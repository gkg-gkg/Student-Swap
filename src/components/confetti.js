// A short celebratory burst. Skipped entirely under prefers-reduced-motion (CSS hides it too).
const COLOURS = ['#FFB020', '#FF5A6E', '#38B6FF', '#22D3A6', '#0072D6'];

export function confetti(count = 70) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = document.createElement('div');
  layer.className = 'confetti';
  layer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = COLOURS[i % COLOURS.length];
    p.style.setProperty('--dx', `${(Math.random() - 0.5) * 240}px`);
    p.style.setProperty('--rot', `${360 + Math.random() * 720}deg`);
    p.style.animationDelay = `${Math.random() * 0.5}s`;
    layer.appendChild(p);
  }
  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 3600);
}
