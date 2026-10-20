import { html } from '../../lib/html.js';
import { offers } from '../../api/index.js';
import { formatPence } from '../../lib/money.js';
import { poundsToPence } from '../make-offer.js';
import { statusBadge, emptyState, countdown, avatar, stars, field } from '../../components/ui.js';
import { openModal } from '../../components/modal.js';
import { toast } from '../../components/toast.js';
import { values, setFieldError, clearFieldErrors, setFormError, focusFirstError, busy } from '../../lib/forms.js';
import { eventLine, sectionHead } from './shared.js';
import { pricing } from '../../config/pricing.js';

/** @param {any} o @param {string} meId @returns {boolean} true when it's my move */
const myTurn = (o, meId) =>
  o.status === 'open' && (o.sellerId === meId ? o.lastActor === 'buyer' : o.lastActor === 'seller');

/** @param {any} o @param {string} meId */
function offerRow(o, meId) {
  const l = o.listing;
  const isSeller = o.sellerId === meId;
  const who = isSeller ? o.buyer : o.seller;
  const mine = myTurn(o, meId);
  const unit = formatPence(o.amountPence, { exact: true });
  return html`<article class="row-card" data-offer-row="${o.id}">
    <div class="row-card__main">
      <a class="row-card__title" href="#/event/${l?.eventId}">${l?.event.title}</a>
      <div class="muted small">${l ? eventLine(l.event) : ''}</div>
      <div class="row">${l?.quantity} × ${l?.tier?.name}: ${o.lastActor === 'seller' ? 'counter' : 'offer'} <strong>${unit}</strong> each <span class="muted small">(listed ${formatPence(l?.pricePence ?? 0, { exact: true })})</span> ${statusBadge('offer', o.status)}</div>
      ${who ? html`<div class="row small">${avatar(who, 'sm')}<a class="link" href="#/seller/${who.id}">${who.displayName}</a> ${stars(who.ratingAvg, who.ratingCount)}</div>` : ''}
      ${o.status === 'open' ? html`<div class="small muted">${mine ? 'Your move. ' : 'Waiting for them to respond. '}Expires in ${countdown(o.expiresAt)}</div>` : ''}
      ${o.status === 'accepted' && !isSeller && o.checkoutDeadline ? html`<div class="notice notice--ok small">Accepted! Complete checkout within <strong>${countdown(o.checkoutDeadline, { doneText: 'expired' })}</strong> (${pricing.offerCheckoutWindowHours}h window) or the offer lapses.</div>` : ''}
      ${o.status === 'accepted' && isSeller && o.checkoutDeadline ? html`<div class="small muted">Waiting for the buyer to check out (${countdown(o.checkoutDeadline, { doneText: 'expired' })} left).</div>` : ''}
    </div>
    <div class="row-card__actions">
      ${
        mine
          ? html`<button class="btn btn--primary btn--sm" type="button" data-act="accept" data-id="${o.id}">Accept</button>
        ${isSeller ? html`<button class="btn btn--secondary btn--sm" type="button" data-act="counter" data-id="${o.id}">Counter</button>` : ''}
        <button class="btn btn--danger btn--sm" type="button" data-act="decline" data-id="${o.id}">Decline</button>`
          : ''
      }
      ${o.status === 'accepted' && !isSeller ? html`<a class="btn btn--primary btn--sm" href="#/checkout/${o.listingId}?offer=${o.id}">Check out ${formatPence(Math.round(o.amountPence * (l?.quantity ?? 1) * (1 + pricing.buyerFeeBps / 10000)), { exact: true })}</a>` : ''}
    </div>
  </article>`;
}

/** @param {{ user: any, reload: () => void }} ctx */
export async function render({ user, reload }) {
  const { made, received } = await offers.myOffers();
  const sortOpenFirst = (/** @type {any[]} */ a) =>
    [...a].sort(
      (x, y) =>
        Number(myTurn(y, user.id)) - Number(myTurn(x, user.id)) ||
        Number(y.status === 'open') - Number(x.status === 'open'),
    );
  const view = html`<div class="stack stack--lg">
    <section>${sectionHead('Offers on your listings', received.length)}
      ${received.length ? html`<div class="stack">${sortOpenFirst(received).map((o) => offerRow(o, user.id))}</div>` : emptyState({ title: 'No offers yet', body: 'When a buyer makes an offer on your tickets, it appears here.' })}</section>
    <section>${sectionHead("Offers you've made", made.length)}
      ${made.length ? html`<div class="stack">${sortOpenFirst(made).map((o) => offerRow(o, user.id))}</div>` : emptyState({ title: "You haven't made any offers", body: 'Found tickets slightly above your budget? Make an offer from the event page.', href: '#/browse', action: 'Browse events' })}</section>
  </div>`;

  return {
    view,
    /** @param {HTMLElement} root */
    onMount(root) {
      const all = [...made, ...received];
      root.querySelectorAll('[data-act]').forEach((b) =>
        b.addEventListener('click', async () => {
          const btn = /** @type {HTMLButtonElement} */ (b);
          const o = all.find((x) => x.id === btn.dataset.id);
          if (!o) return;
          if (btn.dataset.act === 'counter') return counter(o, reload);
          busy(btn, true, '…');
          try {
            await offers.respondToOffer(o.id, { action: /** @type {'accept' | 'decline'} */ (btn.dataset.act) });
            toast(btn.dataset.act === 'accept' ? 'Offer accepted' : 'Offer declined');
            reload();
          } catch (err) {
            busy(btn, false);
            toast(err instanceof Error ? err.message : 'Could not update the offer.', 'error');
          }
        }),
      );
    },
  };
}

/** @param {any} o @param {() => void} reload */
function counter(o, reload) {
  const l = o.listing;
  openModal({
    title: 'Counter-offer',
    variant: 'sheet',
    body: html`<p class="muted">They offered ${formatPence(o.amountPence, { exact: true })} each. Your listing price is ${formatPence(l.pricePence, { exact: true })}. Your counter must be somewhere in between.</p>
      <form id="counter-form" class="stack" novalidate><div class="form-error" role="alert"></div>
        ${field({ id: 'amount', label: 'Your counter per ticket', prefix: '£', inputmode: 'decimal', value: ((o.amountPence + l.pricePence) / 2 / 100).toFixed(2), required: true })}
        <div class="dialog__actions"><button class="btn btn--secondary" type="button" data-cancel>Cancel</button><button class="btn btn--primary" type="submit">Send counter</button></div></form>`,
    onOpen(dialog, close) {
      dialog.querySelector('[data-cancel]')?.addEventListener('click', close);
      const form = /** @type {HTMLFormElement} */ (dialog.querySelector('#counter-form'));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearFieldErrors(form);
        const p = poundsToPence(values(form).amount);
        if (Number.isNaN(p) || p <= o.amountPence || p > l.pricePence) {
          setFieldError(
            form,
            'amount',
            `Enter between ${formatPence(o.amountPence + 1, { exact: true })} and ${formatPence(l.pricePence, { exact: true })}.`,
          );
          return focusFirstError(form);
        }
        const btn = /** @type {HTMLButtonElement} */ (form.querySelector('button[type=submit]'));
        busy(btn, true, 'Sending…');
        try {
          await offers.respondToOffer(o.id, { action: 'counter', counterPence: p });
          close();
          toast('Counter-offer sent');
          reload();
        } catch (err) {
          busy(btn, false);
          setFormError(form, err instanceof Error ? err.message : 'Could not send.');
        }
      });
    },
  });
}
