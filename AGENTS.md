# EqualPath web, first round

- Implement phases 0–3 only, using Revision 2 of the Web App requirements (46 stories / 114 AC; Epics 1–3 have 43 AC).
- Preserve the flat RhineLab-inspired OSM appearance, fine rules and quiet palette. No music, pitch, rotation or 3D buildings.
- Existing prototype stays in `../design-prototypes/rhine-map`; new implementation lives here.
- Read public Appwrite `web_` resources only. The new `web-provider-query` function may be deployed for this authorized round; no old functions or owner rows may be changed. The user subsequently authorized the independent `Cheolhwi/equalpath-web` repository, CI/CD and publishing this website at the existing `equalpathcare.me` domain. Preserve other domain bindings and email DNS records.
- Real data and explicitly labelled controlled examples use separate modes. Never silently substitute fixtures for a failed live request.
- No parent account, child identity, persistent request history, messaging, booking, saved templates, handover, review browser, sharing or rehearsal in this round.
- Run local preview and verify the actual desktop/mobile user journey. Record data limits and unverified release gates honestly.
