// PaymentProvider: the only place the app talks about payments.
//   - Buyers: Stripe Payment Element (cards, Apple/Google Pay) inside our checkout page.
//   - Sellers: Stripe Connect (hosted onboarding link, then payouts released by the backend after the event).
// Pages use `payments` only. Mock mode uses a placeholder card form; real mode is ./stripe.js.
import { USE_MOCKS } from '../config/env.js';
import { delay } from '../api/mock/util.js';
import { save, currentUserRecord } from '../api/mock/db.js';
import { mountPlaceholderCardForm } from '../components/payment-element.js';
import { stripePayments } from './stripe.js';

/**
 * Thrown when the form already showed the problem inline (e.g. an empty card number).
 * Checkout just re-enables the button and does not show a second error.
 */
export class PaymentFormError extends Error {
  constructor() {
    super('Please check your card details.');
    this.silent = true;
  }
}

/**
 * @typedef {object} PaymentForm
 * @property {() => Promise<{ paymentRef: string }>} pay Confirms the payment. Throws PaymentFormError (already shown inline)
 *   or an Error whose message is safe to show the buyer (e.g. "Your card was declined").
 *
 * @typedef {object} PaymentProvider
 * @property {(host: HTMLElement, o: { orderId: string, totalPence: number }) => Promise<PaymentForm>} mountPaymentForm
 *   Real: POST /payments/session -> PaymentIntent client secret, then mount Stripe's Payment Element into `host`.
 * @property {() => Promise<{ status: 'not_started' | 'pending' | 'complete' }>} getConnectStatus
 *   Real: GET /me/connect-status (the backend reads the Stripe account's requirements).
 * @property {(o?: { returnPath?: string }) => Promise<{ url: string }>} createOnboardingLink
 *   Real: POST /me/connect-link { returnPath } -> Stripe Account Link URL; Stripe sends the seller back to returnPath.
 */

/** @type {PaymentProvider} */
const mockPayments = {
  async mountPaymentForm(host) {
    const card = mountPlaceholderCardForm(host);
    return {
      async pay() {
        if (!card.validate()) throw new PaymentFormError();
        await delay(1200);
        if (card.getCard().number.replace(/\s/g, '') === '4000000000000002') {
          const err = new Error('Your card was declined. Try a different card.');
          /** @type {any} */ (err).code = 'card_declined';
          throw err;
        }
        return { paymentRef: `mock_pi_${Date.now()}` };
      },
    };
  },
  async getConnectStatus() {
    await delay(200);
    return { status: currentUserRecord().connectStatus ?? 'not_started' };
  },
  async createOnboardingLink({ returnPath = '/account/payouts' } = {}) {
    await delay(500);
    // Mock: pretend the seller finished Stripe's hosted onboarding. The page then refreshes the status.
    currentUserRecord().connectStatus = 'complete';
    save();
    return { url: `#${returnPath}` };
  },
};

export const payments = USE_MOCKS ? mockPayments : stripePayments;
