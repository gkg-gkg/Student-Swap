import { html } from '../lib/html.js';
import { users } from '../api/index.js';
import { universities } from '../data/regions.js';
import { avatar, stars, emptyState, errorState } from '../components/ui.js';
import { ticketCard } from '../components/ticket-card.js';
import { openOfferModal } from '../features/make-offer.js';
import { navigate } from '../router.js';

/** @param {{ params: Record<string, string>, user: import('../types/index.js').User | null, rerender: () => void }} ctx */
export default async function render({ params, user, rerender }) {
  /** @type {Awaited<ReturnType<typeof users.getSeller>>} */
  let data;
  try {
    data = await users.getSeller(params.id);
  } catch (err) {
    const missing = err instanceof Error && /not found/i.test(err.message);
    return {
      title: 'Seller | StudentSwap',
      description: '',
      view: html`<div class="page"><div class="container">${missing ? emptyState({ title: "We can't find that seller", href: '#/browse', action: 'Buy tickets' }) : errorState({ title: "Couldn't load this profile" })}</div></div>`,
      onMount: (/** @type {HTMLElement} */ root) =>
        root.querySelector('[data-retry]')?.addEventListener('click', () => rerender()),
    };
  }
  const { seller, listings } = data;
  const uni = universities.find((u) => u.id === seller.universityId);
  const joined = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', month: 'long', year: 'numeric' }).format(
    new Date(seller.createdAt),
  );
  return {
    title: `${seller.displayName} | StudentSwap`,
    description: `${seller.displayName}, verified student seller at ${uni?.name ?? 'a UK university'}.`,
    view: html`<div class="page"><div class="container">
      <section class="seller-head card">
        ${avatar(seller, 'lg')}
        <div><h1>${seller.displayName}</h1><p class="muted">${uni?.name ?? ''} <span class="badge badge--ok">Verified student</span></p></div>
        <dl class="seller-stats">
          <div><dt>Rating</dt><dd>${stars(seller.ratingAvg, seller.ratingCount)}</dd></div>
          <div><dt>Completed sales</dt><dd>${seller.completedSales}</dd></div>
          <div><dt>Member since</dt><dd>${joined}</dd></div>
        </dl>
      </section>
      <h2 class="section-title" style="margin:32px 0 12px"><span style="font-size:1.4rem">Tickets for sale</span></h2>
      ${listings.length ? html`<div class="listings">${listings.map((/** @type {any} */ l) => html`<div><a class="row-card__title small" href="#/event/${l.eventId}">${l.event.title}</a>${ticketCard(l, { currentUserId: user?.id, showSeller: false })}</div>`)}</div>` : emptyState({ title: 'Nothing listed right now', body: 'Check back soon.' })}
    </div></div>`,
    /** @param {HTMLElement} root */
    onMount(root) {
      root.querySelectorAll('[data-offer]').forEach((b) =>
        b.addEventListener('click', () => {
          if (!user) return navigate(`/sign-in?next=${encodeURIComponent('/seller/' + seller.id)}`);
          const l = listings.find((/** @type {any} */ x) => x.id === /** @type {HTMLElement} */ (b).dataset.offer);
          if (l) openOfferModal(l);
        }),
      );
    },
  };
}
