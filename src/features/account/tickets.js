import { html } from '../../lib/html.js';
import { orders } from '../../api/index.js';
import { statusBadge, emptyState, badge } from '../../components/ui.js';
import { toast } from '../../components/toast.js';
import { busy } from '../../lib/forms.js';
import { eventLine, sectionHead, isPast } from './shared.js';

/** @param {any} o */
const ticketRow = (o) => html`<article class="row-card">
  <div class="row-card__main">
    <a class="row-card__title" href="#/orders/${o.id}">${o.event.title}</a>
    <div class="muted small">${eventLine(o.event)}</div>
    <div class="row">${o.quantity} × ${o.tier?.name ?? 'ticket'} ${statusBadge('order', o.status)}
      ${o.delivery === 'transfer' ? badge(o.status === 'paid' ? `Waiting for transfer (${o.transferPlatform})` : `Transferred via ${o.transferPlatform}`, o.status === 'paid' ? 'warn' : 'ok') : ''}</div>
  </div>
  <div class="row-card__actions">
    ${o.delivery === 'pdf' && ['delivered', 'completed', 'reported'].includes(o.status) ? html`<button class="btn btn--primary btn--sm" type="button" data-download="${o.id}">Download</button>` : ''}
    <a class="btn btn--secondary btn--sm" href="#/orders/${o.id}">Details</a>
  </div>
</article>`;

export async function render() {
  const list = (await orders.myOrders()).filter((/** @type {any} */ o) => o.status !== 'pending_payment');
  const upcoming = list.filter((/** @type {any} */ o) => !isPast(o.event) && !['refunded'].includes(o.status));
  const past = list.filter((/** @type {any} */ o) => !upcoming.includes(o));
  const view = list.length
    ? html`<div class="stack stack--lg">
      ${upcoming.length ? html`<section>${sectionHead('Upcoming', upcoming.length)}<div class="stack">${upcoming.map(ticketRow)}</div></section>` : ''}
      ${past.length ? html`<section>${sectionHead('Past', past.length)}<div class="stack">${past.map(ticketRow)}</div></section>` : ''}
    </div>`
    : emptyState({
        title: 'No tickets yet',
        body: 'Tickets you buy show up here, ready to download or transfer.',
        href: '#/browse',
        action: 'Find an event',
      });

  return {
    view,
    /** @param {HTMLElement} root */
    onMount(root) {
      root.querySelectorAll('[data-download]').forEach((b) =>
        b.addEventListener('click', async () => {
          const btn = /** @type {HTMLButtonElement} */ (b);
          busy(btn, true, 'Preparing…');
          try {
            const { url, fileName } = await orders.getTicketDownload(/** @type {string} */ (btn.dataset.download));
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            toast('Download started');
          } catch (err) {
            toast(err instanceof Error ? err.message : 'Could not download.', 'error');
          }
          busy(btn, false);
        }),
      );
    },
  };
}
