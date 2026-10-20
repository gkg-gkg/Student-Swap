import { html } from '../lib/html.js';
import { auth, AuthError } from '../auth/index.js';
import { USE_MOCKS } from '../config/env.js';
import { values, setFieldError, clearFieldErrors, setFormError, focusFirstError, busy } from '../lib/forms.js';
import { field } from '../components/ui.js';
import { navigate } from '../router.js';

/** @param {{ query: URLSearchParams }} ctx */
export default function render({ query }) {
  const next = query.get('next');
  return {
    title: 'Sign in | StudentSwap',
    description: 'Sign in to buy and sell student tickets.',
    layout: 'focus',
    exit: { href: '#/', label: 'Close' },
    view: html`<div class="auth"><div class="card auth__card">
      <h1>Welcome back</h1><p>Sign in with your university email.</p>
      <form class="stack" novalidate id="signin">
        <div class="form-error" role="alert"></div>
        ${field({ id: 'email', label: 'University email', type: 'email', required: true, autocomplete: 'email', inputmode: 'email' })}
        ${field({ id: 'password', label: 'Password', type: 'password', required: true, autocomplete: 'current-password' })}
        <div class="right small"><a class="link" href="#/forgot-password">Forgot password?</a></div>
        <button class="btn btn--primary btn--block" type="submit">Sign in</button>
      </form>
      <p class="auth__foot">New here? <a href="#/sign-up${next ? '?next=' + encodeURIComponent(next) : ''}">Create an account</a></p>
      ${USE_MOCKS ? html`<p class="demo-hint">Demo accounts (password <code>Password1!</code>):<br /><code>demo@bham.ac.uk</code> (student)<br /><code>admin@bham.ac.uk</code> (admin)</p>` : ''}
    </div></div>`,
    /** @param {HTMLElement} root */
    onMount(root) {
      const form = /** @type {HTMLFormElement} */ (root.querySelector('#signin'));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearFieldErrors(form);
        const v = values(form);
        const btn = /** @type {HTMLButtonElement} */ (form.querySelector('button[type=submit]'));
        if (!v.email.trim()) return (setFieldError(form, 'email', 'Enter your email.'), focusFirstError(form));
        if (!v.password) return (setFieldError(form, 'password', 'Enter your password.'), focusFirstError(form));
        busy(btn, true, 'Signing in…');
        try {
          await auth.signIn({ email: v.email, password: v.password });
          navigate(next ?? '/browse');
        } catch (err) {
          busy(btn, false);
          if (err instanceof AuthError && err.code === 'UserNotConfirmedException')
            return navigate(`/sign-up?step=verify&email=${encodeURIComponent(v.email)}`);
          setFormError(form, err instanceof Error ? err.message : 'Could not sign in. Please try again.');
        }
      });
    },
  };
}
