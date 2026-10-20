import { html } from '../lib/html.js';

/** Global error page: shown when a page throws while loading. @param {{ error: unknown }} ctx */
export default function render({ error }) {
  const detail = error instanceof Error ? error.message : '';
  return {
    title: 'Something went wrong',
    description: 'An unexpected error occurred.',
    onMount: (/** @type {HTMLElement} */ root) =>
      root.querySelector('[data-reload]')?.addEventListener('click', () => location.reload()),
    view: html`<section class="container coming" role="alert">
      <span class="sticker sticker--coral">Oops</span>
      <h1>Something went wrong</h1>
      <p>We couldn't load this page. Your money and tickets are safe. Please try again.</p>
      ${detail ? html`<p class="small muted"><code>${detail}</code></p>` : ''}
      <div class="row" style="justify-content:center"><button class="btn btn--primary" type="button" data-reload>Reload</button><a class="btn btn--secondary" href="#/">Back home</a></div>
    </section>`,
  };
}
