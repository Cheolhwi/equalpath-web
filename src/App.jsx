import { clearSurroundingsCache } from "./surroundings-cache.js";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  MapPin,
  LocateFixed,
  Search,
  SlidersHorizontal,
  Scale,
  List,
  Check,
  X,
  Sun,
  Moon,
  Info,
  CircleHelp,
  Bookmark,
  ClipboardList,
  Building2,
  Users,
  ChevronDown,
  Heart,
  Settings,
} from "lucide-react";
import Recommendations from "./Recommendations.jsx";
import useInterests from "./useInterests.js";
import useSearchRoutes, { clearSearchRouteCache } from "./useSearchRoutes.js";
import Comparison from "./Comparison.jsx";
import FamilyComparison from "./FamilyComparison.jsx";
import { loadFamilyComparison } from "../shared/family-comparison.mjs";
import MapSearchDock from "./MapSearchDock.jsx";
import SearchActions from "./SearchActions.jsx";
import Dialog from "./Dialog.jsx";
import DialogPresence from "./DialogPresence.jsx";
import SelectMenu, { searchSortOptions } from "./SelectMenu.jsx";
import TimeInput from "./TimeInput.jsx";
import {
  ProviderCard,
  Details,
  Status,
  RegistrationBadge,
  OrderingNote,
} from "./ProviderViews.jsx";
import { requestAPI, errorMessage } from "./api.js";
import { requestErrors, todayKL, requestCaption, needsPickupAddress, MAX_SEARCH_RADIUS_KM, searchRadius, isShortCare, careTypeLabel, canonicalRequest } from "../shared/request.mjs";
import PlaceInput from "./PlaceInput.jsx";
import { DEFAULT_MAP, readMapMemory, writeMapMemory } from "../shared/map-memory.mjs";
import Preparation from "./Preparation.jsx";
import Enquiry from "./Enquiry.jsx";
import FamilyPanel, { FamilyPlanCard, familyMapItems, FAMILY_PANEL_RIGHT } from "./TwoChildren.jsx";
import OneChildPanel, { initialOnePanel } from "./OneChildPanel.jsx";
import useFamily, { familyKey, secondChildErrors } from "./useFamily.js";
import { childRequest, childName } from "../shared/two-child.mjs";
import AgeRangeChoice from "./AgeRangeChoice.jsx";
import GettingStarted from "./GettingStarted.jsx";
import ShortCareAlternatives, { ShortCareMapAlternatives, hasExplicitShortCareMatch } from "./ShortCareAlternatives.jsx";
import { saveTour, tourSeen } from "../shared/tour.mjs";
import { feeSummary } from "../shared/result-summary.mjs";
import { displayName, placeLine, shortDateLabel } from "../shared/display.mjs";
import { assess, costFor, enquiries } from "../shared/conditions.mjs";
import { hasStoredMotionPreference, readMotionPreference, writeMotionPreference } from "./motion-preference.js";
import {
  SavedLibrary,
  SavedCentreReminder,
  FavouriteEditor,
  SavedChanges,
} from "./SavedViews.jsx";
import {
  emptyLibrary,
  readLibrary,
  updateLibrary,
  storageKey,
  factSnapshot,
} from "../shared/saved.mjs";
import { personaliseSearchItems, interestSeeds } from "../shared/recommendations.mjs";
import { addReviewQuestion, withReviewQuestions } from "../shared/contact-message.mjs";
const EMPTY = [];
const focusMapSearch = () => [...document.querySelectorAll(".mobile-search-summary, .map-search-launch")].find(el => el.getClientRects().length)?.focus({ preventScroll: true });
const initial = () => ({
  // Only "A few hours" is offered (2 Oct 2026: regular care removed from the UI).
  careType: "short_term",
  pickup: null,
  date: todayKL(),
  deadline: "",
  end: "",
  age: "",
  transport: "",
  radius: searchRadius(undefined, "short_term"),
  query: "",
  includeUnknown: true,
  includeConflicts: false,
  sort: "recommended",
  // Epic 8: a second child for "A few hours". Child 1 keeps the fields above.
  kids: 1,
  second: { age: "", same: true, deadline: "", end: "" },
});
const scenario = (r) =>
  r
    ? JSON.stringify([
        r.careType,
        r.pickup?.label,
        r.pickup?.lat,
        r.pickup?.lng,
        r.date,
        r.deadline,
        r.end,
        r.age,
        r.transport,
      ])
    : "";
const fingerprint = (r) =>
  r
    ? scenario(r) +
      JSON.stringify([
        r.radius,
        r.query,
        r.includeUnknown,
        r.includeConflicts,
        r.sort,
      ])
    : "";
const MapCanvas = lazy(() => import('./MapCanvas.jsx'));
export default function App({
  introPhase = "ready",
  introArea = 0,
  introReduced = false,
  mapActive = true,
  onHome,
}) {
  // Start the map on entry, then retain the same instance on return visits.
  const [mapStarted, setMapStarted] = useState(mapActive);
  useEffect(() => { if (mapActive) setMapStarted(true); }, [mapActive]);
  const [mode, setMode] = useState(
      new URLSearchParams(location.search).get("mode") === "demo"
        ? "demo"
        : "live",
    ),
    [draft, setDraft] = useState(initial),
    [errors, setErrors] = useState({}),
    [results, setResults] = useState(null),
    [nearby, setNearby] = useState(null),
    [nearbyBusy, setNearbyBusy] = useState(true),
    [nearbyError, setNearbyError] = useState(null),
    [nearbyReload, setNearbyReload] = useState(0),
    [browseCenter, setBrowseCenter] = useState(DEFAULT_MAP.center),
    [mapTarget, setMapTarget] = useState(DEFAULT_MAP),
    [mapRestored, setMapRestored] = useState(false),
    [browseSelection, setBrowseSelection] = useState(null),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(null),
    [formOpen, setFormOpen] = useState(true),
    [selected, setSelected] = useState(null),
    [compareIds, setCompareIds] = useState([]),
    [comparison, setComparison] = useState(null),
    [compareSort, setCompareSort] = useState("distance"),
    [dialog, setDialog] = useState(null),
    [profile, setProfile] = useState(null),
    [enquiry, setEnquiry] = useState(null),
    [questionSelection, setQuestionSelection] = useState({}),
    [dialogBusy, setDialogBusy] = useState(false),
    [dialogError, setDialogError] = useState(null),
    [mobilePane, setMobilePane] = useState("map"),
    [choosing, setChoosing] = useState(false),
    [theme, setTheme] = useState("light"),
    [labels, setLabels] = useState(true),
    [reduced, setReduced] = useState(readMotionPreference),
    [health, setHealth] = useState(null),
    [toast, setToast] = useState(""),
    [clearCacheConfirm, setClearCacheConfirm] = useState(false),
    [mapStatus, setMapStatus] = useState("loading"),
    [library, setLibrary] = useState(emptyLibrary),
    [savedTab, setSavedTab] = useState("favourites"),
    [saveFailure, setSaveFailure] = useState(""),
    [saveEditor, setSaveEditor] = useState(null),
    [reopening, setReopening] = useState(null),
    [savedCheck, setSavedCheck] = useState(null),
    [preparation, setPreparation] = useState(null);
  const [tourOpen, setTourOpen] = useState(false);
  // Epic 8 family plan in the Checklist: in memory only, cleared with the mode.
  const [familyPlan, setFamilyPlan] = useState(null);
  const [onePanel, setOnePanel] = useState(initialOnePanel);
  const family = useFamily(mode);
  // First visit: offer the tour once, without starting it on its own.
  const [tourInvite, setTourInvite] = useState(() => { try { return !tourSeen(window.localStorage); } catch { return false; } });
  const interests = useInterests(mode, tourOpen);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const changed = (event) => {
      if (typeof event.detail?.reduced === "boolean") setReduced(event.detail.reduced);
      else if (!hasStoredMotionPreference()) setReduced(media.matches);
    };
    window.addEventListener("equalpath-motion-change", changed);
    media.addEventListener("change", changed);
    return () => {
      window.removeEventListener("equalpath-motion-change", changed);
      media.removeEventListener("change", changed);
    };
  }, []);
  useEffect(() => {
    if (dialog === 'details' && profile?.p && !dialogBusy && !tourOpen) interests.record([profile.p], 'view');
  }, [dialog, profile?.p?.id, profile?.p?.careType, dialogBusy, tourOpen, interests.record]);
  const [searchFocus, setSearchFocus] = useState(null), [dockHeight, setDockHeight] = useState(150);
  const [searchCollapsed, setSearchCollapsed] = useState(false);
  // Phones: the navigation pill folds away once the map is in use and comes
  // back from the top handle. CSS applies it only at narrow widths.
  const [navHidden, setNavHidden] = useState(false);
  const navReveal = useRef(null);
  // Hide once a search has folded into its mobile summary.
  useEffect(() => { if (searchCollapsed) setNavHidden(true); }, [searchCollapsed]);
  const [pickupQueryReset, setPickupQueryReset] = useState(null);
  const [pickupAddress, setPickupAddress] = useState(null), [addressRetry, setAddressRetry] = useState(0);
  const tourSnapshot = useRef(null), tourData = useRef(null), tourSequence = useRef(0);
  const mapView = useRef(DEFAULT_MAP), rememberedPickup = useRef(null);
  const requestSeq = useRef(0),
    searchController = useRef(null),
    dialogSeq = useRef(0),
    listRef = useRef(null),
    submitRef = useRef(null),
    toastTimer = useRef(null);
  const draftRef = useRef(draft);
  useEffect(() => () => searchController.current?.abort(), [mode]);
  draftRef.current = draft;
  const notify = (text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4200);
  };
  const clearLocalCache = async () => {
    try {
      await clearSurroundingsCache();
      clearSearchRouteCache();
      Object.keys(window.localStorage)
        .filter(key => key.startsWith("equalpath:"))
        .forEach(key => window.localStorage.removeItem(key));
      interests.clear();
      setLibrary(emptyLibrary());
      setDraft(initial());
      setResults(null); setNearby(null); setSelected(null); setCompareIds([]); setComparison(null);
      setProfile(null); setEnquiry(null); setPreparation(null); setSavedCheck(null);
      setErrors({}); setFailure(null); setFormOpen(true); setSearchCollapsed(false); setMobilePane("map");
      setMapTarget(DEFAULT_MAP); setBrowseCenter(DEFAULT_MAP.center); setMapRestored(false);
      mapView.current = DEFAULT_MAP; rememberedPickup.current = null;
      setTheme("light"); setLabels(true); setReduced(false);
      window.dispatchEvent(new CustomEvent("equalpath-motion-change", { detail: { reduced: false } }));
      setClearCacheConfirm(false);
      close();
      onHome?.({ fresh: true });
      notify("Data cleared. You can start again.");
    } catch {
      setClearCacheConfirm(false);
      notify("We couldn’t clear your data. Please try again.");
    }
  };
  useEffect(() => {
    const point=draft.pickup;
    if (!mapActive || mode!=="live" || tourOpen || !needsPickupAddress(point)) { setPickupAddress(null); return; }
    let alive=true;
    setPickupAddress("loading");
    requestAPI({action:"reverse",mode,point:{lat:point.lat,lng:point.lng}}).then(r=>{
      if (!alive) return;
      if (!r.pickup) { setPickupAddress("unavailable"); return; }
      const same=p=>needsPickupAddress(p) && p.lat===point.lat && p.lng===point.lng;
      const rename=value=>value?.request && same(value.request.pickup) ? {...value,request:{...value.request,pickup:r.pickup}} : value;
      setDraft(d=>same(d.pickup) ? {...d,pickup:r.pickup} : d);
      setResults(rename);setComparison(rename);setEnquiry(rename);setPreparation(rename);
      if (same(rememberedPickup.current)) rememberMap(mapView.current,r.pickup);
      setPickupAddress(null);
    }).catch(()=>{if(alive)setPickupAddress("unavailable");});
    return ()=>{alive=false;};
  },[mapActive,mode,tourOpen,draft.pickup?.lat,draft.pickup?.lng,draft.pickup?.label,addressRetry]);
  const reloadLibrary = () => {
    try {
      setLibrary(readLibrary(window.localStorage, mode));
      setSaveFailure("");
    } catch (e) {
      setSaveFailure(e.message);
    }
  };
  useEffect(() => {
    setLibrary(emptyLibrary());
    reloadLibrary();
    const changed = (e) => {
      if (!e.key || e.key === storageKey(mode)) reloadLibrary();
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [mode]);
  const savedCheckSeq = useRef(0);
  const changeLibrary = (change) => {
    try {
      setLibrary(updateLibrary(window.localStorage, mode, change));
      setSavedCheck(null);
      setSaveFailure("");
      return true;
    } catch (e) {
      setSaveFailure(e.message);
      return false;
    }
  };
  const saveFavourite = (item) =>
    changeLibrary((x) => ({
      ...x,
      favourites: [...x.favourites.filter((p) => p.id !== item.id), item],
    }));
  const editFavourite = (p, from = dialog) => {
    setSaveEditor({ p, from });
    setDialog("save-favourite");
  };
  const checkSavedCentres = async (request) => {
    const issues = requestErrors(request, { requireAge: true });
    if (Object.keys(issues).length) {
      setSavedCheck({ status: "error", request, error: Object.values(issues)[0] });
      return;
    }
    const entries = [...library.favourites];
    const seq = ++savedCheckSeq.current;
    setSavedCheck({ status: "checking", request, items: [], failed: 0 });
    const checked = [];
    let failed = 0;
    // Keep the network work bounded while using the same request for every saved centre.
    for (let offset = 0; offset < entries.length; offset += 4) {
      const group = entries.slice(offset, offset + 4);
      const settled = await Promise.allSettled(group.map(async (saved) => {
        const response = await requestAPI({ action: "details", mode, id: saved.id, request });
        return { ...response.items[0], saved };
      }));
      settled.forEach((outcome) => {
        if (outcome.status === "fulfilled" && outcome.value?.id) checked.push(outcome.value);
        else failed += 1;
      });
      if (seq !== savedCheckSeq.current) return;
    }
    setSavedCheck({ status: "ready", request, items: checked, failed, checkedAt: new Date().toISOString() });
  };
  const openSavedCentre = (p, request) => {
    const saved = library.favourites.find((item) => item.id === p.id) ?? p.saved;
    setProfile({ p, request, saved, current: factSnapshot(p) });
    setSelected(p.id);
    setDialogError(null);
    setDialog("details");
  };
  const reopenFavourite = (saved) => {
    setBrowseSelection(null);
    requestSeq.current++;
    setBusy(false);
    setReopening(saved);
    const careType = Array.isArray(health?.shortCareIds) ? health.shortCareIds.includes(saved.id) ? "short_term" : "regular" : saved.careType ?? "short_term";
    if (careType === "regular") {
      // Regular childcare is no longer offered; keep the visitor in "A few hours".
      setReopening(null);
      notify(`${saved.name ?? "This centre"} only offers regular childcare, which EqualPath no longer covers.`);
      return;
    }
    setDraft((x) => ({ ...x, careType, date: "" }));
    setResults(null); setNearby(null); setSelected(null); setCompareIds([]); setComparison(null); setCompareSort("distance"); setProfile(null); setEnquiry(null); setPreparation(null); setQuestionSelection({});
    setErrors(isShortCare({ careType }) ? { date: "Choose a new date to check this centre." } : {});
    setFailure(null);
    setFormOpen(true);
    setMobilePane("map");
    setSearchFocus({ field: isShortCare({careType}) ? "date" : "age", at: Date.now() });
    close();
  };
  useEffect(() => {
    let alive = true;
    let saved = null;
    try { saved = readMapMemory(window.localStorage, mode); } catch { /* Storage can be disabled. */ }
    const view = saved ?? DEFAULT_MAP;
    mapView.current = view;
    rememberedPickup.current = saved?.pickup ?? null;
    setMapTarget(view);
    setBrowseCenter(view.center);
    setMapRestored(!!saved);
    setNearby(null);
    if (mode === "live") setDraft((d) => ({ ...d, pickup: saved?.pickup ?? null }));
    setHealth(null);
    if (mode === "demo")
      setDraft({
        ...initial(),
        careType: "short_term",
        date: todayKL(),
        pickup: {
          id: "demo-pickup",
          label: "Demo usual centre · Kuala Lumpur",
          lat: 3.139,
          lng: 101.6869,
          region: "Kuala Lumpur",
        },
        deadline: "16:00",
        end: "18:00",
        age: "4",
        transport: "institution",
      });
    return () => {
      alive = false;
    };
  }, [mode]);
  useEffect(() => {
    if (!mapActive || results || tourOpen) return;
    let alive = true;
    setNearby(null);
    setNearbyBusy(true);
    setNearbyError(null);
    const timer = setTimeout(() => {
      requestAPI({ action: "nearby", mode, careType: draft.careType, center: browseCenter })
        .then((r) => { if (alive) { setNearby(r); setHealth(r); } })
        .catch((e) => { if (alive) { setNearbyError(e); setHealth({ unavailable: true }); } })
        .finally(() => { if (alive) setNearbyBusy(false); });
    }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [mapActive, mode, draft.careType, browseCenter, results, nearbyReload, tourOpen]);
  useEffect(() => {
    const key = (e) => {
      if (e.key === "Escape" && !e.defaultPrevented && !dialog && !tourOpen && mobilePane === "list" && !document.querySelector('dialog[open], [role="dialog"], [role="listbox"]')) {
        setMobilePane("map"); requestAnimationFrame(() => focusMapSearch()); return;
      }
      if (
        introPhase === "ready" &&
        e.key === "/" &&
        !dialog && !tourOpen &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)
      ) {
        e.preventDefault();
        setFormOpen(true);
        setMobilePane("map");
        setSearchFocus({field:"pickup", at:Date.now()});
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [dialog, introPhase, tourOpen, mobilePane]);
  const rememberMap = (view, pickup = rememberedPickup.current) => {
    if (tourOpen) return;
    mapView.current = view;
    rememberedPickup.current = pickup;
    try { writeMapMemory(window.localStorage, mode, { ...view, pickup }); } catch { /* Map still works without storage. */ }
  };
  const showPickup = (pickup) => {
    setPickupQueryReset({ value: pickup.label });
    const view = { center: { lat: pickup.lat, lng: pickup.lng }, zoom: 13 };
    rememberMap(view, pickup);
    // Centre the starting point in the part of the map the search box leaves free.
    setMapTarget({ ...view, clearOfSearch: true });
    setBrowseCenter(view.center);
    setResults(null);
    setSelected(null);
    setCompareIds([]);
    setComparison(null);
    setMapRestored(false);
  };
  const setField = (field, value) => {
    setSearchCollapsed(false);
    if (field === "careType") {
      requestSeq.current++; dialogSeq.current++;
      setBusy(false); setDialogBusy(false); setReopening(null);
      setResults(null); setNearby(null); setBrowseSelection(null); setSelected(null);
      setCompareIds([]); setComparison(null); setCompareSort("distance");
      setProfile(null); setEnquiry(null); setPreparation(null); setQuestionSelection({}); setDialog(null);
      setErrors({}); setFailure(null); setFormOpen(true); family.clear();
      setDraft(x => ({ ...x, careType: value, radius: searchRadius(undefined, value), date: value === "short_term" ? todayKL() : "", deadline: "", end: "", sort: "recommended" }));
      return;
    }
    if (field === "kids") {
      requestSeq.current++; searchController.current?.abort(); family.clear();
      dialogSeq.current++; setDialogBusy(false); setDialog(null);
      setCompareIds([]); setComparison(null);
      setBusy(false); setResults(null); setSelected(null); setFailure(null);
      setErrors((x) => ({ ...x, secondAge: null, second: null }));
    }
    if (field === "pickup") {
      if (value) {
        requestSeq.current++;
        setBusy(false);
        showPickup(value);
      }
    }
    setDraft((x) => ({ ...x, [field]: value }));
    setErrors((x) => ({ ...x, [field]: null }));
  };
  const dirty = results && fingerprint(draft) !== fingerprint(results.request),
    activeRequest = results?.request,
    rawItems = results?.items ?? nearby?.items ?? EMPTY;
  const rankedItems = useMemo(() => results
      ? personaliseSearchItems({ items: rawItems, seeds: results.seeds ?? [], request: results.request, library, history: interests.history })
      : rawItems, [results, rawItems, library, interests.history]);
  const items = useSearchRoutes(results, rankedItems, mode);
  const familyMode = isShortCare(draft) && draft.kids === 2;
  const familyRequest = familyMode ? family.state?.request : null;
  const familyDock = familyRequest ? { request: familyRequest, total: family.state.status === "ready" ? family.built?.total ?? 0 : 1 } : null;
  const familyDirty = !!familyRequest && familyKey(draft) !== familyKey(familyRequest);
  const mapItems = familyMode && family.state ? familyMapItems(family) : items;
  const narrow = typeof window !== "undefined" && window.matchMedia?.("(max-width: 760px)").matches;
  // Two children: the same no-match websites as one child when either child has
  // no centre, and the same floating cards for the top suggestions.
  const familyReady = familyMode && family.state?.status === "ready" && !familyDirty;
  const familyNoMatch = familyReady && !!family.built?.missing.length;
  const familyCards = familyReady && !familyNoMatch;
  const familyOpen = familyMode && !!family.state && !family.state.collapsed;
  // One child: the same left panel as two children, over the current page of
  // results (suggested centres, then a plan). A new search starts it again.
  useEffect(() => { setOnePanel(initialOnePanel); }, [results]);
  const oneShown = !familyMode && !!results && !busy && !tourOpen && !choosing && mobilePane === "map" && isShortCare(activeRequest) && items.length > 0;
  const oneOpen = oneShown && !onePanel.collapsed;
  // "All N centres" (8 Oct 2026): one button, no Saved shortcut (Saved is in
  // the top navigation). Under the search bar on its own; with the one-child
  // panel it sits beside the panel's "Show …" tab, or beside the open panel.
  const listButton = familyMode ? null : <div className="map-quick-actions">
    <button aria-label={results ? `All ${results.total} centres` : "Nearby centres"} onClick={() => { setFormOpen(false); setMobilePane("list"); }}><List size={17} /><span className="map-results-label">{results ? `All ${results.total} centres` : "Nearby centres"}</span><span className="map-results-short" aria-hidden="true">List</span></button>
  </div>;
  // Arrives armed only after the pointer has left the search bar since the
  // last search, so a pointer resting on Find childcare doesn't hide new results.
  const tuckArmed = useRef(false);
  useEffect(() => { tuckArmed.current = false; }, [results, family.state?.results]);
  const tuckPanels = (e) => {
    if (!e.target.closest?.(".map-search-dock")) return;
    if (e.type === "pointerover" && !tuckArmed.current) return;
    setOnePanel((s) => (s.collapsed ? s : { ...s, collapsed: true }));
    if (family.state && !family.state.collapsed && !family.busy) family.collapse(true);
  };
  useEffect(() => {
    if (!results?.drivingDeferred) return;
    const refresh = current => {
      if (!current?.p || fingerprint(current.request) !== fingerprint(results.request)) return current;
      const driving = items.find(p => p.id === current.p.id)?.driving;
      return driving && driving !== current.p.driving ? { ...current, p: { ...current.p, driving } } : current;
    };
    setProfile(refresh); setEnquiry(refresh); setPreparation(refresh);
  }, [items, results]);
  const switchMode = (next) => {
    setPickupQueryReset(null);
    requestSeq.current++;
    dialogSeq.current++;

    setReopening(null);
    setPreparation(null);
    family.clear();
    setFamilyPlan(null);
    setMode(next);
    setDraft(initial());
    setResults(null);
    setNearby(null);
    setBrowseSelection(null);
    setErrors({});
    setFailure(null);
    setBusy(false);
    setFormOpen(true);
    setSelected(null);
    setCompareIds([]);
    setComparison(null);
    setDialog(null);
    setEnquiry(null);
    setQuestionSelection({});
    setChoosing(false);
    setMobilePane("map");
    const u = new URL(location.href);
    u.searchParams.set("mode", next);
    u.hash = "";
    history.replaceState(null, "", u.pathname + u.search);
  };
  const seedIdsFor = (careType) => [...new Set([...interestSeeds(library, interests.history, careType).map(s => s.id), ...(interests.history.enabled ? interests.history.hidden.filter(s => s.careType === careType).map(s => s.id) : [])])].slice(0,100);
  // Epic 8: two ordinary searches (one per child) and drive times, shown as
  // options on the same map. Child 1 uses the normal checks; Child 2 its own.
  const searchFamily = async (request, opts = {}) => {
    const issues = { ...requestErrors(request, { requireAge: true }), ...secondChildErrors(request) };
    delete issues.transport;
    setErrors(issues);
    if (Object.keys(issues).length) {
      setTimeout(() => setSearchFocus({ field: ["pickup", "date", "age", "deadline", "end"].find((key) => issues[key]) ?? "age", at: Date.now() }), 0);
      return;
    }
    requestSeq.current++;
    searchController.current?.abort();
    setBusy(false); setResults(null); setSelected(null); setFailure(null); setChoosing(false); setMobilePane("map");
    try {
      const found = await family.run(request, { ...opts, personal: { library, history: interests.history, seedIds: seedIdsFor("short_term") } });
      if (!found) return;
      rememberMap(mapView.current, request.pickup);
      setSearchCollapsed(familyKey(draftRef.current) === familyKey(request));
      setSearchFocus(null);
    } catch { /* The family panel shows the failure and a retry. */ }
  };
  const applyFamilyFix = (changes) => {
    const second = { age: "", same: true, deadline: "", end: "", ...(draft.second ?? {}) };
    // Freeze Child 2's times first, so a change to Child 1 does not move both.
    let next = { ...draft, second: second.same ? { ...second, same: false, deadline: draft.deadline, end: draft.end } : second };
    for (const c of changes) {
      const field = c.field === "start" ? "deadline" : "end";
      next = c.child === "a" ? { ...next, [field]: c.value } : { ...next, second: { ...next.second, [field]: c.value } };
    }
    if (next.second.deadline === next.deadline && next.second.end === next.end) next = { ...next, second: { ...next.second, same: true } };
    setDraft(next);
    notify(`Changed ${changes.map((c) => `${childName(c.child)}’s ${c.field === "start" ? "drop-off" : "pickup"} to ${c.value}`).join(" and ")}. Checking again…`);
    searchFamily(next, { keep: true });
  };
  const openFamilyCentre = (p) => {
    // A shared centre ("ab") has no list of its own: read it from Child 1's.
    const state = family.state, k = p?.familyRole === "b" ? "b" : "a";
    if (!state?.results || !p) return;
    const centre = state.results[k]?.find((x) => x.id === p.id)
      ?? [...(state.results.a ?? []), ...(state.results.b ?? [])].find((x) => x.id === p.id) ?? p;
    setProfile({ p: { ...centre, driving: p.driving, familyFor: p.familyFor }, request: canonicalRequest(childRequest(state.plan, k)) });
    setSelected(p.id); setDialogError(null); setDialog("details");
  };
  const search = async (e, page = 0, override = null) => {
    e?.preventDefault?.();
    setSearchCollapsed(false);
    if (isShortCare(override ?? draft) && (override ?? draft).kids === 2) return searchFamily(override ?? draft);
    const request = override ?? draft,
      issues = requestErrors(request, { requireAge: true });
    setErrors(issues);
    if (Object.keys(issues).length) {
      setFormOpen(true);
      setTimeout(
        () => {
          const field = ["pickup", "date", "age", "deadline", "end"].find(key => issues[key]);
          if (mobilePane === "map") setSearchFocus({ field, at: Date.now() });
          else document.querySelector('[aria-invalid="true"]')?.focus();
        },
        0,
      );
      return;
    }
    const seq = ++requestSeq.current;
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    setBusy(true);
    setFailure(null);
    setChoosing(false);
    try {
      const seedIds = seedIdsFor(request.careType);
      const r = await requestAPI({ action: "search", mode, request, page, seedIds }, { signal: controller.signal });
      if (seq !== requestSeq.current) return;
      let savedResult = null;
      if (reopening) {
        savedResult = await requestAPI({
          action: "details",
          mode,
          id: reopening.id,
          request: r.request,
          version: r.version,
        });
        if (seq !== requestSeq.current) return;
      }
      setResults(r);
      rememberMap(mapView.current, r.request.pickup);
      const editedWhilePending =
        fingerprint(draftRef.current) !== fingerprint(request);
      if (!editedWhilePending) setDraft(r.request);
      setSelected(null);
      setFormOpen(editedWhilePending);
      setSearchCollapsed(!editedWhilePending && r.total > 0);
      setSearchFocus(null);
      setHealth(r);
      if (!(override && results && scenario(request) === scenario(results.request))) setMobilePane("map");
      listRef.current?.scrollTo({ top: 0 });
      if (savedResult) {
        setProfile({
          p: savedResult.items[0],
          request: savedResult.request,
          saved: reopening,
          current: factSnapshot(savedResult.items[0]),
        });
        setReopening(null);
        setDialog("details");
        setDialogError(null);
      } else if (browseSelection) {
        const detail = await requestAPI({ action: "details", mode, id: browseSelection.id, request: r.request, version: r.version });
        if (seq !== requestSeq.current) return;
        setProfile({ p: detail.items[0], request: detail.request });
        setDialog("details");
        setBrowseSelection(null);
      }
    } catch (e) {
      if (seq !== requestSeq.current) return;
      setFailure(e);
      if (e.fields) {
        setErrors(e.fields);
        setFormOpen(true);
      }
    } finally {
      if (seq === requestSeq.current) setBusy(false);
    }
  };
  const select = (id, fromMap = false) => {
    setSelected(id);
    if (fromMap) setMobilePane("map");
  };
  // Two children: an option's centres (one or two) are added or removed together.
  const toggleCompareMany = (ids) => {
    if (ids.every((id) => compareIds.includes(id))) { setCompareIds((x) => x.filter((v) => !ids.includes(v))); return; }
    const missing = ids.filter((id) => !compareIds.includes(id));
    if (compareIds.length + missing.length > 3) { notify("Compare up to three centres. Remove one to add another."); return; }
    setCompareIds((x) => [...x, ...missing]);
  };
  const toggleCompare = (id) => {
    if (compareIds.includes(id))
      setCompareIds((x) => x.filter((v) => v !== id));
    else if (compareIds.length < 3) setCompareIds((x) => [...x, id]);
    else notify("Compare up to three centres. Remove one to add another.");
  };
  const openDetails = (p) => {
    if (!activeRequest) {
      setBrowseSelection(p);
      setSelected(p.id);
      setFormOpen(true);
      setMobilePane("map");
      setSearchFocus({field: draft.pickup ? isShortCare(draft) ? "deadline" : "age" : "pickup", at:Date.now()});
      notify(isShortCare(draft) ? "Choose an address, age and times first." : "Choose an address and age first.");
      setTimeout(() => document.getElementById(draft.pickup ? isShortCare(draft) ? "deadline" : "pickup-search" : "pickup-search")?.focus(), 0);
      return;
    }
    setProfile({ p, request: activeRequest });
    setSelected(p.id);
    setDialogError(null);
    setDialog("details");
  };
  const loadComparison = async (ids = compareIds, sort = compareSort) => {
    setDialog("compare");
    setDialogError(null);
    const seq = ++dialogSeq.current;
    setDialogBusy(false);
    const context = familyMode ? family.state : null;
    setComparison(null);
    if (ids.length < 2) return;
    if (familyMode ? !familyReady : !activeRequest) {
      setDialogError({ code: "COMPARISON_NEEDS_SEARCH" });
      return;
    }
    setDialogBusy(true);
    try {
      if (context) {
        const r = await loadFamilyComparison({ api: requestAPI, mode, ids, plan: context.plan, version: context.results.version });
        if (seq === dialogSeq.current) {
          setComparison({ ...r, family: true, familyKey: familyKey(context.request) });
          interests.record(r.items, 'compare');
        }
        return;
      }
      const r = await requestAPI({
        action: "compare",
        mode,
        ids,
        request: { ...activeRequest, sort },
        version: results.version,
      });
      if (seq === dialogSeq.current) { setComparison(r); setCompareSort(r.request.sort); interests.record(r.items, 'compare'); }
    } catch (e) {
      if (seq === dialogSeq.current) setDialogError(e);
    } finally {
      if (seq === dialogSeq.current) setDialogBusy(false);
    }
  };
  const removeCompare = (id) => {
    dialogSeq.current++; setDialogBusy(false);
    const next = compareIds.filter((x) => x !== id);
    setCompareIds(next);
    if (next.length >= 2) loadComparison(next);
    else setComparison(null);
  };
  const prepare = (p, request = activeRequest, forChild = null) => {
    if (!p || !request) return;
    setEnquiry({ p: withReviewQuestions(p, questionSelection, 'contact-v2:' + p.id + scenario(request)), request, forChild });
    setDialogError(null);
    setDialog("enquiry");
  };
  const startPreparation = (p, request = activeRequest) => {
    setPreparation(previous => ({ p, request, sourceRequest:
      previous?.p.id === p.id && scenario(previous.request) === scenario(request)
        ? previous.sourceRequest ?? previous.request : request }));
    setDialogError(null);
    setDialog("preparation");
  };
  const changePreparationTimes = ({ deadline, end }) => {
    setPreparation(current => {
      if (!current || !isShortCare(current.request)) return current;
      const request = { ...current.request, deadline, end };
      if (Object.keys(requestErrors(request)).length) return current;
      // Only times change: reuse the centre's loaded facts and assess the new plan.
      const fit = assess(current.p, request);
      const p = { ...current.p, fit, cost: costFor(current.p, request), enquiries: enquiries(current.p, request, fit) };
      return { ...current, p, request, sourceRequest: current.sourceRequest ?? current.request };
    });
  };
  const refreshPreparation = async () => {
    if (!activeRequest || !preparation) return;
    const seq = ++dialogSeq.current;
    setDialogBusy(true);
    setDialogError(null);
    try {
      const r = await requestAPI({
        action: "details",
        mode,
        id: preparation.p.id,
        request: activeRequest,
      });
      if (seq === dialogSeq.current)
        setPreparation({ p: r.items[0], request: r.request, sourceRequest: r.request });
    } catch (e) {
      if (seq === dialogSeq.current) setDialogError(e);
    } finally {
      if (seq === dialogSeq.current) setDialogBusy(false);
    }
  };
  const close = () => {
    dialogSeq.current++;
    setDialogBusy(false);
    setDialogError(null);
    setClearCacheConfirm(false);
    setDialog(null);
  };
  const startTour = () => {
    if (tourOpen || busy || dialogBusy) return;
    tourSnapshot.current = { draft, results, selected, compareIds, comparison, compareSort, profile, enquiry, questionSelection, formOpen, mobilePane, searchCollapsed, choosing, errors, failure, reopening, mapTarget: mapView.current, pickupQuery: document.querySelector("#pickup-search")?.value ?? draft.pickup?.label ?? "", panelScroll: document.querySelector(".discovery-panel")?.scrollTop ?? 0 };
    tourData.current = null;
    requestSeq.current++; dialogSeq.current++;
    setBusy(false); setDialogBusy(false); setDialog(null); setChoosing(false);
    setTourOpen(true);
  };
  const finishTour = (status) => {
    tourSequence.current++;
    setBusy(false);
    try { saveTour(window.localStorage, status); } catch { /* Current-session dismissal still works. */ }
    const s = tourSnapshot.current;
    setDialog(null); setDialogBusy(false); setDialogError(null);
    if (s) {
      setDraft(s.draft); setResults(s.results); setSelected(s.selected);
      setCompareIds(s.compareIds); setComparison(s.comparison); setCompareSort(s.compareSort);
      setProfile(s.profile); setEnquiry(s.enquiry); setQuestionSelection(s.questionSelection);
      setFormOpen(s.formOpen); setMobilePane(s.mobilePane); setSearchCollapsed(s.searchCollapsed); setChoosing(s.choosing);
      setErrors(s.errors); setFailure(s.failure); setReopening(s.reopening);
      setMapTarget(s.mapTarget);
      setPickupQueryReset({ value: s.pickupQuery });
    }
    setTourOpen(false);
    requestAnimationFrame(() => {
      const panel = document.querySelector(".discovery-panel");
      if (panel && s) panel.scrollTop = s.panelScroll;
      document.querySelector(".quick-tour-button")?.focus({ preventScroll: true });
    });
  };
  const showTourStep = async (step) => {
    const seq = ++tourSequence.current;
    setDialog(null); setFormOpen(true); setErrors({}); setFailure(null); setReopening(null);
    setMobilePane("map");
    setSearchFocus(null); setSearchCollapsed(step >= 3);
    if (step === 0) return;
    const example = { ...initial(), careType: "short_term", pickup: { id: "demo-pickup", label: "KL Sentral · tutorial", lat: 3.1341, lng: 101.6865 }, date: todayKL(), deadline: "13:00", end: "18:00", age: "4", transport: "self" };
    setDraft({ ...example, ...(step === 1 ? { deadline: "", end: "", age: "", transport: "" } : {}) });
    setMapTarget({ center: { lat: 3.139, lng: 101.6869 }, zoom: 13 });
    if (step < 3) { setResults(null); setSelected(null); setCompareIds([]); return; }
    setBusy(true);
    try {
      if (!tourData.current) {
        const response = await requestAPI({ action: "search", mode: "demo", request: example });
        if (seq !== tourSequence.current) return;
        tourData.current = response;
      }
      if (seq !== tourSequence.current) return;
      const r = tourData.current;
      // Known mismatches are hidden by default, so the second example is the
      // next centre in the demo results rather than a fixed conflicting one.
      const garden = r.items.find((p) => p.id === "demo-garden") ?? r.items[0];
      const river = r.items.find((p) => p.id === "demo-river") ?? r.items.find((p) => p.id !== garden?.id);
      setDraft(r.request); setResults(r); setSelected(garden.id); setFormOpen(false);
      if (step <= 4) { setCompareIds([]); return; }
      if (step === 5) { setProfile({ p: garden, request: r.request }); setDialog("details"); return; }
      if (step === 6) {
        setCompareIds([garden.id, river.id]);
        setComparison({ ...r, items: [garden, river] });
        setCompareSort("distance"); setDialog("compare"); return;
      }
      setEnquiry({ p: garden, request: r.request }); setDialog("enquiry");
    } finally { if (seq === tourSequence.current) setBusy(false); }
  };
  // Search is ready immediately. The user can open Quick tour when they need it.
  useEffect(() => {
    if (tourOpen && introPhase !== "ready") finishTour("skipped");
  }, [introPhase]);
  const requestChanged =
    comparison && (comparison.family
      ? !familyMode || familyDirty || comparison.familyKey !== familyKey(familyRequest)
      : familyMode || scenario(comparison.request) !== scenario(activeRequest));
  const retryDialog = () => loadComparison();
  const searchState = busy ? "loading" : failure ? "failed" : dirty ? "pending" : results ? "applied" : "ready";
  // Centres already on the shortlist can go straight to a checklist.
  const navCollapsed = navHidden && mobilePane === "map" && !tourOpen;
  const openNav = keyboard => {
    setNavHidden(false);
    if (keyboard) requestAnimationFrame(() => document.querySelector(".app-header nav button")?.focus({ preventScroll: true }));
  };
  useEffect(() => {
    // The search overlay moves with the bar; its size observer does not see a
    // position change, so ask the map layout to measure again.
    if (!window.matchMedia?.("(max-width: 760px)").matches) return;
    const timer = setTimeout(() => window.dispatchEvent(new Event("resize")), reduced ? 0 : 300);
    return () => clearTimeout(timer);
  }, [navCollapsed, reduced]);
  const checklistChoices = results && !dirty
    ? items.filter((p) => compareIds.includes(p.id) || library.favourites.some((f) => f.id === p.id)).slice(0, 4)
    : [];
  return (
    <main
      className={`equalpath map-first ${theme} mobile-${mobilePane}${navCollapsed ? " nav-collapsed" : ""}`}
      tabIndex={-1}
      data-reduced={reduced}
      data-mode={tourOpen ? "demo" : mode}
      data-search-state={searchState}
      inert={introPhase !== "ready"}
      aria-hidden={introPhase !== "ready" || undefined}
    >
      <a className="skip-link" href="#request-form" onClick={() => { setMobilePane("map"); setSearchFocus({field:"pickup",at:Date.now()}); }}>
        Skip to search
      </a>
      <button type="button" className="nav-reveal" ref={navReveal} aria-label="Show menu" aria-controls="app-header" aria-expanded={!navCollapsed}
        onClick={e => openNav(e.detail === 0)}
        onPointerDown={e => { navReveal.current.dataset.startY = e.clientY; }}
        onPointerMove={e => { const y = Number(navReveal.current.dataset.startY); if (y && e.clientY - y > 8) { delete navReveal.current.dataset.startY; openNav(false); } }}
        onPointerUp={() => { delete navReveal.current.dataset.startY; }}>
        <span aria-hidden="true" />
      </button>
      <header className="app-header" id="app-header"
        onFocus={e => { if (e.target.matches?.(":focus-visible")) setNavHidden(false); }}>
        <button
          className="wordmark"
          aria-label="EqualPath home"
          onClick={() => {
            close();
            setMobilePane("map");
            onHome?.();
          }}
        >
          <strong>
            EQUALPATH
          </strong>
          <small>CHILDCARE IN KL & SELANGOR</small>
        </button>
        <nav aria-label="Main navigation" onClickCapture={() => setNavHidden(true)}>
          <button
            className={!dialog ? "active" : ""}
            onClick={() => {
              close();
              setFormOpen(true); setMobilePane("map"); setSearchFocus({field:"pickup", at:Date.now()});
            }}
          >
            <Search size={18} aria-hidden="true" />Find care
          </button>
          <button
            data-tour="compare"
            className={dialog === "compare" ? "active" : ""}
            onClick={() => loadComparison()}
          >
            <Scale size={18} aria-hidden="true" />Compare {compareIds.length > 0 && <em>{compareIds.length}</em>}
          </button>
          <button
            className={dialog === "saved" ? "active" : ""}
            onClick={() => {
              close();
              reloadLibrary();
              setSavedTab("favourites");
              setDialog("saved");
            }}
          >
            <Bookmark size={18} aria-hidden="true" />Saved {library.favourites.length > 0 && <em>{library.favourites.length}</em>}
          </button>
          <button
            className={dialog === "preparation" ? "active" : ""}
            onClick={() => {
              close();
              setDialog("preparation");
            }}
          >
            <ClipboardList size={18} aria-hidden="true" />Checklist
          </button>
        </nav>
        <div className="header-end">
          <button className="quick-tour-button" aria-label="Quick tour" disabled={busy || dialogBusy} onClick={startTour}><CircleHelp size={19}/><span>Quick tour</span></button>
          <span className={`data-badge ${mode === "demo" ? "demo" : ""}`}>
            {tourOpen ? "TUTORIAL" : mode === "demo" ? "DEMO" : isShortCare(draft) ? "COURSEWORK DEMO" : "KL + SELANGOR"}
          </span>
          <button
            aria-label="Display and data settings"
            onClick={() => setDialog("settings")}
          >
            <Settings size={19} />
          </button>
        </div>
      </header>
      <aside
        className="discovery-panel"
        id="search-panel"
        inert={mobilePane !== "list" || undefined}
        aria-hidden={mobilePane !== "list" || undefined}
        aria-label="Search and results"
      >
        {mobilePane === "list" && <>
        <div className="intro">
          <h1>Find childcare</h1>
          <button className="close-search-panel" aria-label="Close search panel" onClick={() => { setMobilePane("map"); requestAnimationFrame(() => focusMapSearch()); }}><X size={21} /></button>
        </div>
        {tourOpen && <p className="demo-notice">Quick tour: these centres are examples. Your own search comes back when the tour ends.</p>}
        {mode === "demo" && (
          <p className="demo-notice">
            Demo: these centres and prices are made up.{" "}
            <button onClick={() => switchMode("live")}>
              Back to real centres
            </button>
          </p>
        )}
        {!tourOpen && !results && <SavedCentreReminder favourites={library.favourites}
          onChoose={() => { reloadLibrary(); setSavedTab("favourites"); setDialog("saved"); }} />}
        <div className={`request-heading ${results && formOpen ? "" : "request-heading-empty"}`}>
          {results && formOpen && <strong>Your search</strong>}
          {results && formOpen && (
            <button onClick={() => setFormOpen(false)}>
              Show results <SlidersHorizontal size={13} />
            </button>
          )}
        </div>
        {browseSelection && !results && <p className="notice-panel">To check {browseSelection.name}, fill in the times below.</p>}
        {!formOpen && activeRequest && (
          <div className="compact-request">
            <div className="compact-request-text">
              <p>
                <MapPin size={14} />
                {activeRequest.pickup.label}
              </p>
              <small>
                <strong className="request-care-type">{careTypeLabel(activeRequest)}</strong>
                {[isShortCare(activeRequest) ? `${shortDateLabel(activeRequest.date)}, ${activeRequest.deadline}–${activeRequest.end}` : null,
                activeRequest.age === ""
                  ? "Age not chosen"
                  : activeRequest.age === "0"
                    ? "Under 1 year"
                    : `Age ${activeRequest.age.replace("-", "–")}`,
                activeRequest.transport === "self"
                  ? "You bring your child"
                  : activeRequest.transport === "institution"
                    ? "Centre picks up"
                    : null].filter(Boolean).map(part => ` · ${part}`).join("")}
              </small>
            </div>
            {results && <button className="compact-request-change" onClick={() => setFormOpen(true)}>Change search <SlidersHorizontal size={13} /></button>}
          </div>
        )}
        {reopening && (
          <div className="notice-panel">
            <strong>Checking {reopening.name} again</strong>
            <p>
              {isShortCare(draft) ? "Choose a new date to check this centre." : "Check your choices, then search again."}
            </p>
            <button className="text-link" onClick={() => setReopening(null)}>
              Back to a new search
            </button>
            {failure && (
              <SavedChanges saved={reopening} failure={errorMessage(failure)} />
            )}
          </div>
        )}
        <form
          id="request-form"
          onSubmit={search}
          noValidate
          className={formOpen ? "request-form" : "request-form collapsed"}
        >

          <PlaceInput
            hideLabel
            onQueryChange={value => setPickupQueryReset({value})}
            label={isShortCare(draft) ? "Where will your child leave from?" : "Where do you need care?"}
            placeholder={isShortCare(draft) ? "Starting point, e.g. KL Sentral" : "Home, work or school, e.g. KL Sentral"}
            queryReset={pickupQueryReset}
            active={introPhase === "ready" && !dialog && !tourOpen}
            mode={mode}
            value={draft.pickup}
            onChange={(p) => setField("pickup", p)}
            error={errors.pickup}
            onMap={() => {
              setChoosing(true);
              setMobilePane("map");
              setToast("");
            }}
          />
          {pickupAddress && <p className="pickup-address-status" role="status">
            {pickupAddress === "loading" ? "Finding the street name…" : <>We couldn’t find the street name. Your pin is still set. <button type="button" className="text-link" onClick={()=>setAddressRetry(n=>n+1)}>Retry address</button></>}
          </p>}
          {isShortCare(draft) && <div data-tour="care-times" className="care-time-fields">
          <div className="care-day-age">
          <div className="field">
            <label htmlFor="service-date">
              Date
            </label>
            <input
              id="service-date"
              type="date"
              value={draft.date}
              onInput={(e) => setField("date", e.target.value)}
              aria-invalid={!!errors.date}
              aria-describedby={errors.date ? "date-error" : undefined}
            />
            {errors.date && (
              <small id="date-error" className="field-error">
                {errors.date}
              </small>
            )}
          </div>

          <AgeRangeChoice compact value={draft.age} onChange={value => setField("age", value)} error={errors.age} />
          </div>
          <div className="field-pair care-time-endpoints">
            <div className="field">
              <label htmlFor="deadline"><MapPin size={19} aria-hidden="true" />Start</label>
              <TimeInput
                id="deadline"
                suggest={draft.date && draft.date !== todayKL() ? "09:00" : undefined}
                label="Start"
                value={draft.deadline}
                onChange={(value) => setField("deadline", value)}
                invalid={!!errors.deadline}
                describedBy={errors.deadline ? "deadline-error" : undefined}
              />
              {errors.deadline && (
                <small id="deadline-error" className="field-error">{errors.deadline}</small>
              )}
            </div>
            <div className="field">
              <label htmlFor="care-end"><Building2 size={19} aria-hidden="true" />End</label>
              <TimeInput
                id="care-end"
                label="End"
                value={draft.end}
                onChange={(value) => setField("end", value)}
                invalid={!!errors.end}
                describedBy={errors.end ? "care-end-error" : undefined}
              />
              {errors.end && (
                <small id="care-end-error" className="field-error">{errors.end}</small>
              )}
            </div>
          </div>
          </div>}
          {!isShortCare(draft) && <AgeRangeChoice value={draft.age} onChange={value => setField("age", value)} error={errors.age} />}
          <details className="optional-preferences">
            <summary><Users size={17} aria-hidden="true" /><span>Getting to the centre <small>{draft.transport === "self" ? "I’ll bring my child" : draft.transport === "institution" ? "Centre picks up" : "Optional"}</small></span><ChevronDown size={16} aria-hidden="true" /></summary>
          <div>
            <div className="field">
              <label htmlFor="transport">
                Who takes your child to the centre?
              </label>
              <select
                id="transport"
                value={draft.transport}
                onChange={(e) => setField("transport", e.target.value)}
              >
                <option value="">Not sure yet</option>
                <option value="institution">The centre picks my child up</option>
                <option value="self">I’ll bring my child</option>
              </select>
            </div>
          </div>
          </details>
          <details className="search-refinements">
            <summary>
              More filters <PlusIcon />
            </summary>
            <div className="field">
              <label htmlFor="provider-query">Centre name or area</label>
              <input
                id="provider-query"
                value={draft.query}
                onChange={(e) => setField("query", e.target.value)}
                placeholder="Centre name or area"
              />
            </div>
            <div className="field">
              <label htmlFor="radius">Search radius</label>
              <select
                id="radius"
                value={searchRadius(draft.radius, draft.careType)}
                onChange={(e) =>
                  setField(
                    "radius",
                    Number(e.target.value),
                  )
                }
              >
                {[5, MAX_SEARCH_RADIUS_KM].map((n) => (
                  <option key={n} value={n}>
                    Within {n} km
                  </option>
                ))}
              </select>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={draft.includeUnknown}
                onChange={(e) => setField("includeUnknown", e.target.checked)}
              />
              Include centres with missing details
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={draft.includeConflicts}
                onChange={(e) => setField("includeConflicts", e.target.checked)}
              />
              Include centres that don’t meet all my needs
            </label>
          </details>
          <SearchActions busy={busy} results={results} dirty={dirty} failure={failure} submitRef={submitRef} reopening={reopening} />

        </form>
        {!results && <div className="request-save-actions">
          <button className="text-link" onClick={() => { reloadLibrary(); setSavedTab("favourites"); setDialog("saved"); }}>
            Saved centres{library.favourites.length > 0 && ` (${library.favourites.length})`}
          </button>
        </div>}
        {failure && (
          <div className="error-box" role="alert">
            <strong>We couldn’t load centres</strong>
            <p>{errorMessage(failure)}</p>
            <p>Use the Retry search button above to try again.</p>
          </div>
        )}
        {results && (dirty || busy) && (
          <div className="earlier-results" role="status">
            <strong>
              {busy ? "Updating results…" : "Showing previous results"}
            </strong>
            <p>{dirty ? "Your changes aren’t in these results yet. " : ""}{requestCaption(results.request)}</p>
            {!busy && !formOpen && (
              <button onClick={() => search(null)}>
                Update results <ArrowRight size={12} />
              </button>
            )}
          </div>
        )}
        {results ? (
          <>
            <div className="results-toolbar">
              <div>
                <strong>{results.total.toLocaleString()}</strong>
                <span>centres within {results.request.radius} km</span>
              </div>
              <SelectMenu
                label="Order search results"
                value={results.request.sort}
                disabled={busy}
                options={searchSortOptions(results.request.careType).filter(o => o.value !== "closing" || isShortCare(results.request))}
                available={results.ordering?.available}
                unavailableReasons={results.ordering?.unavailableReasons}
                onChange={(sort) => {
                  const r = { ...draft, sort };
                  setDraft(r);
                  search(null, dirty ? 0 : results.page, r);
                }}
              />
            </div>
            <div className="results-note">
              <button onClick={() => setDialog("ordering")}>
                Why this order? <Info size={12} />
              </button>
              <span>
                Page {results.page + 1} · {items.length} shown
              </span>
            </div>
            <div
              className="provider-list"
              ref={listRef}
              aria-busy={busy}
              inert={busy ? true : undefined}
            >
              {items.map((p, i) => (
                <ProviderCard
                  key={p.id}
                  p={p}
                  index={i}
                  selected={p.id === selected}
                  compared={compareIds.includes(p.id)}
                  onSelect={() => select(p.id)}
                  onDetail={() => openDetails(p)}
                  onCompare={() => toggleCompare(p.id)}
                  saved={library.favourites.some((x) => x.id === p.id)}
                  onSave={() => editFavourite(p)}
                  transport={results.request.transport}
                />
              ))}
              {!items.length && (
                <div className="empty-state">
                  <Search size={29} />
                  <h2>No centres found</h2>
                  <p>
                    We looked within {results.request.radius} km of your starting point
                    {results.request.query ? ` for “${results.request.query}”` : ""}.{" "}
                    {!results.request.includeUnknown &&
                      "Centres with missing details are hidden. "}
                    {!results.request.includeConflicts &&
                      "Centres that don’t meet your needs are hidden."}
                  </p>
                  <button
                    className="secondary"
                    onClick={() => {
                      setFormOpen(true);
                      setMobilePane("list");
                    }}
                  >
                    Change your search <ArrowRight size={15} />
                  </button>
                  {!draft.includeUnknown && (
                    <button
                      className="text-link"
                      onClick={() => {
                        const r = { ...draft, includeUnknown: true };
                        setDraft(r);
                        search(null, 0, r);
                      }}
                    >
                      Include centres with missing details
                    </button>
                  )}
                </div>
              )}
            </div>
            {isShortCare(results.request) && !busy && !dirty &&
              (Number.isFinite(results.explicitMatchCount)
                ? results.explicitMatchCount === 0
                : !hasExplicitShortCareMatch(items)) && (
              <ShortCareAlternatives />
            )}
            {results.total > results.pageSize && (
              <div className="pagination">
                <button
                  disabled={busy || dirty || results.page === 0}
                  onClick={() =>
                    search(null, results.page - 1, results.request)
                  }
                >
                  Previous
                </button>
                <span>
                  {results.page * results.pageSize + 1}–
                  {Math.min((results.page + 1) * results.pageSize, results.total)} /{" "}
                  {results.total}
                </span>
                <button
                  disabled={
                    busy || dirty || (results.page + 1) * results.pageSize >= results.total
                  }
                  onClick={() =>
                    search(null, results.page + 1, results.request)
                  }
                >
                  Next <ArrowRight size={13} />
                </button>
              </div>
            )}
            {results.missingLocations > 0 && (
              <p className="location-limit">
                {results.missingLocations} {results.missingLocations === 1 ? "centre has" : "centres have"} no map location.
                They stay in the list, but we can’t check their distance.
              </p>
            )}
          </>
        ) : (
          <div className="before-results nearby-results" aria-busy={nearbyBusy}>
            <h2>Nearby childcare</h2>
            {!draft.pickup && <p>Enter an address above to find childcare nearby.</p>}
            {nearbyBusy && <p role="status">Finding nearby centres…</p>}
            {nearbyError && !failure && <p role="status">{errorMessage(nearbyError)} <button className="text-link" onClick={() => setNearbyReload((v) => v + 1)}>Retry nearby centres</button></p>}
            {!nearbyBusy && nearby && <p>{nearby.total} centres within {nearby.radius} km · showing {nearby.items.length}</p>}
            {!nearbyBusy && nearby?.total === 0 && <p>No centres nearby. Try another starting point.</p>}
            {items.map((p) => <button key={p.id} id={"card-" + p.id} className={`nearby-card ${selected === p.id ? "selected" : ""}`} onClick={() => openDetails(p)} aria-label={`Select ${p.name}`} aria-pressed={selected === p.id}>
              <strong>{displayName(p.name)}</strong><span>{placeLine(p)}</span><span>Fees · {feeSummary(p).label}</span><span className="nearby-action">View centre <ArrowRight size={16} /></span>
            </button>)}
          </div>
        )}
        <footer className="panel-footer">
          <span className="connection-dot" />
          {mode === "demo"
            ? "Fictional examples"
            : health && !health.unavailable
              ? `${health.available.toLocaleString()} ${isShortCare(draft) ? "researched centres · coursework demo" : "centres in the directory"}`
              : health?.unavailable ? "Centre information unavailable" : "Loading centres…"}
          <button onClick={() => setDialog("sources")}>Data & sources</button>
        </footer>
        </>}
      </aside>
      <div className="map-wrap" onPointerDownCapture={e => { if (e.target.closest?.(".maplibregl-canvas-container, .map-card-layer")) setNavHidden(true); }}>
        {!choosing && mobilePane === "map" && <div className="map-tools-overlay"
          // Moving onto the search bar (or touching it) to change a condition
          // tucks the options panel away, for one or two children. Its tab
          // brings it back, and a new search opens it again. Click covers
          // keyboard use.
          onPointerOverCapture={tuckPanels} onClickCapture={tuckPanels}
          onPointerOutCapture={e => { if (e.target.closest?.(".map-search-dock") && !e.relatedTarget?.closest?.(".map-search-dock")) tuckArmed.current = true; }}>
          <MapSearchDock draft={draft} setField={setField} errors={errors} onSearch={search}
            busy={familyMode ? family.busy : busy} results={familyMode ? familyDock : results} dirty={familyMode ? familyDirty : dirty}
            mode={tourOpen ? "demo" : mode} active={introPhase === "ready" && !dialog && !tourOpen} queryReset={pickupQueryReset}
            onQueryChange={value => setPickupQueryReset({value})}
            onPanel={() => { setFormOpen(true); setMobilePane("list"); }}
            onMap={() => { setChoosing(true); setMobilePane("map"); }} submitRef={submitRef}
            focusRequest={searchFocus} onHeight={setDockHeight}
            collapsed={searchCollapsed} onCollapsedChange={setSearchCollapsed}
            notice={reopening ? `Choose a new date for ${reopening.name}.` : results?.total === 0 ? "No centres found. Try another address or change the filters." : browseSelection && !results ? `Add your search details for ${browseSelection.name}.` : mode === "demo" ? "Demo · fictional centres" : ""}
            failure={familyMode ? (family.state?.status === "error" ? family.state.error : null) : failure} onRetry={() => search(null)} addressStatus={pickupAddress} onRetryAddress={() => setAddressRetry(n => n + 1)} />
          {!oneShown && listButton}
          {(familyNoMatch || (!familyMode && isShortCare(results?.request) && !busy && !dirty &&
            (Number.isFinite(results?.explicitMatchCount)
              ? results.explicitMatchCount === 0
              : results && !hasExplicitShortCareMatch(items)))) && (
            <ShortCareMapAlternatives />
          )}
          {nearbyError && !failure && <p className="map-search-status" role="status">Centres could not load<button onClick={() => setNearbyReload(v => v + 1)}>Retry</button></p>}
        </div>}

        {familyMode && family.state && !choosing && mobilePane === "map" && (
          <FamilyPanel family={family} mode={mode} top={dockHeight + 12}
            onFix={applyFamilyFix}
            onWider={() => { const next = { ...draft, radius: 10 }; setDraft(next); searchFamily(next); }}
            onRetrySearch={() => searchFamily(draft)}
            onChecklist={(plan) => { setFamilyPlan(plan); notify("Saved to your Checklist."); }}
            compareIds={compareIds} onCompare={toggleCompareMany}
            onToast={notify} />
        )}
        {oneShown && (
          <OneChildPanel items={items} request={activeRequest} state={onePanel} onChange={setOnePanel} top={dockHeight + 12}
            onSelectCentre={(id) => setSelected(id)}
            onContact={(p) => prepare(p, activeRequest)}
            onChecklist={(p) => startPreparation(p, activeRequest)}
            onDetails={(p) => openDetails(p)} extra={listButton} />
        )}
        {(mapStarted || mapActive) && <Suspense fallback={null}><MapCanvas
          key={mode}
          items={mapItems}
          viewTarget={mapTarget}
          autoFit={familyMode ? !!family.state?.results : !!results}
          onViewChange={(view) => {
            if (tourOpen) return;
            rememberMap(view);
          }}
          onCancel={() => { setChoosing(false); setMobilePane("map"); }}
          pickup={
            choosing ? draft.pickup : familyMode ? (family.state?.plan.start ?? draft.pickup) : (activeRequest?.pickup ?? draft.pickup)
          }
          selected={selected}
          showSuggestions={familyMode ? familyCards : !!results && !dirty && !busy}
          onOpen={familyMode ? openFamilyCentre : openDetails}
          onSave={(p) => editFavourite(p, null)}
          onCompare={(id) => {
            if (familyMode || activeRequest) toggleCompare(id);
            else {
              const centre = items.find(p => p.id === id);
              if (centre) openDetails(centre);
            }
          }}
          savedIds={library.favourites.map(p => p.id)}
          compareIds={compareIds}
          onClosePreview={() => setSelected(null)}
          hasCompare={compareIds.length > 0}
          topInset={dockHeight + 6}
          leftInset={(familyOpen || oneOpen) && !narrow ? FAMILY_PANEL_RIGHT : 0}
          cardsVisible={familyMode ? mobilePane === "map" && (!narrow || !familyOpen) && !family.busy : mobilePane === "map" && !dirty && !busy && (!narrow || !oneOpen)}
          onShowList={() => { setFormOpen(!results); setMobilePane("list"); }}
          onSelect={familyMode && narrow ? (id) => openFamilyCentre(mapItems.find((p) => p.id === id)) : select}
          onPick={(p) => {
            setField("pickup", p);
            setChoosing(false);
            setMobilePane("map");
            setFormOpen(true);
            notify(
              "Location selected. Finding the street address…",
            );
          }}
          choosing={choosing}
          theme={theme}
          reduced={reduced}
          labels={labels}
          visible={true}
          onStatus={setMapStatus}
          introPhase={introPhase}
          introArea={introArea}
          introReduced={introReduced}
        /></Suspense>}
      </div>
      {tourInvite && introPhase === "ready" && !tourOpen && !results && !draft.pickup && !dialog && !choosing && (
        <aside className="tour-invite" aria-label="Quick tour">
          <CircleHelp size={20} aria-hidden="true" />
          <p><strong>New here?</strong> A 1-minute tour shows how to search, compare and contact centres.</p>
          <button className="primary" onClick={() => { setTourInvite(false); startTour(); }}>Show me</button>
          <button className="tour-invite-close" aria-label="Not now" onClick={() => { setTourInvite(false); try { saveTour(window.localStorage, "skipped"); } catch { /* still hidden for this visit */ } }}><X size={16} /></button>
        </aside>
      )}
      {compareIds.length > 0 && (
        <div className="compare-tray">
          <span className="compare-tray-count"><Scale size={18} aria-hidden="true" /><strong>{compareIds.length}</strong> {compareIds.length === 1 ? "centre" : "centres"}</span>
          <button className="compare-tray-open" onClick={() => loadComparison()}>
            Compare <ArrowRight size={16} />
          </button>
          <button
            aria-label="Clear comparison"
            onClick={() => {
              dialogSeq.current++; setDialogBusy(false);
              setCompareIds([]);
              setComparison(null);
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Info size={23} aria-hidden="true" />
          <span>{toast}</span>
          <button aria-label="Close message" onClick={() => setToast("")}><X size={18} /></button>
        </div>
      )}
      <DialogPresence immediate={reduced || introReduced || tourOpen}>
      {dialog && (
        <Dialog
          tourBehind={tourOpen}
          className={dialog === "details" ? "centre-dialog" : `${dialog}-dialog`}
          titleAccessory={dialog === "details" && profile ? <RegistrationBadge p={profile.p} /> : null}
          title={
            dialog === "saved"
              ? "Saved for later"
              : dialog === "save-favourite"
                ? "Save this centre"
                  : dialog === "preparation"
                    ? "Get ready for childcare"
                    : dialog === "details"
                      ? displayName(profile?.p.name ?? "")
                      : dialog === "compare"
                        ? "Compare childcare"
                        : dialog === "enquiry"
                          ? "Contact the centre"
                          : dialog === "settings"
                            ? "Settings"
                            : dialog === "ordering"
                              ? "Why this order?"
                              : "About our information"
          }
          kicker={dialog === "details" ? "CENTRE DETAILS" : ""}
          wide={["details", "saved", "enquiry"].includes(dialog) || (dialog === "compare" && compareIds.length >= 2) || (dialog === "preparation" && !!preparation)}
          onClose={close}
        >
          {dialog === "preparation" && familyPlan && (
            <FamilyPlanCard plan={familyPlan} onOpen={family.state ? () => setDialog(null) : null} onRemove={() => setFamilyPlan(null)} />
          )}
          {dialog === "saved" && (
            <SavedLibrary
              tab={savedTab}
              setTab={setSavedTab}
              library={library}
              failure={saveFailure}
              onRetry={reloadLibrary}
              onReopen={reopenFavourite}
              onStartSearch={() => { close(); setFormOpen(true); setMobilePane("list"); }}
              currentRequest={activeRequest ?? draft}
              savedCheck={savedCheck}
              onCheckSaved={checkSavedCentres}
              onOpenSaved={openSavedCentre}
              onEditFavourite={(p) => editFavourite(p, "saved")}
              onDelete={(type, id) =>
                changeLibrary((x) => ({
                  ...x,
                  [type]: x[type].filter((p) => p.id !== id),
                }))
              }
              onDiscover={close}
              suggestions={<Recommendations mode={mode} library={library} interests={interests}
                request={!dirty ? activeRequest : null}
                onDiscover={() => { close(); setFormOpen(true); setMobilePane('list'); }}
                onSave={item => { if (saveFavourite(item)) notify('Centre saved.'); }}
                onOpen={(p, request) => { setProfile({ p, request }); setSelected(p.id); setDialogError(null); setDialog('details'); }} />}
            />
          )}
          {dialog === "save-favourite" && saveEditor && (
            <FavouriteEditor
              key={saveEditor.p.id}
              p={saveEditor.p}
              existing={library.favourites.find(
                (x) => x.id === saveEditor.p.id,
              )}
              onSave={saveFavourite}
              onCancel={() => setDialog(saveEditor.from)}
            />
          )}
          {dialog === "preparation" &&
            (preparation ? (
              <>
                {dialogBusy && (
                  <p role="status">Checking the latest details…</p>
                )}
                {dialogError && (
                  <div className="error-box" role="alert">
                    {errorMessage(dialogError)} Your earlier checklist is still here.
                    <button onClick={refreshPreparation}>Try again</button>
                  </div>
                )}
                <div inert={dialogBusy || undefined}>
                  <Preparation
                    key={preparation.p.id + scenario(preparation.sourceRequest ?? preparation.request)}
                    p={preparation.p}
                    request={preparation.request}
                    currentRequest={activeRequest}
                    sourceRequest={preparation.sourceRequest ?? preparation.request}
                    onTimesChange={changePreparationTimes}
                    onEnquiry={() =>
                      prepare(preparation.p, preparation.request)
                    }
                    onRefresh={refreshPreparation}
                  />
                </div>
              </>
            ) : (
              <div className="empty-state">
                <h3>Choose a centre first</h3>
                {checklistChoices.length ? <>
                  <p>Pick a centre from your shortlist to make a checklist for your visit.</p>
                  <div className="checklist-choices">
                    {checklistChoices.map((p) => <button key={p.id} className="secondary" onClick={() => startPreparation(p, results.request)}>
                      <span>{displayName(p.name)}</span><ArrowRight size={16} aria-hidden="true" />
                    </button>)}
                  </div>
                  <button className="text-link" onClick={close}>Find another centre</button>
                </> : <>
                  <p>Open a centre and select “Get ready for childcare” to make a checklist for your visit.</p>
                  <button className="primary" onClick={close}>
                    Find childcare <ArrowRight size={16} />
                  </button>
                </>}
              </div>
            ))}
          {dialog === "details" && profile && (
            <>
              {profile.saved && (
                <SavedChanges
                  saved={profile.saved}
                  current={profile.current}
                  onUpdate={() => {
                    if (
                      changeLibrary((x) => ({
                        ...x,
                        favourites: x.favourites.map((f) =>
                          f.id === profile.p.id
                            ? {
                                ...f,
                                name: profile.p.name,
                                category: profile.p.category,
                                region: profile.p.region,
                                snapshot: profile.current,
                              }
                            : f,
                        ),
                      }))
                    ) {
                      setProfile((x) => ({
                        ...x,
                        saved: { ...x.saved, snapshot: x.current },
                      }));
                      notify("Saved details updated.");
                    }
                  }}
                />
              )}
              {saveFailure && profile.saved && (
                <p className="error-box" role="alert">
                  {saveFailure}
                </p>
              )}
              <Details
                p={profile.p}
                request={profile.request}
                onAskReview={(topic, reviewProfile) => {
                  // Details only shows the centre. A review concern becomes a
                  // question for when the parent contacts it from Compare.
                  const { p, selection } = addReviewQuestion({ ...profile.p, reviewProfile: reviewProfile ?? profile.p.reviewProfile }, profile.request, topic, questionSelection, 'contact-v2:' + profile.p.id + scenario(profile.request));
                  setProfile(current => ({ ...current, p }));
                  setQuestionSelection(selection);
                  const add = !compareIds.includes(p.id) && compareIds.length < 3;
                  if (add) setCompareIds(ids => [...ids, p.id]);
                  notify(compareIds.includes(p.id) || add
                    ? "Added to your questions. Contact the centre from Compare."
                    : "Added to your questions. Compare is full, so remove a centre to contact this one from there.");
                }}
                onCompare={() => toggleCompare(profile.p.id)}
                compared={compareIds.includes(profile.p.id)}
              />
            </>
          )}
          {dialog === "compare" &&
            (compareIds.length < 2 ? (
              <div className="empty-state">
                <Scale size={31} />
                <h3>{compareIds.length === 1 ? "Add one more option" : "Find a few options first"}</h3>
                <p>
                  {compareIds.length === 1
                    ? "Select Compare on one more centre to see them side by side."
                    : "Select Compare on 2 or 3 centres to see them side by side."}
                </p>
                <button className="primary" onClick={close}>
                  Find childcare <ArrowRight size={16} />
                </button>
                {(() => {
                  const only = compareIds.length === 1 && !familyMode && activeRequest && (items.find((x) => x.id === compareIds[0]) ?? (profile?.p?.id === compareIds[0] ? profile.p : null));
                  return only ? <button className="secondary" onClick={() => prepare(only, activeRequest)}>Contact {displayName(only.name)} <ArrowRight size={16} /></button> : null;
                })()}
              </div>
            ) : (
              <>
                {dialogBusy && (
                  <p className="loading-line" role="status">
                    <span className="spinner" />
                    Loading your comparison…
                  </p>
                )}
                {dialogError && (
                  <div className="error-box" role="alert">
                    <p>{errorMessage(dialogError)}</p>
                    <button className="text-link" onClick={retryDialog}>
                      Try again
                    </button>
                  </div>
                )}
                {comparison && (
                  <>
                    {requestChanged && (
                      <p className="notice">
                        Your search has changed. Update your search to compare centres for the new plan.
                      </p>
                    )}
                    <div
                      inert={
                        dialogBusy || requestChanged || !!dialogError
                          ? true
                          : undefined
                      }
                    >
                      {comparison.family ? <FamilyComparison
                        items={comparison.items.filter(p => compareIds.includes(p.id))}
                        children={comparison.children}
                        onRemove={removeCompare}
                        onPrepare={(p, key) => prepare(p, comparison.children[key].request, childName(key))}
                        plan={family.state?.plan}
                        onToast={notify}
                      /> : <Comparison
                        items={comparison.items.filter((p) =>
                          compareIds.includes(p.id),
                        )}
                        onRemove={removeCompare}
                        onPrepare={(p) => prepare(p, comparison.request)}
                        sort={compareSort}
                        request={comparison.request}
                        ordering={comparison.ordering}
                        onSort={(v) => {
                          setCompareSort(v);
                          loadComparison(compareIds, v);
                        }}
                      />}
                    </div>
                  </>
                )}
              </>
            ))}
          {dialog === "enquiry" &&
            enquiry &&
            (familyMode ? familyDirty || !family.state?.plan || !["a", "b"].some(key => scenario(enquiry.request) === scenario(canonicalRequest(childRequest(family.state.plan, key)))) : scenario(enquiry.request) !== scenario(activeRequest)) && (
              <p className="notice">
                These questions use your earlier search. For new questions,
                open a centre from your new results.
              </p>
            )}
          {dialog === "enquiry" && enquiry && (
            <>
              {enquiry.forChild && <p className="notice">Questions for {enquiry.forChild}</p>}
              <Enquiry
                key={enquiry.p.id + scenario(enquiry.request)}
                p={enquiry.p}
                request={enquiry.request}
                selection={
                  questionSelection["contact-v2:" + enquiry.p.id + scenario(enquiry.request)]
                }
                onSelection={(ids) =>
                  setQuestionSelection((x) => ({
                    ...x,
                    ["contact-v2:" + enquiry.p.id + scenario(enquiry.request)]: ids,
                  }))
                }
                onCompare={() => loadComparison()}
                onPreparation={() => startPreparation(enquiry.p, enquiry.request)}
              />
            </>
          )}
          {dialog === "ordering" && (
            <div className="prose">
              <OrderingNote ordering={results?.ordering} radius={results?.request.radius} />
              <p>
                {results?.request.sort === "recommended"
                  ? "Recommended puts centres higher when their listed hours, ages and fees fit your search. Your choices, and the centres you save, compare or look at, also count. We also mix in centres with different strengths."
                  : "This page follows the order you chose. Your saved centres and the centres you looked at don’t change it."}
              </p>
              <p>
                The order is not a score for care quality. It also doesn’t mean
                a centre has a place for your child.
              </p>
              <p>
                {results?.request.includeConflicts
                  ? "Centres with details that don’t match your search come last and have grey pins."
                  : "Centres with details that don’t match your search are hidden. To show them, open More filters and tick “Include centres that don’t meet all my needs”."}
              </p>
              <p>
                Each centre has the same number in the list and on the map.
                Centres without a map location are still in the list.
              </p>
            </div>
          )}
          {dialog === "settings" && (
            <>
              <div className="setting-line"><span>Getting started</span><button className="secondary" onClick={startTour}>Replay quick tour</button></div>
              <div className="setting-line">
                <span>Appearance</span>
                <div className="theme-buttons">
                  <button
                    aria-pressed={theme === "light"}
                    onClick={() => setTheme("light")}
                  >
                    <Sun size={16} />
                    Light
                  </button>
                  <button
                    aria-pressed={theme === "dark"}
                    onClick={() => setTheme("dark")}
                  >
                    <Moon size={16} />
                    Dark
                  </button>
                </div>
              </div>
              <label className="setting-line">
                <span>Map labels</span>
                <input
                  type="checkbox"
                  checked={labels}
                  onChange={(e) => setLabels(e.target.checked)}
                />
              </label>
              <label className="setting-line">
                <span>Reduce motion</span>
                <input
                  type="checkbox"
                  checked={reduced}
                  onChange={(e) => {
                    const next = e.target.checked;
                    writeMotionPreference(next);
                    setReduced(next);
                  }}
                />
              </label>
              <div className="setting-line setting-line-clear">
                <span><strong>Clear data on this device</strong><small>Deletes everything EqualPath keeps in this browser: saved centres, your choices, viewing history and settings, for real and demo centres.</small></span>
                {clearCacheConfirm ? <span className="setting-confirm-actions"><strong role="alert">Delete everything from this browser?</strong><button className="secondary" onClick={clearLocalCache}>Clear everything</button><button className="text-link" onClick={() => setClearCacheConfirm(false)}>Cancel</button></span> : <button className="secondary" onClick={() => setClearCacheConfirm(true)}>Clear data</button>}
              </div>
              <div className="data-mode">
                <h3>Try the demo</h3>
                <p>
                  Try made-up centres with different hours and pickup options.
                  Switching between demo and real centres clears your current
                  search.
                </p>
                <button
                  className="secondary"
                  onClick={() => switchMode(mode === "live" ? "demo" : "live")}
                >
                  {mode === "live"
                    ? "Try demo centres"
                    : "Back to real centres"}
                  <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}
          {dialog === "sources" && (
            <div className="prose about-information">
              <h3>Where we cover</h3>
              <p>
                Kuala Lumpur and Selangor only. Putrajaya and other states are not included.
                {health && !health.unavailable &&
                  ` You can search ${health.available.toLocaleString()} centres. We hide ${health.withheld.toLocaleString()} more until we can check their area or branch.`}
              </p>
              <h3>Where the information comes from</h3>
              <ul>
                <li><strong>JKM</strong>: the government list of registered childcare centres.</li>
                <li><strong>CariSchool</strong>: a school directory. It lists KPM codes, but we haven’t checked these codes with the government.</li>
                <li>Centres’ own websites and listings, for contacts, hours, services and fees.</li>
              </ul>
              <p>Every detail shows its source and the date we checked it.</p>
              <h3>What we check, and what we can’t</h3>
              <p>
                We check the listed care hours, ages and fees against your search.
                We can’t see if a centre has a free place today. Being registered
                doesn’t tell you how good the care is. Always ask the centre before
                your child goes.
              </p>
              <h3>Your privacy</h3>
              <p>
                There is no account, and we never contact a centre for you. Your
                search is only sent to find results. This browser remembers your
                last map position and starting point, the centres you save, and
                which centres you looked at (for suggestions). It doesn’t save
                dates or your child’s age. You can turn suggestions history off in
                Saved → For you → How suggestions work.
              </p>
              <h3>Maps and driving times</h3>
              <p>
                Address search uses OpenStreetMap data through Photon. Driving
                times come from the{" "}
                <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noreferrer">OSRM / OpenStreetMap routing</a>{" "}
                service, which only receives the two map points. They don’t
                include traffic. Area checks use the{" "}
                <a href="https://www.geoboundaries.org/api/current/gbOpen/MYS/ADM1/" target="_blank" rel="noreferrer">OSM / geoBoundaries boundary data</a>{" "}
                (2017, ODbL licence), so places near a state border may be
                left out. See a mistake on the map?{" "}
                <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">Fix the map</a>.
              </p>
              <button
                className="secondary"
                onClick={() => switchMode(mode === "live" ? "demo" : "live")}
              >
                {mode === "live"
                  ? "Try demo centres"
                  : "Back to real centres"}
                <ArrowRight size={15} />
              </button>
            </div>
          )}
        </Dialog>
      )}
      </DialogPresence>
      {tourOpen && <GettingStarted onClose={finishTour} onStep={showTourStep} reduced={reduced || introReduced} />}
    </main>
  );
}
function PlusIcon() {
  return <span aria-hidden="true">＋</span>;
}
