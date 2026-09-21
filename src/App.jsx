import { useEffect, useRef, useState } from "react";
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
} from "lucide-react";
import Recommendations from "./Recommendations.jsx";
import useInterests from "./useInterests.js";
import Comparison from "./Comparison.jsx";
import MapCanvas from "./MapCanvas.jsx";
import MapSearchDock from "./MapSearchDock.jsx";
import SearchActions from "./SearchActions.jsx";
import Dialog from "./Dialog.jsx";
import DialogPresence from "./DialogPresence.jsx";
import SelectMenu, { sortOptions } from "./SelectMenu.jsx";
import TimeInput from "./TimeInput.jsx";
import CareTypeChoice from "./CareTypeChoice.jsx";
import {
  ProviderCard,
  Details,
  Status,
  RegistrationBadge,
  OrderingNote,
} from "./ProviderViews.jsx";
import { requestAPI, errorMessage } from "./api.js";
import { requestErrors, todayKL, requestCaption, needsPickupAddress, MAX_SEARCH_RADIUS_KM, SHORT_CARE_RADIUS_KM, searchRadius, isShortCare, careTypeLabel } from "../shared/request.mjs";
import PlaceInput from "./PlaceInput.jsx";
import { DEFAULT_MAP, readMapMemory, writeMapMemory } from "../shared/map-memory.mjs";
import Preparation from "./Preparation.jsx";
import Enquiry from "./Enquiry.jsx";
import AgeRangeChoice from "./AgeRangeChoice.jsx";
import GettingStarted from "./GettingStarted.jsx";
import ShortCareAlternatives, { hasExplicitShortCareMatch } from "./ShortCareAlternatives.jsx";
import { saveTour } from "../shared/tour.mjs";
import { feeSummary } from "../shared/result-summary.mjs";
import { assess, costFor, enquiries } from "../shared/conditions.mjs";
import { hasStoredMotionPreference, readMotionPreference, writeMotionPreference } from "./motion-preference.js";
import {
  SavedLibrary,
  SavedCentreReminder,
  MapSavedShortcuts,
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
const EMPTY = [];
const focusMapSearch = () => [...document.querySelectorAll(".mobile-search-summary, .map-search-launch")].find(el => el.getClientRects().length)?.focus({ preventScroll: true });
const initial = () => ({
  careType: new URLSearchParams(location.search).get("care") === "regular" ? "regular" : "short_term",
  pickup: null,
  date: new URLSearchParams(location.search).get("care") === "regular" ? "" : todayKL(),
  deadline: "",
  end: "",
  age: "",
  transport: "",
  radius: searchRadius(MAX_SEARCH_RADIUS_KM, new URLSearchParams(location.search).get("care") === "regular" ? "regular" : "short_term"),
  query: "",
  includeUnknown: true,
  includeConflicts: true,
  sort: "distance",
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
export default function App({
  introPhase = "ready",
  introArea = 0,
  introReduced = false,
  onHome,
}) {
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
    [mapStatus, setMapStatus] = useState("loading"),
    [library, setLibrary] = useState(emptyLibrary),
    [savedTab, setSavedTab] = useState("favourites"),
    [saveFailure, setSaveFailure] = useState(""),
    [saveEditor, setSaveEditor] = useState(null),
    [reopening, setReopening] = useState(null),
    [savedCheck, setSavedCheck] = useState(null),
    [preparation, setPreparation] = useState(null);
  const [tourOpen, setTourOpen] = useState(false);
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
  }, [dialog, profile, dialogBusy, tourOpen, interests.record]);
  const [searchFocus, setSearchFocus] = useState(null), [dockHeight, setDockHeight] = useState(150);
  const [searchCollapsed, setSearchCollapsed] = useState(false);
  const [pickupQueryReset, setPickupQueryReset] = useState(null);
  const [pickupAddress, setPickupAddress] = useState(null), [addressRetry, setAddressRetry] = useState(0);
  const tourSnapshot = useRef(null), tourData = useRef(null), tourSequence = useRef(0);
  const mapView = useRef(DEFAULT_MAP), rememberedPickup = useRef(null);
  const requestSeq = useRef(0),
    dialogSeq = useRef(0),
    listRef = useRef(null),
    submitRef = useRef(null),
    toastTimer = useRef(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const notify = (text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4200);
  };
  useEffect(() => {
    const point=draft.pickup;
    if (mode!=="live" || tourOpen || !needsPickupAddress(point)) { setPickupAddress(null); return; }
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
  },[mode,tourOpen,draft.pickup?.lat,draft.pickup?.lng,draft.pickup?.label,addressRetry]);
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
    requestAPI({ action: "health", mode, careType: draftRef.current.careType })
      .then((h) => alive && setHealth(h))
      .catch(() => alive && setHealth({ unavailable: true }));
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
        age: "4-6",
        transport: "institution",
      });
    return () => {
      alive = false;
    };
  }, [mode]);
  useEffect(() => {
    if (results || tourOpen) return;
    let alive = true;
    setNearby(null);
    setNearbyBusy(true);
    setNearbyError(null);
    const timer = setTimeout(() => {
      requestAPI({ action: "nearby", mode, careType: draft.careType, center: browseCenter })
        .then((r) => { if (alive) { setNearby(r); setHealth(r); } })
        .catch((e) => { if (alive) setNearbyError(e); })
        .finally(() => { if (alive) setNearbyBusy(false); });
    }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [mode, draft.careType, browseCenter, results, nearbyReload, tourOpen]);
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
    setMapTarget(view);
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
      setErrors({}); setFailure(null); setFormOpen(true);
      setDraft(x => ({ ...x, careType: value, radius: searchRadius(MAX_SEARCH_RADIUS_KM, value), date: value === "short_term" ? todayKL() : "", deadline: "", end: "", sort: "distance" }));
      return;
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
    items = results?.items ?? nearby?.items ?? EMPTY;
  const switchMode = (next) => {
    setPickupQueryReset(null);
    requestSeq.current++;
    dialogSeq.current++;

    setReopening(null);
    setPreparation(null);
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
  const search = async (e, page = 0, override = null) => {
    e?.preventDefault?.();
    setSearchCollapsed(false);
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
    setBusy(true);
    setFailure(null);
    setChoosing(false);
    try {
      const r = await requestAPI({ action: "search", mode, request, page });
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
    if (ids.length < 2 || !activeRequest) return;
    const seq = ++dialogSeq.current;
    setDialogBusy(true);
    try {
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
    const next = compareIds.filter((x) => x !== id);
    setCompareIds(next);
    if (next.length >= 2) loadComparison(next);
    else setComparison(null);
  };
  const prepare = (p, request = activeRequest) => {
    if (!p || !request) return;
    setEnquiry({ p, request });
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
    const example = { ...initial(), careType: "short_term", pickup: { id: "demo-pickup", label: "KL Sentral · tutorial", lat: 3.1341, lng: 101.6865 }, date: todayKL(), deadline: "13:00", end: "18:00", age: "4-6", transport: "self" };
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
      const garden = r.items.find((p) => p.id === "demo-garden"), river = r.items.find((p) => p.id === "demo-river");
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
    comparison && scenario(comparison.request) !== scenario(activeRequest);
  const retryDialog = () => loadComparison();
  const searchState = busy ? "loading" : failure ? "failed" : dirty ? "pending" : results ? "applied" : "ready";
  return (
    <main
      className={`equalpath map-first ${theme} mobile-${mobilePane}`}
      tabIndex={-1}
      data-reduced={reduced}
      data-mode={tourOpen ? "demo" : mode}
      data-search-state={searchState}
      inert={introPhase !== "ready"}
      aria-hidden={introPhase !== "ready" || undefined}
    >
      <a className="skip-link" href="#request-form" onClick={() => { setMobilePane("map"); setSearchFocus({field:"pickup",at:Date.now()}); }}>
        Skip to your request
      </a>
      <header className="app-header">
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
        <nav aria-label="Main navigation">
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
            <SlidersHorizontal size={19} />
          </button>
        </div>
      </header>
      <aside
        className="discovery-panel"
        id="search-panel"
        inert={mobilePane !== "list" || undefined}
        aria-hidden={mobilePane !== "list" || undefined}
        aria-label="Find care for this request"
      >
        {mobilePane === "list" && <>
        <div className="intro">
          <h1>Find childcare</h1>
          <button className="close-search-panel" aria-label="Close search panel" onClick={() => { setMobilePane("map"); requestAnimationFrame(() => focusMapSearch()); }}><X size={21} /></button>
        </div>
        {tourOpen && <p className="demo-notice">Tutorial · fictional centres and sample details. Your search will be restored when you finish or skip.</p>}
        {mode === "demo" && (
          <p className="demo-notice">
            Demo · fictional centres and prices.{" "}
            <button onClick={() => switchMode("live")}>
              Back to real centres
            </button>
          </p>
        )}
        {!tourOpen && <SavedCentreReminder favourites={library.favourites}
          onChoose={() => { reloadLibrary(); setSavedTab("favourites"); setDialog("saved"); }} />}
        <div className={`request-heading ${results ? "" : "request-heading-empty"}`}>
          {results && <strong>Your search</strong>}
          {results && (
            <button onClick={() => setFormOpen((v) => !v)}>
              {formOpen ? "Show results" : "Change search"}{" "}
              <SlidersHorizontal size={13} />
            </button>
          )}
        </div>
        {browseSelection && !results && <p className="notice-panel">To check {browseSelection.name}, fill in the times below.</p>}
        {!formOpen && activeRequest && (
          <div className="compact-request">
            <p>
              <MapPin size={14} />
              {activeRequest.pickup.label}
            </p>
            <strong className="request-care-type">{careTypeLabel(activeRequest)}</strong>
            {isShortCare(activeRequest) && <div>
              <strong>{activeRequest.date}</strong>
              <span>
                Leave {activeRequest.deadline} → Pick up {activeRequest.end}
              </span>
            </div>}
            <small>
              {activeRequest.age === ""
                ? "Age not chosen"
                : activeRequest.age === "0"
                  ? "Under 1 year"
                  : `Age ${activeRequest.age}`}{" "}
              ·{" "}
              {activeRequest.transport === "self"
                ? "I’ll handle pickup"
                : activeRequest.transport === "institution"
                  ? "Centre pickup"
                  : "Pickup not chosen"}
            </small>
          </div>
        )}
        {reopening && (
          <div className="notice-panel">
            <strong>Rechecking {reopening.name}</strong>
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
          <CareTypeChoice value={draft.careType} onChange={value => setField("careType", value)} />

          <PlaceInput
            hideLabel
            onQueryChange={value => setPickupQueryReset({value})}
            label={isShortCare(draft) ? "Where will your child leave from?" : "Where do you need care?"}
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
            {pickupAddress === "loading" ? "Finding the nearby street…" : <>Street address unavailable. Your selected location is kept. <button type="button" className="text-link" onClick={()=>setAddressRetry(n=>n+1)}>Retry address</button></>}
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
                shortLabel="Start"
                label="When will your child leave?"
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
                shortLabel="End"
                label="When will you pick up your child?"
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
            <summary><Users size={17} aria-hidden="true" /><span>Pickup help <small>{draft.transport === "self" ? "I’ll handle it" : draft.transport === "institution" ? "The centre" : "Optional"}</small></span><ChevronDown size={16} aria-hidden="true" /></summary>
          <div>
            <div className="field">
              <label htmlFor="transport">
                Who handles pickup?
              </label>
              <select
                id="transport"
                value={draft.transport}
                onChange={(e) => setField("transport", e.target.value)}
              >
                <option value="">Not sure yet</option>
                <option value="institution">The centre</option>
                <option value="self">I’ll handle it</option>
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
                {(isShortCare(draft) ? [SHORT_CARE_RADIUS_KM] : [5, MAX_SEARCH_RADIUS_KM]).map((n) => (
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
              Include centres with details to confirm
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
        <div className="request-save-actions">
          <button className="text-link" onClick={() => { reloadLibrary(); setSavedTab("favourites"); setDialog("saved"); }}>
            Saved centres{library.favourites.length > 0 && ` (${library.favourites.length})`}
          </button>
          {!!library.favourites.length && !!activeRequest && <button className="text-link" onClick={() => { reloadLibrary(); setSavedTab("favourites"); setDialog("saved"); }}>
            Check saved centres with this search <ArrowRight size={14} />
          </button>}
        </div>
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
            <p>{dirty ? "Your new choices have not been applied. " : ""}{requestCaption(results.request)}</p>
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
                options={sortOptions(results.request.careType).filter(o => o.value !== "closing" || isShortCare(results.request))}
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
                />
              ))}
              {!items.length && (
                <div className="empty-state">
                  <Search size={29} />
                  <h2>No centres found</h2>
                  <p>
                    Area:{" "}
                    {results.request.radius} km from pickup
                    .{" "}
                    {results.request.query &&
                      `Name / area: “${results.request.query}”. `}
                    {!results.request.includeUnknown &&
                      "Unknown conditions are excluded. "}
                    {!results.request.includeConflicts &&
                      "Known conflicts are excluded."}
                  </p>
                  <button
                    className="secondary"
                    onClick={() => {
                      setFormOpen(true);
                      setMobilePane("list");
                    }}
                  >
                    Adjust your search <ArrowRight size={15} />
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
                      Include centres with details to confirm
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
                {results.missingLocations} matching records have no coordinates.
                They remain in the list; their distance cannot be checked.
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
            {!nearbyBusy && nearby?.total === 0 && <p>No centres nearby. Choose another pickup address.</p>}
            {items.map((p) => <button key={p.id} id={"card-" + p.id} className={`nearby-card ${selected === p.id ? "selected" : ""}`} onClick={() => openDetails(p)} aria-label={`Select ${p.name}`} aria-pressed={selected === p.id}>
              <strong>{p.name}</strong><span>{[p.district, p.region].filter(Boolean).join(" · ")}</span><span>Fees · {feeSummary(p).label}</span><span className="nearby-action">View centre <ArrowRight size={16} /></span>
            </button>)}
          </div>
        )}
        <footer className="panel-footer">
          <span className="connection-dot" />
          {mode === "demo"
            ? "Fictional examples"
            : health && !health.unavailable
              ? `${health.available.toLocaleString()} centres in the directory`
              : health?.unavailable ? "Centre information unavailable" : "Loading centres…"}
          <button onClick={() => setDialog("sources")}>Data & sources</button>
        </footer>
        </>}
      </aside>
      <div className="map-wrap">
        {!choosing && mobilePane === "map" && <div className="map-tools-overlay">
          <MapSearchDock draft={draft} setField={setField} errors={errors} onSearch={search} busy={busy} results={results} dirty={dirty}
            mode={tourOpen ? "demo" : mode} active={introPhase === "ready" && !dialog && !tourOpen} queryReset={pickupQueryReset}
            onQueryChange={value => setPickupQueryReset({value})}
            onPanel={() => { setFormOpen(true); setMobilePane("list"); }}
            onMap={() => { setChoosing(true); setMobilePane("map"); }} submitRef={submitRef}
            focusRequest={searchFocus} onHeight={setDockHeight}
            collapsed={searchCollapsed} onCollapsedChange={setSearchCollapsed}
            notice={reopening ? `Choose a new date for ${reopening.name}.` : results?.total === 0 ? "No centres found. Try another address or change the filters." : browseSelection && !results ? `Add your search details for ${browseSelection.name}.` : mode === "demo" ? "Demo · fictional centres" : ""}
            failure={failure} onRetry={() => search(null)} addressStatus={pickupAddress} onRetryAddress={() => setAddressRetry(n => n + 1)} />
          <div className="map-quick-actions">
            <button aria-label={results ? `All ${results.total} centres` : "Nearby centres"} onClick={() => { setFormOpen(false); setMobilePane("list"); }}><List size={17} /><span className="map-results-label">{results ? `All ${results.total} centres` : "Nearby centres"}</span><span className="map-results-short" aria-hidden="true">List</span></button>
            <MapSavedShortcuts library={library}
              onCentres={() => { reloadLibrary(); setSavedTab("favourites"); setDialog("saved"); }} />
          </div>
          {nearbyError && !failure && <p className="map-search-status" role="status">Centres could not load<button onClick={() => setNearbyReload(v => v + 1)}>Retry</button></p>}
        </div>}

        <MapCanvas
          key={mode}
          items={items}
          viewTarget={mapTarget}
          autoFit={!!results}
          onViewChange={(view) => {
            if (tourOpen) return;
            rememberMap(view);
          }}
          onCancel={() => { setChoosing(false); setMobilePane("map"); }}
          pickup={
            choosing ? draft.pickup : (activeRequest?.pickup ?? draft.pickup)
          }
          selected={selected}
          showSuggestions={!!results && !dirty && !busy}
          onOpen={openDetails}
          onSave={(p) => editFavourite(p, null)}
          onCompare={(id) => {
            if (activeRequest) toggleCompare(id);
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
          cardsVisible={mobilePane === "map" && !dirty && !busy}
          onShowList={() => { setFormOpen(!results); setMobilePane("list"); }}
          onSelect={select}
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
        />
      </div>
      {compareIds.length > 0 && (
        <div className="compare-tray">
          <span className="compare-tray-count"><Scale size={18} aria-hidden="true" /><strong>{compareIds.length}</strong> {compareIds.length === 1 ? "centre" : "centres"}</span>
          <button className="compare-tray-open" onClick={() => loadComparison()}>
            Compare <ArrowRight size={16} />
          </button>
          <button
            aria-label="Clear comparison"
            onClick={() => {
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
                    ? "Get ready for child care"
                    : dialog === "details"
                      ? profile?.p.name
                      : dialog === "compare"
                        ? "Compare childcare"
                        : dialog === "enquiry"
                          ? "Contact the centre"
                          : dialog === "settings"
                            ? "Display settings"
                            : dialog === "ordering"
                              ? "Why this order?"
                              : "About our information"
          }
          kicker={
            dialog === "preparation"
              ? "CHECKLIST"
              : ["saved", "save-favourite"].includes(dialog)
                ? "YOUR SAVED ITEMS"
                : dialog === "details"
                  ? "CENTRE DETAILS"
                  : dialog === "enquiry"
                    ? "CONTACT"
                    : dialog === "compare"
                      ? "COMPARE"
                      : "INFORMATION"
          }
          wide={["details", "saved", "enquiry"].includes(dialog) || (dialog === "compare" && compareIds.length >= 2) || (dialog === "preparation" && !!preparation)}
          onClose={close}
        >
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
                  <p role="status">Rechecking current conditions…</p>
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
                <p>
                  Choose a centre to make a checklist for your visit.
                </p>
                <button className="primary" onClick={close}>
                  Find childcare <ArrowRight size={16} />
                </button>
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
                saved={library.favourites.some((x) => x.id === profile.p.id)}
                onSave={() => editFavourite(profile.p, "details")}
                onPreparation={() =>
                  startPreparation(profile.p, profile.request)
                }
                onPrepare={() => prepare(profile.p, profile.request)}
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
                    ? "Tap Compare on one more centre."
                    : "Tap Compare on 2 or 3 centres."}
                </p>
                <button className="primary" onClick={close}>
                  Find childcare <ArrowRight size={16} />
                </button>
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
                        Your search details have changed. Update your search to compare options for your new plans.
                      </p>
                    )}
                    <div
                      inert={
                        dialogBusy || requestChanged || !!dialogError
                          ? true
                          : undefined
                      }
                    >
                      <Comparison
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
                      />
                    </div>
                  </>
                )}
              </>
            ))}
          {dialog === "enquiry" &&
            enquiry &&
            scenario(enquiry.request) !== scenario(activeRequest) && (
              <p className="notice">
                These questions use your earlier search details. Open a centre
                from the updated results to prepare a new list.
              </p>
            )}
          {dialog === "enquiry" && enquiry && (
            <>
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
                When a detail is missing, that centre appears after those with
                information we can compare. This order doesn’t rate care quality
                or mean the centre can take your child.
              </p>
              <p>
                The list and map show the same results. Centres we can’t locate
                on the map still appear in the list.
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
              <div className="data-mode">
                <h3>Try the demo</h3>
                <p>
                  Explore fictional centres with different care hours and pickup
                  options. Switching between the demo and real centres clears
                  your current search and selection.
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
            <div className="prose">
              <p>
                Only Kuala Lumpur and Selangor are served. Putrajaya and other
                states are excluded.{" "}
                {health &&
                  !health.unavailable &&
                  `${health.available.toLocaleString()} records are available; ${health.withheld} are held for region or branch checks.`}
              </p>
              <p>
                <strong>JKM</strong> is an imported registration source.{" "}
                <strong>CariSchool</strong> supplies separate branch
                descriptions and KPM code claims; a directory claim is not
                official KPM verification. Contact and service facts keep their
                own source links and retrieval dates.
              </p>
              <p>
                We check the listed care hours for your date. Ask the centre
                about pickup and whether they can take your child.
                Driving times are estimates and do not include current traffic.
              </p>
              <p>
                Geographic checks use a versioned{" "}
                <a
                  href="https://www.geoboundaries.org/api/current/gbOpen/MYS/ADM1/"
                  target="_blank"
                  rel="noreferrer"
                >
                  OSM / geoBoundaries administrative boundary dataset
                </a>{" "}
                representing 2017, under ODbL. Contradictory coordinates are
                withheld; this is not a survey-grade boundary service.
              </p>
              <p>
                Your current request stays in this browser’s active page and is
                sent only for the current query. There is no parent account,
                child identity form or automatic contact. This browser remembers
                your last map location and pickup point, plus centres you save.
                Dates and child ages are not saved automatically.
                Viewed and compared centre IDs are remembered here to help suggest other centres.
                In Saved → For you → How suggestions work, you can turn viewing history off or clear it.
                Address searches use OpenStreetMap data through Photon; map tiles
                come from the map provider.
                Driving estimates send only pickup and centre coordinates to the
                OSRM routing service. They use road data without live traffic.
                <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noreferrer"> OSRM / OpenStreetMap routing</a> · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">Fix the map</a>.
              </p>
              <p>
                A registration record or an old listing does not show whether
                a centre can take your child now, or how good the care is.
                Check with the centre before your child goes.
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
