const cardAssetPath = 'cards/assets/img/';
const cardNumbers = Array.isArray(window.astroCardNumbers) ? window.astroCardNumbers : [];
const tiltAssetSource = 'https://cdn.jsdelivr.net/npm/vanilla-tilt@1.8.1/dist/vanilla-tilt.min.js';
let tiltAssetPromise = null;
const pageReady = prepareServiceWorker().catch(() => undefined);

function loadTiltAsset() {
  if (typeof window.VanillaTilt?.init === 'function') return Promise.resolve(true);
  if (tiltAssetPromise) return tiltAssetPromise;

  const preload = document.createElement('link');
  preload.rel = 'preload';
  preload.as = 'script';
  preload.href = tiltAssetSource;
  preload.crossOrigin = 'anonymous';
  document.head.append(preload);

  tiltAssetPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = tiltAssetSource;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.append(script);
  });

  return tiltAssetPromise;
}

function waitForWorker(worker) {
  return new Promise((resolve) => {
    if (!worker || ['installed', 'activated', 'redundant'].includes(worker.state)) {
      resolve();
      return;
    }

    worker.addEventListener('statechange', () => {
      if (['installed', 'activated', 'redundant'].includes(worker.state)) resolve();
    }, { once: true });
  });
}

function waitForControllerChange() {
  if (!navigator.serviceWorker.controller) return Promise.resolve();

  return new Promise((resolve) => {
    const timeout = window.setTimeout(resolve, 5000);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
}

async function prepareServiceWorker() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;

  const registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
  await registration.update();
  await waitForWorker(registration.installing);

  if (registration.waiting) {
    const controllerChange = waitForControllerChange();
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    await controllerChange;
  }

  await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((resolve) => window.setTimeout(resolve, 8000))
  ]);
}

pageReady.finally(() => document.body.classList.remove('is-booting'));

const track = document.querySelector('.services__track');
const arrows = document.querySelectorAll('[data-services-direction]');

if (track instanceof HTMLElement) {
  const getStep = () => {
    const card = track.querySelector('.service-card');
    const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
    return card instanceof HTMLElement ? card.offsetWidth + gap : track.clientWidth;
  };

  const updateArrows = () => {
    const maxScroll = track.scrollWidth - track.clientWidth;

    arrows.forEach((arrow) => {
      if (!(arrow instanceof HTMLButtonElement)) return;
      const isNext = arrow.dataset.servicesDirection === 'next';
      arrow.disabled = isNext ? track.scrollLeft >= maxScroll - 1 : track.scrollLeft <= 1;
    });
  };

  arrows.forEach((arrow) => {
    arrow.addEventListener('click', () => {
      const direction = arrow.dataset.servicesDirection === 'next' ? 1 : -1;
      track.scrollBy({ left: direction * getStep(), behavior: 'smooth' });
    });
  });

  track.addEventListener('scroll', updateArrows, { passive: true });
  window.addEventListener('resize', updateArrows);
  updateArrows();
}

const cardModal = document.querySelector('#card-modal');
const cardOpeners = document.querySelectorAll('[data-open-card-modal]');

if (cardModal instanceof HTMLDialogElement && cardOpeners.length) {
  const cardButtons = Array.from(cardModal.querySelectorAll('[data-card-slot]'));
  const cardTimer = cardModal.querySelector('#card-timer');
  const cardStatus = cardModal.querySelector('#card-status');
  const cardHistory = cardModal.querySelector('[data-card-history]');
  const cardHistoryCount = cardModal.querySelector('#card-history-count');
  const cardClose = cardModal.querySelector('[data-close-card-modal]');
  const cardTimerBlock = cardModal.querySelector('.card-modal__timer');
  const cardSurface = cardModal.querySelector('.card-modal__surface');
  const cardLoading = cardModal.querySelector('[data-card-modal-loading]');
  const cardTitle = cardModal.querySelector('.card-modal__title');
  const cardZoom = cardModal.querySelector('[data-card-zoom]');
  const cardZoomClose = cardModal.querySelector('[data-close-card-zoom]');
  const cardZoomImage = cardModal.querySelector('[data-card-zoom-image]');
  const cardZoomCaption = cardModal.querySelector('[data-card-zoom-caption]');
  const storageKey = 'astro-card-selection';
  const historyStorageKey = 'astro-card-history';
  let memoryHistory = [];
  let modalAssetsPromise = null;
  const imagePromises = new Map();
  let tiltStarted = false;
  let activeDay = getDayKey();
  let timerId = 0;
  let closeId = 0;
  let zoomSourceElement = null;
  let floatFrameId = 0;
  let floatState = null;

  function getDayKey(date = new Date()) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }

  function normalizeSelection(selection) {
    const dateKey = String(selection?.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
    const [year, month, day] = dateKey.split('-').map(Number);
    const parsedDate = new Date(year, month - 1, day);
    if (parsedDate.getFullYear() !== year || parsedDate.getMonth() !== month - 1 || parsedDate.getDate() !== day) return null;

    const slot = Number(selection.slot);
    const visibleSlot = Number.isInteger(slot) && slot >= 0 && slot < 8 ? slot % cardButtons.length : -1;
    const card = String(selection.card).padStart(2, '0');
    return visibleSlot >= 0 && cardNumbers.includes(card)
      ? { date: dateKey, slot: visibleSlot, card }
      : null;
  }

  function normalizeHistory(history) {
    if (!Array.isArray(history)) return [];
    const uniqueDates = new Set();
    return history
      .map(normalizeSelection)
      .filter((selection) => selection && !uniqueDates.has(selection.date) && uniqueDates.add(selection.date))
      .sort((first, second) => second.date.localeCompare(first.date));
  }

  function readHistory() {
    let history = memoryHistory;

    try {
      history = normalizeHistory(JSON.parse(localStorage.getItem(historyStorageKey)));
      const legacySelection = normalizeSelection(JSON.parse(localStorage.getItem(storageKey)));
      if (legacySelection && !history.some((selection) => selection.date === legacySelection.date)) {
        history = normalizeHistory([...history, legacySelection]);
        localStorage.setItem(historyStorageKey, JSON.stringify(history));
      }
    } catch {
      // Keep the history in memory when storage is unavailable.
    }

    memoryHistory = history;
    return history;
  }

  function saveSelection(selection) {
    memoryHistory = normalizeHistory([selection, ...readHistory()]);

    try {
      localStorage.setItem(historyStorageKey, JSON.stringify(memoryHistory));
      localStorage.setItem(storageKey, JSON.stringify(selection));
    } catch {
      // Keep the history in memory when storage is unavailable.
    }

    return memoryHistory;
  }

  function formatHistoryDate(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(year, month - 1, day));
  }

  function formatHistoryCount(count) {
    const remainder = count % 10;
    const ending = remainder === 1 && count % 100 !== 11 ? 'карта' : remainder >= 2 && remainder <= 4 && (count % 100 < 10 || count % 100 >= 20) ? 'карты' : 'карт';
    return `${count} ${ending}`;
  }

  function loadImage(source) {
    if (imagePromises.has(source)) return imagePromises.get(source);

    const promise = new Promise((resolve) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        if (typeof image.decode !== 'function') {
          resolve(true);
          return;
        }
        image.decode().then(() => resolve(true), () => resolve(true));
      };
      image.onerror = () => resolve(false);
      image.src = source;
    });

    imagePromises.set(source, promise);
    return promise;
  }

  function setProgressiveBackground(element, lowSource, highSource) {
    element.style.backgroundImage = `url("${lowSource}")`;
    loadImage(highSource).then((loaded) => {
      if (loaded) element.style.backgroundImage = `url("${highSource}")`;
    });
  }

  function preloadCardAssets(numbers) {
    return Promise.all([...new Set(numbers)].flatMap((number) => [
      loadImage(`${cardAssetPath}Image${number}-low.webp`),
      loadImage(`${cardAssetPath}Image${number}.webp`)
    ]));
  }

  function preloadHistoryCardAssets(history) {
    return preloadCardAssets(history.slice(0, 6).map(({ card }) => card));
  }

  function getRandomCardNumber(history) {
    const recentCards = new Set(history.slice(0, 6).map(({ card }) => card));
    const candidates = cardNumbers.filter((number) => !recentCards.has(number));
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function stopCardFloat(preserve = false) {
    window.cancelAnimationFrame(floatFrameId);
    floatFrameId = 0;
    if (preserve && floatState) {
      floatState.pausedAt = performance.now();
    } else if (!preserve) {
      floatState = null;
    }
  }

  function startCardFloat(card, resume = false) {
    if (resume) {
      window.cancelAnimationFrame(floatFrameId);
      floatFrameId = 0;
    } else {
      stopCardFloat();
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const now = performance.now();
    if (resume && floatState?.card === card && floatState.pausedAt) {
      floatState.startedAt += now - floatState.pausedAt;
      floatState.pausedAt = 0;
    } else {
      floatState = {
        card,
        selectedScale: Number.parseFloat(getComputedStyle(card).getPropertyValue('--selected-scale')) || 1.45,
        duration: 8100 + Math.random() * 4800,
        phase: Math.random() * Math.PI * 2,
        xAmplitude: 5 + Math.random() * 7,
        yAmplitude: (12 + Math.random() * 9) * .8,
        yPhase: (Math.random() - .5) * .2,
        rotationAmplitude: (1.4 + Math.random() * 1.8) * (Math.random() > .5 ? 1 : -1),
        scaleAmplitude: .025 + Math.random() * .025,
        startedAt: now,
        pausedAt: 0
      };
    }

    const state = floatState;

    const animate = (now) => {
      if (state !== floatState || !card.classList.contains('is-selected')) return;

      const angle = ((now - state.startedAt) / state.duration) * Math.PI * 2 + state.phase;
      const x = state.xAmplitude * Math.sin(angle);
      const y = state.yAmplitude * Math.sin((angle * 2) + state.yPhase);
      const rotation = state.rotationAmplitude * Math.sin(angle + state.yPhase);
      const scale = state.selectedScale + state.scaleAmplitude * ((Math.sin((angle * 2) + state.yPhase) + 1) / 2);

      card.style.transform = `translate(calc(-50% + ${x.toFixed(2)}px), calc(-50% + var(--lift) + ${y.toFixed(2)}px)) scale(${scale.toFixed(4)}) rotate(${rotation.toFixed(2)}deg)`;
      floatFrameId = window.requestAnimationFrame(animate);
    };

    floatFrameId = window.requestAnimationFrame(animate);
  }

  function initializeCardTilt() {
    if (tiltStarted || typeof window.VanillaTilt?.init !== 'function') return;

    const targets = cardModal.querySelectorAll('.oracle-card__tilt, [data-card-zoom-image]');
    if (!targets.length) return;

    window.VanillaTilt.init(targets, {
      max: 8,
      speed: 650,
      scale: 1.03,
      glare: true,
      'max-glare': .16,
      gyroscope: false
    });
    tiltStarted = true;
  }

  function prepareModalAssets() {
    if (modalAssetsPromise) return modalAssetsPromise;

    const history = readHistory();
    const enhancements = Promise.all([
      loadImage(`${cardAssetPath}bg2.webp`),
      loadImage(`${cardAssetPath}bg.webp`),
      loadImage(`${cardAssetPath}zoom-bg.webp`),
      preloadHistoryCardAssets(history)
    ]).then(([artLoaded, backsLoaded, zoomLoaded]) => {
      if (artLoaded && cardSurface instanceof HTMLElement) cardSurface.classList.add('is-art-loaded');
      if (zoomLoaded && cardZoom instanceof HTMLElement) {
        cardZoom.style.setProperty('--zoom-bg-image', `url("${cardAssetPath}zoom-bg.webp")`);
        cardZoom.classList.add('is-background-loaded');
      }

      if (backsLoaded) {
        cardModal.querySelectorAll('.oracle-card__back').forEach((back) => back.classList.add('is-loaded'));
      }
    }).catch(() => undefined);

    const startTilt = () => loadTiltAsset().then(() => initializeCardTilt()).catch(() => undefined);
    if (window.requestIdleCallback) {
      window.requestIdleCallback(startTilt, { timeout: 2500 });
    } else {
      window.setTimeout(startTilt, 0);
    }

    modalAssetsPromise = Promise.resolve();
    return modalAssetsPromise;
  }

  window.addEventListener('load', () => {
    const schedule = window.requestIdleCallback
      ? (callback) => window.requestIdleCallback(callback, { timeout: 1500 })
      : (callback) => window.setTimeout(callback, 0);
    schedule(() => prepareModalAssets());
  }, { once: true });

  function setModalLoading(isLoading) {
    if (cardLoading instanceof HTMLElement) cardLoading.hidden = !isLoading;
    cardModal.classList.toggle('is-assets-loading', isLoading);
  }

  async function openCardZoom(selection, sourceElement) {
    if (!(cardZoom instanceof HTMLElement) || !(cardZoomImage instanceof HTMLElement) || !(cardZoomCaption instanceof HTMLElement)) return;

    const pendingSource = sourceElement instanceof HTMLElement ? sourceElement : null;
    if (pendingSource) pendingSource.classList.add('is-zoom-source-hidden');
    stopCardFloat(true);

    const lowSource = `${cardAssetPath}Image${selection.card}-low.webp`;
    const highSource = `${cardAssetPath}Image${selection.card}.webp`;
    cardZoomImage.style.backgroundImage = `url("${lowSource}")`;
    if (await loadImage(highSource)) cardZoomImage.style.backgroundImage = `url("${highSource}")`;
    if (!cardModal.open) {
      if (pendingSource) pendingSource.classList.remove('is-zoom-source-hidden');
      return;
    }

    const sourceRect = sourceElement instanceof HTMLElement ? sourceElement.getBoundingClientRect() : null;
    const transitionName = 'card-day-zoom';
    const useViewTransition = typeof document.startViewTransition === 'function';

    if (zoomSourceElement instanceof HTMLElement) {
      zoomSourceElement.style.removeProperty('view-transition-name');
      zoomSourceElement.classList.remove('is-zoom-source-hidden');
    }
    zoomSourceElement = sourceElement instanceof HTMLElement ? sourceElement : null;
    if (zoomSourceElement && useViewTransition) zoomSourceElement.style.viewTransitionName = transitionName;
    if (zoomSourceElement && useViewTransition) zoomSourceElement.classList.add('is-zoom-source-hidden');

    cardModal.classList.remove('is-zoom-open');
    cardZoom.classList.remove('is-open');
    cardZoom.classList.remove('is-view-transition');

    const renderZoom = (withViewTransition) => {
      cardModal.classList.add('is-zoom-open');
      cardZoom.hidden = false;
      cardZoom.setAttribute('aria-hidden', 'false');

      const zoomRect = cardZoom.getBoundingClientRect();
      const sourceX = sourceRect ? sourceRect.left + sourceRect.width / 2 : zoomRect.left + zoomRect.width / 2;
      const sourceY = sourceRect ? sourceRect.top + sourceRect.height / 2 : zoomRect.top + zoomRect.height / 2;

      cardZoomImage.style.setProperty('--zoom-x', `${sourceX - (zoomRect.left + zoomRect.width / 2)}px`);
      cardZoomImage.style.setProperty('--zoom-y', `${sourceY - (zoomRect.top + zoomRect.height / 2)}px`);
      cardZoomImage.setAttribute('aria-label', `Карта от ${formatHistoryDate(selection.date)}`);
      cardZoomCaption.textContent = formatHistoryDate(selection.date);

      if (withViewTransition) {
        if (zoomSourceElement instanceof HTMLElement) zoomSourceElement.classList.add('is-zoom-source-hidden');
        if (zoomSourceElement instanceof HTMLElement) zoomSourceElement.style.removeProperty('view-transition-name');
        cardZoom.classList.add('is-view-transition');
        cardZoomImage.style.viewTransitionName = transitionName;
        cardZoom.classList.add('is-open');
        return;
      }

      window.requestAnimationFrame(() => {
        if (zoomSourceElement instanceof HTMLElement) zoomSourceElement.classList.add('is-zoom-source-hidden');
        cardZoom.classList.add('is-open');
      });
    };

    if (useViewTransition) {
      const transition = document.startViewTransition(() => renderZoom(true));
      transition.finished.finally(() => {
        if (zoomSourceElement === sourceElement && sourceElement instanceof HTMLElement) {
          sourceElement.style.removeProperty('view-transition-name');
        }
        cardZoomImage.style.removeProperty('view-transition-name');
      }).catch(() => undefined);
    } else {
      renderZoom(false);
    }

  }

  function closeCardZoom() {
    if (!(cardZoom instanceof HTMLElement)) return;
    const wasZoomOpen = !cardZoom.hidden;
    const sourceElement = zoomSourceElement;
    const useViewTransition = sourceElement instanceof HTMLElement && typeof document.startViewTransition === 'function';
    const transitionName = 'card-day-zoom-out';

    const hideZoom = (keepSourceName = false) => {
      if (sourceElement instanceof HTMLElement) sourceElement.classList.remove('is-zoom-source-hidden');
      if (!keepSourceName && sourceElement instanceof HTMLElement) sourceElement.style.removeProperty('view-transition-name');
      if (cardZoomImage instanceof HTMLElement) cardZoomImage.style.removeProperty('view-transition-name');
      if (!keepSourceName) {
        zoomSourceElement = null;
        const selectedCard = cardButtons.find((button) => button.classList.contains('is-selected'));
        if (wasZoomOpen && selectedCard instanceof HTMLButtonElement && !cardModal.classList.contains('is-closing')) {
          startCardFloat(selectedCard, true);
        }
      }
      cardModal.classList.remove('is-zoom-open');
      cardZoom.classList.remove('is-open');
      cardZoom.classList.remove('is-view-transition');
      cardZoom.hidden = true;
      cardZoom.setAttribute('aria-hidden', 'true');
    };

    if (!useViewTransition || !(cardZoomImage instanceof HTMLElement)) {
      hideZoom();
      return;
    }

    cardZoomImage.style.viewTransitionName = transitionName;
    const transition = document.startViewTransition(() => {
      sourceElement.classList.remove('is-zoom-source-hidden');
      sourceElement.style.viewTransitionName = transitionName;
      cardZoomImage.style.removeProperty('view-transition-name');
      hideZoom(true);
    });
    transition.finished.finally(hideZoom).catch(() => undefined);
  }

  function renderHistory(history) {
    if (!(cardHistory instanceof HTMLElement)) return;
    cardHistory.replaceChildren();

    if (cardHistoryCount instanceof HTMLElement) cardHistoryCount.textContent = formatHistoryCount(history.length);

    history.forEach((selection) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'card-history__item';
      item.setAttribute('aria-label', `Открыть карту от ${formatHistoryDate(selection.date)}`);

      const image = document.createElement('div');
      image.className = 'card-history__image';
      setProgressiveBackground(
        image,
        `${cardAssetPath}Image${selection.card}-low.webp`,
        `${cardAssetPath}Image${selection.card}.webp`
      );
      image.setAttribute('role', 'img');
      image.setAttribute('aria-label', `Карта от ${formatHistoryDate(selection.date)}`);

      const date = document.createElement('time');
      date.dateTime = selection.date;
      date.textContent = formatHistoryDate(selection.date);

      item.append(image, date);
      item.addEventListener('click', () => openCardZoom(selection, image));
      cardHistory.append(item);
    });
  }

  function resetCards() {
    stopCardFloat();
    cardButtons.forEach((button, index) => {
      if (!(button instanceof HTMLButtonElement)) return;
      button.className = 'oracle-card';
      button.disabled = false;
      button.setAttribute('aria-label', `Выбрать карту ${index + 1}`);
      button.style.removeProperty('transform');
      const face = button.querySelector('.oracle-card__face');
      if (face instanceof HTMLElement) {
        face.style.backgroundImage = '';
        face.classList.remove('is-loaded');
      }
    });
  }

  function renderSelection(selection) {
    resetCards();

    if (cardTitle instanceof HTMLElement) {
      cardTitle.classList.toggle('is-hidden', Boolean(selection));
      cardTitle.setAttribute('aria-hidden', String(Boolean(selection)));
    }
    if (cardTimerBlock instanceof HTMLElement) cardTimerBlock.hidden = !selection;

    if (!selection) {
      if (cardStatus instanceof HTMLElement) cardStatus.textContent = 'Выбери одну карту на сегодня.';
      return;
    }

    const selected = cardButtons[selection.slot];
    if (!(selected instanceof HTMLButtonElement)) return;

    const face = selected.querySelector('.oracle-card__face');
    if (face instanceof HTMLElement) {
      setProgressiveBackground(
        face,
        `${cardAssetPath}Image${selection.card}-low.webp`,
        `${cardAssetPath}Image${selection.card}.webp`
      );
    }

    cardButtons.forEach((button, index) => {
      if (!(button instanceof HTMLButtonElement)) return;
      button.disabled = index !== selection.slot;
      if (index !== selection.slot) {
        button.setAttribute('aria-label', `Карта ${index + 1} уже недоступна`);
        button.classList.add('is-hidden');
      }
    });

    selected.setAttribute('aria-label', 'Открыть вашу карту дня');
    if (cardStatus instanceof HTMLElement) cardStatus.textContent = 'Новая карта будет доступна после полуночи.';
    window.requestAnimationFrame(() => {
      selected.classList.add('is-selected');
      startCardFloat(selected);
    });
  }

  function syncDay() {
    const day = getDayKey();
    if (day === activeDay) return;
    activeDay = day;
    const history = readHistory();
    renderHistory(history);
    renderSelection(history.find((selection) => selection.date === day) || null);
  }

  function updateTimer() {
    syncDay();
    const now = new Date();
    const nextDay = new Date(now);
    nextDay.setHours(24, 0, 0, 0);
    const secondsLeft = Math.max(0, Math.ceil((nextDay.getTime() - now.getTime()) / 1000));
    const hours = String(Math.floor(secondsLeft / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((secondsLeft % 3600) / 60)).padStart(2, '0');
    const seconds = String(secondsLeft % 60).padStart(2, '0');

    if (cardTimer instanceof HTMLElement) {
      cardTimer.textContent = `${hours}:${minutes}:${seconds}`;
      cardTimer.dateTime = nextDay.toISOString();
    }

    timerId = window.setTimeout(updateTimer, 1000);
  }

  function openCardModal(event) {
    event.preventDefault();
    window.clearTimeout(closeId);
    activeDay = getDayKey();
    const history = readHistory();
    preloadHistoryCardAssets(history);
    renderHistory(history);
    renderSelection(history.find((selection) => selection.date === activeDay) || null);
    cardModal.showModal();
    document.body.classList.add('is-card-modal-open');
    setModalLoading(true);
    updateTimer();
    prepareModalAssets().finally(() => {
      if (cardModal.open) setModalLoading(false);
    });
  }

  function finishClose() {
    cardModal.classList.remove('is-closing');
    if (cardModal.open) cardModal.close();
  }

  function closeCardModal() {
    if (!cardModal.open) return;
    closeCardZoom();
    stopCardFloat();
    cardModal.classList.add('is-closing');
    closeId = window.setTimeout(finishClose, 220);
  }

  cardButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (!(button instanceof HTMLButtonElement)) return;

      const history = readHistory();
      const currentSelection = history.find((selection) => selection.date === getDayKey());
      if (currentSelection && button.classList.contains('is-selected')) {
        openCardZoom(currentSelection, button);
        return;
      }
      if (button.disabled || history.some((selection) => selection.date === getDayKey())) return;

      const selection = {
        date: getDayKey(),
        slot: Number(button.dataset.cardSlot),
        card: getRandomCardNumber(history)
      };

      renderHistory(saveSelection(selection));
      renderSelection(selection);
    });
  });

  cardOpeners.forEach((opener) => opener.addEventListener('click', openCardModal));
  if (cardClose instanceof HTMLButtonElement) cardClose.addEventListener('click', closeCardModal);
  if (cardZoomClose instanceof HTMLButtonElement) cardZoomClose.addEventListener('click', closeCardZoom);
  cardModal.addEventListener('cancel', (event) => {
    if (cardZoom instanceof HTMLElement && !cardZoom.hidden) {
      event.preventDefault();
      closeCardZoom();
      return;
    }
    event.preventDefault();
    closeCardModal();
  });
  if (cardZoom instanceof HTMLElement) {
    cardZoom.addEventListener('click', (event) => {
      if (event.target === cardZoom) closeCardZoom();
    });
  }
  cardModal.addEventListener('click', (event) => {
    if (event.target === cardModal) closeCardModal();
  });
  cardModal.addEventListener('close', () => {
    window.clearTimeout(timerId);
    document.body.classList.remove('is-card-modal-open');
    cardModal.classList.remove('is-closing');
  });
}
