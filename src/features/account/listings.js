import { html, mount } from '../../lib/html.js';
import { listings } from '../../api/index.js';
import { formatPence } from '../../lib/money.js';
import { validateListingPrice, maxPrice } from '../../lib/pricing.js';
import { sellerPayout } from '../../lib/fees.js';
import { poundsToPence } from '../make-offer.js';
import { statusBadge, emptyState, field, priceBreakdown, badge } from '../../components/ui.js';
import { openModal } from '../../components/modal.js';
import { toast } from '../../components/toast.js';
import { values, setFieldError, clearFieldErrors, setFormError, focusFirstError, busy } from '../../lib/forms.js';
import { eventLine } from './shared.js';

const FILTERS = [
  ['active', 'Active', ['active', 'reserved']],
  ['review', 'Under review', ['under_review']],
  ['sold', 'Sold', ['sold']],
  ['ended', 'Expired & removed', ['expired', 'removed']],
];

/** @param {any} l */
const row = (l) => html`<article class="row-card">
  <div class="row-card__main">
    <a class="row-card__title" href="#/event/${l.eventId}">${l.event.title}</a>
    <div class="muted small">${eventLine(l.event)}</div>
    <div class="row">${l.quantity} × ${l.tier?.name} at <strong>${formatPence(l.pricePence, { exact: true })}</strong> <span class="muted small">(original ${formatPence(l.faceValuePence)})</span> ${statusBadge('listing', l.status)}
      ${l.status === 'under_review' ? badge("We're checking your ticket", 'warn') : ''}</div>
    ${l.reviewNote && l.status === 'removed' ? html`<div class="small" style="color:var(--coral-deep)">Not approved: ${l.reviewNote}</div>` : ''}
  </div>
  <div class="row-card__actions">
    ${['active', 'under_review'].includes(l.status) ? html`<button class="btn btn--secondary btn--sm" type="button" data-edit="${l.id}">Edit price</button><button class="btn btn--danger btn--sm" type="button" data-delist="${l.id}">Delist</button>` : ''}
    ${l.status === 'reserved' ? html`<span class="small muted">A buyer is checking out</span>` : ''}
  </div>
</article>`;

/** @param {{ reload: () => void }} ctx */
export async function render({ reload }) {
  const all = await listings.myListings();
  const hash = location.hash.split('?')[1];
  const active = new URLSearchParams(hash).get('f') ?? 'active';
  const counts = Object.fromEntries(
    FILTERS.map(([k, , st]) => [
      k,
      all.filter((/** @type {any} */ l) => /** @type {string[]} */ (st).includes(l.status)).length,
    ]),
  );
  const cur = FILTERS.find((f) => f[0] === active) ?? FILTERS[0];
  const shown = all.filter((/** @type {any} */ l) => /** @type {string[]} */ (cur[2]).includes(l.status));

  const view = html`<div class="stack stack--lg">
    <div class="row row--between"><div class="chip-group" role="group" aria-label="Filter listings">${FILTERS.map(([k, label]) => html`<button class="chip-btn" type="button" data-filter="${k}" aria-pressed="${k === cur[0]}">${label} <span class="muted">${counts[/** @type {string} */ (k)]}</span></button>`)}</div>
      <a class="btn btn--primary btn--sm" href="#/sell/new">+ New listing</a></div>
    <div id="list" class="stack">${shown.length ? shown.map(row) : emptyState({ title: `No ${String(cur[1]).toLowerCase()} listings`, body: cur[0] === 'active' ? 'List a spare ticket in a minute.' : undefined, href: cur[0] === 'active' ? '#/sell/new' : undefined, action: cur[0] === 'active' ? 'Sell a ticket' : undefined })}</div>
  </div>`;

  return {
    view,
    /** @param {HTMLElement} root */
    onMount(root) {
      root.querySelectorAll('[data-filter]').forEach((b) =>
        b.addEventListener('click', () => {
          history.replaceState(null, '', `#/account/listings?f=${/** @type {HTMLElement} */ (b).dataset.filter}`);
          reload();
        }),
      );
      root.querySelectorAll('[data-edit]').forEach((b) =>
        b.addEventListener('click', () => {
          const l = all.find((/** @type {any} */ x) => x.id === /** @type {HTMLElement} */ (b).dataset.edit);
          if (l) editPrice(l, reload);
        }),
      );
      root.querySelectorAll('[data-delist]').forEach((b) =>
        b.addEventListener('click', () => {
          const l = all.find((/** @type {any} */ x) => x.id === /** @type {HTMLElement} */ (b).dataset.delist);
          if (l) confirmDelist(l, reload);
        }),
      );
    },
  };
}

/** @param {any} l @param {() => void} reload */
function editPrice(l, reload) {
  openModal({
    title: 'Edit price',
    variant: 'sheet',
    body: html`<p class="muted">${l.event.title} · ${l.quantity} × ${l.tier?.name}. Original price is ${formatPence(l.faceValuePence, { exact: true })}.</p>
      <form id="edit-form" class="stack" novalidate><div class="form-error" role="alert"></div>
        ${field({ id: 'price', label: 'Price per ticket', prefix: '£', inputmode: 'decimal', value: (l.pricePence / 100).toFixed(2), required: true, hint: `Maximum ${formatPence(maxPrice(l.faceValuePence), { exact: true })}.` })}
        <div id="pv" aria-live="polite"></div>
        <div class="dialog__actions"><button class="btn btn--secondary" type="button" data-cancel>Cancel</button><button class="btn btn--primary" type="submit">Save price</button></div></form>`,
    onOpen(dialog, close) {
      const form = /** @type {HTMLFormElement} */ (dialog.querySelector('#edit-form'));
      const input = /** @type {HTMLInputElement} */ (form.elements.namedItem('price'));
      const pv = /** @type {HTMLElement} */ (dialog.querySelector('#pv'));
      const update = () => {
        const p = poundsToPence(input.value);
        if (Number.isNaN(p) || !validateListingPrice(p, l.faceValuePence).ok) return mount(pv, html``);
        const { sellerFee, payout } = sellerPayout(p * l.quantity);
        mount(
          pv,
          priceBreakdown(
            [
              { label: 'Seller fee (5%)', value: `−${formatPence(sellerFee, { exact: true })}` },
              { label: 'You receive', value: formatPence(payout, { exact: true }), strong: true },
            ],
            'Payout',
          ),
        );
      };
      input.addEventListener('input', update);
      update();
      dialog.querySelector('[data-cancel]')?.addEventListener('click', close);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearFieldErrors(form);
        const p = poundsToPence(values(form).price);
        const v = Number.isNaN(p) ? null : validateListingPrice(p, l.faceValuePence);
        if (!v || !v.ok) {
          setFieldError(
            form,
            'price',
            v && !v.ok && v.reason === 'above_cap'
              ? `That's above face value. The most you can charge is ${formatPence(v.max, { exact: true })}.`
              : 'Enter a valid price (at least £1).',
          );
          return focusFirstError(form);
        }
        const btn = /** @type {HTMLButtonElement} */ (form.querySelector('button[type=submit]'));
        busy(btn, true, 'Saving…');
        try {
          await listings.updateListing(l.id, { pricePence: p });
          close();
          toast('Price updated');
          reload();
        } catch (err) {
          busy(btn, false);
          setFormError(form, err instanceof Error ? err.message : 'Could not save.');
        }
      });
    },
  });
}

/** @param {any} l @param {() => void} reload */
function confirmDelist(l, reload) {
  openModal({
    title: 'Delist these tickets?',
    body: html`<p class="muted">${l.event.title} will no longer be on sale. Open offers on it will lapse. You can list again any time.</p>
      <div class="dialog__actions"><button class="btn btn--secondary" type="button" data-cancel>Keep listing</button><button class="btn btn--danger" type="button" data-confirm>Delist</button></div>`,
    onOpen(dialog, close) {
      dialog.querySelector('[data-cancel]')?.addEventListener('click', close);
      dialog.querySelector('[data-confirm]')?.addEventListener('click', async (e) => {
        const btn = /** @type {HTMLButtonElement} */ (e.currentTarget);
        busy(btn, true, 'Delisting…');
        try {
          await listings.delistListing(l.id);
          close();
          toast('Listing removed');
          reload();
        } catch (err) {
          busy(btn, false);
          toast(err instanceof Error ? err.message : 'Could not delist.', 'error');
        }
      });
    },
  });
}
