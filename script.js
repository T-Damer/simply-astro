const cardAssetPath = 'cards/assets/img/';
const cardNumbers = Array.from({ length: 78 }, (_, index) => String(index + 1).padStart(2, '0'));
const pageReady = prepareServiceWorker().catch(() => undefined);

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

function preloadCardAssets() {
  if (!/^https?:$/.test(location.protocol)) return;

  const cardImages = cardNumbers.flatMap((number) => [
    `${cardAssetPath}Image${number}-low.webp`,
    `${cardAssetPath}Image${number}.webp`
  ]);
  const assets = [
    `${cardAssetPath}bg-low.webp`,
    `${cardAssetPath}bg.webp`,
    `${cardAssetPath}bg2-low.webp`,
    `${cardAssetPath}bg2.webp`,
    ...cardImages
  ];

  assets.forEach((source) => fetch(source, { cache: 'force-cache' }).catch(() => undefined));
}

window.addEventListener('load', () => {
  pageReady.finally(() => {
    const schedule = window.requestIdleCallback
      ? (callback) => window.requestIdleCallback(callback, { timeout: 1500 })
      : (callback) => window.setTimeout(callback, 0);
    schedule(preloadCardAssets);
  });
}, { once: true });

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
  const cardSurface = cardModal.querySelector('.card-modal__surface');
  const storageKey = 'astro-card-selection';
  const historyStorageKey = 'astro-card-history';
  let memoryHistory = [];
  let modalBackgroundsStarted = false;
  let activeDay = getDayKey();
  let timerId = 0;
  let closeId = 0;

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
    const card = Number(selection.card);
    return Number.isInteger(slot) && slot >= 0 && slot < cardButtons.length && Number.isInteger(card) && card >= 1 && card <= 78
      ? { date: dateKey, slot, card: String(card).padStart(2, '0') }
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
    return new Promise((resolve) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
      image.src = source;
    });
  }

  function setProgressiveBackground(element, lowSource, highSource) {
    element.style.backgroundImage = `url("${lowSource}")`;
    loadImage(highSource).then((loaded) => {
      if (loaded) element.style.backgroundImage = `url("${highSource}")`;
    });
  }

  function prepareModalBackgrounds() {
    if (modalBackgroundsStarted) return;
    modalBackgroundsStarted = true;

    if (cardSurface instanceof HTMLElement) {
      loadImage(`${cardAssetPath}bg2.webp`).then((loaded) => {
        if (loaded) cardSurface.classList.add('is-art-loaded');
      });
    }

    const backs = cardModal.querySelectorAll('.oracle-card__back');
    loadImage(`${cardAssetPath}bg.webp`).then((loaded) => {
      if (loaded) backs.forEach((back) => back.classList.add('is-loaded'));
    });
  }

  function renderHistory(history) {
    if (!(cardHistory instanceof HTMLElement)) return;
    cardHistory.replaceChildren();

    if (cardHistoryCount instanceof HTMLElement) cardHistoryCount.textContent = formatHistoryCount(history.length);

    history.forEach((selection) => {
      const item = document.createElement('article');
      item.className = 'card-history__item';
      item.setAttribute('role', 'listitem');

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
      cardHistory.append(item);
    });
  }

  function resetCards() {
    cardButtons.forEach((button, index) => {
      if (!(button instanceof HTMLButtonElement)) return;
      button.className = 'oracle-card';
      button.disabled = false;
      button.setAttribute('aria-label', `Выбрать карту ${index + 1}`);
      const face = button.querySelector('.oracle-card__face');
      if (face instanceof HTMLElement) {
        face.style.backgroundImage = '';
        face.classList.remove('is-loaded');
      }
    });
  }

  function renderSelection(selection) {
    resetCards();

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
      button.disabled = true;
      button.setAttribute('aria-label', `Карта ${index + 1} уже недоступна`);
      if (index !== selection.slot) button.classList.add('is-hidden');
    });

    selected.setAttribute('aria-label', 'Ваша карта дня');
    if (cardStatus instanceof HTMLElement) cardStatus.textContent = 'Карта дня открыта. Новая карта будет доступна после полуночи.';
    window.requestAnimationFrame(() => selected.classList.add('is-selected'));
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
    prepareModalBackgrounds();
    const history = readHistory();
    renderHistory(history);
    renderSelection(history.find((selection) => selection.date === activeDay) || null);
    cardModal.showModal();
    document.body.classList.add('is-card-modal-open');
    updateTimer();
  }

  function finishClose() {
    cardModal.classList.remove('is-closing');
    if (cardModal.open) cardModal.close();
  }

  function closeCardModal() {
    if (!cardModal.open) return;
    cardModal.classList.add('is-closing');
    closeId = window.setTimeout(finishClose, 220);
  }

  cardButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (!(button instanceof HTMLButtonElement) || readHistory().some((selection) => selection.date === getDayKey())) return;

      const selection = {
        date: getDayKey(),
        slot: Number(button.dataset.cardSlot),
        card: String(Math.floor(Math.random() * 78) + 1).padStart(2, '0')
      };

      renderHistory(saveSelection(selection));
      renderSelection(selection);
    });
  });

  cardOpeners.forEach((opener) => opener.addEventListener('click', openCardModal));
  if (cardClose instanceof HTMLButtonElement) cardClose.addEventListener('click', closeCardModal);
  cardModal.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeCardModal();
  });
  cardModal.addEventListener('click', (event) => {
    if (event.target === cardModal) closeCardModal();
  });
  cardModal.addEventListener('close', () => {
    window.clearTimeout(timerId);
    document.body.classList.remove('is-card-modal-open');
    cardModal.classList.remove('is-closing');
  });
}
