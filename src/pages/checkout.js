import { html } from '../lib/html.js';
import { orders } from '../api/index.js';
import { payments } from '../payments/provider.js';
import { cities } from '../data/regions.js';
import { formatPence } from '../lib/money.js';
import { formatDayLong, formatTime } from '../lib/time.js';
import { priceBreakdown, countdown, badge, errorState } from '../components/ui.js';
import { startCountdowns } from '../components/countdown.js';
import { toast } from '../components/toast.js';
import { busy } from '../lib/forms.js';
import { navigate } from '../router.js';
import { pricing } from '../config/pricing.js';

/** @param {{ params: Record<string, string>, query: URLSearchParams }} ctx */
export default async function render({ params, query }) {
  const exit = { href: `#/browse`, label: 'Back to browsing' };
  const shell = (/** @type {any} */ view) => ({
    title: 'Checkout | StudentSwap',
    description: 'Secure checkout.',
    layout: 'focus',
    exit,
    view,
  });

  /** @type {Awaited<ReturnType<typeof orders.createOrder>>} */
  let order;
  try {
    order = await orders.createOrder({ listingId: params.listingId, offerId: query.get('offer') ?? undefined });
  } catch (err) {
    const gone = err instanceof Error && /taken|available|not found|own tickets|offer/i.test(err.message);
    return {
      ...shell(
        html`<div class="page"><div class="container checkout checkout--narrow">${
          gone
            ? html`<div class="state-box"><h3>These tickets aren't available</h3><p>${err instanceof Error ? err.message : ''} Someone may have just bought them. Here are more for the same event.</p><a class="btn btn--primary btn--sm" href="#/browse">Browse events</a></div>`
            : errorState({ title: "Couldn't start checkout" })
        }</div></div>`,
      ),
      onMount: (/** @type {HTMLElement} */ root) =>
        root.querySelector('[data-retry]')?.addEventListener('click', () => location.reload()),
    };
  }

  const e = order.event;
  const city = cities.find((c) => c.id === e.cityId)?.name ?? '';
  const listedUnit = order.listing?.pricePence ?? order.unitPence;
  const fromOffer = order.unitPence < listedUnit;
  const rows = [
    {
      label: `${order.quantity} × ${order.tier?.name ?? 'ticket'}`,
      value: formatPence(order.unitPence * order.quantity, { exact: true }),
      note: fromOffer
        ? `Your accepted offer: ${formatPence(order.unitPence, { exact: true })} each (listed at ${formatPence(listedUnit, { exact: true })})`
        : `${formatPence(order.unitPence, { exact: true })} each · original price ${formatPence(order.listing?.faceValuePence ?? order.unitPence, { exact: true })}`,
    },
    { label: `Buyer fee (${pricing.buyerFeeBps / 100}%)`, value: formatPence(order.buyerFeePence, { exact: true }) },
    { label: 'Total to pay', value: formatPence(order.totalPence, { exact: true }), strong: true },
  ];

  const view = html`<div class="page"><div class="container checkout">
    <div class="hold" id="hold" role="status">
      <div><strong>We're holding these tickets for you</strong><div class="small">Time left: ${countdown(order.holdExpiresAt ?? new Date().toISOString(), { format: 'clock', doneText: '00:00' })}</div></div>
    </div>
    <h1>Checkout</h1>
    <div class="checkout__grid">
      <section class="card" aria-labelledby="sum">
        <h2 id="sum">Your order</h2>
        <div class="order-event">
          <strong>${e.title}</strong>
          <span class="muted">${e.venue}, ${city}</span>
          <span class="muted">${formatDayLong(e.startsAt)} · doors ${formatTime(e.startsAt)}</span>
          <span class="row">${badge(order.delivery === 'pdf' ? 'PDF ticket' : `Transfer via ${order.transferPlatform ?? 'ticketing app'}`, 'blue')}${badge(e.ageRestriction, 'hot')}</span>
        </div>
        ${priceBreakdown(rows, 'Order total')}
        <p class="small muted">${order.delivery === 'pdf' ? "You'll be able to download your tickets straight after paying." : 'The seller will transfer your tickets to your email through the ticketing app.'} Your payment is held until after the event.</p>
        <button class="btn btn--ghost btn--sm" type="button" data-cancel>Cancel and release tickets</button>
      </section>
      <section class="card" aria-labelledby="payh">
        <h2 id="payh">Payment</h2>
        <form id="pay-form" class="stack" novalidate>
          <div class="form-error" role="alert"></div>
          <div id="pay-host"></div>
          <button class="btn btn--primary btn--block" type="submit" id="pay-btn">Pay ${formatPence(order.totalPence, { exact: true })}</button>
          <p class="small muted center">Secure payment. Protected by StudentSwap buyer protection.</p>
        </form>
      </section>
    </div>
    <div class="state-box" id="expired" hidden>
      <h3>Your hold has expired</h3><p>We released the tickets so others can buy them. You can try again if they're still available.</p>
      <div class="row"><button class="btn btn--primary btn--sm" type="button" data-again>Try again</button><a class="btn btn--secondary btn--sm" href="#/event/${e.id}">Back to event</a></div>
    </div>
  </div></div>`;

  /** @param {HTMLElement} root */
  function onMount(root) {
    const form = /** @type {HTMLFormElement} */ (root.querySelector('#pay-form'));
    const btn = /** @type {HTMLButtonElement} */ (root.querySelector('#pay-btn'));
    const formError = /** @type {HTMLElement} */ (form.querySelector('.form-error'));
    /** @type {import('../payments/provider.js').PaymentForm | null} */
    let pay = null;
    let expired = false;
    // The provider mounts its own form: a placeholder card form in demo mode, Stripe's Payment Element when live.
    payments
      .mountPaymentForm(/** @type {HTMLElement} */ (root.querySelector('#pay-host')), {
        orderId: order.id,
        totalPence: order.totalPence,
      })
      .then((form) => {
        pay = form;
        btn.disabled = false;
      })
      .catch((err) => {
        formError.textContent = err instanceof Error ? err.message : 'Could not load the payment form.';
      });
    btn.disabled = true;

    root.addEventListener('countdown:done', () => {
      expired = true;
      root.querySelector('.checkout__grid')?.setAttribute('hidden', '');
      root.querySelector('#hold')?.setAttribute('hidden', '');
      /** @type {HTMLElement} */ (root.querySelector('#expired')).hidden = false;
      /** @type {HTMLElement | null} */ (root.querySelector('[data-again]'))?.focus();
    });
    root.querySelector('[data-again]')?.addEventListener('click', () => location.reload());
    root.querySelector('[data-cancel]')?.addEventListener('click', async () => {
      await orders.cancelOrder(order.id).catch(() => {});
      toast('Tickets released');
      navigate(`/event/${e.id}`);
    });

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      formError.textContent = '';
      if (expired || !pay) return;
      busy(btn, true, 'Processing payment…');
      try {
        const { paymentRef } = await pay.pay();
        await orders.payOrder(order.id, { paymentRef });
        navigate(`/orders/${order.id}?paid=1`);
      } catch (err) {
        busy(btn, false);
        if (/** @type {any} */ (err)?.silent) return; // the form already showed the problem inline
        const msg = err instanceof Error ? err.message : 'Payment failed. Please try again.';
        // Expired holds are handled by the timer; everything else is shown inline, calmly.
        formError.textContent = /expired/i.test(msg) ? 'Your hold has expired.' : msg;
        formError.focus?.();
      }
    });
    startCountdowns();
  }

  return { ...shell(view), onMount };
}
