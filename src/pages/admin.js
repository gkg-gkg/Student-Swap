import { html, mount } from '../lib/html.js';
import { admin } from '../api/index.js';
import { cities } from '../data/regions.js';
import { eventTypeLabels, reportReasonLabels } from '../data/labels.js';
import { formatPence } from '../lib/money.js';
import { formatDateTime } from '../lib/time.js';
import { londonToUtc } from '../lib/time.js';
import { poundsToPence } from '../features/make-offer.js';
import {
  tabs,
  badge,
  statusBadge,
  emptyState,
  errorState,
  skeletonBlocks,
  field,
  selectField,
  avatar,
} from '../components/ui.js';
import { toast } from '../components/toast.js';
import { navigate } from '../router.js';
import { values, setFieldError, clearFieldErrors, setFormError, focusFirstError, busy } from '../lib/forms.js';

const TABS = [
  ['', 'Overview'],
  ['listings', 'Listings'],
  ['reports', 'Reports'],
  ['events', 'Events'],
];
const SOURCE = /** @type {Record<string, string>} */ ({
  barcode: 'Barcode check',
  duplicate: 'Duplicate check',
  ai: 'AI check',
});

/** Mock admin area. Every call is also enforced server-side (admin role in the Cognito token). @param {{ params: Record<string, string>, user: any }} ctx */
export default function render({ params, user }) {
  const key = params.tab ?? '';
  if (!TABS.some(([k]) => k === key)) return { redirect: '/admin' };
  const here = `#/admin${key ? '/' + key : ''}`;

  const view = html`<div class="page"><div class="container">
    <div class="page-head"><div><span class="eyebrow">Admin</span><h1>Moderation</h1><p>Signed in as ${user.displayName}. Mock admin role.</p></div></div>
    ${tabs(
      TABS.map(([k, label]) => ({ href: `#/admin${k ? '/' + k : ''}`, label })),
      here,
      'Admin sections',
    )}
    <div id="admin-panel" tabindex="-1">${skeletonBlocks(3)}</div>
  </div></div>`;

  /** @param {HTMLElement} root */
  async function onMount(root) {
    const panel = /** @type {HTMLElement} */ (root.querySelector('#admin-panel'));
    const load = async (quiet = false) => {
      if (!quiet) mount(panel, skeletonBlocks(3));
      try {
        const tab = { '': overview, listings, reports, events }[
          /** @type {'' | 'listings' | 'reports' | 'events'} */ (key)
        ];
        const res = /** @type {{ view: any, onMount?: (root: HTMLElement) => void }} */ (
          await tab({ reload: () => load(true) })
        );
        mount(panel, res.view);
        res.onMount?.(panel);
      } catch (err) {
        if (/** @type {any} */ (err)?.status === 401)
          return navigate(`/sign-in?next=${encodeURIComponent(location.hash.slice(1))}`);
        console.error(err);
        mount(panel, errorState({ title: "Couldn't load this section" }));
        panel.querySelector('[data-retry]')?.addEventListener('click', () => load());
      }
    };
    load();
  }
  return { title: 'Admin | StudentSwap', description: 'StudentSwap admin.', view, onMount };
}

/** ---------- Overview: simple stats by university ---------- */
async function overview() {
  const { rows, totals } = await admin.stats();
  const stat = (/** @type {string} */ label, /** @type {string | number} */ value) =>
    html`<div class="stat"><span class="stat__label">${label}</span><strong class="stat__value">${value}</strong></div>`;
  return {
    view: html`<div class="stack stack--lg">
      <div class="stats">${stat('Users', totals.users)}${stat('Active listings', totals.activeListings)}${stat('Awaiting review', totals.awaitingReview)}${stat('Open reports', totals.openReports)}</div>
      <section aria-labelledby="bu"><h2 id="bu" class="h3" style="margin-bottom:12px">By university</h2>
        <div class="table-wrap"><table class="table"><thead><tr><th scope="col">University</th><th scope="col" class="num">Users</th><th scope="col" class="num">Active listings</th><th scope="col" class="num">Sales</th><th scope="col" class="num">Volume</th></tr></thead>
          <tbody>${rows.map((/** @type {any} */ r) => html`<tr><th scope="row">${r.name}</th><td class="num">${r.users}</td><td class="num">${r.activeListings}</td><td class="num">${r.ordersCount}</td><td class="num">${formatPence(r.volumePence, { exact: true })}</td></tr>`)}</tbody>
          <tfoot><tr><th scope="row">Total</th><td class="num">${totals.users}</td><td class="num">${totals.activeListings}</td><td class="num">${rows.reduce((/** @type {number} */ n, /** @type {any} */ r) => n + r.ordersCount, 0)}</td><td class="num">${formatPence(totals.volumePence, { exact: true })}</td></tr></tfoot></table></div>
      </section>
    </div>`,
  };
}

/** ---------- Listing review queue ---------- */
/** @param {{ reload: () => void }} ctx */
async function listings({ reload }) {
  const queue = await admin.reviewQueue();
  const card = (/** @type {any} */ l) => html`<article class="card review" data-id="${l.id}">
    <div class="row row--between"><div><a class="row-card__title" href="#/event/${l.eventId}">${l.event.title}</a><div class="muted small">${formatDateTime(l.event.startsAt)} · ${l.event.venue}</div></div>${statusBadge('listing', l.status)}</div>
    <div class="row">${l.seller ? html`${avatar(l.seller, 'sm')}<a class="link" href="#/seller/${l.seller.id}">${l.seller.displayName}</a> <span class="small muted">${l.seller.completedSales} sales</span>` : ''}<span>${l.quantity} × ${l.tier?.name} at <strong>${formatPence(l.pricePence, { exact: true })}</strong> <span class="muted small">(original ${formatPence(l.faceValuePence)})</span></span>${l.aiAssisted ? badge('Autofilled by AI', 'blue') : ''}</div>
    <div><strong class="small">Why it is here</strong>
      ${l.reviewReasons?.length ? html`<ul class="reasons">${l.reviewReasons.map((/** @type {any} */ r) => html`<li><span class="reasons__src">${SOURCE[r.source] ?? r.source}</span>${r.severity ? badge(r.severity, r.severity === 'high' ? 'hot' : 'warn') : ''}<span>${r.message}</span></li>`)}</ul>` : html`<p class="muted small">No automatic reason recorded.</p>`}</div>
    <div class="preview"><strong>${l.file?.name ?? 'ticket file'}</strong><span class="small muted">Private file. In production this opens through a short-lived presigned link, never a public URL.</span><button class="btn btn--secondary btn--sm" type="button" data-preview>Open preview (placeholder)</button></div>
    <form class="stack" data-form novalidate><div class="form-error" role="alert"></div>
      ${field({ id: `note-${l.id}`, name: 'note', label: 'Note to the seller', required: true, hint: 'Required if you reject. Shown to the seller.', textarea: true, rows: 2 })}
      <div class="row"><button class="btn btn--primary btn--sm" type="submit" data-decision="approve">Approve</button><button class="btn btn--danger btn--sm" type="submit" data-decision="reject">Reject</button></div></form>
  </article>`;
  return {
    view: queue.length
      ? html`<div class="stack"><p class="muted">${queue.length} ${queue.length === 1 ? 'listing' : 'listings'} waiting, oldest first.</p>${queue.map(card)}</div>`
      : emptyState({ title: 'Nothing to review', body: 'Listings flagged by the automatic checks show up here.' }),
    onMount(/** @type {HTMLElement} */ root) {
      root
        .querySelectorAll('[data-preview]')
        .forEach((b) =>
          b.addEventListener('click', () => toast('Placeholder: the real preview is a presigned S3 link.')),
        );
      root.querySelectorAll('form[data-form]').forEach((f) =>
        f.addEventListener('submit', async (e) => {
          e.preventDefault();
          const form = /** @type {HTMLFormElement} */ (f);
          const decision = /** @type {'approve' | 'reject'} */ (
            /** @type {SubmitEvent} */ (e).submitter?.getAttribute('data-decision')
          );
          const id = /** @type {HTMLElement} */ (form.closest('[data-id]')).dataset.id;
          clearFieldErrors(form);
          const note = values(form).note.trim();
          if (decision === 'reject' && !note)
            return (
              setFieldError(form, 'note', 'Add a reason so the seller knows what to fix.'),
              focusFirstError(form)
            );
          const btn = /** @type {HTMLButtonElement} */ (/** @type {SubmitEvent} */ (e).submitter);
          busy(btn, true, '…');
          try {
            await admin.reviewListing(/** @type {string} */ (id), { decision, note: note || undefined });
            toast(decision === 'approve' ? 'Listing approved and live' : 'Listing rejected');
            reload();
          } catch (err) {
            busy(btn, false);
            setFormError(form, err instanceof Error ? err.message : 'Could not save.');
          }
        }),
      );
    },
  };
}

/** ---------- Reports queue ---------- */
/** @param {{ reload: () => void }} ctx */
async function reports({ reload }) {
  const queue = await admin.reportsQueue();
  const card = (/** @type {any} */ r) => html`<article class="card review" data-id="${r.id}">
    <div class="row row--between"><div><strong>${reportReasonLabels[r.reason] ?? r.reason}</strong><div class="muted small">Report ${r.id} · ${formatDateTime(r.createdAt)}</div></div>${statusBadge('report', r.status)}</div>
    <p>${r.description}</p>
    ${r.evidenceNames?.length ? html`<p class="small">Evidence: ${r.evidenceNames.join(', ')}</p>` : html`<p class="small muted">No evidence attached.</p>`}
    <div class="row small"><span>${r.event?.title}</span><span class="muted">Order ${r.orderId}${r.order ? ` · ${formatPence(r.order.totalPence, { exact: true })}` : ''}</span></div>
    <div class="row small"><span>Buyer: <a class="link" href="#/seller/${r.buyer?.id}">${r.buyer?.displayName}</a></span><span>Seller: <a class="link" href="#/seller/${r.seller?.id}">${r.seller?.displayName}</a></span></div>
    <form class="stack" data-form novalidate><div class="form-error" role="alert"></div>
      ${field({ id: `rn-${r.id}`, name: 'note', label: 'Decision note (shown to the buyer)', textarea: true, rows: 2, required: true })}
      <div class="row"><button class="btn btn--primary btn--sm" type="submit" data-resolution="refund">Refund buyer</button><button class="btn btn--secondary btn--sm" type="submit" data-resolution="deny">Deny and pay seller</button></div></form>
  </article>`;
  return {
    view: queue.length
      ? html`<div class="stack"><p class="muted">${queue.length} open ${queue.length === 1 ? 'report' : 'reports'}. A refund voids the seller's payout; denying releases it.</p>${queue.map(card)}</div>`
      : emptyState({ title: 'No open reports', body: 'Reports from buyers show up here.' }),
    onMount(/** @type {HTMLElement} */ root) {
      root.querySelectorAll('form[data-form]').forEach((f) =>
        f.addEventListener('submit', async (e) => {
          e.preventDefault();
          const form = /** @type {HTMLFormElement} */ (f);
          const resolution = /** @type {'refund' | 'deny'} */ (
            /** @type {SubmitEvent} */ (e).submitter?.getAttribute('data-resolution')
          );
          const id = /** @type {HTMLElement} */ (form.closest('[data-id]')).dataset.id;
          clearFieldErrors(form);
          const note = values(form).note.trim();
          if (!note)
            return (setFieldError(form, 'note', 'Add a short note explaining the decision.'), focusFirstError(form));
          const btn = /** @type {HTMLButtonElement} */ (/** @type {SubmitEvent} */ (e).submitter);
          busy(btn, true, '…');
          try {
            await admin.resolveReport(/** @type {string} */ (id), { resolution, note });
            toast(resolution === 'refund' ? 'Refund approved' : 'Report closed, seller will be paid');
            reload();
          } catch (err) {
            busy(btn, false);
            setFormError(form, err instanceof Error ? err.message : 'Could not save.');
          }
        }),
      );
    },
  };
}

/** ---------- Events: requests + create ---------- */
const SLOTS = ['21:00', '21:30', '22:00', '22:30', '23:00', '23:30'];
/** @param {{ reload: () => void }} ctx */
async function events({ reload }) {
  const requests = await admin.eventRequests();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  return {
    view: html`<div class="stack stack--lg">
      <section aria-labelledby="rq"><h2 id="rq" class="h3" style="margin-bottom:12px">Requests from sellers</h2>
        ${requests.length ? html`<div class="stack">${requests.map((/** @type {any} */ r) => html`<article class="row-card"><div class="row-card__main"><strong>${r.name}</strong><span class="muted small">${r.venue} · ${r.date} · requested by ${r.requester}</span>${r.note ? html`<span class="small">${r.note}</span>` : ''}</div><div class="row-card__actions"><button class="btn btn--secondary btn--sm" type="button" data-fill="${r.id}">Use as a starting point</button><button class="btn btn--ghost btn--sm" type="button" data-dismiss="${r.id}">Dismiss</button></div></article>`)}</div>` : emptyState({ title: 'No requests', body: "When a seller can't find their event, the request appears here." })}</section>
      <section class="card" aria-labelledby="ae"><h2 id="ae" class="h3">Add an event</h2>
        <form id="event-form" class="stack" novalidate><div class="form-error" role="alert"></div>
          ${field({ id: 'title', label: 'Event name', required: true })}
          ${field({ id: 'venue', label: 'Venue', required: true })}
          <div class="two-col">${selectField({ id: 'cityId', label: 'City', options: cities.map((c) => ({ value: c.id, label: c.name })), placeholder: 'Choose…', required: true })}${selectField({ id: 'type', label: 'Type', options: Object.entries(eventTypeLabels).map(([value, label]) => ({ value, label })), value: 'club_night', required: true })}</div>
          <div class="two-col">${field({ id: 'date', label: 'Date', type: 'date', value: tomorrow, required: true })}${selectField({ id: 'time', label: 'Start time', options: SLOTS.map((t) => ({ value: t, label: t })), value: '22:00', required: true })}</div>
          <div class="two-col">${field({ id: 'tier1', label: 'Ticket type', value: 'General release', required: true })}${field({ id: 'price1', label: 'Original price', prefix: '£', inputmode: 'decimal', required: true })}</div>
          <div class="two-col">${field({ id: 'tier2', label: 'Second ticket type' })}${field({ id: 'price2', label: 'Original price', prefix: '£', inputmode: 'decimal' })}</div>
          ${field({ id: 'description', label: 'Description', textarea: true, rows: 3 })}
          <div><button class="btn btn--primary" type="submit">Add event</button></div>
        </form></section>
    </div>`,
    onMount(/** @type {HTMLElement} */ root) {
      const form = /** @type {HTMLFormElement} */ (root.querySelector('#event-form'));
      root.querySelectorAll('[data-dismiss]').forEach((b) =>
        b.addEventListener('click', async () => {
          await admin.dismissEventRequest(/** @type {string} */ (/** @type {HTMLElement} */ (b).dataset.dismiss));
          reload();
        }),
      );
      root.querySelectorAll('[data-fill]').forEach((b) =>
        b.addEventListener('click', () => {
          const r = requests.find((/** @type {any} */ x) => x.id === /** @type {HTMLElement} */ (b).dataset.fill);
          if (!r) return;
          /** @type {HTMLInputElement} */ (form.elements.namedItem('title')).value = r.name;
          /** @type {HTMLInputElement} */ (form.elements.namedItem('venue')).value = r.venue;
          if (r.date) /** @type {HTMLInputElement} */ (form.elements.namedItem('date')).value = r.date;
          form.scrollIntoView({ behavior: 'smooth' });
        }),
      );
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearFieldErrors(form);
        const v = values(form);
        for (const k of ['title', 'venue', 'cityId', 'date', 'tier1'])
          if (!v[k]?.trim()) setFieldError(form, k, 'Required.');
        const p1 = poundsToPence(v.price1 ?? '');
        if (Number.isNaN(p1) || p1 < 100) setFieldError(form, 'price1', 'Enter an original price of at least £1.');
        const tiers = [{ name: v.tier1, faceValuePence: p1 }];
        if (v.tier2?.trim()) {
          const p2 = poundsToPence(v.price2 ?? '');
          if (Number.isNaN(p2) || p2 < 100) setFieldError(form, 'price2', 'Enter an original price of at least £1.');
          else tiers.push({ name: v.tier2, faceValuePence: p2 });
        }
        if (form.querySelector('.field--error')) return focusFirstError(form);
        const [hh, mm] = v.time.split(':').map(Number);
        const btn = /** @type {HTMLButtonElement} */ (form.querySelector('button[type=submit]'));
        busy(btn, true, 'Adding…');
        try {
          await admin.createEvent({
            title: v.title,
            venue: v.venue,
            cityId: v.cityId,
            type: v.type,
            startsAt: londonToUtc(v.date, hh, mm),
            durationHours: 6,
            description: v.description,
            tiers,
          });
          toast('Event added. It is live for buyers and sellers.');
          reload();
        } catch (err) {
          busy(btn, false);
          setFormError(form, err instanceof Error ? err.message : 'Could not add the event.');
        }
      });
    },
  };
}
