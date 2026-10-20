import { html } from '../lib/html.js';
import { reports } from '../api/index.js';
import { reportReasonLabels } from '../data/labels.js';
import { formatDateTime } from '../lib/time.js';
import { statusBadge, errorState } from '../components/ui.js';

/** @param {{ params: Record<string, string>, rerender: () => void }} ctx */
export default async function render({ params, rerender }) {
  /** @type {any} */
  let r;
  try {
    r = await reports.getReport(params.id);
  } catch (err) {
    return {
      title: 'Report | StudentSwap',
      description: '',
      view: html`<div class="page"><div class="container">${errorState({ title: err instanceof Error && /not found/i.test(err.message) ? "We can't find that report" : "Couldn't load this report" })}</div></div>`,
      onMount: (/** @type {HTMLElement} */ root) =>
        root.querySelector('[data-retry]')?.addEventListener('click', () => rerender()),
    };
  }
  const resolved = r.status !== 'open';
  const steps = [
    ['Report submitted', formatDateTime(r.createdAt), true],
    ['Under review', 'A person is looking at your evidence', true],
    [
      r.status === 'resolved_refund'
        ? 'Refund approved'
        : r.status === 'resolved_denied'
          ? 'Closed: no refund'
          : 'Decision',
      resolved ? 'Resolved' : 'We usually reply within a day',
      resolved,
    ],
  ];
  return {
    title: 'Report status | StudentSwap',
    description: 'Track your report.',
    view: html`<div class="page page--narrow"><div class="container order-page">
      <a class="back-link" href="#/orders/${r.orderId}">← Back to order</a>
      <div class="row row--between"><h1 class="order-title" style="margin:0">Report ${r.id}</h1>${statusBadge('report', r.status)}</div>
      <p class="muted" style="margin:8px 0 24px">${r.event?.title ?? ''}</p>
      <div class="stack">
        <section class="card" aria-labelledby="pr"><h2 id="pr">Progress</h2>
          <ol class="timeline">${steps.map(([label, when, ok]) => html`<li class="${ok ? 'is-done' : ''}"><span class="timeline__dot" aria-hidden="true">${ok ? '✓' : ''}</span><div><strong>${label}</strong><span class="muted small">${when}</span></div></li>`)}</ol>
          ${r.resolutionNote ? html`<div class="notice ${r.status === 'resolved_refund' ? 'notice--ok' : ''}"><strong>Our decision:</strong> ${r.resolutionNote}</div>` : ''}
          ${r.status === 'resolved_refund' ? html`<p class="small muted">Refunds go back to your original payment method. Your bank decides how quickly it appears.</p>` : ''}
        </section>
        <section class="card" aria-labelledby="dt"><h2 id="dt">What you reported</h2>
          <p><strong>${reportReasonLabels[r.reason] ?? r.reason}</strong></p>
          <p class="muted">${r.description}</p>
          ${r.evidenceNames?.length ? html`<p class="small">Evidence: ${r.evidenceNames.join(', ')}</p>` : ''}
        </section>
      </div>
    </div></div>`,
  };
}
