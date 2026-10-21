// Errors the API returns as `{ message, code }` (handoff §2). The UI shows `message` and branches on `code`.
export class ApiError extends Error {
  /** @param {number} status @param {string} message safe to show the user @param {string} [code] */
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const notFound = (/** @type {string} */ what) => new ApiError(404, `${what} not found.`, 'not_found');
export const badRequest = (/** @type {string} */ message, /** @type {string | undefined} */ code = undefined) =>
  new ApiError(400, message, code);
