# Short-care public review crawl — 22 September 2026

The crawl checked the current 15 short-care candidates against their public
Google Maps place pages in the Codex in-app browser. It recorded the observed
branch name/address, aggregate rating and count, public topic labels, and a
small derived taxonomy. Full review text and reviewer details were not copied
into the product data.

The branch match was checked against the current provider id and address. The
derived record is stored in
`server/data/short-care-review-evidence-20260922.json` and is merged into the
published catalogue by `server/review-evidence.mjs`.

Only repeated positive evidence is used for personalisation:

| Level 1 | Level 2 | Branches with sufficient evidence |
| --- | --- | --- |
| Communication | Responsive team | Lullabee — Old Klang Road; Little Playhouse — KL Eco City; Edu Talent — Setia Alam |

No branch had enough branch-matched positive evidence in this pass for
flexible short care, smooth pickup, clear late-pickup rules, or predictable
fees. Those preferences remain neutral in search. The crawl therefore improves
ranking where evidence exists without turning missing review coverage into a
claim about availability.

The source pages are public Google Maps place/search pages. Their topic labels
and relative review dates can change, so this file is a dated evidence
snapshot and must be refreshed before making a later availability claim.
