import { html, mount } from '../../lib/html.js';
import { payouts } from '../../api/index.js';
import { payments } from '../../payments/provider.js';
import { formatPence } from '../../lib/money.js';
import { formatDateTime } from '../../lib/time.js';
import { statusBadge, emptyState, badge } from '../../components/ui.js';
import { toast } from '../../components/toast.js';
import { busy } from '../../lib/forms.js';
import { pricing } from '../../config/pricing.js';
import { eventLine, sectionHead } from './shared.js';

/** @param {'not_started' | 'pending' | 'complete'} status */
const connectCard = (status) => html`<section class="card card--flat connect" aria-labelledby="cn">
  <div class="row row--between"><h2 id="cn" class="h3">Payout account</h2>
    ${status === 'complete' ? badge('Ready to be paid', 'ok') : status === 'pending' ? badge('Verification pending', 'warn') : badge('Not set up', 'hot')}</div>
  ${
    status === 'complete'
      ? html`<p class="muted">Your payout account is connected through Stripe. Released payouts go straight to your bank.</p>`
      : html`<p class="muted">To get paid you'll connect a bank account with Stripe, our payments partner. It takes a few minutes and you only do it once. You can list tickets before you finish, but we can't release money until you do.</p>
      <button class="btn btn--primary" type="button" data-connect>${status === 'pending' ? 'Continue setup' : 'Set up payouts'}</button>
      <p class="small muted">Placeholder: this will open Stripe's hosted Connect onboarding.</p>`
  }
</section>`;

export async function render() {
  const [summary, connect] = await Promise.all([payouts.getPayoutSummary(), payments.getConnectStatus()]);
  const t = summary.totals;
  const stat = (/** @type {string} */ label, /** @type {number} */ pence, /** @type {string} */ sub) =>
    html`<div class="stat"><span class="stat__label">${label}</span><strong class="stat__value">${formatPence(pence, { exact: true })}</strong><span class="small muted">${sub}</span></div>`;

  const view = html`<div class="stack stack--lg">
    <div id="connect-slot">${connectCard(connect.status)}</div>
    <section aria-label="Totals"><div class="stats">
      ${stat('Held', t.heldPence, `Released ${pricing.payoutReleaseHoursAfterEvent}h after each event`)}
      ${stat('Ready', t.eligiblePence, 'Being sent to your account')}
      ${stat('Paid out', t.releasedPence, 'In your bank')}
      ${t.frozenPence ? stat('Paused', t.frozenPence, "Open report: we're reviewing") : ''}
    </div></section>
    <section>${sectionHead('Payouts', summary.items.length)}
      ${
        summary.items.length
          ? html`<div class="stack">${summary.items.map(
              (/** @type {any} */ p) => html`<article class="row-card">
        <div class="row-card__main">
          <a class="row-card__title" href="#/orders/${p.orderId}">${p.event?.title ?? p.orderId}</a>
          <div class="muted small">${p.event ? eventLine(p.event) : ''}</div>
          <div class="row"><strong>${formatPence(p.amountPence, { exact: true })}</strong> <span class="muted small">(sale ${formatPence(p.grossPence, { exact: true })} − fee ${formatPence(p.sellerFeePence, { exact: true })})</span> ${statusBadge('payout', p.status)}</div>
          <div class="small muted">${p.status === 'released' ? `Paid ${formatDateTime(p.releasedAt ?? p.releaseAt)}` : p.status === 'frozen' ? 'Paused while a report is reviewed' : `Releases ${formatDateTime(p.releaseAt)}`}</div>
        </div></article>`,
            )}</div>`
          : emptyState({
              title: 'No payouts yet',
              body: 'When your tickets sell, the money is held safely and shows up here.',
              href: '#/sell/new',
              action: 'List a ticket',
            })
      }</section>
  </div>`;

  return {
    view,
    /** @param {HTMLElement} root */
    onMount(root) {
      const wire = () =>
        root.querySelector('[data-connect]')?.addEventListener('click', async (e) => {
          const btn = /** @type {HTMLButtonElement} */ (e.currentTarget);
          busy(btn, true, 'Opening Stripe…');
          try {
            const { url } = await payments.createOnboardingLink();
            if (/^https?:/.test(url)) return void location.assign(url); // real Stripe: hosted onboarding, returns to this page
            const s = await payments.getConnectStatus();
            mount(/** @type {HTMLElement} */ (root.querySelector('#connect-slot')), connectCard(s.status));
            toast('Payout account connected (demo)');
          } catch {
            busy(btn, false);
            toast('Could not start onboarding. Please try again.', 'error');
          }
        });
      wire();
    },
  };
}
