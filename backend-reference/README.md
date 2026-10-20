# Backend reference: Claude ticket features

Reference AWS Lambda code for `POST /ai/extract-ticket` and `POST /ai/verify-ticket`. It is **not** part of the static site.

```bash
cd backend-reference
npm install
npm test        # 8 tests, no API key needed (a fake client returns canned output)
```

To deploy: provide `adapters.mjs` (`loadFile`, `loadEvent`), set `ANTHROPIC_API_KEY` from Secrets Manager, and put the handler behind API Gateway with a Cognito authorizer. Full instructions and the design rules are in `docs/BACKEND_HANDOFF.md` section 8.

Notes:

- Uses `@anthropic-ai/sdk` with `claude-opus-5-5` (override with `ANTHROPIC_MODEL`), structured outputs via a **Zod 4** schema, and `effort: 'low'`.
- It imports `../src/lib/ticket-match.js` for the plain-code mismatch checks; copy or bundle that file with the Lambda.
