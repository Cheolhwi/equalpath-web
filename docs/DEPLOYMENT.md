# Appwrite website publishing

The new repository is `Cheolhwi/equalpath-web` (private). Appwrite Sites hosts the website as site `equalpath-web` in the existing Singapore project. Its configured primary domain is `https://equalpathcare.me/`, with `www.equalpathcare.me` redirecting to the root domain. GitHub Pages is disabled for this repository. The old iOS repository is not used to build or deploy this website.

## Current publication status

As checked on 2026-09-12 at 15:10 UTC, the automatically deployed website is available at [the Appwrite preview](https://equalpath-web.appwrite.network/). The preview passes normal HTTPS verification and serves the expected source digest. The live browser journey through pickup search, the flat map, comparison, evidence and question preparation was verified; see [the browser check](../evidence/appwrite-preview-journey.md). Calls and messages were not sent.

The custom domain's DNS is configured and publicly resolves to Appwrite. Appwrite still reports certificate issuance in progress for both `equalpathcare.me` and `www.equalpathcare.me`. The GitHub test and build steps pass, and a push has been observed triggering a ready Appwrite deployment. The final GitHub verification step currently fails because custom-domain HTTPS is not ready. The preview is usable, but production-domain publication is not yet verified as complete.

After Appwrite marks both domains verified, rerun the latest failed GitHub Actions job and confirm that the matching release passes its HTTPS and backend checks. Local DNS caches can retain the former GitHub address separately from public DNS. Keep certificate validation enabled throughout.

## Automatic delivery

- GitHub Actions runs `npm ci` and `npm run release` for pull requests and pushes to `main`.
- Appwrite's native Git integration builds pushes to `main` using the same `npm ci` / `npm run release` sequence and publishes only `dist`.
- `release` runs all 43 tests, builds the frontend and checks the published entry assets and API configuration. Failed checks prevent activation of a new Appwrite deployment.
- A deterministic digest of source, dependencies and tests is written into `dist/build-info.json`. GitHub Actions then waits for the matching Appwrite release and checks HTTPS, entry assets and the public backend using the website's origin.
- Repository credentials are managed by the Appwrite GitHub integration. The GitHub workflow has only `contents: read` and requires no Appwrite administrator API key.
- The GitHub App is limited to **only `Cheolhwi/equalpath-web`**. The Site's production branch and automatic deployment branch filter are both `main`. Silent mode is enabled, so deployments do not post repository comments.

## Configuration

The frontend uses public constants in `src/config.js`. Do not enable the development `/api` override in production. `equalpathcare.me` is registered as a Web platform in Appwrite for origin validation. The Site has no database scopes and does not change existing owner data.

Namecheap keeps the original `dns1.registrar-servers.com` / `dns2.registrar-servers.com` nameservers. The former four GitHub Pages A records were replaced with the Appwrite-provided configuration:

| Type  | Host  | Value                     | TTL      |
| ----- | ----- | ------------------------- | -------- |
| ALIAS | `@`   | `appwrite.network.`       | 1 minute |
| CNAME | `www` | `appwrite.network.`       | 1 minute |
| CAA   | `@`   | `0 issue "certainly.com"` | 1 minute |

Email Forwarding, the root SPF record, both Resend CNAME records and the Resend DKIM TXT record were preserved and checked again after reloading Namecheap. [The previous DNS records](../evidence/dns-before-appwrite.json) provide a rollback reference. [Publication evidence](../evidence/appwrite-publication-status.json) records the Site, deployment, installation scope and domain status at the stated check time. [Production-origin API verification](../evidence/production-origin-journey.json) independently verifies place search, provider search and comparison with the configured website origin; this does not substitute for the pending custom-domain HTTPS check.

Older DNS answers may remain cached for the previous 30-minute TTL. Certificate issuance is asynchronous after Appwrite validates DNS; wait for normal HTTPS verification to pass before treating a new domain as available. Do not disable TLS verification to work around an unfinished certificate.

## Rollback

Use Appwrite's active deployment selector to reactivate a previously verified deployment, or revert the faulty commit on `main` and push. A source revert runs the full checks before automatic publication. No old iOS Function or owner data should be changed to roll back the website.

## Local verification

Run `npm ci` in a standalone checkout, then `npm run release`. To check that exact build on the public domain, run `node scripts/verify-site.mjs`; it reads the expected digest from local `dist/build-info.json`. Alternatively provide `EXPECTED_SOURCE` with the full 64-character digest. Raw source, tests, documentation and backend code are not published as website files.
