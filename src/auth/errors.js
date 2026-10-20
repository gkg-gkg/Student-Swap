// Error type shared by every AuthProvider so pages can branch on Cognito-style names.
export class AuthError extends Error {
  /** @param {string} code Cognito-style name e.g. UsernameExistsException, CodeMismatchException @param {string} message */
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
