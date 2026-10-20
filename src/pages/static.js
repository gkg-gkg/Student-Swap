import { html, mount } from '../lib/html.js';
import { brand } from '../config/brand.js';
import { pricing } from '../config/pricing.js';
import { faqGroups } from '../data/faq.js';
import { termsSections, privacySections } from '../data/legal.js';
import { buyerTotal, sellerPayout, buyerFeeText, cardFeeText } from '../lib/fees.js';
import { formatPence } from '../lib/money.js';
import { poundsToPence } from '../features/make-offer.js';
import { field, selectField, priceBreakdown, pageHead } from '../components/ui.js';
import { values, setFieldError, clearFieldErrors, setFormError, focusFirstError, busy } from '../lib/forms.js';
import { universities } from '../data/regions.js';
import { icons } from '../components/icons.js';

/** The ticket's journey on the How it works page: [title, body, who does it]. */
const journey = [
  [
    'Listed',
    'A verified student uploads the ticket, or picks a transfer, and sets a price at or below the original.',
    'Seller',
  ],
  [
    'Checked',
    'We read the barcode, look for duplicates and check the details match the event. Anything unclear goes to a person before it goes live.',
    'StudentSwap',
  ],
  ['Paid and held', `You pay the price you saw plus a ${buyerFeeText()} booking fee. The money is held.`, 'You'],
  ['Delivered', 'Download the PDF, or accept the transfer in the ticketing app.', 'Seller'],
  [
    'After the event',
    `The seller is paid ${pricing.payoutReleaseHoursAfterEvent} hours after the event, unless you report a problem.`,
    'StudentSwap',
  ],
];

const journeyIcons = [icons.plus, icons.search, icons.lock, icons.ticket, icons.cash];

/** Short FAQ at the bottom of How it works. The full list lives on the FAQ page. */
const faqs = [
  [
    'Who can use StudentSwap?',
    'Only verified students. You sign up with your university email and confirm a 6-digit code before you can buy or sell.',
  ],
  [
    'Can tickets be sold for more than the original price?',
    'No. Every listing is capped at the original price, and the cap is checked every time a price is set.',
  ],
  [
    'When does the seller get paid?',
    'Your payment is held while the night happens. The seller is paid 24 hours after the event ends, as long as no problem has been reported.',
  ],
  [
    'What if my ticket does not work?',
    'Report it from your order before the payout date. We review the evidence and, where the ticket is not valid, refund you.',
  ],
  [
    'What fees are there?',
    `Buyers pay a ${buyerFeeText()} booking fee on top of the ticket price. Selling is free: the only cost is Stripe's card fee (about ${cardFeeText()}), taken from the sale. Everything is shown before you commit.`,
  ],
  [
    'How do I get my ticket?',
    'Sellers either upload the ticket PDF or transfer it through the original ticketing app to your email. Either way, you will see exactly how in your order.',
  ],
];

/** [icon, title, body, tone] for "Built so a bad swap is hard to pull off", including how tickets are checked. */
const safeguards = [
  [
    icons.grad,
    'Verified students only',
    'You need a supported university email and a confirmed code to join. Everyone is 18+.',
    'blue',
  ],
  [
    icons.scale,
    'Original-price cap',
    'No markups. A listing can never cost more than the ticket originally did.',
    'plain',
  ],
  [
    icons.lock,
    'Money held until after',
    `Your payment is held until ${pricing.payoutReleaseHoursAfterEvent}h after the event, so sellers only get paid for tickets that worked.`,
    'mint',
  ],
  [
    icons.search,
    'Scanned on upload',
    "PDF tickets are read for a valid barcode and checked for duplicates. If we can't read one, a person reviews it before it goes live.",
    'plain',
  ],
  [
    icons.shield,
    'A real ticket or your money back',
    'Report a problem before the payout date and we review it. Valid reports are refunded.',
    'rose',
  ],
  [
    icons.ticket,
    'Private and tracked',
    'PDFs are stored privately and only released once the buyer has paid. App transfers are confirmed by the seller and tracked on the order.',
    'plain',
  ],
];

/** [what, group chat, StudentSwap] */
const comparison = [
  ['Who you are buying from', 'Anyone in the chat', 'Verified university students'],
  ['Price', 'Whatever they ask', 'Never above the original price'],
  ['Sold twice?', 'You find out at the door', 'Duplicates are checked before a ticket goes live'],
  ['Where your money goes', 'Straight to a stranger', 'Held until after the event'],
  ['If the ticket fails', "You're on your own", 'Report it and we review it for a refund'],
];

/** Terms and Privacy body: numbered sections with a "last updated" line. @param {[string, any][]} sections */
const legal = (sections) =>
  html`<div class="prose"><p class="small">Last updated: ${brand.legal.lastUpdated}</p>
    ${sections.map(([h, body]) => html`<h2>${h}</h2>${body}`)}</div>`;

/** @param {string} title @param {string} sub @param {any} body */
const shell = (title, sub, body) =>
  html`<div class="page"><div class="container">${pageHead({ title, sub })}${body}</div></div>`;

const pages =
  /** @type {Record<string, () => { title: string, description: string, view: any, onMount?: (root: HTMLElement) => void }>} */ ({
    'how-it-works': () => ({
      title: 'How it works | StudentSwap',
      description:
        'Buy and sell student tickets safely: verified students, original-price cap, money held until after the event.',
      view: shell(
        'How StudentSwap works',
        'Verified students swapping real tickets, with your money protected the whole way.',
        html`
      <div class="stack stack--xl">
        <section class="paths" aria-label="Buying and selling">
          <div class="path path--buy">
            <h2>Buying</h2>
            <ul class="path__list">
              <li>${icons.search}<div><strong>Find your night</strong><span>Search events and compare tickets from verified students.</span></div></li>
              <li>${icons.lock}<div><strong>Pay safely</strong><span>You pay the listed price plus a ${buyerFeeText()} booking fee. We hold the money.</span></div></li>
              <li>${icons.ticket}<div><strong>Get your ticket</strong><span>Download the PDF, or accept the transfer in the ticketing app.</span></div></li>
              <li>${icons.shield}<div><strong>Enjoy</strong><span>Something wrong? Report it before the payout date.</span></div></li>
            </ul>
            <a class="btn btn--primary" href="#/browse">Buy tickets</a>
          </div>
          <div class="path path--sell">
            <h2>Selling</h2>
            <ul class="path__list">
              <li>${icons.bolt}<div><strong>List in a minute</strong><span>Pick the event, upload the ticket or choose transfer, set a price at or below original.</span></div></li>
              <li>${icons.cash}<div><strong>Free to sell</strong><span>No StudentSwap fee. Stripe's card fee (about ${cardFeeText()}) comes out of the sale, and you see your payout before you publish.</span></div></li>
              <li>${icons.chat}<div><strong>Sell</strong><span>Accept offers or wait for a buyer. Transfer if needed.</span></div></li>
              <li>${icons.scale}<div><strong>Get paid</strong><span>${pricing.payoutReleaseHoursAfterEvent}h after the event, if no problem is reported.</span></div></li>
            </ul>
            <a class="btn btn--secondary" href="#/sell">Sell tickets</a>
          </div>
        </section>

        <section id="journey" aria-labelledby="life-h">
          <div class="section-head"><h2 id="life-h">Protected at every step.</h2><p>From the moment a ticket is listed to the moment the seller is paid.</p></div>
          <ol class="flow" style="--flow-n:${journey.length}">
            ${journey.map(([title, body, who], i) => html`<li class="flow__step"><span class="flow__num" aria-hidden="true">${i + 1}</span><div class="flow__card"><span class="flow__icon" aria-hidden="true">${journeyIcons[i]}</span><h3>${title}</h3><p>${body}</p><span class="flow__who ${who === 'StudentSwap' ? 'flow__who--us' : ''}">${who}</span></div></li>`)}
          </ol>
        </section>

        <section id="safety" aria-labelledby="safe-h">
          <div class="section-head"><h2 id="safe-h">Built so a bad swap is hard to pull off.</h2><p>Every rule and check below exists for one reason: so you can buy from a stranger with confidence.</p></div>
          <div class="bento bento--3">
            ${safeguards.map(([icon, t, b, tone]) => html`<article class="bento__item bento__item--${tone}"><div class="bento__icon">${icon}</div><h3>${t}</h3><p>${b}</p></article>`)}
          </div>
        </section>

        <section aria-labelledby="wrong-h">
          <div class="section-head"><h2 id="wrong-h">If something goes wrong</h2><p>Four steps, and your money stays held while we look.</p></div>
          <ol class="wrong">
            <li><strong>Report it</strong><span>Open the order and choose <em>Report a problem</em> before the payout date.</span></li>
            <li><strong>Tell us what happened</strong><span>Pick a reason, describe it and add evidence such as screenshots.</span></li>
            <li><strong>We pause the payout</strong><span>The seller isn't paid while we review your report.</span></li>
            <li><strong>You get an answer</strong><span>If the ticket was not valid, you are refunded to your original payment method. If not, the seller is paid and we tell you why.</span></li>
          </ol>
        </section>

        <section class="safe-panel" aria-labelledby="stay-h">
          <h2 id="stay-h">Staying safe</h2>
          <ul>
            <li>Only pay through StudentSwap. Never send money to a seller directly.</li>
            <li>Never share your password or the 6-digit code with anyone, including us.</li>
            <li>Check the event date, venue and entry rules before you buy.</li>
            <li>If something feels off, <a href="#/contact">contact us</a>.</li>
          </ul>
        </section>

        <section id="compare" aria-labelledby="cmp-h">
          <div class="section-head"><h2 id="cmp-h">A group chat vs StudentSwap</h2></div>
          <div class="table-wrap">
            <table class="table compare">
              <thead><tr><th scope="col"><span class="sr-only">What you get</span></th><th scope="col">Group chat</th><th scope="col" class="compare__us">StudentSwap</th></tr></thead>
              <tbody>
                ${comparison.map(([what, chat, us]) => html`<tr><th scope="row">${what}</th><td>${chat}</td><td class="compare__us">${us}</td></tr>`)}
              </tbody>
            </table>
          </div>
        </section>

        <section id="faq" aria-labelledby="faq-h" style="max-width:820px">
          <div class="section-head"><h2 id="faq-h">Frequently asked questions</h2></div>
          <div class="accordion">
            ${faqs.map(([q, a]) => html`<details><summary>${q}</summary><p class="accordion__body">${a}</p></details>`)}
          </div>
          <p style="margin-top:16px"><a class="link" href="#/faq">See all questions</a></p>
        </section>

        <section class="cta">
          <h2>Ready when you are.</h2>
          <p>Join with your university email and swap your first ticket in minutes.</p>
          <div class="btn-row"><a class="btn btn--glow" href="#/sign-up">Get started</a><a class="btn btn--secondary" href="#/browse">Buy tickets</a></div>
        </section>
      </div>`,
      ),
    }),

    fees: () => ({
      title: 'Fees | StudentSwap',
      description:
        'Simple, transparent fees: a small booking fee for buyers, and selling is free. Always shown before you commit.',
      view: shell(
        'Simple fees',
        'No hidden costs. You always see the full price before you commit.',
        html`
      <div class="how-cols">
        <div class="card stack"><h2>Buyers pay ${buyerFeeText()}</h2><p class="muted">A booking fee on top of the ticket price, shown from the first price you see and again at checkout.</p></div>
        <div class="card stack"><h2>Selling is free</h2><p class="muted">StudentSwap takes nothing from sellers. The only cost is Stripe's card fee (about ${cardFeeText()} of the payment), taken from the sale. You see your payout before you publish.</p></div>
      </div>
      <section class="card stack" style="margin-top:24px" aria-labelledby="calc"><h2 id="calc">Try it</h2>
        ${field({ id: 'calc-price', label: 'Ticket price', prefix: '£', inputmode: 'decimal', value: '12.00', hint: 'Enter any price to see what each side pays.' })}
        <div class="how-cols"><div><h3 class="h3">Buyer pays</h3><div id="calc-buyer" aria-live="polite"></div></div><div><h3 class="h3">Seller receives</h3><div id="calc-seller" aria-live="polite"></div></div></div>
      </section>
      <p class="muted" style="margin-top:20px;max-width:62ch">Stripe's card fee depends on the buyer's card (it's a little higher for premium and non-UK cards), so seller payouts here are estimates. If a refund is approved after a report, the buyer is refunded in full. Fees may change, but never without showing you the final amount first.</p>`,
      ),
      onMount(root) {
        const input = /** @type {HTMLInputElement} */ (root.querySelector('#calc-price'));
        const update = () => {
          const p = poundsToPence(input.value);
          const b = /** @type {HTMLElement} */ (root.querySelector('#calc-buyer'));
          const s = /** @type {HTMLElement} */ (root.querySelector('#calc-seller'));
          if (Number.isNaN(p) || p < 100) {
            mount(b, html`<p class="muted">Enter at least £1.</p>`);
            mount(s, html``);
            return;
          }
          const bt = buyerTotal(p);
          const sp = sellerPayout(p);
          mount(
            b,
            priceBreakdown([
              { label: 'Ticket', value: formatPence(bt.price, { exact: true }) },
              { label: 'Booking fee', value: formatPence(bt.buyerFee, { exact: true }) },
              { label: 'Total', value: formatPence(bt.total, { exact: true }), strong: true },
            ]),
          );
          mount(
            s,
            priceBreakdown([
              { label: 'Sale price', value: formatPence(sp.price, { exact: true }) },
              { label: 'Card processing (Stripe, est.)', value: `−${formatPence(sp.cardFee, { exact: true })}` },
              { label: 'You receive', value: formatPence(sp.payout, { exact: true }), strong: true },
            ]),
          );
        };
        input.addEventListener('input', update);
        update();
      },
    }),

    faq: () => ({
      title: 'FAQ | StudentSwap',
      description: 'Answers to common questions about buying, selling, fees, payouts and problems.',
      view: shell(
        'Frequently asked questions',
        "Can't find your answer? We're happy to help.",
        html`
      <div class="stack stack--lg" style="max-width:820px">${faqGroups.map((g) => html`<section><h2 class="faq-group">${g.title}</h2><div class="accordion">${g.items.map(([q, a]) => html`<details><summary>${q}</summary><p class="accordion__body">${a}</p></details>`)}</div></section>`)}
      <p>Still stuck? <a class="link" href="#/contact">Contact us</a>.</p></div>`,
      ),
    }),

    contact: () => ({
      title: 'Contact | StudentSwap',
      description: 'Get in touch with the StudentSwap team.',
      view: shell(
        'Contact us',
        `We usually reply within a day. You can also email ${brand.supportEmail}.`,
        html`
      <div class="card" style="max-width:600px" id="contact-card">
        <form id="contact-form" class="stack" novalidate><div class="form-error" role="alert"></div>
          ${field({ id: 'name', label: 'Your name', required: true, autocomplete: 'name' })}
          ${field({ id: 'email', label: 'Email', type: 'email', required: true, autocomplete: 'email', inputmode: 'email' })}
          ${selectField({ id: 'topic', label: 'Topic', required: true, placeholder: 'Choose…', options: ['An order or ticket', 'Selling', 'My account', 'Request a university', 'Something else'].map((t) => ({ value: t, label: t })) })}
          ${field({ id: 'message', label: 'Message', textarea: true, rows: 5, required: true, hint: 'For order problems, use "Report a problem" on the order page so we can pause the payout.' })}
          <div><button class="btn btn--primary" type="submit">Send message</button></div>
        </form>
        <p class="small muted" style="margin-top:12px">Supported universities: ${universities.map((u) => u.short).join(', ')}.</p>
      </div>`,
      ),
      onMount(root) {
        const form = /** @type {HTMLFormElement} */ (root.querySelector('#contact-form'));
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          clearFieldErrors(form);
          const v = values(form);
          if (!v.name.trim()) setFieldError(form, 'name', 'Enter your name.');
          if (!/^\S+@\S+\.\S+$/.test(v.email)) setFieldError(form, 'email', 'Enter a valid email address.');
          if (!v.topic) setFieldError(form, 'topic', 'Choose a topic.');
          if (v.message.trim().length < 10) setFieldError(form, 'message', 'Tell us a little more (10+ characters).');
          if (form.querySelector('.field--error')) return focusFirstError(form);
          const btn = /** @type {HTMLButtonElement} */ (form.querySelector('button[type=submit]'));
          busy(btn, true, 'Sending…');
          try {
            // TODO(api): POST /contact (SES). Mock just waits.
            await new Promise((r) => setTimeout(r, 600));
            mount(
              /** @type {HTMLElement} */ (root.querySelector('#contact-card')),
              html`<div class="state-box"><h3>Thanks, we've got it</h3><p>We'll reply to ${v.email} soon.</p><a class="btn btn--primary btn--sm" href="#/">Back home</a></div>`,
            );
          } catch {
            busy(btn, false);
            setFormError(form, 'Could not send your message. Please try again.');
          }
        });
      },
    }),

    terms: () => ({
      title: 'Terms of use | StudentSwap',
      description:
        'The rules for buying and selling tickets on StudentSwap, including fees, payouts and buyer protection.',
      view: shell('Terms of use', 'The rules for buying and selling on StudentSwap.', legal(termsSections)),
    }),

    privacy: () => ({
      title: 'Privacy policy | StudentSwap',
      description: 'What personal data StudentSwap collects, how it is used and shared, and your rights.',
      view: shell('Privacy policy', 'What we collect, why, and the choices you have.', legal(privacySections)),
    }),
  });

/** @param {{ path: string }} ctx */
export default function render({ path }) {
  const key = path.replace(/^\//, '');
  return pages[key]();
}
