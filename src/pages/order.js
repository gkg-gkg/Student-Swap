import { html } from '../lib/html.js';
import { orders } from '../api/index.js';
import { cities } from '../data/regions.js';
import { formatPence } from '../lib/money.js';
import { formatDayLong, formatTime, formatDateTime } from '../lib/time.js';
import { reportableOrderStates } from '../lib/status.js';
import { avatar, badge, statusBadge, priceBreakdown, countdown, errorState, stars } from '../components/ui.js';
import { confetti } from '../components/confetti.js';
import { toast } from '../components/toast.js';
import { busy } from '../lib/forms.js';
import { startCountdowns } from '../components/countdown.js';
import { pricing } from '../config/pricing.js';

let polls = 0;

/** Timeline steps for the order's life. @param {any} o */
function timeline(o) {
  const done = (/** @type {boolean} */ b) => (b ? 'is-done' : '');
  const ended = new Date(o.event.endsAt).getTime() < Date.now();
  const reported = o.status === 'reported' || o.status === 'refunded' || o.reportId;
  const steps = [
    ['Paid', o.paidAt ? formatDateTime(o.paidAt) : '', !!o.paidAt],
    [
      o.delivery === 'pdf' ? 'Tickets delivered' : 'Tickets transferred',
      o.deliveredAt ? formatDateTime(o.deliveredAt) : 'Waiting for the seller',
      !!o.deliveredAt,
    ],
    ['Event', formatDateTime(o.event.startsAt), ended],
    [
      o.status === 'refunded' ? 'Refunded' : reported && o.status === 'reported' ? 'Under review' : 'Seller paid',
      formatDateTime(o.payoutReleaseAt),
      ['completed', 'refunded'].includes(o.status),
    ],
  ];
  return html`<ol class="timeline">${steps.map(([label, when, ok]) => html`<li class="${done(/** @type {boolean} */ (ok))}"><span class="timeline__dot" aria-hidden="true">${ok ? '✓' : ''}</span><div><strong>${label}</strong><span class="muted small">${when}</span></div></li>`)}</ol>`;
}

/** @param {{ params: Record<string, string>, query: URLSearchParams, user: import('../types/index.js').User | null, rerender: () => void }} ctx */
export default async function render({ params, query, user, rerender }) {
  /** @type {any} */
  let o;
  try {
    o = await orders.getOrder(params.id);
  } catch (err) {
    return {
      title: 'Order | StudentSwap',
      description: '',
      view: html`<div class="page"><div class="container">${errorState({ title: err instanceof Error && /not found/i.test(err.message) ? "We can't find that order" : "Couldn't load this order" })}</div></div>`,
      onMount: (/** @type {HTMLElement} */ root) =>
        root.querySelector('[data-retry]')?.addEventListener('click', () => rerender()),
    };
  }

  const isSeller = o.sellerId === user?.id;
  const returning = query.get('paid') === '1' && !isSeller;
  const confirming = returning && o.status === 'pending_payment'; // real mode: waiting for Stripe's webhook
  const justPaid = returning && !confirming;
  const e = o.event;
  const city = cities.find((c) => c.id === e.cityId)?.name ?? '';
  const windowOpen = reportableOrderStates.includes(o.status) && new Date(o.payoutReleaseAt).getTime() > Date.now();
  const other = isSeller ? o.buyer : o.seller;

  const celebrate = confirming
    ? html`<section class="celebrate" role="status"><div class="celebrate__tick" aria-hidden="true">…</div><h1>Confirming your payment</h1><p>This usually takes a few seconds. You don't need to do anything.</p></section>`
    : justPaid
      ? html`<section class="celebrate" aria-live="polite">
    <div class="celebrate__tick" aria-hidden="true">✓</div>
    <h1>You're <span class="mark">going!</span></h1>
    <p>Payment confirmed for <strong>${e.title}</strong>. ${o.status === 'delivered' && o.delivery === 'pdf' ? 'Your tickets are ready below.' : 'The seller has been asked to transfer your tickets.'}</p>
  </section>`
      : '';

  const access = isSeller
    ? ''
    : html`<section class="card" aria-labelledby="acc">
    <h2 id="acc">Your tickets</h2>
    ${
      o.delivery === 'pdf'
        ? ['delivered', 'completed', 'reported'].includes(o.status)
          ? html`<p class="muted">${o.quantity} ${o.quantity === 1 ? 'ticket' : 'tickets'} as a PDF. The download link is private and expires after 60 seconds, so just tap again if it lapses.</p><button class="btn btn--primary" type="button" data-download>Download tickets</button>`
          : html`<p class="muted">Your tickets will appear here once payment is confirmed.</p>`
        : o.status === 'paid'
          ? html`<div class="notice notice--warn">Waiting for ${o.seller?.displayName ?? 'the seller'} to transfer your tickets via <strong>${o.transferPlatform ?? 'the ticketing app'}</strong>. We'll notify you the moment they do.</div><p class="small muted">Haven't received them? Don't worry: your money is held until after the event, and you can report a problem below.</p>`
          : html`<div class="notice notice--ok">Transferred via <strong>${o.transferPlatform ?? 'the ticketing app'}</strong>. Check your email and the app to accept the tickets.</div>`
    }
  </section>`;

  const sellerBox = isSeller
    ? html`<section class="card" aria-labelledby="sl">
    <h2 id="sl">Your sale</h2>
    ${
      o.status === 'paid' && o.delivery === 'transfer'
        ? html`<div class="notice notice--warn">Transfer the tickets to the buyer via <strong>${o.transferPlatform ?? 'the ticketing app'}</strong>, then confirm below.</div><button class="btn btn--primary" type="button" data-transferred>I've transferred the tickets</button>`
        : html`<p class="muted">${o.delivery === 'pdf' ? 'The buyer can download your uploaded ticket.' : 'You confirmed the transfer.'}</p>`
    }
    ${
      o.payout
        ? html`<div class="stack">${priceBreakdown(
            [
              { label: 'Sale price', value: formatPence(o.payout.grossPence, { exact: true }) },
              {
                label: 'Card processing (Stripe)',
                value: `−${formatPence(o.payout.cardFeePence, { exact: true })}`,
              },
              { label: 'Your payout', value: formatPence(o.payout.amountPence, { exact: true }), strong: true },
            ],
            'Payout',
          )}<p class="small muted">${statusBadge('payout', o.payout.status)} Released ${pricing.payoutReleaseHoursAfterEvent}h after the event if no problem is reported.</p></div>`
        : ''
    }
  </section>`
    : '';

  const protect = isSeller
    ? ''
    : html`<section class="card" aria-labelledby="prot">
    <h2 id="prot">Buyer protection</h2>
    ${
      windowOpen
        ? html`<p class="muted">Something wrong with your tickets? Report it before <strong>${formatDateTime(o.payoutReleaseAt)}</strong> (${countdown(o.payoutReleaseAt, { doneText: 'closed' })} left). We'll hold the seller's payout while we look into it.</p><a class="btn btn--secondary" href="#/orders/${o.id}/report">Report a problem</a>`
        : o.report
          ? html`<p class="muted">You reported a problem on ${formatDateTime(o.report.createdAt)}.</p><a class="btn btn--secondary" href="#/reports/${o.report.id}">View report status</a>`
          : html`<p class="muted">The reporting window for this order has closed.</p>`
    }
  </section>`;

  const view = html`<div class="page"><div class="container order-page">
    ${celebrate}
    ${justPaid ? '' : html`<a class="back-link" href="#/account/${isSeller ? 'payouts' : 'orders'}">← ${isSeller ? 'Payouts' : 'My orders'}</a><h1 class="order-title">Order ${o.id}</h1>`}
    <div class="order-grid">
      <div class="stack">
        <section class="card" aria-labelledby="ev">
          <div class="row row--between"><h2 id="ev">${e.title}</h2>${statusBadge('order', o.status)}</div>
          <p class="muted">${e.venue}, ${city}<br />${formatDayLong(e.startsAt)} · doors ${formatTime(e.startsAt)} · last entry ${formatTime(e.lastEntryAt)}</p>
          <p class="row">${badge(e.ageRestriction, 'hot')} <span class="small muted">${e.idRequirement}</span></p>
          <p class="small">${o.quantity} × ${o.tier?.name ?? 'ticket'} · <a class="link" href="#/event/${e.id}">View event</a></p>
        </section>
        ${access}${sellerBox}${protect}
      </div>
      <div class="stack">
        <section class="card" aria-labelledby="tl"><h2 id="tl">Progress</h2>${timeline(o)}</section>
        ${
          isSeller
            ? ''
            : html`<section class="card" aria-labelledby="pay"><h2 id="pay">Payment</h2>${priceBreakdown(
                [
                  {
                    label: `${o.quantity} × ${formatPence(o.unitPence, { exact: true })}`,
                    value: formatPence(o.unitPence * o.quantity, { exact: true }),
                  },
                  { label: 'Buyer fee', value: formatPence(o.buyerFeePence, { exact: true }) },
                  { label: 'Total paid', value: formatPence(o.totalPence, { exact: true }), strong: true },
                ],
                'Payment',
              )}</section>`
        }
        ${other ? html`<section class="card" aria-labelledby="who"><h2 id="who">${isSeller ? 'Buyer' : 'Seller'}</h2><div class="row">${avatar(other)}<div><a class="listing__name" href="#/seller/${other.id}">${other.displayName}</a><div class="small">${stars(other.ratingAvg, other.ratingCount)}</div></div></div></section>` : ''}
      </div>
    </div>
  </div></div>`;

  /** @param {HTMLElement} root */
  function onMount(root) {
    if (justPaid) confetti();
    // Poll until the backend marks the order paid (max ~30s), then re-render into the celebration.
    if (confirming && (polls += 1) < 12) window.setTimeout(() => location.hash.includes(o.id) && rerender(), 2500);
    root.querySelector('[data-download]')?.addEventListener('click', async (ev) => {
      const btn = /** @type {HTMLButtonElement} */ (ev.currentTarget);
      busy(btn, true, 'Preparing…');
      try {
        const { url, fileName } = await orders.getTicketDownload(o.id);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        toast('Download started');
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Could not download. Try again.', 'error');
      }
      busy(btn, false);
    });
    root.querySelector('[data-transferred]')?.addEventListener('click', async (ev) => {
      const btn = /** @type {HTMLButtonElement} */ (ev.currentTarget);
      busy(btn, true, 'Saving…');
      try {
        await orders.markTransferred(o.id);
        toast('Thanks! The buyer has been notified.');
        rerender();
      } catch (err) {
        busy(btn, false);
        toast(err instanceof Error ? err.message : 'Could not update the order.', 'error');
      }
    });
    startCountdowns();
  }

  return {
    title: `${justPaid ? "You're going!" : 'Order'} ${o.id} | StudentSwap`,
    description: `Order for ${e.title}.`,
    view,
    onMount,
  };
}
