// Real PaymentProvider using Stripe. Needs: STRIPE_PUBLISHABLE_KEY (src/config/env.js) and the backend endpoints
//   POST /payments/session        { orderId } -> { clientSecret, stripeAccount }   (PaymentIntent on the seller's account)
//   GET  /me/connect-status                   -> { status }
//   POST /me/connect-link                     -> { url }
// The backend is the source of truth: it marks the order paid from Stripe's `payment_intent.succeeded` webhook.
// Card details never touch our servers (Stripe's iframe collects them).
import { STRIPE_PUBLISHABLE_KEY } from '../config/env.js';
import { request } from '../api/http.js';

/** @type {Promise<any> | null} */
let stripeJs = null;
/** Loads Stripe.js from Stripe's own domain (required for PCI scope; do not self-host it). Resolves to the `Stripe` factory. */
function loadStripeJs() {
  stripeJs ??= new Promise((resolve, reject) => {
    if (/** @type {any} */ (window).Stripe) return resolve(/** @type {any} */ (window).Stripe);
    const s = document.createElement('script');
    s.src = 'https://js.stripe.com/v3/';
    s.onload = () => resolve(/** @type {any} */ (window).Stripe);
    s.onerror = () => reject(new Error('Could not load the payment form. Check your connection and try again.'));
    document.head.appendChild(s);
  });
  return stripeJs;
}

/** @type {import('./provider.js').PaymentProvider} */
export const stripePayments = {
  async mountPaymentForm(host, { orderId }) {
    if (!STRIPE_PUBLISHABLE_KEY) throw new Error('Payments are not configured yet.');
    const [Stripe, { clientSecret, stripeAccount }] = await Promise.all([
      loadStripeJs(),
      request('/payments/session', { method: 'POST', body: { orderId } }),
    ]);
    // The payment is made on the seller's Stripe account (Stripe takes its fee from them; we get the booking fee).
    const stripe = Stripe(STRIPE_PUBLISHABLE_KEY, { stripeAccount });
    const elements = stripe.elements({
      clientSecret,
      appearance: {
        theme: 'stripe',
        variables: {
          colorPrimary: '#0072D6',
          colorText: '#0F172A',
          borderRadius: '10px',
          fontFamily: 'Inter, system-ui, sans-serif',
        },
      },
    });
    host.replaceChildren();
    elements.create('payment').mount(host);
    return {
      async pay() {
        const { error, paymentIntent } = await stripe.confirmPayment({
          elements,
          redirect: 'if_required', // 3-D Secure etc. may redirect; we come back to the order page, which waits for the webhook
          confirmParams: { return_url: `${location.origin}${location.pathname}#/orders/${orderId}?paid=1` },
        });
        if (error) throw new Error(error.message ?? 'Payment failed. Please try again.');
        return { paymentRef: paymentIntent.id };
      },
    };
  },
  getConnectStatus: () => request('/me/connect-status'),
  createOnboardingLink: ({ returnPath } = {}) => request('/me/connect-link', { method: 'POST', body: { returnPath } }),
};
