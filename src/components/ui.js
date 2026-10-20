// Small reusable UI pieces. Each returns SafeHtml; interactive ones have a matching init in their own file.
import { html, raw } from '../lib/html.js';
import { statusLabels } from '../data/labels.js';
import { icons } from './icons.js';

/** @typedef {ReturnType<typeof html>} Html */

/** @param {{ avatar: { tone: string, initials: string } }} user @param {'sm' | 'md' | 'lg'} [size] */
export const avatar = (user, size = 'md') =>
  html`<span class="avatar avatar--${size} art--${user.avatar.tone}" aria-hidden="true">${user.avatar.initials}</span>`;

/** @param {number} rating @param {number} [count] */
export function stars(rating, count) {
  if (!count) return html`<span class="stars stars--none">New seller</span>`;
  return html`<span class="stars" aria-label="Rated ${rating.toFixed(1)} out of 5 from ${count} sales"><span aria-hidden="true">★</span> ${rating.toFixed(1)} <span class="stars__count" aria-hidden="true">(${count})</span></span>`;
}

/** @param {string} text @param {'blue' | 'ok' | 'hot' | 'warn' | 'muted'} [tone] */
export const badge = (text, tone = 'blue') => html`<span class="badge badge--${tone}">${text}</span>`;

/** @param {'listing' | 'offer' | 'order' | 'payout' | 'report' | 'barcode'} kind @param {string} status */
export function statusBadge(kind, status) {
  const [label, tone] = statusLabels[kind][status] ?? [status, 'muted'];
  return badge(label, /** @type {any} */ (tone));
}

/** @param {{ title: string, body?: string, href?: string, action?: string, icon?: Html }} o */
export const emptyState = ({ title, body, href, action, icon }) => html`<div class="state-box">
  ${icon ?? ''}<h3>${title}</h3>${body ? html`<p>${body}</p>` : ''}
  ${href && action ? html`<a class="btn btn--primary btn--sm" href="${href}">${action}</a>` : ''}
</div>`;

/** Error with a retry button. Pages wire `[data-retry]`. @param {{ title?: string, body?: string }} [o] */
export const errorState = ({
  title = 'Something went wrong',
  body = 'Check your connection and try again.',
} = {}) => html`<div class="state-box" role="alert">
  <h3>${title}</h3><p>${body}</p><button class="btn btn--primary btn--sm" type="button" data-retry>Try again</button>
</div>`;

/** @param {number} [n] @param {string} [cls] */
export const skeletonBlocks = (n = 3, cls = 'skeleton--card') =>
  html`<div class="skeleton-list" aria-busy="true" aria-label="Loading">${Array.from({ length: n }, () => html`<div class="skeleton ${cls}"></div>`)}</div>`;

/**
 * @typedef {object} FieldOpts
 * @property {string} id
 * @property {string} label
 * @property {string} [type]
 * @property {string} [name]
 * @property {string | number} [value]
 * @property {string} [hint]
 * @property {string} [error]
 * @property {boolean} [required]
 * @property {string} [autocomplete]
 * @property {string} [inputmode]
 * @property {string} [placeholder]
 * @property {number} [maxlength]
 * @property {string} [min]
 * @property {string} [max]
 * @property {string} [step]
 * @property {string} [prefix] e.g. "£"
 * @property {boolean} [textarea]
 * @property {number} [rows]
 */

/** Labelled input. Errors are announced and linked with aria-describedby. @param {FieldOpts} o */
export function field(o) {
  const {
    id,
    label,
    type = 'text',
    name = id,
    value = '',
    hint,
    error,
    required,
    autocomplete,
    inputmode,
    placeholder,
    maxlength,
    min,
    max,
    step,
    prefix,
    textarea,
    rows = 4,
  } = o;
  const described = [hint ? `${id}-hint` : '', `${id}-error`].filter(Boolean).join(' ');
  const attrs = html`id="${id}" name="${name}" ${required ? raw('required') : ''} ${autocomplete ? raw(`autocomplete="${autocomplete}"`) : ''} ${inputmode ? raw(`inputmode="${inputmode}"`) : ''} aria-describedby="${described}" ${error ? raw('aria-invalid="true"') : ''}`;
  const control = textarea
    ? html`<textarea ${attrs} rows="${rows}" ${maxlength ? raw(`maxlength="${maxlength}"`) : ''} placeholder="${placeholder ?? ''}">${value}</textarea>`
    : html`<input ${attrs} type="${type}" value="${value}" placeholder="${placeholder ?? ''}" ${maxlength ? raw(`maxlength="${maxlength}"`) : ''} ${min ? raw(`min="${min}"`) : ''} ${max ? raw(`max="${max}"`) : ''} ${step ? raw(`step="${step}"`) : ''} />`;
  return html`<div class="field ${error ? 'field--error' : ''}">
    <label for="${id}">${label}${required ? '' : html` <span class="field__opt">(optional)</span>`}</label>
    <div class="${prefix ? 'field__wrap field__wrap--prefix' : 'field__wrap'}">${prefix ? html`<span class="field__prefix" aria-hidden="true">${prefix}</span>` : ''}${control}</div>
    ${hint ? html`<p class="field__hint" id="${id}-hint">${hint}</p>` : ''}
    <p class="field__error" id="${id}-error" role="alert">${error ?? ''}</p>
  </div>`;
}

/** @param {{ id: string, label: string, options: { value: string, label: string }[], value?: string, name?: string, placeholder?: string, required?: boolean, error?: string }} o */
export function selectField({ id, label, options, value = '', name = id, placeholder, required, error }) {
  return html`<div class="field ${error ? 'field--error' : ''}">
    <label for="${id}">${label}</label>
    <div class="field__wrap"><select id="${id}" name="${name}" ${required ? raw('required') : ''} aria-describedby="${id}-error">
      ${placeholder ? html`<option value="">${placeholder}</option>` : ''}
      ${options.map((o) => html`<option value="${o.value}" ${o.value === value ? raw('selected') : ''}>${o.label}</option>`)}
    </select></div>
    <p class="field__error" id="${id}-error" role="alert">${error ?? ''}</p>
  </div>`;
}

/** @param {{ id: string, name?: string, label: Html | string, checked?: boolean, required?: boolean }} o */
export const checkbox = ({ id, name = id, label, checked, required }) =>
  html`<div class="field"><label class="check" for="${id}"><input type="checkbox" id="${id}" name="${name}" ${checked ? raw('checked') : ''} ${required ? raw('required') : ''} aria-describedby="${id}-error" /><span>${label}</span></label><p class="field__error" id="${id}-error" role="alert"></p></div>`;

/** @param {string[]} steps @param {number} current zero-based */
export const stepper = (steps, current) => html`<ol class="stepper" aria-label="Progress">
  ${steps.map((s, i) => html`<li class="stepper__item ${i < current ? 'is-done' : ''} ${i === current ? 'is-current' : ''}" ${i === current ? raw('aria-current="step"') : ''}><span class="stepper__dot">${i < current ? '✓' : i + 1}</span><span class="stepper__label">${s}</span></li>`)}
</ol>`;

/** Link-based tabs (each tab is a route). @param {{ href: string, label: string, badge?: number }[]} items @param {string} current href of active tab @param {string} label */
export const tabs = (items, current, label) => html`<nav class="tabs" aria-label="${label}">
  ${items.map((t) => html`<a class="tabs__tab" href="${t.href}" ${t.href === current ? raw('aria-current="page"') : ''}>${t.label}${t.badge ? html`<span class="tabs__badge">${t.badge}</span>` : ''}</a>`)}
</nav>`;

/** @param {{ label: string, value: string, strong?: boolean, note?: string }[]} rows @param {string} [title] */
export const priceBreakdown = (
  rows,
  title,
) => html`<dl class="breakdown" ${title ? raw(`aria-label="${title.replace(/"/g, '')}"`) : ''}>
  ${rows.map((r) => html`<div class="breakdown__row ${r.strong ? 'breakdown__row--total' : ''}"><dt>${r.label}${r.note ? html`<small>${r.note}</small>` : ''}</dt><dd>${r.value}</dd></div>`)}
</dl>`;

/** @param {{ title: string, sub?: string, back?: { href: string, label: string }, action?: Html }} o */
export const pageHead = ({ title, sub, back, action }) => html`<div class="page-head">
  <div>${back ? html`<a class="back-link" href="${back.href}">← ${back.label}</a>` : ''}<h1>${title}</h1>${sub ? html`<p>${sub}</p>` : ''}</div>${action ?? ''}
</div>`;

/** Time-limited text that Countdown (components/countdown.js) keeps ticking. @param {string} iso @param {{ format?: 'clock' | 'auto', doneText?: string }} [o] */
export const countdown = (iso, { format = 'auto', doneText = 'Expired' } = {}) =>
  html`<span class="countdown" role="timer" data-countdown="${iso}" data-format="${format}" data-done-text="${doneText}"></span>`;

export { icons };
