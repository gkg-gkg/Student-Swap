import { API_BASE_URL } from '../config/env.js';

export class HttpError extends Error {
  /** @param {number} status @param {string} message @param {string} [code] */
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** @returns {Promise<string | null>} */
async function idToken() {
  // Imported lazily so mock mode never touches the Amplify stub.
  const { auth } = await import('../auth/index.js');
  return auth.getIdToken();
}

/**
 * Thin fetch wrapper for the real API (API Gateway). Sends the Cognito ID token when signed in.
 * Errors from the API should look like { message, code }.
 * @template T
 * @param {string} path @param {{ method?: string, body?: unknown, query?: Record<string, string | number | undefined> }} [opts]
 * @returns {Promise<T>}
 */
export async function request(path, { method = 'GET', body, query } = {}) {
  const qs = query
    ? '?' +
      new URLSearchParams(
        Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => [k, String(v)]),
      )
    : '';
  const token = await idToken();
  const res = await fetch(`${API_BASE_URL}${path}${qs === '?' ? '' : qs}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new HttpError(res.status, err.message ?? `Request failed (${res.status})`, err.code);
  }
  return res.status === 204 ? /** @type {T} */ (undefined) : res.json();
}
