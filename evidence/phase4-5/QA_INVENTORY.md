# Phase 4–5 QA inventory

Source: Revision 2.1 Web App DoD, AC 4.1.1–4.4.2 and 5.1.1–5.6.2.

- Save a provider and optional non-identifying reason; reload, reopen, edit and delete. Desktop/mobile saved list, storage readback.
- Save a public pickup/time/transport template; reload and reuse with an empty service date and age. Edit fields and remove. Verify no request history, identity, age or date is persisted.
- Reopen a favourite, choose a fresh date, check through API; do not reuse fit. Show material before/after facts and original source/retrieval dates.
- Off-path: reject quota/denied storage, preserve previous saved version and current candidate. Reject unreadable storage without overwriting it.
- Off-path: changed/unmatched saved pickup blocks submit until corrected; conflicting times show field error; failed refresh retains snapshot and says changes cannot be checked.
- Preparation entry from details and enquiry; request-specific duration/transport/age prompts, three party groups, unassigned contacts, no estimated route time.
- Packing checkboxes round trip; source requirements separate; identity/health only blank export spaces. Regenerate after current request changes, old sheet labelled until explicit recheck.
- Download standalone HTML; Print / Save PDF; source dates, phone, questions and draft / institution authorisation statement readable. Hostile strings escaped, private reasons excluded.
- Desktop 1440x1000, mobile 390x844 and 320px minimum, keyboard focus and 200% zoom; inspect initial and scroll states, header navigation, modal containment, exported A4 pages.
- Live read-only Appwrite smoke using a regional branch; controlled examples stay separated. No owner writes or contacts sent.
