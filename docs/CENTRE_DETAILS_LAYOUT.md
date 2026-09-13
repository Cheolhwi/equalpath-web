# Centre details: decision-first layout

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
