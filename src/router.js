import { html, mount } from './lib/html.js';
import { header, bottomNav, footer } from './components/layout.js';
import { startCountdowns, stopCountdowns } from './components/countdown.js';
import { auth } from './auth/index.js';
import { brand } from './config/brand.js';

/**
 * Hash router with lazy page modules (code splitting without a bundler).
 *
 * A page module's default export receives ctx and returns either
 *   { redirect: '/path' }  or  { title, description, view, onMount?, layout?, exit? }.
 *
 * Route flags:
 *   auth  : must be signed in (else -> /sign-in?next=...)
 *   admin : must have the admin role
 *   guest : signed-in users are bounced away (sign-in, sign-up)
 * Layouts: 'default' (header, footer, bottom nav) or 'focus' (logo + exit only: checkout, sell, auth).
 */
/** @type {{ path: string, load: () => Promise<any>, auth?: boolean, admin?: boolean, guest?: boolean }[]} */
const routes = [
  { path: '/', load: () => import('./pages/landing.js') },
  { path: '/browse', load: () => import('./pages/browse.js') },
  { path: '/event/:id', load: () => import('./pages/event.js') },
  { path: '/checkout/:listingId', load: () => import('./pages/checkout.js'), auth: true },
  { path: '/sell', load: () => import('./pages/sell-info.js') },
  // The wizard itself needs an account: guests are sent to sign in, then returned here.
  { path: '/sell/new', load: () => import('./pages/sell.js'), auth: true },
  { path: '/sign-up', load: () => import('./pages/sign-up.js'), guest: true },
  { path: '/sign-in', load: () => import('./pages/sign-in.js'), guest: true },
  { path: '/forgot-password', load: () => import('./pages/forgot-password.js'), guest: true },
  { path: '/reset-password', load: () => import('./pages/reset-password.js'), guest: true },
  { path: '/account', load: () => import('./pages/account.js'), auth: true },
  { path: '/account/:tab', load: () => import('./pages/account.js'), auth: true },
  { path: '/orders/:id', load: () => import('./pages/order.js'), auth: true },
  { path: '/orders/:id/report', load: () => import('./pages/report.js'), auth: true },
  { path: '/reports/:id', load: () => import('./pages/report-status.js'), auth: true },
  { path: '/seller/:id', load: () => import('./pages/seller.js') },
  { path: '/admin', load: () => import('./pages/admin.js'), auth: true, admin: true },
  { path: '/admin/:tab', load: () => import('./pages/admin.js'), auth: true, admin: true },
  // Safety now lives inside How it works.
  { path: '/safety', load: async () => ({ default: () => ({ redirect: '/how-it-works' }) }) },
  ...['how-it-works', 'fees', 'faq', 'contact', 'terms', 'privacy'].map((p) => ({
    path: `/${p}`,
    load: () => import('./pages/static.js'),
  })),
];

/** @param {string} path */
function match(path) {
  for (const r of routes) {
    const names = /** @type {string[]} */ ([]);
    const re = new RegExp('^' + r.path.replace(/:(\w+)/g, (_, n) => (names.push(n), '([^/]+)')) + '/?$');
    const m = path.match(re);
    if (m) return { route: r, params: Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

/** @param {string} name @param {string} content */
function setMeta(name, content, attr = 'name') {
  let el = document.head.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export const navigate = (/** @type {string} */ to) => {
  location.hash = '#' + to;
};

let renderToken = 0;

export async function renderRoute() {
  const token = ++renderToken;
  const [rawPath, rawQuery = ''] = (location.hash.replace(/^#/, '') || '/').split('?');
  const path = rawPath || '/';
  const query = new URLSearchParams(rawQuery);
  const app = /** @type {HTMLElement} */ (document.getElementById('app'));
  stopCountdowns();

  /** @param {any} page @param {any} user */
  const paint = (page, user) => {
    if (token !== renderToken) return;
    document.title = page.title;
    setMeta('description', page.description ?? '');
    setMeta('og:title', page.title, 'property');
    setMeta('og:description', page.description ?? '', 'property');
    setMeta('og:site_name', brand.name, 'property');
    setMeta('og:image', `https://${brand.domain}/public/og-image.png`, 'property');
    setMeta('twitter:card', 'summary_large_image');
    const focus = page.layout === 'focus';
    mount(
      app,
      html`${header({ path, user, focus, exit: page.exit })}<main id="main" tabindex="-1">${page.view}</main>${focus ? '' : footer()}${focus ? '' : bottomNav(path)}`,
    );
    window.scrollTo(0, 0);
    document.getElementById('main')?.focus({ preventScroll: true });
    startCountdowns();
    page.onMount?.(app);
  };

  try {
    const user = await auth.getCurrentUser().catch(() => null);
    if (token !== renderToken) return;
    const found = match(path);

    if (!found) return paint((await import('./pages/not-found.js')).default({ path }), user);
    const { route, params } = found;
    const next = encodeURIComponent(path + (rawQuery ? '?' + rawQuery : ''));

    if (route.auth && !user) return navigate(`/sign-in?next=${next}`);
    if (user && !user.profileComplete && path !== '/sign-up') return navigate('/sign-up?step=profile');
    if (route.guest && user?.profileComplete) return navigate(query.get('next') ?? '/browse');
    if (route.admin && user?.role !== 'admin')
      return paint((await import('./pages/not-found.js')).default({ path, forbidden: true }), user);

    const page = (await route.load()).default({ path, params, query, user, rerender: renderRoute });
    const resolved = await page;
    if (token !== renderToken) return;
    if (resolved.redirect) return navigate(resolved.redirect);
    paint(resolved, user);
  } catch (err) {
    console.error(err);
    if (token !== renderToken) return;
    const user = await auth.getCurrentUser().catch(() => null);
    paint((await import('./pages/error.js')).default({ error: err }), user);
  }
}

export function startRouter() {
  window.addEventListener('hashchange', renderRoute);
  window.addEventListener('unhandledrejection', (e) => console.error('Unhandled:', e.reason));
  return renderRoute();
}
