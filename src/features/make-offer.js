// Make-offer modal, shared by the event page and seller profile.
import { html, mount } from '../lib/html.js';
import { offers } from '../api/index.js';
import { formatPence } from '../lib/money.js';
import { buyerTotal } from '../lib/fees.js';
import { field, priceBreakdown } from '../components/ui.js';
import { openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { values, setFieldError, clearFieldErrors, setFormError, focusFirstError, busy } from '../lib/forms.js';
import { navigate } from '../router.js';
import { pricing } from '../config/pricing.js';

/** Parse "12.50" -> 1250 pence, or NaN. @param {string} s */
export const poundsToPence = (s) => (/^\d+(\.\d{1,2})?$/.test(s.trim()) ? Math.round(parseFloat(s) * 100) : NaN);

/** @param {any} listing enriched listing @param {{ onDone?: () => void }} [o] */
export function openOfferModal(listing, { onDone } = {}) {
  const suggested = Math.max(100, Math.floor((listing.pricePence * 0.9) / 50) * 50);
  openModal({
    title: 'Make an offer',
    variant: 'sheet',
    body: html`<p class="muted">${listing.event.title}: ${listing.quantity} ${listing.quantity === 1 ? 'ticket' : 'tickets'}, listed at ${formatPence(listing.pricePence, { exact: true })} each.</p>
      <form class="stack" novalidate id="offer-form">
        <div class="form-error" role="alert"></div>
        ${field({ id: 'amount', label: 'Your offer per ticket', prefix: '£', inputmode: 'decimal', value: (suggested / 100).toFixed(2), required: true, hint: `Up to ${formatPence(listing.pricePence, { exact: true })}. The seller has 24 hours to respond.` })}
        <div id="offer-summary" aria-live="polite"></div>
        <p class="small muted">If accepted, you'll have ${pricing.offerCheckoutWindowHours} hours to check out. Nothing is charged until then.</p>
        <div class="dialog__actions"><button class="btn btn--secondary" type="button" data-close-offer>Cancel</button><button class="btn btn--primary" type="submit">Send offer</button></div>
      </form>`,
    onOpen(dialog, close) {
      const form = /** @type {HTMLFormElement} */ (dialog.querySelector('#offer-form'));
      const summary = /** @type {HTMLElement} */ (dialog.querySelector('#offer-summary'));
      const input = /** @type {HTMLInputElement} */ (form.elements.namedItem('amount'));
      const update = () => {
        const p = poundsToPence(input.value);
        if (Number.isNaN(p) || p < 100 || p > listing.pricePence) return mount(summary, html``);
        const { price, buyerFee, total } = buyerTotal(p * listing.quantity);
        mount(
          summary,
          priceBreakdown(
            [
              {
                label: `Offer (${listing.quantity} × ${formatPence(p, { exact: true })})`,
                value: formatPence(price, { exact: true }),
              },
              { label: 'Buyer fee (5%)', value: formatPence(buyerFee, { exact: true }) },
              { label: 'You would pay', value: formatPence(total, { exact: true }), strong: true },
            ],
            'Offer total',
          ),
        );
      };
      input.addEventListener('input', update);
      update();
      dialog.querySelector('[data-close-offer]')?.addEventListener('click', close);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearFieldErrors(form);
        const p = poundsToPence(values(form).amount);
        if (Number.isNaN(p) || p < 100)
          return (setFieldError(form, 'amount', 'Enter an amount of at least £1.'), focusFirstError(form));
        if (p > listing.pricePence)
          return (
            setFieldError(
              form,
              'amount',
              `Offers can't be higher than the listing price (${formatPence(listing.pricePence, { exact: true })}). You can just buy it.`,
            ),
            focusFirstError(form)
          );
        const btn = /** @type {HTMLButtonElement} */ (form.querySelector('button[type=submit]'));
        busy(btn, true, 'Sending…');
        try {
          await offers.createOffer({ listingId: listing.id, amountPence: p });
          close();
          toast("Offer sent. We'll let you know when the seller replies.");
          onDone?.();
          navigate('/account/offers');
        } catch (err) {
          busy(btn, false);
          setFormError(form, err instanceof Error ? err.message : 'Could not send your offer.');
        }
      });
    },
  });
}
