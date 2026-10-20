import { html, mount } from '../lib/html.js';
import { auth, AuthError, MOCK_CODE } from '../auth/index.js';
import { USE_MOCKS } from '../config/env.js';
import { users } from '../api/index.js';
import { universities } from '../data/regions.js';
import { universityForEmail } from '../lib/university.js';
import { values, setFieldError, clearFieldErrors, setFormError, focusFirstError, busy } from '../lib/forms.js';
import { field, checkbox, stepper } from '../components/ui.js';
import { toast } from '../components/toast.js';
import { navigate } from '../router.js';

const STEPS = ['University email', 'Verify'];
const TONES = /** @type {const} */ (['blue', 'coral', 'amber', 'mint', 'night']);
const initialsOf = (/** @type {string} */ name) =>
  name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';

/** Display name from the university email, e.g. garv.gupta@bham.ac.uk -> "Garv G". Editable later in the account. @param {string} email */
const nameFromEmail = (email) => {
  const parts = (email.split('@')[0] ?? '')
    .split(/[^a-zA-Z]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase());
  if (parts.length === 0) return 'Student';
  return parts.length > 1 ? `${parts[0]} ${parts[1][0]}` : parts[0];
};

/** @param {{ query: URLSearchParams, user: import('../types/index.js').User | null }} ctx */
export default function render({ query, user }) {
  // Where the flow starts: signed-in with no profile -> 18+ step; ?step=verify&email= -> verify.
  const state = {
    step: user && !user.profileComplete ? 2 : query.get('step') === 'verify' ? 1 : 0,
    email: user?.email ?? query.get('email') ?? '',
    password: '',
    age: false,
    universityId: user?.universityId ?? '',
  };

  const supported = universities.map((u) => u.short).join(', ');

  /** @param {HTMLElement} root */
  function onMount(root) {
    const host = /** @type {HTMLElement} */ (root.querySelector('#signup'));
    const draw = () => {
      mount(host, view());
      wire();
      /** @type {HTMLElement | null} */ (
        host.querySelector('input:not([type=checkbox]), button[type=submit]')
      )?.focus();
    };
    async function finishProfile() {
      const me = await auth.getCurrentUser();
      const displayName = nameFromEmail(state.email);
      await users.completeProfile({
        displayName,
        universityId: state.universityId || me?.universityId || '',
        avatar: { tone: TONES[0], initials: initialsOf(displayName) },
        ageConfirmed: state.age,
      });
      toast('Welcome to StudentSwap!');
      navigate(query.get('next') ?? '/browse');
    }

    function view() {
      const s = state.step;
      const head = html`${stepper(STEPS, s)}`;
      if (s === 0) {
        return html`${head}<h1>Join with your uni email</h1><p>Only verified students can buy and sell. We'll send a 6-digit code to confirm it's you.</p>
          <form class="stack" novalidate data-form="details">
            <div class="form-error" role="alert"></div>
            ${field({ id: 'email', label: 'University email', type: 'email', value: state.email, required: true, autocomplete: 'email', inputmode: 'email', placeholder: 'you@university.ac.uk', hint: `Supported: ${supported}.` })}
            <p class="small" id="uni-match" aria-live="polite"></p>
            ${field({ id: 'password', label: 'Password', type: 'password', required: true, autocomplete: 'new-password', hint: 'At least 8 characters, with a letter and a number.' })}
            ${checkbox({ id: 'age', label: 'I confirm that I am 18 years old or over.', required: true })}
            ${checkbox({ id: 'terms', label: html`I agree to the <a href="#/terms" target="_blank" rel="noopener">Terms</a> and <a href="#/privacy" target="_blank" rel="noopener">Privacy Policy</a> (draft).`, required: true })}
            <button class="btn btn--primary btn--block" type="submit">Send my code</button>
          </form>
          <p class="auth__foot">Already have an account? <a href="#/sign-in">Sign in</a></p>`;
      }
      if (s === 1) {
        return html`${head}<h1>Check your email</h1><p>We sent a 6-digit code to <strong>${state.email}</strong>. It can take a minute to arrive.</p>
          <form class="stack" novalidate data-form="verify">
            <div class="form-error" role="alert"></div>
            <div class="code-input">${field({ id: 'code', label: '6-digit code', required: true, inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, placeholder: '······' })}</div>
            <button class="btn btn--primary btn--block" type="submit">Verify</button>
            <button class="btn btn--ghost btn--block" type="button" data-resend>Resend code</button>
          </form>
          ${USE_MOCKS ? html`<p class="demo-hint">Demo mode: no real email is sent. Use code <code>${MOCK_CODE}</code>.</p>` : ''}
          <p class="auth__foot"><a href="#" data-back>Use a different email</a></p>`;
      }
      // Signed in but sign-up was interrupted: confirm 18+ and the terms, then the profile is created for them.
      return html`${head}<h1>One quick thing</h1><p>StudentSwap is for adults only. Many events are 18+.</p>
        <form class="stack" novalidate data-form="age">
          <div class="form-error" role="alert"></div>
          ${checkbox({ id: 'age', label: 'I confirm that I am 18 years old or over.', required: true })}
          ${checkbox({ id: 'terms', label: html`I agree to the <a href="#/terms" target="_blank" rel="noopener">Terms</a> and <a href="#/privacy" target="_blank" rel="noopener">Privacy Policy</a> (draft).`, required: true })}
          <button class="btn btn--primary btn--block" type="submit">Continue</button>
        </form>`;
    }

    function wire() {
      const form = /** @type {HTMLFormElement | null} */ (host.querySelector('form'));
      if (!form) return;
      const kind = form.dataset.form;

      if (kind === 'details') {
        const emailEl = /** @type {HTMLInputElement} */ (form.elements.namedItem('email'));
        const match = /** @type {HTMLElement} */ (host.querySelector('#uni-match'));
        const hint = () => {
          const u = universityForEmail(emailEl.value);
          match.textContent = u ? `✓ ${u.name}` : '';
          match.style.color = 'var(--green-deep)';
          match.style.fontWeight = '600';
        };
        emailEl.addEventListener('input', hint);
        hint();
      }

      host.querySelector('[data-back]')?.addEventListener('click', (e) => {
        e.preventDefault();
        state.step = 0;
        draw();
      });

      host.querySelector('[data-resend]')?.addEventListener('click', async () => {
        await auth.resendSignUpCode({ email: state.email }).catch(() => {});
        toast('New code sent');
      });

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearFieldErrors(form);
        const v = values(form);
        const btn = /** @type {HTMLButtonElement} */ (form.querySelector('button[type=submit]'));
        try {
          if (kind === 'details') {
            if (!v.email?.trim())
              return (setFieldError(form, 'email', 'Enter your university email.'), focusFirstError(form));
            if (!universityForEmail(v.email))
              return (
                setFieldError(
                  form,
                  'email',
                  "That isn't a supported university email. Use the address your university gave you.",
                ),
                focusFirstError(form)
              );
            if (!v.password) return (setFieldError(form, 'password', 'Choose a password.'), focusFirstError(form));
            if (!v.age)
              return (setFieldError(form, 'age', 'You need to be 18 or over to continue.'), focusFirstError(form));
            if (!v.terms)
              return (
                setFieldError(form, 'terms', 'Please accept the Terms and Privacy Policy.'),
                focusFirstError(form)
              );
            state.age = true;
            busy(btn, true, 'Sending code…');
            await auth.signUp({ email: v.email, password: v.password });
            state.email = v.email.trim().toLowerCase();
            state.password = v.password;
            state.step = 1;
          } else if (kind === 'age') {
            if (!v.age)
              return (setFieldError(form, 'age', 'You need to be 18 or over to continue.'), focusFirstError(form));
            if (!v.terms)
              return (
                setFieldError(form, 'terms', 'Please accept the Terms and Privacy Policy.'),
                focusFirstError(form)
              );
            state.age = true;
            busy(btn, true, 'Setting up your account…');
            await finishProfile();
            return;
          } else if (kind === 'verify') {
            if (!/^\d{6}$/.test(v.code ?? ''))
              return (setFieldError(form, 'code', 'Enter the 6-digit code.'), focusFirstError(form));
            busy(btn, true, 'Verifying…');
            await auth.confirmSignUp({ email: state.email, code: v.code });
            state.universityId = universityForEmail(state.email)?.id ?? '';
            if (state.age) {
              busy(btn, true, 'Setting up your account…');
              await finishProfile();
              return;
            }
            state.step = 2; // arrived via sign-in: 18+ not yet confirmed
          }
          draw();
        } catch (err) {
          busy(btn, false);
          const code = err instanceof AuthError ? err.code : '';
          const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
          if (code === 'UsernameExistsException') setFormError(form, msg);
          else if (code === 'InvalidPasswordException') (setFieldError(form, 'password', msg), focusFirstError(form));
          else if (code === 'CodeMismatchException') (setFieldError(form, 'code', msg), focusFirstError(form));
          else if (code === 'InvalidEmailDomain') (setFieldError(form, 'email', msg), focusFirstError(form));
          else setFormError(form, msg);
        }
      });
    }
    draw();
  }

  return {
    title: 'Sign up | StudentSwap',
    description: 'Create your StudentSwap account with your university email.',
    layout: 'focus',
    exit: { href: '#/', label: 'Close' },
    view: html`<div class="auth"><div class="card auth__card" id="signup"></div></div>`,
    onMount,
  };
}
