import { html } from '../lib/html.js';

/** 404 (and 403 for admin-only pages). @param {{ path: string, forbidden?: boolean }} ctx */
export default function render({ forbidden }) {
  return {
    title: forbidden ? 'Not allowed' : 'Page not found',
    description: 'This page does not exist.',
    view: html`<section class="container coming">
      <span class="sticker">${forbidden ? '403' : '404'}</span>
      <h1>${forbidden ? "You can't see this page" : "That page didn't make it in"}</h1>
      <p>${forbidden ? 'This area is for StudentSwap admins only.' : 'The link may be old, or the page may have moved.'}</p>
      <div class="row" style="justify-content:center"><a class="btn btn--primary" href="#/">Back home</a><a class="btn btn--secondary" href="#/browse">Browse events</a></div>
    </section>`,
  };
}
