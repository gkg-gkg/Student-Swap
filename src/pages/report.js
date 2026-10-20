import { html, mount } from '../lib/html.js';
import { orders, reports, uploads } from '../api/index.js';
import { reportReasonLabels } from '../data/labels.js';
import { reportableOrderStates } from '../lib/status.js';
import { formatDateTime } from '../lib/time.js';
import { field, countdown, errorState } from '../components/ui.js';
import { dropzone, initDropzone } from '../components/dropzone.js';
import { toast } from '../components/toast.js';
import { values, setFieldError, clearFieldErrors, setFormError, focusFirstError, busy } from '../lib/forms.js';
import { navigate } from '../router.js';

const MAX_FILES = 5;
const TYPES = ['application/pdf', 'image/png', 'image/jpeg'];

/** @param {{ params: Record<string, string>, user: import('../types/index.js').User, rerender: () => void }} ctx */
export default async function render({ params, user, rerender }) {
  /** @type {any} */
  let o;
  try {
    o = await orders.getOrder(params.id);
  } catch {
    return {
      title: 'Report a problem | StudentSwap',
      description: '',
      view: html`<div class="page"><div class="container">${errorState({ title: "Couldn't load this order" })}</div></div>`,
      onMount: (/** @type {HTMLElement} */ root) =>
        root.querySelector('[data-retry]')?.addEventListener('click', () => rerender()),
    };
  }

  const back = html`<a class="back-link" href="#/orders/${o.id}">← Back to order</a>`;
  const blocked = (/** @type {string} */ title, /** @type {any} */ body) => ({
    title: 'Report a problem | StudentSwap',
    description: '',
    view: html`<div class="page page--narrow"><div class="container">${back}<div class="state-box"><h3>${title}</h3>${body}</div></div></div>`,
  });
  if (o.buyerId !== user.id)
    return blocked("You can't report this order", html`<p>Only the buyer can report a problem.</p>`);
  if (o.report)
    return blocked(
      'You already reported this order',
      html`<a class="btn btn--primary btn--sm" href="#/reports/${o.report.id}">View report status</a>`,
    );
  if (!reportableOrderStates.includes(o.status) || new Date(o.payoutReleaseAt).getTime() <= Date.now()) {
    return blocked(
      'The reporting window has closed',
      html`<p>Problems must be reported before the seller's payout date (${formatDateTime(o.payoutReleaseAt)}). If something is seriously wrong, <a class="link" href="#/contact">contact us</a>.</p>`,
    );
  }

  /** @type {{ name: string, status: 'uploading' | 'done' | 'error' }[]} */
  const evidence = [];

  const view = html`<div class="page page--narrow"><div class="container">
    ${back}
    <h1 class="order-title">Report a problem</h1>
    <p class="muted">${o.event.title}. Report it before <strong>${formatDateTime(o.payoutReleaseAt)}</strong>: <span class="muted">${countdown(o.payoutReleaseAt, { doneText: 'window closed' })} left</span>. We pause the seller's payout while we look into it.</p>
    <form id="report-form" class="stack stack--lg" style="margin-top:24px" novalidate>
      <div class="form-error" role="alert"></div>
      <fieldset class="chips-fieldset" aria-describedby="reason-error"><legend>What went wrong?</legend>
        <div class="pick-list" role="radiogroup">${Object.entries(reportReasonLabels).map(([k, label]) => html`<label class="pick"><input type="radio" name="reason" value="${k}" /><span class="pick__body"><strong>${label}</strong></span></label>`)}</div>
        <p class="field__error" id="reason-error" role="alert"></p>
      </fieldset>
      ${field({ id: 'description', label: 'Tell us what happened', textarea: true, rows: 5, required: true, maxlength: 2000, hint: 'Include what you saw, when, and what the seller said (at least 20 characters).' })}
      <section class="stack" aria-labelledby="ev-h"><h2 id="ev-h" class="h3" style="margin:0">Evidence <span class="field__opt">(optional, up to ${MAX_FILES})</span></h2>
        ${dropzone({ id: 'evidence', accept: '.pdf,.png,.jpg,.jpeg', label: 'Add screenshots or photos', hint: 'PNG, JPG or PDF, up to 10 MB each', multiple: true })}
        <ul class="evidence-list" id="evidence-list"></ul>
      </section>
      <div class="notice">What happens next: we review your report, usually within a day. If the ticket was not valid you are refunded to your original payment method.</div>
      <div><button class="btn btn--primary" type="submit">Submit report</button></div>
    </form>
  </div></div>`;

  /** @param {HTMLElement} root */
  function onMount(root) {
    const form = /** @type {HTMLFormElement} */ (root.querySelector('#report-form'));
    const list = /** @type {HTMLElement} */ (root.querySelector('#evidence-list'));
    const drawList = () =>
      mount(
        list,
        html`${evidence.map((f, i) => html`<li class="evidence-item"><span class="evidence-item__name">${f.name}</span><span class="small muted">${f.status === 'uploading' ? 'Uploading…' : f.status === 'error' ? 'Failed' : 'Attached'}</span><button class="btn btn--ghost btn--sm" type="button" data-remove="${i}" aria-label="Remove ${f.name}">Remove</button></li>`)}`,
      );
    list.addEventListener('click', (e) => {
      const b = /** @type {HTMLElement} */ (e.target).closest('[data-remove]');
      if (!b) return;
      evidence.splice(Number(/** @type {HTMLElement} */ (b).dataset.remove), 1);
      drawList();
    });

    const dz = /** @type {HTMLElement} */ (root.querySelector('[data-dropzone]'));
    initDropzone(dz, async (files, input) => {
      for (const file of files) {
        if (evidence.length >= MAX_FILES) {
          toast(`You can attach up to ${MAX_FILES} files.`, 'error');
          break;
        }
        if (!TYPES.includes(file.type) || file.size > 10 * 1024 * 1024) {
          toast(`${file.name}: use a PNG, JPG or PDF under 10 MB.`, 'error');
          continue;
        }
        const entry = { name: file.name, status: /** @type {'uploading' | 'done' | 'error'} */ ('uploading') };
        evidence.push(entry);
        drawList();
        try {
          const { uploadUrl, key } = await uploads.requestUploadUrl({
            fileName: file.name,
            contentType: file.type,
            size: file.size,
            purpose: 'evidence',
          });
          await uploads.putFile(uploadUrl, file, key);
          entry.status = 'done';
        } catch {
          entry.status = 'error';
        }
        drawList();
      }
      input.value = '';
    });

    root.addEventListener('countdown:done', () => {
      form
        .querySelectorAll('input, textarea, button')
        .forEach((el) => /** @type {HTMLInputElement} */ (el).setAttribute('disabled', ''));
      setFormError(form, 'The reporting window has closed.');
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFieldErrors(form);
      const v = values(form);
      const reasonErr = /** @type {HTMLElement} */ (form.querySelector('#reason-error'));
      reasonErr.textContent = '';
      if (!v.reason) {
        reasonErr.textContent = 'Choose what went wrong.';
        return /** @type {HTMLElement | null} */ (form.querySelector('input[name=reason]'))?.focus();
      }
      if (v.description.trim().length < 20)
        return (
          setFieldError(form, 'description', 'Please describe the problem in at least 20 characters.'),
          focusFirstError(form)
        );
      if (evidence.some((f) => f.status === 'uploading'))
        return setFormError(form, 'Please wait for your files to finish uploading.');
      const btn = /** @type {HTMLButtonElement} */ (form.querySelector('button[type=submit]'));
      busy(btn, true, 'Submitting…');
      try {
        const r = await reports.createReport({
          orderId: o.id,
          reason: v.reason,
          description: v.description,
          evidenceNames: evidence.filter((f) => f.status === 'done').map((f) => f.name),
        });
        toast('Report submitted. We will look into it.');
        navigate(`/reports/${r.id}`);
      } catch (err) {
        busy(btn, false);
        setFormError(form, err instanceof Error ? err.message : 'Could not submit your report.');
      }
    });
  }

  return { title: 'Report a problem | StudentSwap', description: 'Report a problem with your order.', view, onMount };
}
