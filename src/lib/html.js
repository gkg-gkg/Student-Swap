// Tiny safe templating: interpolated values are HTML-escaped unless wrapped with raw()/html``.
// This keeps user-generated text (display names, descriptions) from becoming markup.

class SafeHtml {
  /** @param {string} value */
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

/** @param {unknown} s */
const escape = (s) =>
  String(s).replace(/[&<>"']/g, (c) => {
    /** @type {Record<string, string>} */
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return map[c];
  });

/** @param {unknown} v @returns {string} */
const stringify = (v) => {
  if (v == null || v === false) return '';
  if (v instanceof SafeHtml) return v.value;
  if (Array.isArray(v)) return v.map(stringify).join('');
  return escape(v);
};

/** @param {TemplateStringsArray} strings @param {unknown[]} values */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => {
    out += stringify(v) + strings[i + 1];
  });
  return new SafeHtml(out);
}

/** Mark a trusted string (e.g. static SVG) as safe. Never pass user input. @param {string} s */
export const raw = (s) => new SafeHtml(s);

/** @param {Element} el @param {SafeHtml} safe */
export function mount(el, safe) {
  el.innerHTML = safe.value;
}

export { SafeHtml };
