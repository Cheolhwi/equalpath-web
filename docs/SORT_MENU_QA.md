# Themed sorting menus — 13 September 2026

Search results and centre comparison now share a select-only combobox with the app’s ivory/sage palette, fine border, light shadow and selected check. Unavailable priorities remain visible but disabled. Dark appearance uses the existing colour variables.

The popup stays inside the app or its active modal, outside the scrolling result/table container. It follows scrolling/resizing, opens upward when needed and fits narrow screens. Escape closes the menu without dismissing the comparison dialog. Focus stays on the trigger during arrow-key/type-ahead navigation; Enter or a pointer selection commits a change. Tab and outside clicks dismiss it. Opening, previewing and reselecting the current option do not request new results.

No search, sorting, pagination, fee or map-highlighting rules changed. Existing priority browser tests now use the visible custom options. `tests/browser/sort-menu.spec.mjs` covers disabled options, preview versus committed searches, type-ahead, keyboard focus, dismissal, 390/320px widths, reduced-height upward placement, modal interaction and dark appearance. Screenshots and the browser result report are generated in `.build/sort-menu/` when `QA_EVIDENCE_DIR` is set to that path. This is keyboard and browser validation, not a full assistive-technology audit.
