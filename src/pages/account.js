import { html, mount } from '../lib/html.js';
import { offers, notifications } from '../api/index.js';
import { tabs, avatar, errorState, skeletonBlocks } from '../components/ui.js';
import { startCountdowns } from '../components/countdown.js';
import { navigate } from '../router.js';

/** @type {[string, string, () => Promise<any>][]} */
const TABS = [
  ['tickets', 'My tickets', () => import('../features/account/tickets.js')],
  ['listings', 'My listings', () => import('../features/account/listings.js')],
  ['offers', 'Offers', () => import('../features/account/offers.js')],
  ['orders', 'Orders', () => import('../features/account/orders.js')],
  ['payouts', 'Payouts', () => import('../features/account/payouts.js')],
  ['notifications', 'Notifications', () => import('../features/account/notifications.js')],
  ['settings', 'Settings', () => import('../features/account/settings.js')],
];

/**
 * Each tab module exports `render(ctx) -> Promise<{ view, onMount? }>`.
 * @param {{ params: Record<string, string>, user: import('../types/index.js').User, rerender: () => void }} ctx
 */
export default function render({ params, user, rerender }) {
  const key = params.tab;
  if (!key) return { redirect: '/account/tickets' };
  const tab = TABS.find((t) => t[0] === key);
  if (!tab) return { redirect: '/account/tickets' };
  const [, tabTitle, loadTab] = tab; // narrowed copy for use inside closures

  const view = html`<div class="page"><div class="container">
    <div class="account-head">${avatar(user, 'lg')}<div><h1>${user.displayName}</h1><p class="muted">${user.email}</p></div></div>
    ${tabs(
      TABS.map(([k, label]) => ({ href: `#/account/${k}`, label })),
      `#/account/${key}`,
      'Account sections',
    )}
    <div id="tab-panel" tabindex="-1">${skeletonBlocks(3)}</div>
  </div></div>`;

  /** @param {HTMLElement} root */
  async function onMount(root) {
    const panel = /** @type {HTMLElement} */ (root.querySelector('#tab-panel'));
    const load = async (/** @type {boolean} */ quiet = false) => {
      if (!quiet) mount(panel, skeletonBlocks(3));
      try {
        const mod = await loadTab();
        const result = await mod.render({ user, reload: () => load(true), rerender });
        mount(panel, result.view);
        result.onMount?.(panel);
        startCountdowns();
      } catch (err) {
        if (/** @type {any} */ (err)?.status === 401)
          return navigate(`/sign-in?next=${encodeURIComponent(location.hash.slice(1))}`);
        console.error(err);
        mount(panel, errorState({ title: "Couldn't load this section" }));
        panel.querySelector('[data-retry]')?.addEventListener('click', () => load());
      }
    };
    load();

    // Small badges on tabs that need attention (best effort; never blocks the page).
    Promise.all([offers.myOffers(), notifications.listNotifications()])
      .then(([o, n]) => {
        const mine = (/** @type {any} */ x) =>
          x.sellerId === user.id ? x.lastActor === 'buyer' : x.lastActor === 'seller';
        const todo =
          [...o.made, ...o.received].filter((x) => x.status === 'open' && mine(x)).length +
          o.made.filter((/** @type {any} */ x) => x.status === 'accepted').length;
        const unread = n.filter((x) => !x.read).length;
        for (const [k, count] of [
          ['offers', todo],
          ['notifications', unread],
        ]) {
          const a = root.querySelector(`.tabs a[href="#/account/${k}"]`);
          if (a && count) a.insertAdjacentHTML('beforeend', `<span class="tabs__badge">${count}</span>`);
        }
      })
      .catch(() => {});
  }

  return { title: `${tabTitle} | StudentSwap`, description: 'Your StudentSwap account.', view, onMount };
}
