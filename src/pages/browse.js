import { html, mount, raw } from '../lib/html.js';
import { events } from '../api/index.js';
import { cities, universities, getRegion } from '../data/regions.js';
import { brand } from '../config/brand.js';
import { eventTypeLabels } from '../data/labels.js';
import { eventCard } from '../components/event-card.js';
import { selectField, emptyState, errorState, pageHead } from '../components/ui.js';

const WHEN = [
  ['', 'Any date'],
  ['tonight', 'Tonight'],
  ['weekend', 'This weekend'],
  ['date', 'Pick dates'],
];
const PRICES = [
  ['', 'Any price'],
  ['1000', 'Up to £10'],
  ['1500', 'Up to £15'],
  ['2000', 'Up to £20'],
  ['3000', 'Up to £30'],
  ['5000', 'Up to £50'],
];
const SORTS = [
  ['soonest', 'Soonest first'],
  ['price_low', 'Price: low to high'],
  ['price_high', 'Price: high to low'],
  ['most_tickets', 'Most tickets'],
];
const KEYS = ['q', 'when', 'from', 'to', 'city', 'uni', 'venue', 'type', 'max', 'sort'];

/** @param {{ query: URLSearchParams }} ctx */
export default function render({ query }) {
  /** @type {Record<string, string>} */
  const state = Object.fromEntries(KEYS.map((k) => [k, query.get(k) ?? '']));
  if (!state.sort) state.sort = 'soonest';
  const opts = (/** @type {string[][]} */ list) => list.map(([value, label]) => ({ value, label }));

  const view = html`<div class="page"><div class="container">
    ${pageHead({ title: 'Find your night', sub: `Tickets from verified ${getRegion(brand.activeRegionId)?.name} students, never above the original price.` })}
    <div class="browse">
      <div class="filters-backdrop" data-filters-close></div>
      <aside class="filters" id="filters" aria-label="Filters">
        <div class="filters__head"><h2>Filters</h2><button class="btn btn--ghost btn--sm" type="button" data-clear>Clear all</button><button class="btn btn--primary btn--sm filters__done" type="button" data-filters-close>Show results</button></div>
        <form id="filter-form" class="stack" novalidate>
          <fieldset class="chips-fieldset"><legend>When</legend>
            <div class="chip-group" role="radiogroup">
              ${WHEN.map(([v, l]) => html`<label class="chip-radio"><input type="radio" name="when" value="${v}" ${state.when === v ? raw('checked') : ''} /><span>${l}</span></label>`)}
            </div>
          </fieldset>
          <div class="date-range" ${state.when === 'date' ? '' : raw('hidden')}>
            <div class="field"><label for="from">From</label><div class="field__wrap"><input type="date" id="from" name="from" value="${state.from}" /></div></div>
            <div class="field"><label for="to">To</label><div class="field__wrap"><input type="date" id="to" name="to" value="${state.to}" /></div></div>
          </div>
          ${selectField({ id: 'city', label: 'City', options: cities.map((c) => ({ value: c.id, label: c.name })), value: state.city, placeholder: 'All cities' })}
          ${selectField({ id: 'uni', label: 'University', options: universities.map((u) => ({ value: u.id, label: u.short })), value: state.uni, placeholder: 'All universities' })}
          <div id="venue-slot">${selectField({ id: 'venue', label: 'Venue', options: [], value: state.venue, placeholder: 'All venues' })}</div>
          ${selectField({ id: 'type', label: 'Event type', options: Object.entries(eventTypeLabels).map(([value, label]) => ({ value, label })), value: state.type, placeholder: 'All types' })}
          ${selectField({ id: 'max', label: 'Price', options: opts(PRICES.slice(1)), value: state.max, placeholder: 'Any price' })}
        </form>
      </aside>
      <section class="browse__results" aria-label="Events">
        <div class="browse__bar">
          <div class="field browse__search"><label class="sr-only" for="q">Search events or venues</label><div class="field__wrap"><input type="search" id="q" value="${state.q}" placeholder="Search events or venues" autocomplete="off" /></div></div>
          <button class="btn btn--secondary btn--sm browse__filter-btn" type="button" data-filters-open aria-controls="filters">Filters<span class="tabs__badge" id="filter-count" hidden></span></button>
          ${selectField({ id: 'sort', label: 'Sort', options: opts(SORTS), value: state.sort })}
        </div>
        <p class="browse__count" id="count" aria-live="polite"></p>
        <div id="results"></div>
      </section>
    </div>
  </div></div>`;

  /** @param {HTMLElement} root */
  function onMount(root) {
    const form = /** @type {HTMLFormElement} */ (root.querySelector('#filter-form'));
    const sortEl = /** @type {HTMLSelectElement} */ (root.querySelector('#sort'));
    const qEl = /** @type {HTMLInputElement} */ (root.querySelector('#q'));
    const results = /** @type {HTMLElement} */ (root.querySelector('#results'));
    const count = /** @type {HTMLElement} */ (root.querySelector('#count'));
    const panel = /** @type {HTMLElement} */ (root.querySelector('#filters'));
    const backdrop = /** @type {HTMLElement} */ (root.querySelector('.filters-backdrop'));
    let reqId = 0;
    let debounce = 0;

    // venue options come from the API (they depend on what's on)
    events
      .getFilterOptions()
      .then(({ venues }) => {
        const slot = /** @type {HTMLElement} */ (root.querySelector('#venue-slot'));
        mount(
          slot,
          selectField({
            id: 'venue',
            label: 'Venue',
            options: venues.map((v) => ({ value: v, label: v })),
            value: state.venue,
            placeholder: 'All venues',
          }),
        );
      })
      .catch(() => {});

    const activeCount = () => ['when', 'city', 'uni', 'venue', 'type', 'max'].filter((k) => state[k]).length;

    function readState() {
      const v = Object.fromEntries(new FormData(form));
      for (const k of ['when', 'from', 'to', 'city', 'uni', 'venue', 'type', 'max'])
        state[k] = /** @type {string} */ (v[k] ?? '');
      state.q = qEl.value.trim();
      state.sort = sortEl.value;
      const dates = /** @type {HTMLElement} */ (root.querySelector('.date-range'));
      dates.hidden = state.when !== 'date';
      if (state.when !== 'date') state.from = state.to = '';
    }

    function sync() {
      const qs = new URLSearchParams(Object.entries(state).filter(([k, v]) => v && !(k === 'sort' && v === 'soonest')));
      history.replaceState(null, '', `#/browse${qs.size ? '?' + qs : ''}`); // no hashchange: keep focus
      const n = activeCount();
      const badgeEl = /** @type {HTMLElement} */ (root.querySelector('#filter-count'));
      badgeEl.hidden = n === 0;
      badgeEl.textContent = String(n);
      load();
    }

    async function load() {
      const id = ++reqId;
      mount(
        results,
        html`<div class="grid-cards" aria-busy="true" aria-label="Loading events">${Array.from({ length: 6 }, () => html`<div class="skeleton skeleton--event"></div>`)}</div>`,
      );
      count.textContent = 'Loading…';
      try {
        const list = await events.listEvents({
          q: state.q || undefined,
          when: /** @type {any} */ (state.when || undefined),
          from: state.from || undefined,
          to: state.to || undefined,
          cityId: state.city || undefined,
          uniId: state.uni || undefined,
          venue: state.venue || undefined,
          type: state.type || undefined,
          maxPricePence: state.max ? Number(state.max) : undefined,
          sort: /** @type {any} */ (state.sort),
        });
        if (id !== reqId) return;
        count.textContent = `${list.length} ${list.length === 1 ? 'event' : 'events'}`;
        if (!list.length) {
          mount(
            results,
            emptyState({
              title: 'No events match',
              body: 'Try removing a filter, or check back soon. New events are added all the time.',
            }),
          );
          results
            .querySelector('.state-box')
            ?.insertAdjacentHTML(
              'beforeend',
              '<button class="btn btn--secondary btn--sm" type="button" data-clear-inline>Clear filters</button>',
            );
          results.querySelector('[data-clear-inline]')?.addEventListener('click', clear);
          return;
        }
        mount(results, html`<div class="grid-cards">${list.map((e) => eventCard(e))}</div>`);
      } catch {
        if (id !== reqId) return;
        count.textContent = '';
        mount(results, errorState({ title: "Couldn't load events" }));
        results.querySelector('[data-retry]')?.addEventListener('click', load);
      }
    }

    function clear() {
      form.reset();
      for (const k of KEYS) state[k] = '';
      state.sort = 'soonest';
      qEl.value = '';
      sortEl.value = 'soonest';
      /** @type {HTMLInputElement} */ (form.querySelector('input[name=when][value=""]')).checked = true;
      readState();
      sync();
    }

    const open = (/** @type {boolean} */ on) => {
      panel.classList.toggle('is-open', on);
      backdrop.classList.toggle('is-open', on);
      if (on) /** @type {HTMLElement | null} */ (panel.querySelector('input, select'))?.focus();
    };
    root.querySelector('[data-filters-open]')?.addEventListener('click', () => open(true));
    root.querySelectorAll('[data-filters-close]').forEach((el) => el.addEventListener('click', () => open(false)));
    panel.addEventListener('keydown', (e) => e.key === 'Escape' && open(false));
    root.querySelector('[data-clear]')?.addEventListener('click', clear);

    form.addEventListener('change', () => (readState(), sync()));
    sortEl.addEventListener('change', () => (readState(), sync()));
    qEl.addEventListener('input', () => {
      window.clearTimeout(debounce);
      // Skip if the visitor has left Browse in the meantime, or sync() would rewrite their URL back here.
      debounce = window.setTimeout(() => qEl.isConnected && (readState(), sync()), 250);
    });
    qEl.addEventListener('keydown', (e) => e.key === 'Enter' && e.preventDefault());

    readState();
    sync();
  }

  return {
    title: 'Browse tickets | StudentSwap',
    description: `Find student club nights, balls, socials and gigs across the ${getRegion(brand.activeRegionId)?.name}, with tickets from verified students.`,
    view,
    onMount,
  };
}
