// Money is integer pence everywhere. Only format at the edge.

/**
 * @param {number} pence
 * @param {{ exact?: boolean }} [opts] exact: always show pence (checkout, payouts)
 */
export function formatPence(pence, { exact = false } = {}) {
  const pounds = pence / 100;
  const whole = Number.isInteger(pounds);
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: exact || !whole ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(pounds);
}
