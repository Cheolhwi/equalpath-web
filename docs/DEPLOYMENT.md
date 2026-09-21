# EqualPath website deployment

This is the runbook for the standalone `Cheolhwi/equalpath-web` repository. The website is published by the Appwrite Site `equalpath-web` in the Singapore project and is served at [https://equalpathcare.me/](https://equalpathcare.me/). The old iOS/Appwrite repository is not a website release source.

## Before publishing

1. Confirm the checkout and intended commit:

   ```sh
   git rev-parse --show-toplevel
   git remote -v
   git branch --show-current
   git status --short
   git log -1 --oneline
   ```

   Publish website changes from `main` only after the intended commit is reviewed. Do not publish unrelated changes, change DNS or domain bindings, modify owner data, or change unrelated Functions.

2. Install the locked dependencies and run the release gate:

   ```sh
   npm ci
   npm run release
   ```

   This runs `npm test`, the dry-run-safe `scripts/deploy-api.mjs`, `npm run build`, and `scripts/check-build.mjs`. A frontend release does not require a Function deployment. Use `node scripts/deploy-api.mjs --deploy` only for a separately authorised `web-provider-query` publication and record that scope.

3. Record the source identity from `dist/build-info.json`:

   ```sh
   node -e 'console.log(require("./dist/build-info.json").source)'
   ```

   `scripts/source-digest.mjs` defines the digest inputs. The digest, commit SHA, local test result and build result belong in the release receipt.

## Publishing and proving the public version

The Appwrite Git integration builds pushes to `main` with `npm ci` and `npm run release`, then publishes `dist`. GitHub Actions also runs its independent checks. A push, a green local build, an Appwrite deployment record, or an Appwrite preview URL is not by itself proof that the production site contains this release.

After the Appwrite deployment is ready, verify the exact digest:

```sh
EXPECTED_SOURCE=<64-character-source-digest> node scripts/verify-site.mjs
```

Without `EXPECTED_SOURCE`, the verifier reads the local `dist/build-info.json`. It checks:

- HTTPS and the allowed production origin;
- the public `build-info.json` source digest;
- every entry asset named by the manifest;
- the expected EqualPath document title; and
- the public `web-provider-query` health response with the production origin.

Do not call the release live until the public digest matches the intended commit. Keep the active Appwrite deployment ID/status and the public digest in the receipt.

## When verification does not match

The verifier waits only within its bounded window. If the public digest is still old or missing:

1. Inspect the latest Appwrite Site deployment's source commit, status and build output/logs.
2. Check that the deployment was created from the intended `main` commit and that the build produced `dist/build-info.json`.
3. Fix the cause, run the local gate once more, and perform one deliberate deployment retry.
4. Do not make empty commits, poll forever, disable TLS, or treat a stale preview/CDN response as a successful release.

Keep these outcomes separate in the receipt: local checks, local browser visual checks, Appwrite build/deployment, public HTTPS/digest/backend verification, and CI. Existing automatic browser CI results may be reported, but they are not evidence of a new manual run and must not be silently marked passed.

## Verification split by change type

UI/UX work has a mandatory local visual gate. Start the local preview, open it in a local browser, inspect the affected desktop and mobile layouts, and exercise the changed interaction before publishing. A build, unit test, or DOM-only check does not replace this screen-level check. Do not use cloud browser journeys for UI-only work.

Backend, data, and business-logic changes use the relevant local tests plus cloud/public verification after release. A mixed UI and logic change requires both the local visual gate and the cloud verification. Keep local visual evidence, cloud/backend evidence, Appwrite deployment evidence and browser CI outcomes separate in the release receipt.

If the local Appwrite CLI is offloaded or hangs because a dependency is not hydrated, stop that command with a bounded timeout and use a functioning checked-in/API release path. Never print access tokens, environment dumps, owner rows or deployment secrets.

## Rollback

Reactivate a previously verified Appwrite deployment, or revert the faulty website commit on `main` and let the same release gate run again. Do not roll back the website by changing the old iOS Functions or owner data.
