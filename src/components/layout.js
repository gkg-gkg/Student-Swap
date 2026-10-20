import { html, raw } from '../lib/html.js';
import { brand } from '../config/brand.js';
import { icons, logoMark } from './icons.js';
import { avatar } from './ui.js';
import { getRegion } from '../data/regions.js';

const regionName = getRegion(brand.activeRegionId)?.name ?? '';

const logo = html`<a class="logo" href="#/">${logoMark}<span>Student<b>Swap</b></span>${regionName ? html`<span class="logo__region">${regionName}</span>` : ''}</a>`;

/** @param {{ path: string, user: import('../types/index.js').User | null, focus?: boolean, exit?: { href: string, label: string } }} o */
export function header({ path, user, focus, exit }) {
  if (focus) {
    return html`<header class="site-header"><div class="container">${logo}
      ${exit ? html`<a class="btn btn--ghost btn--sm right" href="${exit.href}">${exit.label}</a>` : ''}
    </div></header>`;
  }
  const nav = (/** @type {string} */ href, /** @type {string} */ label) =>
    html`<a href="#${href}" ${path === href || path.startsWith(href + '/') ? raw('aria-current="page"') : ''}>${label}</a>`;
  return html`<header class="site-header">
    <div class="container">
      ${logo}
      <nav class="nav-desktop" aria-label="Main">
        ${nav('/browse', 'Buy Tickets')}${nav('/sell', 'Sell Tickets')}${nav('/how-it-works', 'How it works')}
        ${user?.role === 'admin' ? nav('/admin', 'Admin') : ''}
      </nav>
      <div class="header-actions">
        ${
          user
            ? html`<a class="header-user" href="#/account">${avatar(user, 'sm')}<span class="header-user__name">${user.displayName.split(' ')[0]}</span><span class="sr-only"> account</span></a>`
            : html`<a class="btn btn--ghost btn--sm" href="#/sign-in">Sign in</a><a class="btn btn--primary btn--sm btn--signup" href="#/sign-up">Sign up</a>`
        }
      </div>
    </div>
  </header>`;
}

export function bottomNav(/** @type {string} */ path) {
  const item = (
    /** @type {string} */ href,
    /** @type {string} */ label,
    /** @type {any} */ icon,
    /** @type {string} */ match = href,
  ) =>
    html`<a href="#${href}" ${path === match || (match !== '/' && path.startsWith(match + '/')) ? raw('aria-current="page"') : ''}>${icon}<span>${label}</span></a>`;
  return html`<nav class="bottom-nav" aria-label="Quick">
    ${item('/', 'Home', icons.home)}
    ${item('/browse', 'Buy Tickets', icons.search)}
    <a href="#/sell" class="bottom-nav__sell" ${path === '/sell' ? raw('aria-current="page"') : ''}><span class="plus">${icons.plus}</span><span>Sell Tickets</span></a>
    ${item('/account/tickets', 'My Tickets', icons.ticket)}
    ${item('/account/orders', 'Account', icons.user, '/account')}
  </nav>`;
}

export function footer() {
  return html`<footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <a class="logo" href="#/">${logoMark}<span>Student<b>Swap</b></span></a>
          <p>Verified ${regionName} students swapping real tickets at fair prices. Never above the original price.</p>
        </div>
        <div>
          <h2>Marketplace</h2>
          <ul>
            <li><a href="#/browse">Buy tickets</a></li>
            <li><a href="#/sell">Sell tickets</a></li>
            <li><a href="#/how-it-works">How it works &amp; safety</a></li>
          </ul>
        </div>
        <div>
          <h2>Help</h2>
          <ul>
            <li><a href="#/fees">Fees</a></li>
            <li><a href="#/faq">FAQ</a></li>
            <li><a href="#/contact">Contact</a></li>
          </ul>
        </div>
        <div>
          <h2>Legal</h2>
          <ul>
            <li><a href="#/terms">Terms</a></li>
            <li><a href="#/privacy">Privacy</a></li>
          </ul>
        </div>
      </div>
      <p class="footer-legal">© ${new Date().getFullYear()} ${brand.name}. Not affiliated with any university or venue.</p>
    </div>
  </footer>`;
}
