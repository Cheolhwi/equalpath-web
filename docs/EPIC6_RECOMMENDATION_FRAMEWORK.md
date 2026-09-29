# Epic 6 recommendation framework

The current implemented framework is documented in
[Search, review evidence and recommendations](EPIC6_SEARCH_RECOMMENDATION_V1.md).

```text
Supplied branch-matched reviews
  → deduplicate / keep dates and source context
  → level-one group → level-two preference
  → clause sentiment + recency + sparse-evidence shrinkage
  → graded review profile for each branch
                                   ↓
First-use choices ───────────────→ preference fit
Saved / compared / viewed / hidden → learned interests from fresh seed profiles
                                   ↓
Current search → radius / nearest page / age / time / pickup checks
  → conflict-free candidates → personalised rerank
  → one ordered list + the same top-three map suggestions
  → inspect topic passages → choose concern → Contact question → copy
                                   ↓
                      subsequent local activity feedback
```

Unknown review evidence stays neutral. Reviews do not prove a vacancy. Known
service conflicts cannot be overridden by preferences. Explicit price, closing
and pickup sorts remain authoritative. Cold start is skippable; browser-local
reset returns to the landing page and removes saved centres and interests.

The source workbook has no original review URLs, so those links remain a data
gap. The implementation exposes the supplied record, dates, context and limits.
Human-adjudicated accuracy and online recommendation lift remain unmeasured.

Original editable overview: [English Draw.io](EPIC6_RECOMMENDATION_FRAMEWORK_EN.drawio)
· [English PNG](EPIC6_RECOMMENDATION_FRAMEWORK_EN.png). These earlier exports use
the original five themes; the implementation now has six groups and twelve
preferences as listed in the current implementation record above.
