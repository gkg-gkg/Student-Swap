import { html, mount } from '../lib/html.js';
import { brand } from '../config/brand.js';
import { getRegion, universitiesInRegion, universities } from '../data/regions.js';
import { eventTypeLabels } from '../data/labels.js';
import { events } from '../api/index.js';
import { londonYmd, dayLabel, formatDay } from '../lib/time.js';
import { formatPence } from '../lib/money.js';
import { eventCard } from '../components/event-card.js';
import { emptyState, errorState } from '../components/ui.js';
import { icons } from '../components/icons.js';

const trust = [
  [icons.grad, 'Uni-verified', 'Everyone signs up with a university email, so you are swapping with other students.'],
  [
    icons.scale,
    'Original-price cap',
    'No markups. Listings can never be priced above what the ticket originally cost.',
  ],
  [
    icons.lock,
    'Money held',
    'Your payment is held until after the event, so a seller only gets paid for a ticket that worked.',
  ],
  [icons.shield, 'Buyer protection', 'Ticket not valid? Report it before payout and we will review it for a refund.'],
];

/** Event types for "What are you in the mood for?". Links use the browse page's type filter. */
const moods = [
  ['club_night', 'Club nights for students across the Midlands.'],
  ['ball', 'Black tie, live bands and late finishes.'],
  ['social', 'Rooftops, bars and society nights.'],
  ['gig', 'Student bands and open stages.'],
];

const trackSkeleton = [1, 2, 3, 4].map(() => html`<div class="skeleton skeleton--event"></div>`);

/** "Your week at a glance": one tile per day for the next 7 days, linking to browse filtered to that date. @param {import('../types/index.js').AppEvent[]} list */
const weekTiles = (list) => {
  const now = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const iso = new Date(now.getTime() + i * 86400000).toISOString();
    const ymd = londonYmd(iso);
    const onDay = list.filter((e) => londonYmd(e.startsAt) === ymd);
    const prices = onDay.filter((e) => e.ticketsAvailable > 0).map((e) => e.lowestPricePence);
    const [weekday, date, month] = formatDay(iso).split(' ');
    return {
      ymd,
      weekday: i < 2 ? dayLabel(iso, now) : weekday,
      date,
      month,
      count: onDay.length,
      venues: [...new Set(onDay.map((e) => e.venue))],
      from: prices.length ? Math.min(...prices) : null,
    };
  });
  const busiest = Math.max(1, ...days.map((d) => d.count));
  return days.map((d) => {
    const inner = html`<span class="week__wd">${d.weekday}</span><strong class="week__num">${d.date}</strong><span class="week__mon">${d.month}</span>
      <span class="week__bar" style="--fill:${d.count / busiest}" aria-hidden="true"></span>
      ${
        d.count
          ? html`<ul class="week__venues">${d.venues.slice(0, 2).map((v) => html`<li>${v}</li>`)}${d.venues.length > 2 ? html`<li class="week__more">+${d.venues.length - 2} more</li>` : ''}</ul>`
          : html`<span class="week__count">Nothing yet</span>`
      }
      ${d.from !== null ? html`<span class="week__from">from ${formatPence(d.from)}</span>` : ''}`;
    return html`<li>${d.count ? html`<a class="week__day" href="#/browse?when=date&from=${d.ymd}&to=${d.ymd}">${inner}</a>` : html`<div class="week__day week__day--empty">${inner}</div>`}</li>`;
  });
};

/** Arrow buttons scroll the track by whole cards (as many as fit) and disable at either end. @param {HTMLElement} root */
const wireCarousel = (root) => {
  const track = /** @type {HTMLElement} */ (root.querySelector('.carousel__track'));
  const prev = /** @type {HTMLButtonElement} */ (root.querySelector('.carousel__btn--prev'));
  const next = /** @type {HTMLButtonElement} */ (root.querySelector('.carousel__btn--next'));
  const update = () => {
    prev.disabled = track.scrollLeft <= 2;
    next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
  };
  // Step by card width + gap rather than the track width, so each click lands exactly on a card edge.
  const step = () => {
    const card = /** @type {HTMLElement | null} */ (track.firstElementChild);
    if (!card) return track.clientWidth;
    const width = card.offsetWidth + parseFloat(getComputedStyle(track).columnGap || '0');
    return Math.max(1, Math.floor((track.clientWidth + 1) / width)) * width;
  };
  prev.onclick = () => track.scrollBy({ left: -step(), behavior: 'smooth' });
  next.onclick = () => track.scrollBy({ left: step(), behavior: 'smooth' });
  track.onscroll = update;
  update();
};

const gridSkeleton = html`<div class="grid-cards" aria-busy="true" aria-label="Loading events">
  ${[1, 2, 3, 4].map(() => html`<div class="skeleton skeleton--event"></div>`)}
</div>`;

/** Hero art: two vertical columns of tickets drifting in opposite directions. Decorative only. @param {ReturnType<typeof eventCard>[]} cards */
const heroColumns = (cards) => {
  const half = Math.ceil(cards.length / 2);
  const col = (/** @type {typeof cards} */ items) => html`<div class="vcol">
    <div class="vcol__track">
      <div class="vcol__group">${items}</div>
      <div class="vcol__group" aria-hidden="true">${items}</div>
    </div>
  </div>`;
  return html`<div class="hero__cols" aria-hidden="true">${col(cards.slice(0, half))}${col(cards.slice(half))}</div>`;
};

/** @param {{ user?: import('../types/index.js').User | null }} ctx */
export default function render({ user } = {}) {
  const region = getRegion(brand.activeRegionId);
  const unis = universitiesInRegion(brand.activeRegionId);
  const myUni = user ? universities.find((u) => u.id === user.universityId) : undefined;

  const view = html`
    <section class="hero">
      <div class="container hero__grid">
        <div class="hero__text">
          <h1>
            <span class="line">Swap <span class="line--phone">tickets.</span></span>
            <span class="line">Not <span class="mark">scams.</span></span>
          </h1>
          <p class="hero__sub hero__sub--long">Didn’t get a ticket? StudentSwap is the safe way to buy and sell event tickets with other students. No group-chat scams, no screenshots sold five times, no haggling. Every seller is verified, every ticket is checked, and your money’s protected until you’re through the door!</p>
          <p class="hero__sub hero__sub--short">Buy and sell event tickets with verified students. Your money’s protected until you’re through the door.</p>
          <div class="hero__cta">
            <a class="btn btn--primary" href="#/browse">Buy tickets</a>
            <a class="btn btn--secondary" href="#/sell">Sell tickets</a>
          </div>
          <ul class="hero__unis" aria-label="Universities on ${brand.name}">
            ${unis.map((u) => html`<li><a href="#/browse?uni=${u.id}">${u.short}</a></li>`)}
          </ul>
        </div>
        <div class="hero__art" id="hero-art"></div>
      </div>
    </section>

    <section class="section" id="soon">
      <div class="container">
        <div class="tonight-head">
          <div class="section-head">
            <h2>On soon near you</h2>
            <p id="soon-sub">${myUni ? `Events near ${myUni.short} come first.` : `Tickets from verified students across the ${region?.name}.`}</p>
          </div>
          <a class="btn btn--secondary btn--sm" href="#/browse">See all events</a>
        </div>
        <div class="carousel">
          <button class="carousel__btn carousel__btn--prev" type="button" aria-label="Previous events" aria-controls="soon-slot" disabled>←</button>
          <div class="carousel__track" id="soon-slot" tabindex="0" aria-label="Events on soon">${trackSkeleton}</div>
          <button class="carousel__btn carousel__btn--next" type="button" aria-label="Next events" aria-controls="soon-slot">→</button>
        </div>
      </div>
    </section>

    <section class="section" id="week">
      <div class="container">
        <div class="section-head">
          <h2>Your week at a glance</h2>
          <p>Pick a night to see what’s on. Prices are the cheapest ticket that day.</p>
        </div>
        <ol class="week" id="week-slot" aria-busy="true">
          ${[1, 2, 3, 4, 5, 6, 7].map(() => html`<li><div class="week__day skeleton"></div></li>`)}
        </ol>
      </div>
    </section>

    <section class="section" id="mood">
      <div class="container">
        <div class="section-head">
          <h2>What are you in the mood for?</h2>
        </div>
        <div class="mood-list">
          ${moods.map(([type, blurb]) => html`<a class="mood" href="#/browse?type=${type}"><strong>${eventTypeLabels[type]}s</strong><span>${blurb}</span><span class="mood__go" aria-hidden="true">→</span></a>`)}
        </div>
      </div>
    </section>

    <section class="section" id="selling-fast">
      <div class="container">
        <div class="fast-panel">
          <div class="fast-panel__head">
            <span class="sticker sticker--coral">Going quickly</span>
            <h2>Selling fast</h2>
            <p>Grab these before they’re gone. Prices are never above the original.</p>
            <a class="link-arrow" href="#/browse">View all events</a>
          </div>
          <div id="fast-slot">${gridSkeleton}</div>
        </div>
      </div>
    </section>

    <section class="section" id="trust">
      <div class="container">
        <div class="section-head section-head--center">
          <h2>Safe swaps, no stress.</h2>
          <p>We built the rules around the things that go wrong when you buy a ticket from a stranger.</p>
        </div>
        <div class="trust-grid">
          ${trust.map(([icon, title, body]) => html`<article class="trust"><div class="trust__icon">${icon}</div><h3>${title}</h3><p>${body}</p></article>`)}
        </div>
      </div>
    </section>

    <section class="section" style="padding-top:0">
      <div class="container">
        <div class="cta">
          <h2>Your night is <span class="mark">sorted.</span></h2>
          <p>Join with your university email and swap your first ticket in minutes.</p>
          <div class="btn-row">
            <a class="btn btn--glow" href="#/sign-up">Get started</a>
            <a class="btn btn--secondary" href="#/browse">Buy tickets</a>
          </div>
        </div>
      </div>
    </section>`;

  /** Loads events after first paint and fills the hero art, "On soon near you", the week strip and "Selling fast". @param {HTMLElement} root */
  async function onMount(root) {
    const heroArt = /** @type {HTMLElement} */ (root.querySelector('#hero-art'));
    const soonSlot = /** @type {HTMLElement} */ (root.querySelector('#soon-slot'));
    const weekSlot = /** @type {HTMLElement} */ (root.querySelector('#week-slot'));
    const weekSection = /** @type {HTMLElement} */ (root.querySelector('#week'));
    const fastSlot = /** @type {HTMLElement} */ (root.querySelector('#fast-slot'));
    const fastSection = /** @type {HTMLElement} */ (root.querySelector('#selling-fast'));
    if (!heroArt || !soonSlot || !fastSlot) return;
    // Empty and error states fill the whole track instead of one carousel slot.
    const showState = (/** @type {any} */ content) => {
      soonSlot.classList.add('carousel__track--state');
      mount(soonSlot, content);
      wireCarousel(root);
    };
    try {
      const list = await events.listEvents();
      // The visitor may have left the homepage while events were loading.
      if (!soonSlot.isConnected) return;
      weekSection.hidden = false;
      weekSlot.removeAttribute('aria-busy');
      mount(weekSlot, html`${weekTiles(list)}`);

      if (list.length === 0) {
        showState(
          emptyState({
            title: 'No tickets listed yet',
            body: 'Check back soon, or list one yourself.',
            href: '#/sell/new',
            action: 'Sell a ticket',
          }),
        );
        heroArt.replaceChildren();
        fastSection.hidden = true;
        return;
      }

      const decorative = list.map((e) => eventCard(e, { link: false }));
      mount(heroArt, heroColumns(decorative));

      // On soon near you: the 8 soonest events, the signed-in student's own uni/city first.
      const near = (/** @type {(typeof list)[number]} */ e) =>
        !!myUni && (e.universityIds.includes(myUni.id) || e.cityId === myUni.cityId);
      const soon = [...list]
        .sort((a, b) => Number(near(b)) - Number(near(a)) || a.startsAt.localeCompare(b.startsAt))
        .slice(0, 8);
      soonSlot.classList.remove('carousel__track--state');
      mount(soonSlot, html`${soon.map((e) => eventCard(e, { fastTag: false }))}`);
      wireCarousel(root);

      // Selling fast: scarcest first, then soonest.
      const fast = list
        .filter((e) => e.sellingFast)
        .sort((a, b) => a.ticketsAvailable - b.ticketsAvailable || a.startsAt.localeCompare(b.startsAt))
        .slice(0, 4);
      if (fast.length) mount(fastSlot, html`<div class="grid-cards">${fast.map((e) => eventCard(e))}</div>`);
      else fastSection.hidden = true;
    } catch {
      if (!soonSlot.isConnected) return;
      const retry = () => {
        mount(soonSlot, html`${trackSkeleton}`);
        mount(fastSlot, gridSkeleton);
        onMount(root);
      };
      showState(errorState({ title: "Couldn't load events" }));
      mount(fastSlot, errorState({ title: "Couldn't load events" }));
      for (const slot of [soonSlot, fastSlot]) slot.querySelector('[data-retry]')?.addEventListener('click', retry);
      weekSection.hidden = true;
      heroArt.replaceChildren();
    }
  }

  return {
    title: `${brand.name}: ${brand.tagline} | ${region?.name} student tickets`,
    description: `Buy and sell club night and event tickets with verified ${region?.name} students. Never above the original price, money held until after the event.`,
    view,
    onMount,
  };
}
