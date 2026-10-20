import { html, mount } from '../lib/html.js';
import { events } from '../api/index.js';
import { cities, universities } from '../data/regions.js';
import { eventTypeLabels } from '../data/labels.js';
import { formatPence } from '../lib/money.js';
import { formatDayLong, formatTime, dayLabel } from '../lib/time.js';
import { ticketCard } from '../components/ticket-card.js';
import { badge, emptyState, errorState } from '../components/ui.js';
import { toast } from '../components/toast.js';
import { openOfferModal } from '../features/make-offer.js';
import { navigate } from '../router.js';

/** @param {{ params: Record<string, string>, user: import('../types/index.js').User | null }} ctx */
export default async function render({ params, user }) {
  /** @type {Awaited<ReturnType<typeof events.getEvent>>} */
  let data;
  try {
    data = await events.getEvent(params.id);
  } catch (err) {
    const notFound = err instanceof Error && /not found/i.test(err.message);
    return {
      title: notFound ? 'Event not found | StudentSwap' : 'Something went wrong | StudentSwap',
      description: '',
      view: html`<div class="page"><div class="container">${
        notFound
          ? emptyState({
              title: "We can't find that event",
              body: 'It may have finished or been removed.',
              href: '#/browse',
              action: 'Browse events',
            })
          : errorState({ title: "Couldn't load this event" })
      }</div></div>`,
      onMount(/** @type {HTMLElement} */ root) {
        root.querySelector('[data-retry]')?.addEventListener('click', () => location.reload());
      },
    };
  }

  const { event: e, listings } = data;
  let alertOn = data.alertOn;
  const city = cities.find((c) => c.id === e.cityId)?.name ?? '';
  const unis = e.universityIds
    .map((id) => universities.find((u) => u.id === id)?.short)
    .filter(Boolean)
    .join(', ');
  const day = dayLabel(e.startsAt);

  const alertButton = () =>
    html`<button class="btn ${alertOn ? 'btn--primary' : 'btn--secondary'}" type="button" data-alert aria-pressed="${alertOn}">${alertOn ? 'Alert on' : 'Alert me when tickets drop'}</button>`;

  const tierBlocks = e.tiers.map((/** @type {any} */ t) => {
    const rows = listings
      .filter((/** @type {any} */ l) => l.tierId === t.id)
      .sort((/** @type {any} */ a, /** @type {any} */ b) => a.pricePence - b.pricePence);
    return html`<section class="tier" aria-labelledby="tier-${t.id}">
      <div class="tier__head"><h3 id="tier-${t.id}">${t.name}</h3><span class="muted small">Original price ${formatPence(t.faceValuePence)}${rows.length ? ` · from ${formatPence(rows[0].pricePence)}` : ''}</span></div>
      ${
        rows.length
          ? html`<div class="listings">${rows.map((/** @type {any} */ l) => ticketCard(l, { currentUserId: user?.id }))}</div>`
          : html`<p class="tier__empty">No tickets listed for this type yet. <button class="link-btn" type="button" data-alert-inline>Alert me when they drop</button></p>`
      }
    </section>`;
  });

  const view = html`<article>
    <header class="event-hero art--${e.tone}">
      <div class="container">
        <a class="back-link back-link--onart" href="#/browse">← All events</a>
        <div class="event-hero__tags"><span class="sticker ${day === 'Tonight' ? 'sticker--paper' : ''}">${day}</span>${e.sellingFast ? html`<span class="sticker sticker--coral">Selling fast</span>` : ''}<span class="sticker sticker--paper">${eventTypeLabels[e.type]}</span></div>
        <h1>${e.title}</h1>
        <p class="event-hero__sub">${e.venue} · ${city}</p>
      </div>
    </header>
    <div class="container event-layout">
      <section class="event-main" aria-label="Tickets">
        <div class="event-main__head">
          <div><h2>Tickets</h2><p class="muted">${e.ticketsAvailable ? `${e.ticketsAvailable} tickets from verified students. Prices include no markup, just a small fee shown at each step.` : "Nothing listed yet. Set an alert and we'll tell you the moment tickets appear."}</p></div>
          <div id="alert-slot">${alertButton()}</div>
        </div>
        ${e.ticketsAvailable === 0 && listings.length === 0 ? html`<div class="state-box"><h3>No tickets yet</h3><p>Tickets listed by students will show up here.</p><a class="btn btn--primary btn--sm" href="#/sell/new?event=${e.id}">Got a spare? Sell it</a></div>` : ''}
        <div class="tiers">${tierBlocks}</div>
        ${listings.length ? html`<p class="small muted">Got a spare for this night? <a class="link" href="#/sell/new?event=${e.id}">Sell it here</a>, at or below the original price.</p>` : ''}
        <p class="notice">Every ticket is covered by buyer protection: your money is held until after the event, and you can report a problem before the payout date.</p>
      </section>
      <aside class="event-side card" aria-label="Event details">
        <h2>Details</h2>
        <dl class="details">
          <div><dt>Date</dt><dd>${formatDayLong(e.startsAt)}</dd></div>
          <div><dt>Doors</dt><dd>${formatTime(e.startsAt)}</dd></div>
          <div><dt>Last entry</dt><dd>${formatTime(e.lastEntryAt)}</dd></div>
          <div><dt>Venue</dt><dd>${e.venue}, ${city}</dd></div>
          <div><dt>Age</dt><dd>${badge(e.ageRestriction, 'hot')}</dd></div>
          <div><dt>ID</dt><dd>${e.idRequirement}</dd></div>
          <div><dt>Popular with</dt><dd>${unis}</dd></div>
        </dl>
        <p class="muted">${e.description}</p>
      </aside>
    </div>
  </article>`;

  /** @param {HTMLElement} root */
  function onMount(root) {
    const needAuth = () => {
      if (user) return false;
      navigate(`/sign-in?next=${encodeURIComponent('/event/' + e.id)}`);
      return true;
    };
    root.querySelectorAll('[data-offer]').forEach((btn) =>
      btn.addEventListener('click', () => {
        if (needAuth()) return;
        const listing = listings.find(
          (/** @type {any} */ l) => l.id === /** @type {HTMLElement} */ (btn).dataset.offer,
        );
        if (listing) openOfferModal(listing);
      }),
    );
    const toggleAlert = async () => {
      if (needAuth()) return;
      try {
        const res = await events.setAlert(e.id, !alertOn);
        alertOn = res.alertOn;
        mount(/** @type {HTMLElement} */ (root.querySelector('#alert-slot')), alertButton());
        root.querySelector('[data-alert]')?.addEventListener('click', toggleAlert);
        toast(alertOn ? "Alert set. We'll notify you when tickets drop." : 'Alert removed');
      } catch {
        toast('Could not update your alert. Please try again.', 'error');
      }
    };
    root.querySelector('[data-alert]')?.addEventListener('click', toggleAlert);
    root.querySelectorAll('[data-alert-inline]').forEach((b) => b.addEventListener('click', toggleAlert));
  }

  return {
    title: `${e.title} tickets | StudentSwap`,
    description: `${e.title} at ${e.venue}, ${city}. ${formatDayLong(e.startsAt)}. Tickets from verified students, never above face value.`,
    view,
    onMount,
  };
}
