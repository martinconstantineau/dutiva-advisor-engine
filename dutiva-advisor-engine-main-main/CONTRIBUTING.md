# Contributing

## Development setup

1. Install Node.js 18+.
2. Install dependencies:
   - `npm ci`
3. Run checks:
   - `npm run lint`
   - `npm run build`
   - `npm test`

## Pull requests

Before opening a PR:

1. Keep changes scoped and focused.
2. Add or update tests for behavior changes.
3. Ensure gate logic and response contract remain valid.
4. Update docs for user-facing or API-contract changes.

## Security expectations

- Never commit secrets.
- Keep provider and web-search errors sanitized.
- Preserve route-based rendering gates and citation-validation behavior.

