# Appwrite website publishing

The new repository is `Cheolhwi/equalpath-web` (private). Appwrite Sites hosts the website as site `equalpath-web` in the existing Singapore project. The intended public domain is `https://equalpathcare.me/`. GitHub Pages is disabled for this repository. The old iOS repository is not used to build or deploy this website.

## Automatic delivery

- GitHub Actions runs `npm ci` and `npm run release` for pull requests and pushes to `main`.
- Appwrite's native Git integration builds pushes to `main` using the same `npm ci` / `npm run release` sequence and publishes only `dist`.
- `release` runs all 39 tests, builds the frontend and checks the published entry assets and API configuration. Failed checks prevent activation of a new Appwrite deployment.
- A deterministic digest of source, dependencies and tests is written into `dist/build-info.json`. GitHub Actions then waits for the matching Appwrite release and checks HTTPS, entry assets and the public backend using the website's origin.
- Repository credentials are managed by the Appwrite GitHub integration. The GitHub workflow has only `contents: read` and requires no Appwrite administrator API key.

## Configuration

The frontend uses public constants in `src/config.js`. Do not enable the development `/api` override in production. `equalpathcare.me` is registered as a Web platform in Appwrite for origin validation. The Site has no database scopes and does not change existing owner data.

At Namecheap, replace only the website's GitHub Pages A records with the Appwrite-provided apex ALIAS/CAA configuration. Keep Namecheap nameservers, mail forwarding and Resend records. The final DNS values and live deployment results will be recorded in the publishing evidence after verification.

## Rollback

Use Appwrite's active deployment selector to reactivate a previously verified deployment, or revert the faulty commit on `main` and push. A source revert runs the full checks before automatic publication. No old iOS Function or owner data should be changed to roll back the website.

## Local verification

Run `npm ci` in a standalone checkout, then `npm run release`. To check that exact build on the public domain, run `node scripts/verify-site.mjs`; it reads the expected digest from local `dist/build-info.json`. Alternatively provide `EXPECTED_SOURCE` with the full 64-character digest. Raw source, tests, documentation and backend code are not published as website files.
