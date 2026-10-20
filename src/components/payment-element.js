// MOCK-ONLY card form, used by payments/provider.js when USE_MOCKS is true. In real mode Stripe's Payment
// Element (payments/stripe.js) replaces it entirely. Raw card numbers must never reach our own servers.
import { html, mount } from '../lib/html.js';
import { field } from './ui.js';
import { USE_MOCKS } from '../config/env.js';

/** @param {HTMLElement} host */
export function mountPlaceholderCardForm(host) {
  mount(
    host,
    html`<fieldset class="pay" id="pay-fields">
    <legend>Pay by card</legend>
    <p class="pay__note">Demo card form. In production Stripe's secure payment form appears here. Cards are never stored by StudentSwap.</p>
    ${field({ id: 'cardName', label: 'Name on card', required: true, autocomplete: 'cc-name' })}
    ${field({ id: 'cardNumber', label: 'Card number', required: true, inputmode: 'numeric', autocomplete: 'cc-number', placeholder: '1234 5678 9012 3456', maxlength: 23 })}
    <div class="pay__row">
      ${field({ id: 'cardExp', label: 'Expiry', required: true, inputmode: 'numeric', autocomplete: 'cc-exp', placeholder: 'MM/YY', maxlength: 5 })}
      ${field({ id: 'cardCvc', label: 'CVC', required: true, inputmode: 'numeric', autocomplete: 'cc-csc', placeholder: '123', maxlength: 4 })}
    </div>
    ${USE_MOCKS ? html`<p class="demo-hint">Demo: any valid-looking card works, e.g. <code>4242 4242 4242 4242</code>, any future date, any CVC. Use <code>4000 0000 0000 0002</code> to see a declined card.</p>` : ''}
  </fieldset>`,
  );

  const q = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ (host.querySelector('#' + id));
  const num = q('cardNumber');
  const exp = q('cardExp');
  num.addEventListener('input', () => {
    num.value = num.value
      .replace(/\D/g, '')
      .slice(0, 19)
      .replace(/(.{4})/g, '$1 ')
      .trim();
  });
  exp.addEventListener('input', () => {
    const d = exp.value.replace(/\D/g, '').slice(0, 4);
    exp.value = d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  });

  /** @param {string} id @param {string} [msg] */
  const err = (id, msg) => {
    const wrap = /** @type {HTMLElement} */ (q(id).closest('.field'));
    wrap.classList.toggle('field--error', !!msg);
    const e = /** @type {HTMLElement} */ (wrap.querySelector('.field__error'));
    e.textContent = msg ?? '';
    return msg;
  };

  return {
    /** @returns {boolean} true when the card details look valid */
    validate() {
      const digits = num.value.replace(/\D/g, '');
      const [mm, yy] = exp.value.split('/');
      const now = new Date();
      const expOk =
        /^\d{2}$/.test(mm ?? '') &&
        /^\d{2}$/.test(yy ?? '') &&
        +mm >= 1 &&
        +mm <= 12 &&
        new Date(2000 + +yy, +mm, 0, 23, 59) >= now;
      const problems = [
        err('cardName', q('cardName').value.trim() ? '' : 'Enter the name on the card.'),
        err('cardNumber', digits.length >= 13 ? '' : 'Enter your card number.'),
        err('cardExp', expOk ? '' : 'Enter a valid expiry date (MM/YY).'),
        err('cardCvc', /^\d{3,4}$/.test(q('cardCvc').value) ? '' : 'Enter the 3 or 4 digit code.'),
      ].filter(Boolean);
      if (problems.length) /** @type {HTMLElement | null} */ (host.querySelector('.field--error input'))?.focus();
      return problems.length === 0;
    },
    getCard: () => ({ number: num.value }),
  };
}
