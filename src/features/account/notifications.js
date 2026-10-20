import { html } from '../../lib/html.js';
import { notifications } from '../../api/index.js';
import { relativeTime } from '../../lib/time.js';
import { emptyState } from '../../components/ui.js';
import { toast } from '../../components/toast.js';

const ICON = /** @type {Record<string, string>} */ ({ offer: 'Offer', order: 'Order', alert: 'Alert', system: 'News' });

/** @param {{ reload: () => void }} ctx */
export async function render({ reload }) {
  const list = await notifications.listNotifications();
  const unread = list.filter((/** @type {any} */ n) => !n.read).length;
  return {
    view: html`<div class="stack">
      <div class="row row--between"><p class="muted">${unread ? `${unread} unread` : 'All caught up'}</p>${unread ? html`<button class="btn btn--secondary btn--sm" type="button" data-read-all>Mark all as read</button>` : ''}</div>
      ${
        list.length
          ? html`<ul class="notes">${list.map((/** @type {any} */ n) => html`<li class="note ${n.read ? '' : 'is-unread'}"><span class="note__kind">${ICON[n.kind]}</span><div class="note__body"><a href="${n.href ?? '#/account/notifications'}" data-note="${n.id}"><strong>${n.title}</strong></a><span class="muted small">${n.body}</span><span class="small muted">${relativeTime(n.createdAt)}</span></div>${n.read ? '' : html`<span class="note__dot"><span class="sr-only">Unread</span></span>`}</li>`)}</ul>`
          : emptyState({ title: 'No notifications', body: 'Offers, sales and ticket alerts will show up here.' })
      }
    </div>`,
    /** @param {HTMLElement} root */
    onMount(root) {
      root.querySelector('[data-read-all]')?.addEventListener('click', async () => {
        await notifications.markRead();
        toast('All marked as read');
        reload();
      });
      root.querySelectorAll('[data-note]').forEach((a) =>
        a.addEventListener('click', () => {
          notifications.markRead([/** @type {string} */ (/** @type {HTMLElement} */ (a).dataset.note)]).catch(() => {});
        }),
      );
    },
  };
}
