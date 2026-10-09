# Cloud Telegram enquiry demo

## Website release verification (10 October 2026)

The client configuration enables the verified cloud endpoint. After the browser tool repeatedly refused the explicitly allowed local origin, the user directed: “算了，你先发布吧” (publish first). This authorizes this release with the desktop/mobile visual and production Contact journey gates explicitly unverified; it does not mark those checks passed or change future release rules. The actual published commit, digest, active deployment and CI outcomes are recorded in the production release receipt. The non-browser release gate must pass against an exact clean source snapshot, excluding unrelated untracked duplicate files. See `evidence/telegram-cloud-20261010/production-release/receipt.json` when the publication is complete.

The Contact page's **Ask for me · Demo** button opens the existing chat window beside **Copy message**. This is a simulation, not provider contact or a booking. Published age limits, whole-visit opening hours, date exceptions, admission uncertainty and fee rules remain authoritative. Capacity alone is simulated. All 101 short-care branches have a virtual identity; their real phone numbers, addresses and websites are never used as recipients.

## Architecture

Website → dedicated `web-enquiry-demo` Appwrite Function → `@EqualPathCareDemoBot` → Telegram private bot-to-bot message → `@EqualPathVirtualCentreBot` → merchant webhook/rules → Telegram reply → assistant webhook → private job events → website.

Both bots must enable **Bot-to-Bot Communication Mode** in BotFather. Both webhooks validate separate Telegram secret headers and the exact allowed sender ID/private chat. The merchant represents virtual copies of branches, not a real operator. It uses deterministic templates, not an LLM. The assistant verifies the returned text against the request's expected structured result; it does not infer new acceptance from arbitrary prose. No result is published before the actual Telegram reply arrives.

References: [Telegram bot-to-bot communication](https://core.telegram.org/bots/features#bot-to-bot-communication), [Bot API](https://core.telegram.org/bots/api), [Appwrite Function domains](https://appwrite.io/docs/products/functions/domains).

## Durable state and privacy

The new `equalpath-enquiry-demo/events` table has **no public permissions**, empty row permissions, and an encrypted payload column. It stores only a random job ID, hashed browser-session owner, virtual branch, anonymous Child 1/2 ages, date, times, selected question IDs and simulation replies. No names, phone numbers, precise starting points, health details or message body from the real Contact flow are copied. These data do not feed recommendation training.

Job data expires from access after 30 minutes. Hourly cleanup deletes expired demo rows; in a healthy scheduled deployment physical retention is at most about 90 minutes. Quota counters retain hashes/counts for 48 hours. A failed cleanup can extend physical retention and must be checked in deployment evidence. Telegram messages remain in the two test bots' Telegram conversation under Telegram's retention; the website's 30-minute expiry does **not** delete them.

Idempotency keys prevent repeat clicks/lost-response retries from sending twice. Merchant deliveries also have a durable single-send claim. There are at most two messages per job; only the merchant responds to REQUEST and only the assistant accepts REPLY. A crash after a send may leave the request unresolved; there is no automatic resend of an ambiguous delivery. Explicit retry creates a new job. Cancelled/expired requests cannot become accepted from a late reply.

The no-login demo caps sends at 10 per browser session per UTC day and 200 globally per UTC day. Resetting a browser can bypass its local-session cap, but not the global cap. This is not full abuse protection against invocation floods. Status reads use an unguessable session token plus job ID and reveal no other session's data.

## Cost and website integration

The Function uses the existing small compute size for enquiries, webhooks, status reads and scheduled queue recovery. Its recovery checks run every five minutes, including while idle; they are not a separate prewarm service. The separate search Function and its zero-database-read catalogue path are untouched. A chat follows durable events every 2.5 seconds initially, then 5 seconds, stopping on a terminal result or disconnect. Appwrite does not keep a response stream or long-poll worker open. The UI progressively displays received text; this is not generated reasoning or LLM token streaming.

`src/enquiry-config.json` enables the cloud endpoint in the local release candidate after verified Telegram roundtrips; the public deployment is verified separately by its exact source digest. The local `dev:enquiry` harness remains separately labelled. Production never falls back silently to that local simulator.

## Deployment

1. Run the website's normal tests/release gate, including `scripts/package-enquiry.mjs` (isolated package import and catalogue check).
2. `node scripts/deploy-enquiry.mjs --deploy` provisions only the new private demo database/table and dedicated Function. Existing search/owner data is untouched.
3. Configure the generated Appwrite endpoint, BotFather communication modes, then use `scripts/connect-enquiry.mjs --connect` with authorized tokens via protected stdin. Tokens are written only as secret Function variables, never to a frontend file, Git or local `.env` file. Never paste credentials in chat or command history. If setup partially fails, inspect variable **names only** and webhook status before retrying; the script refuses to overwrite existing credential configuration.
4. Verify public health, table access denial, quota/storage behavior and actual assistant → merchant → assistant delivery. Check timeout, false webhook, cancel and two-child outcomes. Record Telegram message IDs without credentials or visit details.
5. Enable the nonsecret client config only after verification. Perform desktop/mobile local Contact journey checks. Release the authorized website changes on main and verify the exact public source digest and the real production Contact journey.

Until step 4 succeeds, this is a deployed disabled backend, **not a working Telegram integration or a live website feature**.

If computer control cannot copy the existing tokens reliably, run `node scripts/connect-enquiry.mjs --connect --prompt` from the website repository in an interactive terminal. Paste each token into its hidden prompt, not into a command or chat. Input is held in process memory and then sent to Telegram for identity validation and Appwrite for secret storage; it is not saved locally. The script verifies both bot usernames before changing cloud configuration. In BotFather, both bots still need Bot-to-Bot Communication Mode enabled; webhook registration alone does not prove message delivery.

## Durable FIFO queue and anonymous sessions

The cloud service uses the same private encrypted demo table as a small durable queue. No Redis or separate server is required. A browser generates a random 256-bit bearer secret in sessionStorage; the server derives a private owner key with HMAC and returns a non-secret anonymous session ID. Each request has its own deterministic ID and idempotency nonce. The ID alone cannot read another session's request.

After validation and daily quota admission, a separate queue row is appended. Appwrite's server-assigned `$sequence` orders these rows, including simultaneous submissions and requests whose initial validation finished out of order. One unfinished request is processed at a time. A unique immutable dispatch event claims the head once, preventing multiple workers from sending it twice. Completion, cancellation, failure, or timeout releases the head. An ambiguous send or crashed worker is never automatically resent; the user can explicitly retry with a new request ID.

Queue wait is bounded to 10 minutes. After dispatch, the Telegram reply has 120 seconds. Creation, cancellation and completed webhooks advance the queue immediately. Status polls are read-only and fetch only the current job and its events once; they do not scan the shared queue. Each pump reads one FIFO head at a time, scanning at most 20 terminal heads per pass. A recovery execution every five minutes advances interrupted/expired jobs when browser tabs close. In the exceptional no-reply or crashed-worker case, the next job may wait up to five additional minutes for recovery; normal replies advance the queue immediately. Old rows are pruned hourly and retained for at most 30 minutes plus the cleanup interval. The recovery schedule adds approximately 288 short executions and queue checks per day, even while idle. It never touches the search Function or its catalogue database-read budget. This is a bounded coursework/demo queue, not an unlimited public messaging service: 10 requests per session/day and 200 total/day remain in force.

BotFather's current command list exposes `/setbot2bot`. Use it for each of the two test bots, select its username, and enable Bot-to-Bot communication. Both were enabled on 10 October 2026; `evidence/telegram-cloud-20261010/bot-to-bot-enabled.png` records the confirmations without tokens.

Reference: https://appwrite.io/docs/products/databases/tablesdb/order (ordering by `$sequence`).

## Earlier verification on 10 October 2026

The cloud Function is enabled and its active deployment is `6ac926619ca1077d9177` (ready). Four independent sessions submitted requests concurrently: one was waiting for Telegram and three were queued; all four received their actual Telegram simulation replies in about 22 seconds. Duplicate nonces reused the original request; another session could not read it; an invalid webhook secret was denied. The complete local release check passed 350 tests. See `evidence/telegram-cloud-20261010/roundtrip.json` and `verification.json`.

The website feature is still disabled and these changes are not published to the website. The required local browser check remains blocked by the browser tool's saved-permission denial for `http://127.0.0.1:4186`, despite the user's explicit allow setting. Desktop/mobile Contact checks and the production Contact journey are pending. Backend/API success is not frontend acceptance or website-release proof.

## Read-budget optimization (10 October 2026)

`scripts/audit-enquiry-reads.mjs` replays synthetic concurrent sessions without network access and counts returned rows (empty reads count as one), following [Appwrite read accounting](https://appwrite.io/docs/advanced/billing/database-reads-and-writes). This is a model of application-level reads, not a measurement of billed cloud usage.

| Same replay | Before | After |
|---|---:|---:|
| One waiting session, one poll | 11 | 3 |
| Ten sessions, one poll each | 164 | 21 |
| Twenty sessions, one poll each | 524 | 41 |
| Successful roundtrip plus final poll, no intermediate polls | 35 | 23 |
| Idle queue + hourly cleanup, 30 days (estimate) | 43,920 | 9,360 |

Immutable event claims, per-session isolation, FIFO ordering, daily limits and timeouts are unchanged. No private-state cache or eventually consistent status mirror is introduced. An event query excludes the job row using its indexed kind; a queue query returns just one head. Deployment/roundtrip and the current website-gate status are recorded separately in the read-budget receipt.

The optimized cloud deployment `6ac94e2f4a963a82ca7e` is now ready and active with the five-minute recovery schedule. Four real Telegram roundtrips completed in 25.7 seconds; the website release checks passed 353 tests. See `evidence/telegram-cloud-20261010/read-budget/receipt.json`. This backend verification does not complete the still-blocked local Contact visual gate or publish the website button.

The separately configured legacy `support-coordination` Function was updated only to skip repeated reads of unchanged family aggregates and to query old revisions hourly. Its minute task schedule, consent checks and delivery claims remain intact. No owner rows were manually read or changed and no real handover was manually triggered. An offline idle replay (three families and ten registration counters) fell from 1,380 to 781 reads/hour. The remaining per-minute family list still costs reads; eliminating that scan would need a separately designed due-work index.
