import { html, mount, raw } from '../lib/html.js';
import { events, listings, ticketAi } from '../api/index.js';
import { cities } from '../data/regions.js';
import { formatPence } from '../lib/money.js';
import { dayLabel, formatTime, formatDayLong } from '../lib/time.js';
import { sellerPayout, buyerTotal, buyerFeeText } from '../lib/fees.js';
import { validateListingPrice, maxPrice, listingWindow } from '../lib/pricing.js';
import { payments } from '../payments/provider.js';
import { pricing } from '../config/pricing.js';
import { features, ticketSafety } from '../config/features.js';
import { USE_MOCKS } from '../config/env.js';
import { matchEvent, matchTier } from '../lib/ticket-match.js';
import { processTicketFile } from '../features/ticket-upload.js';
import { poundsToPence } from '../features/make-offer.js';
import { stepper, field, checkbox, priceBreakdown, badge, errorState, statusBadge } from '../components/ui.js';
import { dropzone, initDropzone } from '../components/dropzone.js';
import { openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { confetti } from '../components/confetti.js';
import { values, setFieldError, clearFieldErrors, setFormError, focusFirstError, busy } from '../lib/forms.js';

const STEPS = ['Event', 'Delivery', 'Price', 'Review'];
const PLATFORMS = ['Fatsoma', 'FIXR', 'Ticketmaster', 'Skiddle', 'Other'];

/** @param {{ query: URLSearchParams }} ctx */
export default function render({ query }) {
  /** @type {any} */
  const s = {
    step: 0,
    events: /** @type {any[] | null} */ (null),
    eventId: query.get('event') ?? '',
    payoutsReady: false,
    tierId: '',
    quantity: 1,
    delivery: /** @type {'pdf' | 'transfer' | ''} */ (''),
    platform: '',
    file: /** @type {null | import('../features/ticket-upload.js').TicketFile} */ (null),
    /** AI autofill: what we read, how it matched our catalogue, and whether the seller applied it. */
    autofill: /** @type {any} */ ({
      tab: 'upload',
      status: 'idle',
      message: '',
      extracted: null,
      match: null,
      tierMatch: null,
      applied: false,
      text: '',
    }),
    priceInput: '',
    declarations: false,
    result: /** @type {any} */ (null),
  };

  const ev = () => s.events?.find((/** @type {any} */ e) => e.id === s.eventId);
  const tier = () => ev()?.tiers.find((/** @type {any} */ t) => t.id === s.tierId);
  const pricePence = () => poundsToPence(s.priceInput);

  /** @param {HTMLElement} root */
  async function onMount(root) {
    const host = /** @type {HTMLElement} */ (root.querySelector('#wizard'));

    const load = async () => {
      mount(host, html`<div class="skeleton skeleton--card" aria-busy="true"></div>`);
      try {
        const [list, connect] = await Promise.all([
          events.listEvents({ sort: 'soonest' }),
          payments.getConnectStatus(),
        ]);
        s.events = list;
        s.payoutsReady = connect.status === 'complete';
        if (s.eventId && ev()) s.tierId = ev().tiers[0].id;
        draw();
      } catch {
        mount(host, errorState({ title: "Couldn't load events" }));
        host.querySelector('[data-retry]')?.addEventListener('click', load);
      }
    };

    function draw() {
      if (!s.payoutsReady) return payoutsGate();
      mount(
        host,
        s.result
          ? resultView()
          : html`${stepper(STEPS, s.step)}${[stepEvent, stepDelivery, stepPrice, stepReview][s.step]()}`,
      );
      wire();
      /** @type {HTMLElement | null} */ (host.querySelector('h1'))?.focus();
      window.scrollTo(0, 0);
    }

    /** Sellers connect a bank account with Stripe before their first listing, so they can always be paid. */
    function payoutsGate() {
      mount(
        host,
        html`<div class="stack stack--lg" style="max-width:560px">
          <div><h1 tabindex="-1">Set up payouts first</h1>
          <p class="muted">Before your first listing, connect your bank account with Stripe, our payments partner. It takes a few minutes and you only do it once. Then the money from every sale reaches you ${pricing.payoutReleaseHoursAfterEvent}h after the event.</p></div>
          <div class="form-error" role="alert"></div>
          <div><button class="btn btn--primary" type="button" data-connect>Set up payouts</button></div>
        </div>`,
      );
      /** @type {HTMLElement | null} */ (host.querySelector('h1'))?.focus();
      host.querySelector('[data-connect]')?.addEventListener('click', async (e) => {
        const btn = /** @type {HTMLButtonElement} */ (e.currentTarget);
        busy(btn, true, 'Opening Stripe…');
        try {
          const returnPath = `/sell/new${s.eventId ? `?event=${s.eventId}` : ''}`;
          const { url } = await payments.createOnboardingLink({ returnPath });
          if (/^https?:/.test(url)) return void location.assign(url); // real Stripe: comes back here when done
          s.payoutsReady = (await payments.getConnectStatus()).status === 'complete';
          toast('Payout account connected (demo)');
          draw();
        } catch {
          busy(btn, false);
          /** @type {HTMLElement} */ (host.querySelector('.form-error')).textContent =
            "Couldn't open Stripe. Please try again.";
        }
      });
    }

    /** ---------- Step 1: event, tier, quantity ---------- */
    function stepEvent() {
      const e = ev();
      return html`<h1 tabindex="-1">What are you selling?</h1><p class="muted">Pick the event, then your ticket type and how many.</p>
        <div class="stack stack--lg">
          ${features.aiAutofill ? autofillSection() : ''}
          <section aria-labelledby="pick-ev">
            <h2 id="pick-ev" class="sr-only">Choose event</h2>
            <div class="field"><label class="sr-only" for="ev-search">Search events</label><div class="field__wrap"><input type="search" id="ev-search" placeholder="Search events or venues" autocomplete="off" /></div></div>
            <div class="pick-list" role="radiogroup" aria-label="Events" id="ev-list">${eventOptions('')}</div>
            <p class="small muted">Can't find it? <button class="link-btn" type="button" data-request>Request an event</button>. We add events within a day or so.</p>
          </section>
          ${
            e
              ? html`<section aria-labelledby="pick-tier"><h2 id="pick-tier" class="h3">Ticket type</h2>
            <div class="pick-list" role="radiogroup" aria-label="Ticket type">${e.tiers.map((/** @type {any} */ t) => html`<label class="pick"><input type="radio" name="tier" value="${t.id}" ${t.id === s.tierId ? raw('checked') : ''} /><span class="pick__body"><strong>${t.name}</strong><span class="muted small">Original price ${formatPence(t.faceValuePence, { exact: true })}</span></span></label>`)}</div>
            <div class="field" style="max-width:240px;margin-top:16px"><label for="qty">How many tickets?</label>
              <div class="qty"><button class="qty__btn" type="button" data-qty="-1" aria-label="One fewer">−</button><input id="qty" type="text" inputmode="numeric" value="${s.quantity}" readonly aria-live="polite" /><button class="qty__btn" type="button" data-qty="1" aria-label="One more">+</button></div>
              <p class="field__hint">Sold together as one bundle (1 to 6).</p></div></section>`
              : ''
          }
        </div>
        ${bar({ next: !!e && !!s.tierId && listingWindow(e.startsAt).ok, back: false })}`;
    }

    /** @param {string} q */
    function eventOptions(q) {
      const list = (s.events ?? []).filter((/** @type {any} */ e) =>
        `${e.title} ${e.venue}`.toLowerCase().includes(q.toLowerCase()),
      );
      if (!list.length) return html`<p class="muted">No events match "${q}".</p>`;
      return html`${list.map((/** @type {any} */ e) => {
        const lead = listingWindow(e.startsAt);
        // Too far ahead to list yet (Stripe's 90-day hold limit): shown, but greyed out with the date it opens.
        return html`<label class="pick ${lead.ok ? '' : 'pick--disabled'}"><input type="radio" name="event" value="${e.id}" ${e.id === s.eventId && lead.ok ? raw('checked') : ''} ${lead.ok ? '' : raw('disabled')} /><span class="pick__body"><strong>${e.title}</strong><span class="muted small">${dayLabel(e.startsAt)} · ${formatTime(e.startsAt)} · ${e.venue}, ${cities.find((c) => c.id === e.cityId)?.name}</span>${lead.ok ? '' : html`<span class="small">Listing opens ${formatDayLong(lead.opensAt.toISOString())}</span>`}</span></label>`;
      })}`;
    }

    /** ---------- AI autofill ---------- */
    const FIELD_LABELS = /** @type {const} */ ([
      ['eventName', 'Event'],
      ['venue', 'Venue'],
      ['startsAt', 'Date and time'],
      ['ticketType', 'Ticket type'],
      ['faceValuePence', 'Original price'],
    ]);

    function autofillSection() {
      const a = s.autofill;
      const working = a.status === 'working';
      return html`<section class="autofill card card--flat stack" aria-labelledby="af-h">
        <div class="row row--between"><h2 id="af-h" class="h3" style="margin:0">Autofill from your ticket</h2>${badge(USE_MOCKS ? 'AI (demo)' : 'AI', 'blue')}</div>
        <p class="muted small">Upload a screenshot or PDF of your ticket, or paste the confirmation email. We'll read it and fill in the details. You check everything before you publish, and you can always type it in yourself.</p>
        <div class="seg" role="group" aria-label="How to add your ticket">
          <button class="seg__btn" type="button" data-af-tab="upload" aria-pressed="${a.tab === 'upload'}">Upload ticket</button>
          <button class="seg__btn" type="button" data-af-tab="paste" aria-pressed="${a.tab === 'paste'}">Paste email</button>
        </div>
        ${a.tab === 'upload' && !working && !s.file ? dropzone({ id: 'af-file', accept: '.pdf,.png,.jpg,.jpeg', label: 'Drop your ticket here, or tap to choose', hint: 'PDF, PNG or JPG, up to 10 MB' }) : ''}
        ${a.tab === 'paste' && !working ? html`<div class="field"><label class="sr-only" for="af-text">Ticket email text</label><div class="field__wrap"><textarea id="af-text" rows="5" placeholder="Paste the confirmation email here">${a.text}</textarea></div></div><div><button class="btn btn--secondary btn--sm" type="button" data-af-read>Read email</button></div>` : ''}
        ${working ? html`<div class="file-check" role="status"><span class="spinner" aria-hidden="true"></span><div class="file-check__body"><div class="file-check__name">Reading your ticket…</div><div class="small muted">${a.message || 'This usually takes a few seconds.'}</div></div></div>` : ''}
        ${a.status === 'failed' ? html`<div class="notice notice--warn" role="status">${a.message} No problem: just choose your event below.</div>` : ''}
        ${a.status === 'done' ? autofillResult() : ''}
        ${USE_MOCKS ? html`<p class="small muted">Demo tip: file names with "cosmic" read an event we don't list, "unreadable" fails, "edited" gets flagged at publish.</p>` : ''}
      </section>`;
    }

    function autofillResult() {
      const a = s.autofill;
      const x = a.extracted;
      const low = (/** @type {string} */ k) => x[k] == null || (x.confidence?.[k] ?? 0) < ticketSafety.lowConfidence;
      const val = (/** @type {string} */ k) => {
        if (x[k] == null) return 'Not found';
        if (k === 'startsAt') return `${dayLabel(x[k])} · ${formatTime(x[k])}`;
        if (k === 'faceValuePence') return formatPence(x[k], { exact: true });
        return x[k];
      };
      return html`<div class="af-result" role="status">
        <strong>Here's what we found</strong>
        <dl class="af-fields">${FIELD_LABELS.map(([k, label]) => html`<div><dt>${label}</dt><dd>${val(k)} ${low(k) ? badge('Check this', 'warn') : ''}</dd></div>`)}</dl>
        ${
          a.match
            ? html`<p class="small">Matched to <strong>${a.match.event.title}</strong> (${a.match.event.venue}).${a.tierMatch ? '' : ' Please choose your ticket type.'}</p>`
            : html`<p class="small">We don't have <strong>${x.eventName ?? 'this event'}</strong> yet. <button class="link-btn" type="button" data-request>Request it</button> and we'll add it, or pick a different event below.</p>`
        }
        ${
          a.applied
            ? html`<div class="notice notice--ok">✓ Details applied. Check the event and ticket type below, then continue.</div>`
            : html`<div class="row">${a.match ? html`<button class="btn btn--primary btn--sm" type="button" data-af-apply>Use these details</button>` : ''}<button class="btn btn--secondary btn--sm" type="button" data-af-reset>${a.match ? 'Enter manually' : 'Try another ticket'}</button></div>`
        }
      </div>`;
    }

    /** Runs the whole autofill: upload + checks (if a file), then ask the AI to read it. */
    async function runAutofill(/** @type {{ file?: File, text?: string }} */ input) {
      const a = s.autofill;
      Object.assign(a, {
        status: 'working',
        message: '',
        extracted: null,
        match: null,
        tierMatch: null,
        applied: false,
      });
      redrawAutofill();
      try {
        if (input.file) {
          a.message = 'Uploading and checking your ticket…';
          redrawAutofill();
          s.file = await processTicketFile(input.file, (state) => {
            s.file = state;
          });
          if (s.file.check === 'rejected') {
            const msg = s.file.message ?? 'That ticket could not be accepted.';
            s.file = null;
            return (Object.assign(a, { status: 'failed', message: msg }), redrawAutofill());
          }
          a.message = 'Reading the details…';
          redrawAutofill();
        }
        const res = await ticketAi.extractTicket({
          fileKey: s.file?.key,
          fileName: input.file?.name,
          text: input.text,
        });
        if (!res.ok)
          return (
            Object.assign(a, { status: 'failed', message: res.message || "We couldn't read that ticket." }),
            redrawAutofill()
          );
        const match = matchEvent(res.extracted, s.events ?? []);
        Object.assign(a, {
          status: 'done',
          extracted: res.extracted,
          match,
          tierMatch: match ? matchTier(res.extracted.ticketType, match.event) : null,
        });
      } catch {
        // Extraction is a convenience, never a blocker: fall back to manual entry.
        Object.assign(a, { status: 'failed', message: "We couldn't read that ticket just now." });
      }
      redrawAutofill();
    }

    function applyAutofill() {
      const a = s.autofill;
      s.eventId = a.match.event.id;
      s.tierId = (a.tierMatch ?? a.match.event.tiers[0]).id;
      s.priceInput = '';
      a.applied = true;
      if (s.file && s.file.check !== 'rejected') s.delivery = 'pdf';
      draw();
    }

    function redrawAutofill() {
      const el = host.querySelector('.autofill');
      if (!el) return;
      const tmp = document.createElement('div');
      mount(tmp, autofillSection());
      el.replaceWith(/** @type {Element} */ (tmp.firstElementChild));
      wireAutofill();
    }

    function wireAutofill() {
      const root = host.querySelector('.autofill');
      if (!root) return;
      root.querySelectorAll('[data-af-tab]').forEach((b) =>
        b.addEventListener('click', () => {
          s.autofill.tab = /** @type {HTMLElement} */ (b).dataset.afTab;
          if (s.autofill.status !== 'working') Object.assign(s.autofill, { status: 'idle', message: '' });
          redrawAutofill();
        }),
      );
      const dz = /** @type {HTMLElement | null} */ (root.querySelector('[data-dropzone]'));
      if (dz) initDropzone(dz, ([f]) => runAutofill({ file: f }));
      root.querySelector('[data-af-read]')?.addEventListener('click', () => {
        const text = /** @type {HTMLTextAreaElement} */ (root.querySelector('#af-text')).value;
        s.autofill.text = text;
        if (text.trim().length < 15) return toast('Paste the full email text first.', 'error');
        runAutofill({ text });
      });
      root.querySelector('[data-af-apply]')?.addEventListener('click', applyAutofill);
      root.querySelector('[data-af-reset]')?.addEventListener('click', () => {
        s.file = null;
        Object.assign(s.autofill, {
          status: 'idle',
          message: '',
          extracted: null,
          match: null,
          tierMatch: null,
          applied: false,
        });
        redrawAutofill();
      });
      root.querySelector('[data-request]')?.addEventListener('click', () => openRequest(s.autofill.extracted));
    }

    /** ---------- Step 2: delivery ---------- */
    function stepDelivery() {
      return html`<h1 tabindex="-1">How will you deliver it?</h1><p class="muted">Pick how the buyer gets their ticket.</p>
        <div class="stack stack--lg">
          <div class="pick-list" role="radiogroup" aria-label="Delivery method">
            <label class="pick"><input type="radio" name="delivery" value="pdf" ${s.delivery === 'pdf' ? raw('checked') : ''} /><span class="pick__body"><strong>Upload the ticket (PDF or image)</strong><span class="muted small">We check the barcode. The file stays private and is only released to the buyer after they pay.</span></span></label>
            <label class="pick"><input type="radio" name="delivery" value="transfer" ${s.delivery === 'transfer' ? raw('checked') : ''} /><span class="pick__body"><strong>Transfer through the ticketing app</strong><span class="muted small">FIXR, Fatsoma, Ticketmaster and others let you send a ticket to someone's email.</span></span></label>
          </div>
          ${
            s.delivery === 'pdf'
              ? html`<section aria-labelledby="up">
            <h2 id="up" class="h3">Your ticket</h2>
            <div id="file-panel">${filePanel()}</div>
          </section>`
              : ''
          }
          ${
            s.delivery === 'transfer'
              ? html`<section class="stack" aria-labelledby="tr">
            <h2 id="tr" class="h3">Transfer details</h2>
            <div class="field"><label for="platform">Which app is the ticket in?</label><div class="field__wrap"><select id="platform" name="platform"><option value="">Choose…</option>${PLATFORMS.map((p) => html`<option ${p === s.platform ? raw('selected') : ''}>${p}</option>`)}</select></div></div>
            <div class="notice"><strong>How this works</strong><ol class="steps-list"><li>Someone buys your ticket and pays. The money is held by StudentSwap.</li><li>We email you the buyer's name and the email address to transfer to.</li><li>You transfer the ticket in the app, then confirm on StudentSwap.</li><li>You're paid ${pricing.payoutReleaseHoursAfterEvent}h after the event if no problem is reported.</li></ol></div>
          </section>`
              : ''
          }
        </div>
        ${bar({ next: deliveryReady(), back: true })}`;
    }

    function deliveryReady() {
      if (s.delivery === 'transfer') return !!s.platform;
      if (s.delivery === 'pdf') return s.file?.status === 'done' && s.file.check !== 'rejected';
      return false;
    }

    function filePanel() {
      const f = s.file;
      if (!f)
        return dropzone({
          id: 'ticket-file',
          accept: '.pdf,.png,.jpg,.jpeg',
          label: 'Drag your ticket here, or tap to choose',
          hint: 'PDF, PNG or JPG, up to 10 MB',
        });
      const working = f.status === 'uploading' || f.status === 'checking';
      const label =
        f.status === 'uploading'
          ? 'Uploading…'
          : f.status === 'checking'
            ? 'Checking barcode and looking for duplicates…'
            : null;
      return html`<div class="file-check" role="status">
        ${working ? html`<span class="spinner" aria-hidden="true"></span>` : html`<span class="file-check__icon file-check__icon--${f.check}" aria-hidden="true">${f.check === 'passed' ? '✓' : f.check === 'rejected' ? '✕' : '!'}</span>`}
        <div class="file-check__body"><div class="file-check__name">${f.name}</div><div class="small muted">${label ?? f.message}</div></div>
        ${f.check ? statusBadge('barcode', f.check) : statusBadge('barcode', 'checking')}
      </div>
      ${f.check === 'needs_review' ? html`<div class="notice notice--warn">${f.message} You can still publish: it goes live once approved, usually within a few hours.</div>` : ''}
      ${f.check === 'rejected' ? html`<div class="form-error" role="alert">${f.message} Please upload a different file.</div>` : ''}
      ${!working ? html`<button class="btn btn--secondary btn--sm" type="button" data-replace>Choose a different file</button>` : ''}
      ${USE_MOCKS ? html`<p class="small muted">Demo tip: name a file with "review" or "reject" to see the other results. Uploading the same file twice is blocked as a duplicate.</p>` : ''}`;
    }

    async function handleFile(/** @type {File} */ file) {
      const panel = /** @type {HTMLElement} */ (host.querySelector('#file-panel'));
      const redraw = () => {
        mount(panel, filePanel());
        wireFilePanel();
        refreshBar();
      };
      s.file = await processTicketFile(file, (state) => {
        s.file = state;
        redraw();
      });
      redraw();
    }

    function wireFilePanel() {
      const panel = host.querySelector('#file-panel');
      if (!panel) return;
      const dz = /** @type {HTMLElement | null} */ (panel.querySelector('[data-dropzone]'));
      if (dz) initDropzone(dz, ([f]) => handleFile(f));
      panel.querySelector('[data-replace]')?.addEventListener('click', () => {
        s.file = null;
        mount(/** @type {HTMLElement} */ (panel), filePanel());
        wireFilePanel();
        refreshBar();
      });
    }

    /** ---------- Step 3: price ---------- */
    function stepPrice() {
      const t = tier();
      const face = t.faceValuePence;
      return html`<h1 tabindex="-1">Set your price</h1><p class="muted">StudentSwap prices are capped at face value, so everyone pays a fair price.</p>
        <div class="price-grid">
          <div class="stack">
            <div class="field"><label for="face">Original price (per ticket)</label><div class="field__wrap field__wrap--prefix"><span class="field__prefix" aria-hidden="true">£</span><input id="face" value="${(face / 100).toFixed(2)}" readonly aria-describedby="face-hint" /></div><p class="field__hint" id="face-hint">Set by the event for "${t.name}". Different amount? <a class="link" href="#/contact">Tell us</a>.</p></div>
            ${field({ id: 'price', label: 'Your price (per ticket)', prefix: '£', inputmode: 'decimal', value: s.priceInput, required: true, hint: `Maximum ${formatPence(maxPrice(face), { exact: true })}.` })}
            <div class="row" role="group" aria-label="Quick prices">
              <button class="chip" type="button" data-quick="1">Original price</button>
              <button class="chip" type="button" data-quick="0.9">10% off</button>
              <button class="chip" type="button" data-quick="0.8">20% off</button>
            </div>
            <p class="small muted">Cheaper tickets sell faster. Buyers can also make offers, which you can accept, decline or counter.</p>
          </div>
          <aside class="card card--flat" aria-labelledby="pv"><h2 id="pv" class="h3">Your payout</h2><div id="preview" aria-live="polite"></div></aside>
        </div>
        ${bar({ next: priceOk(), back: true })}`;
    }

    function priceOk() {
      const p = pricePence();
      return !Number.isNaN(p) && validateListingPrice(p, tier().faceValuePence).ok;
    }

    function previewHtml() {
      const p = pricePence();
      const q = s.quantity;
      if (Number.isNaN(p)) return html`<p class="muted">Enter a price to see what you'll receive.</p>`;
      const v = validateListingPrice(p, tier().faceValuePence);
      if (!v.ok) return html`<p class="muted">Enter a valid price to see your payout.</p>`;
      const { cardFee, payout } = sellerPayout(p * q);
      const { total } = buyerTotal(p * q);
      return html`${priceBreakdown(
        [
          { label: `${q} × ${formatPence(p, { exact: true })}`, value: formatPence(p * q, { exact: true }) },
          {
            label: 'Card processing (Stripe, est.)',
            value: `−${formatPence(cardFee, { exact: true })}`,
          },
          { label: 'You receive', value: formatPence(payout, { exact: true }), strong: true },
        ],
        'Payout preview',
      )}<p class="small muted">Buyers pay ${formatPence(total, { exact: true })} (your price plus a ${buyerFeeText()} booking fee). Selling is free: the only cost is Stripe's card fee, which depends on the buyer's card. You're paid ${pricing.payoutReleaseHoursAfterEvent}h after the event if no problem is reported.</p>`;
    }

    /** ---------- Step 4: review ---------- */
    function stepReview() {
      const e = ev();
      const p = pricePence();
      const { cardFee, payout } = sellerPayout(p * s.quantity);
      return html`<h1 tabindex="-1">Review and publish</h1><p class="muted">Check everything, then confirm the declarations.</p>
        <form id="review-form" class="stack stack--lg" novalidate>
          <div class="form-error" role="alert"></div>
          <section class="card card--flat stack" aria-labelledby="sum">
            <h2 id="sum" class="h3">Your listing</h2>
            <div><strong>${e.title}</strong><div class="muted small">${formatDayLong(e.startsAt)} · ${e.venue}</div></div>
            <p class="row">${s.quantity} × ${tier().name} ${badge(s.delivery === 'pdf' ? 'PDF ticket' : `Transfer via ${s.platform}`, 'blue')}${s.file?.check === 'needs_review' ? badge('Will be reviewed', 'warn') : ''}${s.autofill.applied ? badge('Details read by AI, confirmed by you', 'ok') : ''}</p>
            ${priceBreakdown(
              [
                {
                  label: `Price (${s.quantity} × ${formatPence(p, { exact: true })})`,
                  value: formatPence(p * s.quantity, { exact: true }),
                },
                {
                  label: 'Card processing (Stripe, est.)',
                  value: `−${formatPence(cardFee, { exact: true })}`,
                },
                { label: 'You receive', value: formatPence(payout, { exact: true }), strong: true },
              ],
              'Listing summary',
            )}
            <button class="btn btn--ghost btn--sm" type="button" data-edit>Edit details</button>
          </section>
          <section class="stack" aria-labelledby="decl"><h2 id="decl" class="h3">Declarations</h2>
            ${checkbox({ id: 'own', label: "I own these tickets and I'm allowed to resell them.", required: true })}
            ${checkbox({ id: 'valid', label: 'The tickets are genuine, valid for this event, and not listed anywhere else.', required: true })}
            ${checkbox({ id: 'price', label: 'My price is at or below face value.', required: true })}
            ${checkbox({ id: 'rules', label: html`I accept the <a href="#/terms" target="_blank" rel="noopener">Terms</a> and understand I'm paid ${pricing.payoutReleaseHoursAfterEvent}h after the event if no problem is reported.`, required: true })}
          </section>
          <div class="wizard__bar"><button class="btn btn--secondary" type="button" data-back>Back</button><button class="btn btn--primary" type="submit">Publish listing</button></div>
        </form>`;
    }

    /** ---------- Result ---------- */
    function resultView() {
      const l = s.result;
      const live = l.status === 'active';
      return html`<div class="celebrate" role="status"><div class="celebrate__tick" aria-hidden="true">${live ? '✓' : '…'}</div>
        <h1 tabindex="-1">${live ? html`Your tickets are <span class="mark">live!</span>` : 'Sent for review'}</h1>
        <p>${live ? "Buyers can see them now. We'll let you know as soon as someone buys or makes an offer." : "A person is checking your ticket. It usually takes a few hours and you'll get a notification when it's approved."}</p>
        ${!live && l.reviewReasons?.length ? html`<div class="notice notice--warn" style="text-align:left;max-width:520px;margin:16px auto 0"><strong>What we're double-checking</strong><ul class="steps-list">${l.reviewReasons.map((/** @type {any} */ r) => html`<li>${r.message}</li>`)}</ul><span class="small">If anything looks wrong, you can edit or delist from My listings.</span></div>` : ''}
        <div class="row" style="justify-content:center;margin-top:20px"><a class="btn btn--primary" href="#/account/listings">View my listings</a><a class="btn btn--secondary" href="#/event/${l.eventId}">See event page</a></div></div>`;
    }

    /** Sticky action bar. @param {{ next: boolean, back: boolean }} o */
    function bar({ next, back }) {
      return html`<div class="wizard__bar" id="bar">${back ? html`<button class="btn btn--secondary" type="button" data-back>Back</button>` : html`<span></span>`}<button class="btn btn--primary" type="button" data-next ${next ? '' : raw('disabled')}>${s.step === 2 ? 'Review' : 'Continue'}</button></div>`;
    }
    function refreshBar() {
      const nextBtn = /** @type {HTMLButtonElement | null} */ (host.querySelector('[data-next]'));
      if (!nextBtn) return;
      const ok = [() => !!ev() && !!s.tierId, deliveryReady, priceOk][s.step]?.() ?? true;
      nextBtn.disabled = !ok;
    }

    /** ---------- Wiring ---------- */
    function wire() {
      host.querySelector('[data-next]')?.addEventListener('click', () => {
        s.step += 1;
        draw();
      });
      host.querySelectorAll('[data-back]').forEach((b) =>
        b.addEventListener('click', () => {
          s.step -= 1;
          draw();
        }),
      );
      host.querySelector('[data-edit]')?.addEventListener('click', () => {
        s.step = 0;
        draw();
      });

      if (s.step === 0) {
        const list = /** @type {HTMLElement} */ (host.querySelector('#ev-list'));
        host.querySelector('#ev-search')?.addEventListener('input', (e) => {
          mount(list, eventOptions(/** @type {HTMLInputElement} */ (e.target).value));
        });
        host.addEventListener('change', onStep0Change);
        host.querySelectorAll('[data-qty]').forEach((b) =>
          b.addEventListener('click', () => {
            s.quantity = Math.min(6, Math.max(1, s.quantity + Number(/** @type {HTMLElement} */ (b).dataset.qty)));
            /** @type {HTMLInputElement} */ (host.querySelector('#qty')).value = String(s.quantity);
          }),
        );
        host
          .querySelectorAll('section[aria-labelledby="pick-ev"] [data-request]')
          .forEach((b) => b.addEventListener('click', () => openRequest()));
        wireAutofill();
      }

      if (s.step === 1) {
        host.querySelectorAll('input[name=delivery]').forEach((r) =>
          r.addEventListener('change', (e) => {
            s.delivery = /** @type {any} */ (e.target).value;
            draw();
          }),
        );
        host.querySelector('#platform')?.addEventListener('change', (e) => {
          s.platform = /** @type {HTMLSelectElement} */ (e.target).value;
          refreshBar();
        });
        wireFilePanel();
      }

      if (s.step === 2) {
        const input = /** @type {HTMLFormElement['elements'] & HTMLInputElement} */ (host.querySelector('#price'));
        const preview = /** @type {HTMLElement} */ (host.querySelector('#preview'));
        const update = () => {
          s.priceInput = input.value;
          const p = pricePence();
          const wrap = /** @type {HTMLElement} */ (input.closest('.field'));
          const errEl = /** @type {HTMLElement} */ (wrap.querySelector('.field__error'));
          const face = tier().faceValuePence;
          let msg = '';
          if (input.value.trim() && Number.isNaN(p)) msg = 'Enter a price like 12 or 12.50.';
          else if (!Number.isNaN(p)) {
            const v = validateListingPrice(p, face);
            if (!v.ok)
              msg =
                v.reason === 'above_cap'
                  ? `That's above face value. The most you can charge is ${formatPence(v.max, { exact: true })}.`
                  : v.reason === 'too_low'
                    ? 'The minimum price is £1.'
                    : 'Enter a valid price.';
          }
          wrap.classList.toggle('field--error', !!msg);
          input.setAttribute('aria-invalid', msg ? 'true' : 'false');
          errEl.textContent = msg;
          mount(preview, previewHtml());
          refreshBar();
        };
        input.addEventListener('input', update);
        host.querySelectorAll('[data-quick]').forEach((b) =>
          b.addEventListener('click', () => {
            const m = Number(/** @type {HTMLElement} */ (b).dataset.quick);
            input.value = ((Math.round((tier().faceValuePence * m) / 50) * 50) / 100).toFixed(2);
            update();
          }),
        );
        update();
      }

      if (s.step === 3) {
        const form = /** @type {HTMLFormElement} */ (host.querySelector('#review-form'));
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          clearFieldErrors(form);
          const v = values(form);
          const missing = ['own', 'valid', 'price', 'rules'].filter((k) => !v[k]);
          if (missing.length) {
            missing.forEach((k) => setFieldError(form, k, 'Please confirm this to publish.'));
            return focusFirstError(form);
          }
          const btn = /** @type {HTMLButtonElement} */ (form.querySelector('button[type=submit]'));
          busy(btn, true, 'Publishing…');
          try {
            s.result = await listings.createListing({
              eventId: s.eventId,
              tierId: s.tierId,
              quantity: s.quantity,
              pricePence: pricePence(),
              delivery: /** @type {any} */ (s.delivery),
              transferPlatform: s.delivery === 'transfer' ? s.platform : undefined,
              fileKey: s.file?.key,
              fileName: s.file?.name,
              barcodeCheck: /** @type {any} */ (s.file?.check),
              fingerprint: s.file?.fingerprint,
              extraction: s.autofill.applied ? s.autofill.extracted : undefined,
              declarationsAccepted: true,
            });
            if (s.result.status === 'active') confetti(50);
            draw();
          } catch (err) {
            busy(btn, false);
            setFormError(form, err instanceof Error ? err.message : 'Could not publish your listing.');
          }
        });
      }
    }

    /** @param {Event} e */
    function onStep0Change(e) {
      const t = /** @type {HTMLInputElement} */ (e.target);
      if (t.name === 'event') {
        s.eventId = t.value;
        s.tierId = ev().tiers[0].id;
        s.quantity = 1;
        s.priceInput = '';
        s.autofill.applied = false; // the seller changed the event by hand, so the AI read no longer applies
        host.removeEventListener('change', onStep0Change);
        const search = /** @type {HTMLInputElement} */ (host.querySelector('#ev-search')).value;
        draw();
        const again = /** @type {HTMLInputElement | null} */ (host.querySelector('#ev-search'));
        if (again) again.value = search;
      } else if (t.name === 'tier') {
        s.tierId = t.value;
        s.priceInput = '';
        s.autofill.applied = false;
        refreshBar();
      }
    }

    /** @param {any} [prefill] extraction to pre-fill the request */
    function openRequest(prefill) {
      openModal({
        title: 'Request an event',
        variant: 'sheet',
        body: html`<p class="muted">Tell us about the event and we'll add it, usually within a day.</p>
          <form id="req-form" class="stack" novalidate><div class="form-error" role="alert"></div>
            ${field({ id: 'name', label: 'Event name', required: true, value: prefill?.eventName ?? '' })}
            ${field({ id: 'venue', label: 'Venue', required: true, value: prefill?.venue ?? '' })}
            ${field({ id: 'date', label: 'Date', type: 'date', required: true, value: prefill?.startsAt ? prefill.startsAt.slice(0, 10) : '' })}
            ${field({ id: 'note', label: 'Anything else (e.g. link to the event page)', textarea: true, rows: 3 })}
            <div class="dialog__actions"><button class="btn btn--secondary" type="button" data-close-req>Cancel</button><button class="btn btn--primary" type="submit">Send request</button></div></form>`,
        onOpen(dialog, close) {
          dialog.querySelector('[data-close-req]')?.addEventListener('click', close);
          const form = /** @type {HTMLFormElement} */ (dialog.querySelector('#req-form'));
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearFieldErrors(form);
            const v = values(form);
            for (const k of ['name', 'venue', 'date']) if (!v[k]?.trim()) setFieldError(form, k, 'Required.');
            if (form.querySelector('.field--error')) return focusFirstError(form);
            const btn = /** @type {HTMLButtonElement} */ (form.querySelector('button[type=submit]'));
            busy(btn, true, 'Sending…');
            try {
              await events.requestEvent({ name: v.name, venue: v.venue, date: v.date, note: v.note });
              close();
              toast("Thanks! We'll add it soon and let you know.");
            } catch (err) {
              busy(btn, false);
              setFormError(form, err instanceof Error ? err.message : 'Could not send your request.');
            }
          });
        },
      });
    }

    load();
  }

  return {
    title: 'Sell a ticket | StudentSwap',
    description: 'List your spare ticket in a minute. Priced at or below face value.',
    layout: 'focus',
    exit: { href: '#/account/listings', label: 'Cancel' },
    view: html`<div class="page page--narrow"><div class="container wizard"><div id="wizard"><div class="skeleton skeleton--card"></div></div></div></div>`,
    onMount,
  };
}
