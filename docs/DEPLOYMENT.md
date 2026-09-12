# Website publishing

The new repository is `Cheolhwi/equalpath-web` (private). The public website is hosted on GitHub Pages at `https://equalpathcare.me/`. The public directory and read-only query Function remain in the existing Appwrite project.

## Automatic delivery

- Pull requests run the 39 tests and a clean production build.
- Pushes to `main` and manual runs on `main` perform the same checks, upload only `dist`, and publish that tested artifact.
- The deployment verifies HTTPS, the exact source revision in `build-info.json`, entry assets and the anonymous Appwrite health request using the website's origin.
- Failed tests/builds do not publish. Concurrent releases wait in order. Actions are pinned to verified official commits.
- GitHub Pages deployment uses GitHub's short-lived workflow identity. No Appwrite administrator key or personal GitHub token is stored in the repository or workflow.

## Configuration

The frontend uses the public constants in `src/config.js`. Do not set the local `/api` override in production. `equalpathcare.me` is added as a Web platform in Appwrite for browser origin validation. The platform does not change database permissions or owner data.

The domain's existing Namecheap A records already point to GitHub Pages. DNS and Resend mail records are preserved. GitHub Pages stores the custom domain in repository settings; an Actions deployment does not need a CNAME file in the source tree.

## Rollback

Revert the faulty source commit on `main` and push. The same tests, build and deployment run for the revert. Do not edit the old iOS repository, change old Functions, or restore owner data to roll back the website.

## Local verification

After committing the source, run `npm test`, `npm run build`, and `node scripts/check-build.mjs`. To check a deployed revision, supply its full commit in `EXPECTED_COMMIT` and run `node scripts/verify-site.mjs`. Production evidence is recorded separately after the first successful delivery.
