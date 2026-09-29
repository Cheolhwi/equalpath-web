# Epic 6 implementation and local verification

Date: 29 September 2026. Repository: `Cheolhwi/equalpath-web`, branch `main`.
Base commit: `04669518947349c6065429fede9ce0aeb170afd8`.
The new implementation is a local working-tree change, not a published release.

## Completed in this change

| Previously missing behaviour | Implemented behaviour |
| --- | --- |
| Five broadly supported flags did not distinguish branches | Six groups, twelve review preferences; topic-specific positive/negative balance, recency and sparse-evidence shrinkage |
| Fixed keyword labels only | Corpus-trained hierarchical TF-IDF model for unlabelled records, retained source annotations, clause sentiment and passage-relevance gates |
| Activity only boosted familiar branch IDs | Fresh off-page seed profiles build a weighted topic-interest vector from saved, compared, viewed and hidden centres |
| Ordinary search only promoted a few results | Eligible current-page rerank with matching list, pin and map-card suggestions; favourites stay eligible |
| Review topics lacked inspectable passages | Relevant verbatim passages, dates, source record, context, sample/monthly counts, missing-link and identity limits |
| Review concerns did not enter Contact | Neutral questions with two supporting recent records; merge fee questions; untick, copy and preserve multiple choices through refreshed details |
| Little evidence that preferences mattered | Real-corpus score-diversity tests, preference-ranking scenarios, off-page/negative-history tests and held-out classifier evaluation |

## Verification

- `npm run release`: **224/224 tests passed**; isolated Function-package dry-run
  import passed; production build and five-asset integrity checks passed.
- Local source digest:
  `34cc72c0c907bcf6033f522aafc7a7d18cddfa27d4a6deac842edd43fa6a7f3b`.
- Re-extracted the corrected Numbers workbook with the checked-in extraction
  script. All 10,211 IDs, dates, text, annotations and stars matched the input
  used to build the 101 branch profiles. Original workbook unchanged.
- Classifier evaluation: 8,120 training records, 2,091 test records from 21 held-out
  branches; precision 0.8548, recall 0.8844, micro-F1 0.8694.
  This is agreement with supplied annotations, **not independent accuracy or
  an online recommendation-lift measurement**. Repeated templates can still
  make this evaluation easier than genuinely new writing.
- Full application tested through a local browser at `127.0.0.1:4199`, local
  `/api`, live-data mode. No production mutation or production browser journey.
- Desktop: 1440px-wide layout (observed content height 952px); mobile: 390px
  wide (observed content height 796px; preference screen also checked at the
  requested 390×844 viewport). Both layouts had no horizontal document overflow.
- First-use preferences: selected states, three-choice limit, Continue, transition
  to map and carried-over preferences checked.
- Normal search: KL Sentral, 1–3 years, 29 September, 10:00–12:00; the map showed
  three personalised cards. Unit/API tests separately verify list/map identity,
  unchanged page membership and explicit sort/eligibility rules.
- Reviews: switch topic, inspect positive and critical passages, open the topic
  menu, read source/sample details and enter Contact. Fixed an observed desktop
  overlap between review content and the sticky contact card and rechecked it.
- Contact: neutral question checked; unticking displays Not included; Copy
  displays Copied. Reopening and adding a second topic retains both questions;
  adding the same topic again does not duplicate it. More details contains the
  two supporting excerpts. Copy contents are regression-tested; the browser
  clipboard bridge did not expose the app's copied string for independent
  clipboard verification.
- Local browser console: no captured errors at final inspection. Earlier
  temporary tabs disappeared and pointer targeting was inconsistent; the final
  complete application checks succeeded using keyboard-accessible controls.
- Vite reports the existing large-entry-chunk advisory; build/integrity gates pass.

Screenshots:
[Desktop reviews](../evidence/epic6-20260929/desktop-reviews.png),
[Mobile preferences](../evidence/epic6-20260929/mobile-preferences.png),
[Mobile reviews](../evidence/epic6-20260929/mobile-reviews.png),
[Mobile Contact](../evidence/epic6-20260929/mobile-contact.png).

## Remaining data and evaluation limits

The supplied workbook contains no original review URLs. A supplied source
record and context are available, but the original-platform route required by
DoD 6.1.1 cannot be claimed complete. Reviewer identity, source permission and
complete-platform coverage are not independently verified. No missing original
link, review or opposing quote has been fabricated.

The readable taxonomy is curated; topic assignment is automatic. The model
needs an explicit data rebuild for new review batches. Behaviour-based ranking
adapts locally as the visitor uses the site; it does not retrain the text model
online. Independently labelled sentiment/topic evaluation and real-user outcome
measurement remain future evidence work.

This is not a blanket Epic 6 DoD or production completion claim. Function/site
publication, CI, public source digest and the required real-production journey
have not been run for this implementation. Follow the existing deployment
entrypoint when publication is requested.
