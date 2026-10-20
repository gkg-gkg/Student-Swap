import { html } from '../lib/html.js';
import { auth, AuthError, MOCK_CODE } from '../auth/index.js';
import { USE_MOCKS } from '../config/env.js';
import { values, setFieldError, clearFieldErrors, setFormError, focusFirstError, busy } from '../lib/forms.js';
import { field } from '../components/ui.js';
import { toast } from '../components/toast.js';
import { navigate } from '../router.js';

/** @param {{ query: URLSearchParams }} ctx */
export default function render({ query }) {
  const email = query.get('email') ?? '';
  return {
    title: 'Reset password | StudentSwap',
    description: 'Choose a new StudentSwap password.',
    layout: 'focus',
    exit: { href: '#/sign-in', label: 'Back' },
    view: html`<div class="auth"><div class="card auth__card">
      <h1>Choose a new password</h1><p>Enter the code we emailed to <strong>${email || 'you'}</strong> and your new password.</p>
      <form class="stack" novalidate id="reset">
        <div class="form-error" role="alert"></div>
        ${email ? '' : field({ id: 'email', label: 'University email', type: 'email', required: true, autocomplete: 'email' })}
        <div class="code-input">${field({ id: 'code', label: '6-digit code', required: true, inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, placeholder: '······' })}</div>
        ${field({ id: 'newPassword', label: 'New password', type: 'password', required: true, autocomplete: 'new-password', hint: 'At least 8 characters, with a letter and a number.' })}
        <button class="btn btn--primary btn--block" type="submit">Update password</button>
      </form>
      ${USE_MOCKS ? html`<p class="demo-hint">Demo mode: use code <code>${MOCK_CODE}</code>.</p>` : ''}
    </div></div>`,
    /** @param {HTMLElement} root */
    onMount(root) {
      const form = /** @type {HTMLFormElement} */ (root.querySelector('#reset'));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearFieldErrors(form);
        const v = values(form);
        const who = email || v.email;
        if (!who?.trim()) return (setFieldError(form, 'email', 'Enter your email.'), focusFirstError(form));
        if (!/^\d{6}$/.test(v.code ?? ''))
          return (setFieldError(form, 'code', 'Enter the 6-digit code.'), focusFirstError(form));
        if (!v.newPassword)
          return (setFieldError(form, 'newPassword', 'Choose a new password.'), focusFirstError(form));
        const btn = /** @type {HTMLButtonElement} */ (form.querySelector('button[type=submit]'));
        busy(btn, true, 'Updating…');
        try {
          await auth.confirmResetPassword({ email: who, code: v.code, newPassword: v.newPassword });
          toast('Password updated. Sign in with your new password.');
          navigate('/sign-in');
        } catch (err) {
          busy(btn, false);
          const code = err instanceof AuthError ? err.code : '';
          const msg = err instanceof Error ? err.message : 'Something went wrong.';
          if (code === 'InvalidPasswordException') (setFieldError(form, 'newPassword', msg), focusFirstError(form));
          else if (code === 'CodeMismatchException') (setFieldError(form, 'code', msg), focusFirstError(form));
          else setFormError(form, msg);
        }
      });
    },
  };
}
