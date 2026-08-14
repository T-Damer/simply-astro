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
