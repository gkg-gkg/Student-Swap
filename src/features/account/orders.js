import { html } from '../../lib/html.js';
import { orders } from '../../api/index.js';
import { formatPence } from '../../lib/money.js';
import { formatDateTime } from '../../lib/time.js';
import { statusBadge, emptyState } from '../../components/ui.js';
import { eventLine, sectionHead } from './shared.js';

/** @param {any} o @param {'buy' | 'sell'} kind */
const row = (o, kind) => html`<article class="row-card">
  <div class="row-card__main">
    <a class="row-card__title" href="#/orders/${o.id}">${o.event.title}</a>
    <div class="muted small">${eventLine(o.event)}</div>
    <div class="row">${o.quantity} × ${o.tier?.name ?? 'ticket'} · ${kind === 'buy' ? html`<strong>${formatPence(o.totalPence, { exact: true })}</strong> paid` : html`<strong>${formatPence(o.unitPence * o.quantity, { exact: true })}</strong> sale`} ${statusBadge('order', o.status)}</div>
    <div class="small muted">Order ${o.id} · ${formatDateTime(o.createdAt)} · ${kind === 'buy' ? `from ${o.seller?.displayName}` : `to ${o.buyer?.displayName}`}</div>
  </div>
  <div class="row-card__actions">
    <a class="btn btn--secondary btn--sm" href="#/orders/${o.id}">View</a>
    ${kind === 'sell' && o.status === 'paid' && o.delivery === 'transfer' ? html`<a class="btn btn--primary btn--sm" href="#/orders/${o.id}">Transfer tickets</a>` : ''}
  </div>
</article>`;

export async function render() {
  const [bought, sold] = await Promise.all([orders.myOrders(), orders.mySales()]);
  return {
    view: html`<div class="stack stack--lg">
      <section>${sectionHead('Your purchases', bought.length)}${bought.length ? html`<div class="stack">${bought.map((/** @type {any} */ o) => row(o, 'buy'))}</div>` : emptyState({ title: 'No purchases yet', href: '#/browse', action: 'Browse events' })}</section>
      <section>${sectionHead('Your sales', sold.length)}${sold.length ? html`<div class="stack">${sold.map((/** @type {any} */ o) => row(o, 'sell'))}</div>` : emptyState({ title: 'No sales yet', body: 'When someone buys your tickets, the order appears here.', href: '#/sell/new', action: 'List a ticket' })}</section>
    </div>`,
  };
}
