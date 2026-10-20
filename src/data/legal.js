import { html } from '../lib/html.js';
import { brand } from '../config/brand.js';
import { pricing } from '../config/pricing.js';
import { buyerFeeText, cardFeeText } from '../lib/fees.js';

// Terms of Use and Privacy Policy, as [heading, body] sections. Numbers and timings come from config/pricing.js so the
// legal text always matches the product rules. Keep every claim in line with docs/BACKEND_HANDOFF.md.

const { name, supportEmail } = brand;
const { entity, companyNumber, address, icoNumber } = brand.legal;
const hold = pricing.payoutReleaseHoursAfterEvent;
const mail = html`<a href="mailto:${supportEmail}">${supportEmail}</a>`;

/** @type {[string, any][]} */
export const termsSections = [
  [
    '1. About these terms',
    html`<p>These terms are an agreement between you and ${entity} ("${name}", "we", "us"), a company registered in England and Wales (company number ${companyNumber}, registered office ${address}). They apply whenever you use the ${name} website and services.</p>
      <p>By creating an account, buying or selling, you agree to these terms and to our <a href="#/privacy">Privacy Policy</a>. If you do not agree, please do not use ${name}.</p>
      <p>Nothing in these terms affects your statutory rights as a consumer.</p>`,
  ],
  [
    '2. What StudentSwap is (and is not)',
    html`<p>${name} is an online marketplace where verified university students can resell event tickets to each other. We provide the platform, the ticket checks, the payment flow through our payments partner Stripe, and the buyer protection described in section 9.</p>
      <ul>
        <li><strong>We are not the seller.</strong> When you buy a ticket, your contract for the ticket is with the student who sold it.</li>
        <li><strong>We are not the event organiser.</strong> Events are run by venues and promoters. We are not responsible for the event itself, including its content, timings, entry decisions or safety.</li>
        <li><strong>We are independent.</strong> ${name} is not affiliated with, or endorsed by, any university, students' union, venue, promoter or ticketing platform.</li>
      </ul>
      <p>Event listings are created by us, using information from organisers. We try to keep them accurate but cannot guarantee every detail. Always check the organiser's own information before you go.</p>`,
  ],
  [
    '3. Who can use StudentSwap',
    html`<p>To use ${name} you must:</p>
      <ul>
        <li>be 18 or over;</li>
        <li>be a current student at a supported university, with an active university email address on our list of supported domains;</li>
        <li>[confirm: live in the UK and,] if you sell, have a UK bank account; and</li>
        <li>be able to enter into a legally binding contract.</li>
      </ul>
      <p>You may hold only one account. Your account is personal to you: do not share it, sell it or let anyone else use it. Keep your password and sign-in codes secret. We will never ask you for them.</p>
      <p>You must give us accurate information and keep it up to date. If you leave your university or lose access to your university email, you may no longer be able to use ${name}.</p>
      <p>${name} is for personal use. If you buy tickets to resell them, or sell tickets as part of a business, you must not use ${name}.</p>`,
  ],
  [
    '4. Listing and selling tickets',
    html`<p>Before your first listing you must set up payouts with Stripe, our payments partner. This means accepting Stripe's own terms (the Stripe Connected Account Agreement) and giving Stripe the identity and bank details it asks for. Stripe, not ${name}, decides whether to approve your payout account.</p>
      <p>When you list a ticket, you promise that:</p>
      <ul>
        <li>you own the ticket, legally obtained it, and already have it (in your hands, as a file, or in your ticketing app account). You must not list tickets you do not yet have;</li>
        <li>the ticket is genuine, valid for the event and has not been used, cancelled, copied or sold to anyone else;</li>
        <li>everything you tell us is true and complete, including the event, ticket type, the original price and any seat, standing area or entry restrictions (for example a named ticket, age limit or ID requirement);</li>
        <li>reselling the ticket, and transferring it to the buyer, is allowed under the organiser's terms, or you have told the buyer about any restriction; and</li>
        <li>you will not sell the same ticket anywhere else while it is listed on ${name}. If it sells elsewhere, remove the listing straight away.</li>
      </ul>
      <p><strong>Original-price cap.</strong> You cannot list a ticket for more than its original price, meaning the face value of that ticket type shown on the event page. This is checked whenever a price is set or changed. You can always list for less.</p>
      <p><strong>Bundles.</strong> A listing can contain 1 to 6 tickets for the same event and ticket type, sold together. The price is per ticket.</p>
      <p><strong>Listing window.</strong> You can list a ticket for an event starting within the next ${pricing.maxListingLeadDays} days. This is because our payments partner can only hold a payment for a limited time, and payouts are made after the event.</p>
      <p><strong>Ticket checks.</strong> Uploaded tickets are checked automatically. This includes reading the barcode or QR code, looking for duplicates of tickets already listed, and comparing the ticket details with the event. An AI service may read the ticket for these checks and to fill in the listing for you (see the <a href="#/privacy">Privacy Policy</a>). An exact duplicate of a ticket already on ${name} is blocked. Anything else unclear goes to a member of our team before the listing goes live. We may reject, pause or remove any listing, and we will tell you why where we can.</p>
      <p><strong>Removing a listing.</strong> You can remove a listing at any time before it is bought. Once a buyer has paid, the sale is binding and you must deliver the ticket.</p>`,
  ],
  [
    '5. Delivering tickets',
    html`<p>Tickets are delivered in one of two ways, chosen when you list:</p>
      <ul>
        <li><strong>Uploaded ticket (PDF or image).</strong> The file is stored privately and only released to the buyer once they have paid. You must not use, share or resell the ticket after it is sold.</li>
        <li><strong>Transfer.</strong> You transfer the ticket to the buyer through the original ticketing app (for example FIXR or Fatsoma). You must do this as soon as possible after the sale, and in any case [confirm deadline: in good time] before the event, then confirm the transfer on the order page.</li>
      </ul>
      <p>[confirm policy for named tickets:] If a ticket is named, you must complete any name change the organiser offers so the buyer can get in.</p>`,
  ],
  [
    '6. Buying tickets',
    html`<p>Every listing shows the ticket price, the original price and the booking fee before you buy, and checkout shows the full total before you pay.</p>
      <ul>
        <li><strong>Checkout hold.</strong> When you start checkout, the tickets are reserved for you for ${Math.round(pricing.checkoutHoldSeconds / 60)} minutes. If you do not pay in time, they go back on sale.</li>
        <li><strong>Offers.</strong> You can offer a lower price on a listing. The seller has 24 hours to accept, decline or counter. If an offer is accepted, you have ${pricing.offerCheckoutWindowHours} hours to complete checkout at that price, after which the offer expires. An offer is not a sale until you have paid.</li>
        <li><strong>Getting your ticket.</strong> Your order page tells you how your ticket is delivered: either a download, or a transfer to your account in the ticketing app.</li>
      </ul>
      <p>Before you buy, check the event date, venue, ticket type and entry rules, including age limits and ID requirements. The venue or organiser decides who gets in. If you are refused entry for reasons that have nothing to do with the ticket (for example no valid ID, being under age, or conduct), that is not covered by buyer protection.</p>
      <p><strong>Cancellation.</strong> [legal review: confirm the 14-day exemption applies to peer-to-peer resale] Tickets are for an event on a specific date, so there is no 14-day right to cancel once you have paid. If something goes wrong with the ticket, buyer protection applies (section 9).</p>`,
  ],
  [
    '7. Fees and payments',
    html`<ul>
        <li><strong>Buyers</strong> pay a booking fee of ${buyerFeeText()} of the order, on top of the ticket price. It is shown before you pay.</li>
        <li><strong>Sellers</strong> pay no ${name} fee. Stripe charges its card processing fee (around ${cardFeeText()} of the payment, more for premium and non-UK cards), which is taken from the sale. The payout preview shows your estimated payout before you publish.</li>
      </ul>
      <p>Payments are processed by Stripe. The buyer's payment goes to the seller's Stripe account, and Stripe pays our booking fee to us. We never see or store your full card details.</p>
      <p>Prices are in pounds sterling. We may change our fees in future, but any change will not affect an order you have already paid for, and you will always see the final amount before you commit.</p>`,
  ],
  [
    '8. Holding payments and payouts',
    html`<p>To protect buyers, a seller's money is not paid out to their bank straight away. It stays in the seller's Stripe account balance until <strong>${hold} hours after the event ends</strong>, and is then paid out as long as no problem has been reported.</p>
      <ul>
        <li>If the buyer reports a problem before then, the payout is paused while we review it.</li>
        <li>Card payments can take a few days to clear, so a payout may arrive a little after it is released.</li>
        <li>Payouts go to the bank account you set up with Stripe. Stripe's terms also apply, and Stripe may delay or withhold payouts for its own reasons, such as identity checks.</li>
      </ul>
      <p>You are responsible for any tax due on money you receive. [confirm with an accountant:] Selling your own spare tickets at or below cost does not usually create a tax bill, but if you are unsure, check with HMRC.</p>`,
  ],
  [
    '9. Problems, reports and refunds (buyer protection)',
    html`<p>If something is wrong with your ticket, report it from your order page using <em>Report a problem</em> <strong>before the seller is paid</strong> (${hold} hours after the event ends). You can report that:</p>
      <ul>
        <li>the ticket is not valid, or you were refused entry because of the ticket;</li>
        <li>you did not receive the ticket;</li>
        <li>it is for the wrong event or date;</li>
        <li>it had already been used or sold to someone else; or</li>
        <li>something else went wrong.</li>
      </ul>
      <p>Describe what happened and add any evidence you have, such as screenshots or a message from the venue. We pause the seller's payout, may ask both of you for more information, and decide on the evidence available.</p>
      <ul>
        <li><strong>If we find the ticket was not valid or not delivered,</strong> we refund you in full, including the booking fee, to your original payment method. Your bank decides how quickly it arrives.</li>
        <li><strong>If we find the ticket was valid and delivered,</strong> the seller is paid and we tell you why.</li>
      </ul>
      <p><strong>Cancelled or rescheduled events.</strong> [decide this policy and build it into the backend:] If an event is cancelled before the seller is paid, report it and we will refund you in full. Refunds from the organiser normally go to the original ticket holder (the seller), who keeps that refund instead of the payout. If an event is moved to a new date, your ticket normally stays valid for the new date. Report it if you can no longer go, and we will look at what can be done case by case.</p>
      <p><strong>After the seller is paid,</strong> we can no longer refund you through ${name}. You still have any rights you have against the seller, and you may be able to ask your card provider for a chargeback.</p>
      <p><strong>For sellers:</strong> refunds come out of the sale. Stripe's card fee is not returned on a refund. If a buyer disputes the payment with their bank, Stripe debits the disputed amount and its dispute fee [confirm current amount, about £20] from your Stripe balance, and may recover any shortfall from you under its terms.</p>
      <p>Reports must be honest. Making a false report, or reporting a ticket you used, is fraud.</p>`,
  ],
  [
    '10. Ratings and public profile',
    html`<p>Other users can see your display name, your university, a "verified student" badge, and, if you sell, your rating and number of completed sales. Choose a display name that is not offensive and does not impersonate anyone. We do not show other users your email address, except where a seller needs it to transfer a ticket to you [not built yet: the order page does not show the buyer's email to the seller].</p>`,
  ],
  [
    '11. Things you must not do',
    html`<p>You must not:</p>
      <ul>
        <li>list a ticket above its original price, or ask for or take extra money outside ${name};</li>
        <li>take payment, or arrange a sale, outside ${name} with someone you met on it;</li>
        <li>list fake, copied, edited, stolen, used or cancelled tickets, or tickets you do not have;</li>
        <li>sell the same ticket more than once;</li>
        <li>make false reports or chargebacks, or give false information;</li>
        <li>harass, threaten or abuse anyone, or post anything unlawful, offensive or misleading;</li>
        <li>create more than one account, use someone else's account, or get around a suspension;</li>
        <li>scrape, copy or automatically collect data from ${name}, or try to interfere with its security or working; or</li>
        <li>use ${name} for anything unlawful, including breaking the law on ticket resale.</li>
      </ul>`,
  ],
  [
    '12. Suspending or closing accounts',
    html`<p>We may remove listings, cancel unpaid orders, pause payouts while we investigate, or suspend or close your account if we reasonably believe you have broken these terms, acted fraudulently, or put other users at risk. Where we can, we will tell you why and give you a chance to respond. Where fraud or a legal duty is involved we may also share information with the police, Stripe, or the event organiser.</p>
      <p>You can close your account at any time by <a href="#/contact">contacting us</a>. Any open orders, reports and payouts will be completed first.</p>`,
  ],
  [
    '13. Our responsibility to you',
    html`<p>We provide ${name} with reasonable care and skill. Our checks lower the risk of a bad ticket, but they cannot guarantee that every ticket is valid. That is why buyer protection exists.</p>
      <p>We are not responsible for:</p>
      <ul>
        <li>the event itself, or decisions made by the venue or organiser;</li>
        <li>what users do outside ${name};</li>
        <li>losses that were not foreseeable when you agreed to these terms; or</li>
        <li>business losses. ${name} is for personal use only.</li>
      </ul>
      <p>Apart from refunds under buyer protection, our total liability to you for any claim about ${name} is limited to [confirm cap: the greater of £100 and the fees you have paid us in the 12 months before the claim].</p>
      <p>Nothing in these terms limits our liability for death or personal injury caused by our negligence, for fraud, or for anything else the law does not allow us to limit.</p>
      <p>We try to keep ${name} running at all times, but it may sometimes be unavailable, for example during maintenance.</p>`,
  ],
  [
    '14. Our content',
    html`<p>The ${name} name, logo, design and software belong to us or our licensors. You may use them only to use ${name} as intended.</p>
      <p>You keep ownership of anything you upload, but you give us permission to store, copy and display it as needed to run ${name}. For example, we show your listing to buyers and release your ticket file to the buyer who pays for it.</p>`,
  ],
  [
    '15. Changes to these terms',
    html`<p>We may update these terms, for example when we add features or the law changes. If a change is significant, we will tell you by email or on the site before it takes effect. If you keep using ${name} after that, the new terms apply. Orders already paid for stay under the terms that applied when you paid.</p>`,
  ],
  [
    '16. Complaints and disputes',
    html`<p>If you are unhappy with us, email ${mail} and we will try to sort it out quickly. For a problem with an order, use <em>Report a problem</em> on the order page so we can pause the payout.</p>
      <p>These terms are governed by the law of England and Wales. You can bring a claim in the courts of England and Wales, or, if you live in Scotland or Northern Ireland, in the courts where you live.</p>
      <p>If any part of these terms is found to be unenforceable, the rest still applies. If we do not enforce a right straight away, we can still enforce it later.</p>`,
  ],
  [
    '17. Contact us',
    html`<p>Email ${mail}, use our <a href="#/contact">contact form</a>, or write to ${entity}, ${address}.</p>`,
  ],
];

/** @type {[string, any][]} */
export const privacySections = [
  [
    '1. Who we are',
    html`<p>${name} is run by ${entity}, a company registered in England and Wales (company number ${companyNumber}, registered office ${address}). We are the "controller" of your personal data, which means we decide how and why it is used. We are registered with the Information Commissioner's Office (ICO) under number ${icoNumber}.</p>
      <p>This policy explains what personal data we collect, how we use it, who we share it with and what rights you have under UK data protection law (the UK GDPR and the Data Protection Act 2018).</p>
      <p>For any privacy question or request, email ${mail}.</p>`,
  ],
  [
    '2. What we collect',
    html`<p><strong>Account details</strong></p>
      <ul>
        <li>Your university email address, and the university it shows you attend.</li>
        <li>Your display name and profile picture settings (initials and colour).</li>
        <li>Your password, stored by our sign-in provider so that we cannot read it [confirm against Amazon Cognito], and the one-time codes we send to verify your email.</li>
        <li>Your confirmation that you are 18 or over, and when you gave it.</li>
        <li>Your notification settings and any event alerts you turn on.</li>
      </ul>
      <p><strong>Selling</strong></p>
      <ul>
        <li>Your listings: event, ticket type, quantity, price, delivery method and ticketing app.</li>
        <li>Ticket files you upload, or confirmation emails you paste in. These can include the name on the ticket, an email address, an order reference and a barcode or QR code.</li>
        <li>Details read from your ticket to fill in or check the listing, and the results of our checks.</li>
        <li>"Fingerprints" of each ticket (a code made from the file, the barcode values and a similarity value for the image), used to spot the same ticket being sold twice.</li>
        <li>Your Stripe account reference and whether your payout setup is complete. Stripe collects your identity and bank details directly; we do not receive your full bank details.</li>
      </ul>
      <p><strong>Buying</strong></p>
      <ul>
        <li>Your orders, offers, amounts paid and the status of each order.</li>
        <li>Payment information from Stripe, such as whether a payment succeeded or was refunded. Your card details go straight to Stripe; we never see or store them.</li>
      </ul>
      <p><strong>Reports and messages</strong></p>
      <ul>
        <li>Problem reports: the reason, your description and any evidence you upload, plus our notes and decision.</li>
        <li>Messages you send through our contact form or by email: your name, email address and what you tell us.</li>
        <li>Ratings and the number of completed sales on your seller profile.</li>
      </ul>
      <p><strong>Technical data</strong></p>
      <ul>
        <li>Your IP address, browser and device type, and records of requests to our servers, used for security and to fix faults.</li>
      </ul>
      <p>We do not ask for special category data (such as health or religion). Please do not include it in reports or messages.</p>`,
  ],
  [
    '3. How we use it, and our legal reasons',
    html`<p>UK law requires a legal reason ("lawful basis") for each use of your data. Ours are:</p>
      <ul>
        <li><strong>To provide ${name} (contract).</strong> Creating your account, checking you are a student at a supported university, running listings, offers and orders, taking payments through Stripe, delivering tickets, holding and releasing payouts, handling reports and refunds, and sending you emails about your account and orders.</li>
        <li><strong>To keep ${name} safe (legitimate interests).</strong> Checking tickets, detecting duplicates and fraud, reviewing flagged listings and reports, enforcing our <a href="#/terms">Terms</a>, and protecting our systems. Our interest is a marketplace where students can trust the tickets they buy.</li>
        <li><strong>To run and improve ${name} (legitimate interests).</strong> Understanding how the service is used, for example the number of users, listings and sales per university, and fixing problems. We use totals for this wherever we can.</li>
        <li><strong>To meet legal duties (legal obligation).</strong> Keeping financial records, responding to lawful requests from authorities, and dealing with legal claims.</li>
      </ul>
      <p>We do not sell your personal data, and we do not use it for advertising. We will only send you marketing emails if you have opted in, and you can opt out at any time.</p>`,
  ],
  [
    '4. Automated checks and AI',
    html`<p>To fill in listings and check tickets, we send the ticket file or pasted email text you give us to an AI service, Claude, provided by Anthropic. It reads the event, venue, date, ticket type and price, and flags anything that does not match the event or looks edited.</p>
      <ul>
        <li>We send only the single file or text needed for that check.</li>
        <li>The AI can flag a listing for review, but it never approves or rejects one by itself. Flagged listings are checked by a member of our team.</li>
        <li>Separately, an <strong>exact</strong> duplicate of a ticket already on ${name} (the same file or the same barcode) is blocked automatically. If you think this is wrong, <a href="#/contact">contact us</a> and a person will review it.</li>
        <li>Under Anthropic's commercial terms, data we send is not used to train its models and is kept only for a limited period [check Anthropic's current API retention period and state it] for safety and abuse monitoring.</li>
      </ul>`,
  ],
  [
    '5. Who we share it with',
    html`<p><strong>Other users</strong>, only as needed for a sale:</p>
      <ul>
        <li>Your display name, university, "verified student" badge, rating and completed sales are visible on your profile and listings.</li>
        <li>A buyer gets the ticket file they paid for. For transfers, the seller receives the details needed to send the ticket, such as the buyer's email address.</li>
      </ul>
      <p><strong>Service providers</strong> who process data for us under contract and only on our instructions:</p>
      <ul>
        <li><strong>Amazon Web Services</strong> ([confirm region: UK, London]): website hosting, sign-in (Amazon Cognito), our database, private file storage, malware scanning of uploads, and sending email.</li>
        <li><strong>Anthropic</strong> (USA): the Claude AI service that reads and checks tickets (section 4).</li>
        <li><strong>Google</strong> (USA): the fonts on our website are loaded from Google Fonts, which means your browser sends your IP address to Google.</li>
      </ul>
      <p><strong>Stripe</strong> processes payments and seller payouts. For card payments and seller accounts, Stripe also acts as a separate controller under its own <a href="https://stripe.com/gb/privacy" target="_blank" rel="noopener">privacy policy</a>, for example for identity checks and fraud prevention.</p>
      <p><strong>Others, only when necessary:</strong> the police, regulators or other authorities where the law requires it or to prevent fraud; an event organiser, if needed to investigate a fraudulent ticket; our professional advisers; and a buyer of our business, who would have to respect this policy.</p>
      <p>We do not share your data with your university.</p>`,
  ],
  [
    '6. International transfers',
    html`<p>Most of your data is stored in the UK. Anthropic, Google and Stripe may process data in the USA. When this happens we rely on UK-approved safeguards, such as the UK-US data bridge or the UK International Data Transfer Addendum to the EU standard contractual clauses [confirm which safeguard each provider uses, from their data processing agreements].</p>`,
  ],
  [
    '7. How long we keep it',
    html`<ul>
        <li><strong>Account details:</strong> while your account is open. When you close it, we delete or anonymise them within 30 days, apart from the records below.</li>
        <li><strong>Ticket files and pasted emails:</strong> until 6 months after the event, to cover reports and payment disputes, then deleted.</li>
        <li><strong>Ticket fingerprints:</strong> until 12 months after the event, to stop the same ticket being sold again.</li>
        <li><strong>Reports and evidence:</strong> 12 months after the report is resolved.</li>
        <li><strong>Orders, payments and payouts:</strong> 6 years after the end of the financial year they relate to, as UK tax and accounting law requires.</li>
        <li><strong>Contact messages:</strong> 2 years after we last reply.</li>
        <li><strong>Server and security logs:</strong> up to 90 days.</li>
      </ul>
      <p>[All periods above are proposals: confirm them and build the deletion jobs before launch.] We may keep data longer if we need it for a legal claim or a fraud investigation.</p>`,
  ],
  [
    '8. Your rights',
    html`<p>You have the right to:</p>
      <ul>
        <li><strong>access</strong> the personal data we hold about you;</li>
        <li><strong>correct</strong> it if it is wrong;</li>
        <li><strong>delete</strong> it, where we no longer need it;</li>
        <li><strong>restrict</strong> how we use it, or <strong>object</strong> to uses based on our legitimate interests;</li>
        <li><strong>take</strong> a copy of data you gave us in a common format (portability); and</li>
        <li>ask for a <strong>person to review</strong> an automated decision, such as a blocked duplicate.</li>
      </ul>
      <p>To use any of these rights, email ${mail} from your account email. We will reply within one month. It is free, but we may need to confirm your identity first. Some rights have limits, for example we must keep payment records for tax purposes.</p>
      <p>If you are unhappy with how we handle your data, please tell us first. You can also complain to the Information Commissioner's Office at <a href="https://ico.org.uk" target="_blank" rel="noopener">ico.org.uk</a> or on 0303 123 1113.</p>`,
  ],
  [
    '9. Cookies and browser storage',
    html`<p>We do not use advertising or analytics cookies.</p>
      <ul>
        <li><strong>Sign-in:</strong> when you sign in, your browser stores sign-in tokens so you stay signed in. These are strictly necessary and are removed when you sign out [confirm against the live sign-in setup].</li>
        <li><strong>Payments:</strong> at checkout, Stripe sets cookies used to process your payment securely and prevent fraud. These are strictly necessary for paying.</li>
      </ul>
      <p>Because these are strictly necessary, we do not ask for consent to them. You can block or clear them in your browser, but signing in and paying will not work without them.</p>`,
  ],
  [
    '10. Security',
    html`<p>[confirm once the backend is live:] We protect your data with encryption in transit and at rest, private file storage with short-lived download links, access limited to staff who need it, and malware scanning of uploads. Your card details are handled only by Stripe. No system is completely secure, so if we ever have a breach that puts you at risk, we will tell you and the ICO as the law requires.</p>`,
  ],
  [
    '11. Age',
    html`<p>${name} is only for people aged 18 or over. If we learn that someone under 18 has an account, we will close it and delete their data, unless we must keep it for legal reasons.</p>`,
  ],
  [
    '12. Changes to this policy',
    html`<p>We will update this policy when how we use data changes. If a change is significant, we will tell you by email or on the site before it takes effect.</p>`,
  ],
];
