# Automatic enquiry — local test harness

Cloud deployment is implemented separately in `server/enquiry`; see [the cloud runbook](../../docs/TELEGRAM_ENQUIRY_DEMO.md). This file describes only the older local harness and manual Telegram test adapter. It is not the production transport.


The product entry is **Ask for me · Demo**, next to the existing **Copy message** button. Clicking it opens a chat window and starts the simulated enquiry immediately. No separate lab page is needed.

## Run

From the website repository:

```sh
npm run dev:enquiry
```

Open `http://127.0.0.1:4186/#discover`, search, open a plan, then **Contact the centre**. One-child Contact, two-child comparison Contact, and the two-child plan's per-centre Copy actions use the same component. Only this development server exposes the button and API; the ordinary production build does not enable the experiment.

## What is real and what is simulated

- All 101 short-care branches use the bundled catalogue's existing age limits, business hours, care windows, date exceptions, admission and fee rules. These are listed facts, not fresh provider verification.
- Capacity and staff replies are simulated. Known age/hours conflicts always prevent acceptance, including a start before opening, end after closing, split-session gap and existing weekend restrictions. Missing/conflicting facts require confirmation.
- One or two children are evaluated separately. Overlapping visits compete for simulated places. Missing/partial answers do not become complete acceptance.
- The simulation only answers visit suitability and listed fee estimates. Other selected question IDs remain unresolved. It never invents pickup, booking or review answers.
- There is no real booking, no contact with real providers, and no change to catalogue, recommendations or public availability.

## Chat and transport

The UI makes an authenticated POST to create or resume a request, then opens one authenticated NDJSON response stream. The server pushes actual queued/waiting/replied/cancelled/failed/timed-out snapshots. There is no polling loop and no invented reasoning transcript. The final deterministic reply is progressively revealed as text in the browser; it is **not** LLM token generation or free-text AI extraction.

Closing the window keeps the request and stream alive while the Contact component remains mounted. Reopening the same request resumes it without another send. A paused stream can reconnect without resending. A stopped or timed-out request can be retried; timeout does not imply rejection. Changed branch/date/ages/times/questions cannot reuse an earlier reply.

Requests expire after 30 minutes, or on server restart. The browser remembers only a random session token and request IDs in sessionStorage; Clear local cache removes them. Server memory holds only the visit details, anonymous Child 1/2 labels, selected question IDs and simulated branch ID. Real contacts, names, addresses and arbitrary destination URLs are rejected or excluded. No Appwrite writes or additional database reads are needed.

## Optional Telegram test connection

Telegram is **not connected by default**. Without credentials, replies are generated locally after a short simulated delay. To connect a private test bot you control:

1. In Telegram, open **@BotFather**, send `/newbot`, and create a dedicated bot. This requires the user's Telegram account; the website cannot provision a bot identity itself.
2. Run `npm run enquiry:setup` and enter the token in the terminal's hidden prompt. Do not paste it into a chat or commit it.
3. Send `/start` in your own private chat with that bot, then complete setup. It writes ignored `.env.telegram.local` with restrictive file permissions.
4. Restart `npm run dev:enquiry`.
5. Click **Ask for me · Demo** in the website. In Telegram, use the test reply buttons to act as the virtual shop. The website streams the resulting reply.

This adapter is a manual test-shop driver; local mode is automatic. It does not yet run an autonomous Telegram shop conversation. Only one explicitly configured private chat is permitted; groups, caller-supplied routing and real provider contacts are not supported. Existing bot webhooks are never removed; use a separate bot. Token-bearing request URLs are never logged. No Telegram connection or delivery has been verified without a bot/token.

## Verification

`node --test tests/virtual-enquiry.test.mjs` checks catalogue parity, factual constraints, capacity, unresolved questions, validation, session ownership, idempotency, timeout/cancellation, transport failure and streamed state/reconnect behavior. `npm test` runs all website unit tests.

`/experiments/virtual-enquiry/` is an internal QA harness for scenarios and branch coverage, not the user entry. Product visual acceptance must be exercised through the actual Contact/Copy message journey on desktop and mobile. See `evidence/virtual-enquiry-local-20261009/` for this pass.

Public deployment, hosted storage/retention, autonomous Telegram simulation and LLM extraction are outside this prototype. They are not implied by a successful local chat.
