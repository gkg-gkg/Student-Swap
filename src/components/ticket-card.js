// A ticket listing (one seller's bundle of tickets) as shown on event pages and seller profiles.
import { html } from '../lib/html.js';
import { formatPence } from '../lib/money.js';
import { buyerTotal } from '../lib/fees.js';
import { avatar, stars, badge } from './ui.js';
import { universities } from '../data/regions.js';

/**
 * @param {any} l enriched listing (see api/mock/helpers.js enrichListing)
 * @param {{ currentUserId?: string, showSeller?: boolean }} [opts]
 */
export function ticketCard(l, { currentUserId, showSeller = true } = {}) {
  const mine = currentUserId === l.sellerId;
  const { buyerFee, total } = buyerTotal(l.pricePence * l.quantity);
  const uni = universities.find((u) => u.id === l.seller?.universityId);
  const below = l.faceValuePence - l.pricePence;
  return html`<article class="listing" data-listing="${l.id}">
    <div class="listing__seller">
      ${
        showSeller && l.seller
          ? html`${avatar(l.seller)}<div><a class="listing__name" href="#/seller/${l.seller.id}">${l.seller.displayName}</a><div class="listing__sub">${stars(l.seller.ratingAvg, l.seller.ratingCount)} · ${uni?.short ?? ''}</div></div>`
          : html`<div><strong>${l.tier?.name ?? 'Ticket'}</strong></div>`
      }
    </div>
    <div class="listing__info">
      <span class="listing__qty">${l.quantity} ${l.quantity === 1 ? 'ticket' : 'tickets, sold together'}</span>
      ${l.delivery === 'pdf' ? badge('PDF ticket', 'blue') : badge(`Transfer via ${l.transferPlatform ?? 'ticketing app'}`, 'blue')}
      ${below > 0 ? badge(`${formatPence(below)} under original`, 'ok') : badge('Original price', 'muted')}
    </div>
    <div class="listing__price">
      <span class="listing__amount">${formatPence(l.pricePence)}<small> each</small></span>
      <span class="listing__total">${formatPence(total, { exact: true })} total incl. ${formatPence(buyerFee, { exact: true })} fee · original ${formatPence(l.faceValuePence)}</span>
    </div>
    <div class="listing__actions">
      ${
        mine
          ? html`${badge('Your listing', 'muted')}`
          : html`<a class="btn btn--primary btn--sm" href="#/checkout/${l.id}">Buy</a><button class="btn btn--secondary btn--sm" type="button" data-offer="${l.id}">Make offer</button>`
      }
    </div>
  </article>`;
}
