import { html } from '../../lib/html.js';
import { users, notifications } from '../../api/index.js';
import { auth } from '../../auth/index.js';
import { USE_MOCKS } from '../../config/env.js';
import { resetDb } from '../../api/mock/db.js';
import { universities } from '../../data/regions.js';
import { field } from '../../components/ui.js';
import { toast } from '../../components/toast.js';
import { values, setFieldError, clearFieldErrors, setFormError, focusFirstError, busy } from '../../lib/forms.js';
import { navigate } from '../../router.js';

const TONES = ['blue', 'coral', 'amber', 'mint', 'night'];
const PREFS = /** @type {const} */ ([
  ['offers', 'Offers', 'New offers, counter-offers and replies'],
  ['orders', 'Orders and tickets', 'Purchases, transfers and payout updates'],
  ['alerts', 'Ticket alerts', 'When tickets drop for events you follow'],
  ['marketing', 'News and tips', 'Occasional product updates. Off by default'],
]);

/** @param {{ user: import('../../types/index.js').User, rerender: () => void }} ctx */
export async function render({ user, rerender }) {
  const uni = universities.find((u) => u.id === user.universityId);
  return {
    view: html`<div class="stack stack--lg settings">
      <section class="card card--flat" aria-labelledby="pf"><h2 id="pf" class="h3">Profile</h2>
        <form id="profile-form" class="stack" novalidate><div class="form-error" role="alert"></div>
          ${field({ id: 'displayName', label: 'Display name', value: user.displayName, required: true, maxlength: 30 })}
          <div class="field"><label>Email</label><div>${user.email}</div></div>
          <div class="field"><label>University</label><div class="row">${uni?.name} <span class="badge badge--ok">Verified by your email</span></div></div>
          <fieldset class="field" style="border:0;padding:0;margin:0"><legend style="font-weight:600;font-size:.92rem;margin-bottom:8px">Avatar colour</legend>
            <div class="avatar-picker" role="radiogroup">${TONES.map((t) => html`<label><input type="radio" name="tone" value="${t}" ${t === user.avatar.tone ? 'checked' : ''} aria-label="${t}" /><span class="avatar avatar--lg art--${t}">${user.avatar.initials}</span></label>`)}</div></fieldset>
          <div><button class="btn btn--primary" type="submit">Save profile</button></div>
        </form></section>
      <section class="card card--flat" aria-labelledby="nt"><h2 id="nt" class="h3">Notifications</h2>
        <div class="stack">${PREFS.map(([k, label, sub]) => html`<label class="switch"><input type="checkbox" role="switch" data-pref="${k}" ${user.notificationPrefs[k] ? 'checked' : ''} /><span class="switch__track" aria-hidden="true"></span><span><strong>${label}</strong><span class="muted small" style="display:block">${sub}</span></span></label>`)}</div></section>
      <section class="card card--flat" aria-labelledby="ac"><h2 id="ac" class="h3">Account</h2>
        <div class="row"><button class="btn btn--secondary" type="button" data-signout>Sign out</button><a class="btn btn--ghost" href="#/contact">Delete my account (contact us)</a></div>
        ${USE_MOCKS ? html`<div class="demo-hint">Demo mode: <button class="link-btn" type="button" data-reset>reset demo data</button> to start fresh (signs you out).</div>` : ''}</section>
    </div>`,
    /** @param {HTMLElement} root */
    onMount(root) {
      const form = /** @type {HTMLFormElement} */ (root.querySelector('#profile-form'));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearFieldErrors(form);
        const v = values(form);
        if (v.displayName.trim().length < 2)
          return (
            setFieldError(form, 'displayName', 'Display name must be at least 2 characters.'),
            focusFirstError(form)
          );
        const btn = /** @type {HTMLButtonElement} */ (form.querySelector('button[type=submit]'));
        busy(btn, true, 'Saving…');
        try {
          const initials = v.displayName
            .trim()
            .split(/\s+/)
            .map((p) => p[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();
          await users.updateProfile({
            displayName: v.displayName,
            avatar: { tone: /** @type {any} */ (v.tone), initials },
          });
          toast('Profile saved');
          rerender();
        } catch (err) {
          busy(btn, false);
          setFormError(form, err instanceof Error ? err.message : 'Could not save.');
        }
      });
      root.querySelectorAll('[data-pref]').forEach((i) =>
        i.addEventListener('change', async () => {
          const el = /** @type {HTMLInputElement} */ (i);
          try {
            await notifications.updatePrefs({ [/** @type {string} */ (el.dataset.pref)]: el.checked });
            toast('Preference saved');
          } catch {
            el.checked = !el.checked;
            toast('Could not save. Please try again.', 'error');
          }
        }),
      );
      root.querySelector('[data-signout]')?.addEventListener('click', async () => {
        await auth.signOut();
        toast('Signed out');
        navigate('/');
      });
      root.querySelector('[data-reset]')?.addEventListener('click', () => {
        resetDb();
        toast('Demo data reset');
        navigate('/');
        location.reload();
      });
    },
  };
}
