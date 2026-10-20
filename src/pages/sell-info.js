import { html } from '../lib/html.js';
import { pricing } from '../config/pricing.js';
import { sellerPayout, cardFeeText } from '../lib/fees.js';
import { formatPence } from '../lib/money.js';
import { icons } from '../components/icons.js';
import { brand } from '../config/brand.js';

/** [icon, title, body, tone, wide] */
const features = [
  [
    icons.bolt,
    'List in a minute',
    'Upload your ticket or paste the confirmation email and we read the details for you. You check them and publish. No forms to wrestle with.',
    'blue',
    true,
  ],
  [
    icons.cash,
    'Free to sell',
    `StudentSwap takes nothing from sellers. The only cost is Stripe's card fee (about ${cardFeeText()}), and you see your payout before you publish.`,
    'mint',
    false,
  ],
  [
    icons.grad,
    'Only verified students',
    'Every buyer signed up with a university email and is 18 or over. No anonymous strangers.',
    'plain',
    false,
  ],
  [
    icons.chat,
    'Offers on your terms',
    'Accept, decline or counter. You are always in control of the price, up to the original.',
    'rose',
    false,
  ],
  [
    icons.lock,
    'The money is already there',
    `The buyer pays up front and we hold it. You are paid ${pricing.payoutReleaseHoursAfterEvent} hours after the event, as long as no problem is reported. Change your price or take a ticket down any time until a buyer starts checking out.`,
    'ink',
    true,
  ],
  [
    icons.shield,
    'Protected from scams',
    'Tickets are checked and duplicates are caught, so fewer disputes and no chasing people for money.',
    'plain',
    false,
  ],
];

const steps = [
  [icons.ticket, 'Add your ticket', 'Upload it, paste the email, or choose a transfer through the ticketing app.'],
  [icons.sliders, 'Set your price', 'Pick any price up to the original. We show your payout as you type.'],
  [icons.chat, 'Sell', 'Buyers can buy straight away or send an offer. We tell you the moment something happens.'],
  [icons.cash, 'Get paid', `Your payout is released ${pricing.payoutReleaseHoursAfterEvent} hours after the event.`],
];

/** Public "why sell here" page. The button goes to the wizard, which sends guests to sign in first. */
export default function render() {
  const sale = sellerPayout(1200);
  const offer = sellerPayout(1000);
  const cta = (/** @type {string} */ cls = 'btn btn--primary') =>
    html`<a class="${cls}" href="#/sell/new">Sell tickets</a>`;
  return {
    title: 'Sell tickets | StudentSwap',
    description:
      'Sell your spare event ticket to verified students. List in a minute, see your payout first, and get paid after the event.',
    view: html`
    <section class="sell-hero">
      <div class="container sell-hero__grid">
        <div>
          <h1>
            <span class="line">Spare ticket?</span>
            <span class="line">Get <span class="mark">paid.</span></span>
          </h1>
          <p class="sell-hero__sub">Can’t make it any more? Sell your ticket to a verified student in minutes, with the buyer’s money secured before you hand anything over.</p>
          <div class="sell-hero__cta">${cta()}</div>
        </div>
        <div class="sell-phone" aria-hidden="true">
          <span class="sticker sticker--mint sell-phone__tag">Paid ${pricing.payoutReleaseHoursAfterEvent}h after the event</span>
          <div class="sell-phone__screen">
            <p class="sell-phone__time">23:47</p>
            <p class="sell-phone__date">Saturday 24 October</p>
            <div class="sell-phone__note sell-phone__note--sold">
              <span class="sell-phone__app">${icons.ticket}</span>
              <div><strong>Ticket sold!</strong><span>Fresh Fling: Rooftop Party sold to a verified student.</span></div>
              <em>now</em>
            </div>
            <div class="sell-phone__note">
              <span class="sell-phone__app">${icons.chat}</span>
              <div><strong>New offer: ${formatPence(1000, { exact: true })}</strong><span>Someone wants your Boiler Room Ball ticket. You'd get ${formatPence(offer.payout, { exact: true })}.</span></div>
              <em>2m</em>
            </div>
            <div class="sell-phone__note sell-phone__note--cash">
              <span class="sell-phone__app">${icons.cash}</span>
              <div><strong>+${formatPence(sale.payout, { exact: true })} on its way</strong><span>Your ${brand.name} payout has been sent to your bank.</span></div>
              <em>1d</em>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-head"><h2>Selling that doesn't stress you out.</h2><p>Everything is designed so you can sell quickly and safely.</p></div>
        <div class="bento">${features.map(([icon, title, body, tone, wide]) => html`<article class="bento__item bento__item--${tone} ${wide ? 'bento__item--wide' : ''}"><div class="bento__icon">${icon}</div><h3>${title}</h3><p>${body}</p></article>`)}</div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-head"><h2>Four steps to cash.</h2></div>
        <ol class="flow" style="--flow-n:${steps.length}">${steps.map(([icon, t, b], i) => html`<li class="flow__step"><span class="flow__num" aria-hidden="true">${i + 1}</span><div class="flow__card"><span class="flow__icon" aria-hidden="true">${icon}</span><h3>${t}</h3><p>${b}</p></div></li>`)}</ol>
      </div>
    </section>

    <section class="section" style="padding-top:0">
      <div class="container">
        <div class="cta">
          <h2>Ready to sell?</h2>
          <p>It only takes a minute to list your first ticket.</p>
          <div class="btn-row"><a class="btn btn--glow" href="#/sell/new">Sell tickets</a><a class="btn btn--secondary" href="#/how-it-works">How it works</a></div>
        </div>
      </div>
    </section>`,
  };
}
