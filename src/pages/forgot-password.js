import { html } from '../lib/html.js';
import { auth } from '../auth/index.js';
import { values, setFieldError, clearFieldErrors, setFormError, focusFirstError, busy } from '../lib/forms.js';
import { field } from '../components/ui.js';
import { navigate } from '../router.js';

export default function render() {
  return {
    title: 'Forgot password | StudentSwap',
    description: 'Reset your StudentSwap password.',
    layout: 'focus',
    exit: { href: '#/sign-in', label: 'Back' },
    view: html`<div class="auth"><div class="card auth__card">
      <h1>Forgot your password?</h1><p>Enter your university email and we'll send a code to reset it.</p>
      <form class="stack" novalidate id="forgot">
        <div class="form-error" role="alert"></div>
        ${field({ id: 'email', label: 'University email', type: 'email', required: true, autocomplete: 'email', inputmode: 'email' })}
        <button class="btn btn--primary btn--block" type="submit">Send reset code</button>
      </form>
      <p class="auth__foot"><a href="#/sign-in">Back to sign in</a></p>
    </div></div>`,
    /** @param {HTMLElement} root */
    onMount(root) {
      const form = /** @type {HTMLFormElement} */ (root.querySelector('#forgot'));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearFieldErrors(form);
        const { email } = values(form);
        if (!email.trim()) return (setFieldError(form, 'email', 'Enter your email.'), focusFirstError(form));
        const btn = /** @type {HTMLButtonElement} */ (form.querySelector('button[type=submit]'));
        busy(btn, true, 'Sending…');
        try {
          await auth.forgotPassword({ email });
          navigate(`/reset-password?email=${encodeURIComponent(email)}`);
        } catch (err) {
          busy(btn, false);
          setFormError(form, err instanceof Error ? err.message : 'Something went wrong.');
        }
      });
    },
  };
}
