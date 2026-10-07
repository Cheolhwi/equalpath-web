# Centre details

## Profile only (6 October 2026) — current

The user wants the main journey to feel like the two-children flow: decide and act in Compare (and the plan), and use Details only to read about a centre and add it to Compare.

Reading order:

1. Branch identity and address (registration badge beside the title).
2. "Your search" line: date, times and starting point, with one status (mismatches, things to ask, or "The listed details match your search") and "Compare shows the details and the questions to ask." Two-children mode shows "Two children · Fits both children / Child N …" instead. One action: **Add to compare** / **Added to compare**.
3. The four key facts: care ends, age, drive and fee.
4. Parent reviews (open), with Fees & extras and Opening hours (open) beside them on desktop and below them on phones.
5. Phone & website, then Registration & sources (folded).

Removed from Details: the condition list ("Before you choose"), Contact the centre, Save, Phone in the action card and "Get ready for childcare". Contact and the condition questions are in Compare; a shortlist with one centre now offers "Contact <centre>" directly. Save remains on map and list cards. A review concern's button now reads "Add to my questions": it adds the question for that centre, adds the centre to Compare when there is room and says so.

Verified 6 Oct at 1440×900 and 390×844 (local preview, fictional and bundled catalogue): new layout, Add to compare, one-centre Contact, review loading, and Details for a two-children "Fits both children" card (previously a TypeError). The existing browser specs could not be used: they already fail at setup because the side search panel they open no longer exists.

## Decision-first layout (13 September 2026) — superseded

13 September 2026. The user requested a clearer information hierarchy based on what a parent needs to decide next.

## Reading order

1. Identify the branch and the current visit: name, registration disclosure, address, date, pickup deadline and care end.
2. Scan four facts together: care closing, admission age, drive from pickup and fee with its billing unit. Area estimates remain labelled.
3. Review conditions: conflicts first and expanded by default, then unknowns and matching details. Each row retains its complete explanation and source disclosure. Travel estimates do not confirm handover feasibility.
4. Act in one grouped panel: prepare questions, compare, save, sourced contact details and the existing preparation-sheet action. Questions are not duplicated elsewhere on the page.
5. Inspect supporting detail as needed: programme fees and extras, weekly care times, registration and original sources. Expired or unresolved badge attention opens the registration section by default.

Desktop uses a main reading column plus a contact/action sidebar. Mobile follows a single-column flow with a 2-by-2 fact summary. Source retrieval dates remain available on expansion, without occupying the first screen. Existing status meanings and data are unchanged.

## Verification

- 130 unit tests and production build/package checks passed.
- 17 relevant browser tests passed across the completed runs: detail hierarchy and mobile keyboard access, fee/source disclosures, saved choices, question preparation, pickup checklists, and the guided tour. The fee test now opens the source disclosure before reading the link.
- Desktop and mobile captures inspected in `.build/centre-details/`: `details-desktop.png`, `details-mobile.png`, `details-mobile-actions.png`.
- Local browser checked against actual public Appwrite data for Brainy Bunch Montessori Playschool KL Sentral: sourced fee basis, closing time, driving estimate, registration code and phone displayed in the new layout.
- No data collection, owner-data mutation, contact message, domain or API deployment is part of this UI change.
