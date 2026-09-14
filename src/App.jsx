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
  Map as MapIcon,
  Check,
  X,
  RotateCcw,
  Sun,
  Moon,
  Info,
  CircleHelp,
} from "lucide-react";
import MapCanvas from "./MapCanvas.jsx";
import Dialog from "./Dialog.jsx";
import DialogPresence from "./DialogPresence.jsx";
import SelectMenu, { SORT_OPTIONS } from "./SelectMenu.jsx";
import TimeInput from "./TimeInput.jsx";
import {
  ProviderCard,
  Details,
  Comparison,
  Status,
  RegistrationBadge,
  OrderingNote,
} from "./ProviderViews.jsx";
import { requestAPI, errorMessage } from "./api.js";
import { requestErrors, todayKL, requestCaption, needsPickupAddress, MAX_SEARCH_RADIUS_KM } from "../shared/request.mjs";
import PlaceInput from "./PlaceInput.jsx";
import { DEFAULT_MAP, readMapMemory, writeMapMemory } from "../shared/map-memory.mjs";
import Preparation from "./Preparation.jsx";
import Enquiry from "./Enquiry.jsx";
import GettingStarted from "./GettingStarted.jsx";
import { tourSeen, saveTour } from "../shared/tour.mjs";
import { feeSummary, drivingLabel } from "../shared/result-summary.mjs";
import {
  SavedLibrary,
  SavedSearchReminder,
  FavouriteEditor,
  TemplateEditor,
  SavedChanges,
} from "./SavedViews.jsx";
import {
  emptyLibrary,
  readLibrary,
  updateLibrary,
  storageKey,
  factSnapshot,
  reuseTemplate,
  matchedSavedPlace,
} from "../shared/saved.mjs";
const EMPTY = [];
const initial = () => ({
  pickup: null,
  date: todayKL(),
  deadline: "",
  end: "",
  age: "",
  transport: "",
  radius: MAX_SEARCH_RADIUS_KM,
  query: "",
  includeUnknown: true,
  includeConflicts: true,
  sort: "distance",
});
const scenario = (r) =>
  r
    ? JSON.stringify([
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
    [mobilePane, setMobilePane] = useState("list"),
    [choosing, setChoosing] = useState(false),
    [theme, setTheme] = useState("light"),
    [labels, setLabels] = useState(true),
    [reduced, setReduced] = useState(
      matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
    [health, setHealth] = useState(null),
    [toast, setToast] = useState(""),
    [mapStatus, setMapStatus] = useState("loading"),
    [library, setLibrary] = useState(emptyLibrary),
    [savedTab, setSavedTab] = useState("favourites"),
    [saveFailure, setSaveFailure] = useState(""),
    [saveEditor, setSaveEditor] = useState(null),
    [templateEditor, setTemplateEditor] = useState(null),
    [reopening, setReopening] = useState(null),
    [reusePlace, setReusePlace] = useState(null),
    [preparation, setPreparation] = useState(null);
  const [tourOpen, setTourOpen] = useState(false);
  const [pickupQueryReset, setPickupQueryReset] = useState(null);
  const [pickupAddress, setPickupAddress] = useState(null), [addressRetry, setAddressRetry] = useState(0);
  const tourOffered = useRef(false), tourSnapshot = useRef(null), tourData = useRef(null), tourSequence = useRef(0), startTourRef = useRef(null);
  const reuseSeq = useRef(0);
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
  const changeLibrary = (change) => {
    try {
      setLibrary(updateLibrary(window.localStorage, mode, change));
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
  const saveTemplate = (item) =>
    changeLibrary((x) => ({
      ...x,
      templates: [...x.templates.filter((p) => p.id !== item.id), item],
    }));
  const editFavourite = (p, from = dialog) => {
    setSaveEditor({ p, from });
    setDialog("save-favourite");
  };
  const editTemplate = (value, from = dialog) => {
    setTemplateEditor({ value, from });
    setDialog("save-template");
  };
  const useTemplate = async (item) => {
    const next = reuseTemplate(item, initial());
    const seq = ++reuseSeq.current;
    requestSeq.current++;
    setBusy(false);
    setDraft(next);
    setReopening(null);
    setErrors({ date: "Choose a new service date." });
    setFailure(null);
    setReusePlace({
      state: "pending",
      message: "Loading your saved pickup place…",
    });
    setFormOpen(true);
    setMobilePane("list");
    close();
    try {
      const response = await requestAPI(mode === "live" ? {
        action: "nearby", mode, center: item.pickup,
      } : {
        action: "places",
        mode,
        query: item.pickup.label,
      });
      if (seq !== reuseSeq.current) return;
      if (mode === "live" || matchedSavedPlace(item.pickup, response.items)) {
        setReusePlace(null);
        showPickup(item.pickup);
      }
      else
        setReusePlace({
          state: "invalid",
          message:
            "This saved pickup place could not be matched to the current directory. Select the public place again; its saved value has not been replaced.",
        });
    } catch {
      if (seq === reuseSeq.current)
        setReusePlace({
          state: "invalid",
          message:
            "We couldn’t check your saved pickup place. Try loading this search again or choose the place on the map.",
        });
    }
  };
  const reopenFavourite = (saved) => {
    requestSeq.current++;
    setBusy(false);
    setReopening(saved);
    setDraft((x) => ({ ...x, date: "" }));
    setErrors({
      date: "Choose a new date to check this centre.",
    });
    setFailure(null);
    setFormOpen(true);
    setMobilePane("list");
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
    requestAPI({ action: "health", mode })
      .then((h) => alive && setHealth(h))
      .catch(() => alive && setHealth({ unavailable: true }));
    if (mode === "demo")
      setDraft({
        ...initial(),
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
    if (results || tourOpen) return;
    let alive = true;
    setNearby(null);
    setNearbyBusy(true);
    setNearbyError(null);
    const timer = setTimeout(() => {
      requestAPI({ action: "nearby", mode, center: browseCenter })
        .then((r) => { if (alive) { setNearby(r); setHealth(r); } })
        .catch((e) => { if (alive) setNearbyError(e); })
        .finally(() => { if (alive) setNearbyBusy(false); });
    }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [mode, browseCenter, results, nearbyReload, tourOpen]);
  useEffect(() => {
    const key = (e) => {
      if (
        introPhase === "ready" &&
        e.key === "/" &&
        !dialog &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)
      ) {
        e.preventDefault();
        setFormOpen(true);
        setMobilePane("list");
        setTimeout(() => document.getElementById("pickup-search")?.focus(), 0);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [dialog, introPhase]);
  const rememberMap = (view, pickup = rememberedPickup.current) => {
    if (tourOpen) return;
    mapView.current = view;
    rememberedPickup.current = pickup;
    try { writeMapMemory(window.localStorage, mode, { ...view, pickup }); } catch { /* Map still works without storage. */ }
  };
  const showPickup = (pickup) => {
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
    if (field === "pickup") {
      reuseSeq.current++;
      setReusePlace(null);
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
    items = results?.items ?? nearby?.items ?? EMPTY,
    active = items.find((p) => p.id === selected);
  const switchMode = (next) => {
    requestSeq.current++;
    dialogSeq.current++;
    reuseSeq.current++;
    setReusePlace(null);
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
    setMobilePane("list");
    const u = new URL(location.href);
    u.searchParams.set("mode", next);
    u.hash = "";
    history.replaceState(null, "", u.pathname + u.search);
  };
  const search = async (e, page = 0, override = null) => {
    e?.preventDefault?.();
    const request = override ?? draft,
      issues = requestErrors(request);
    if (reusePlace) issues.pickup = reusePlace.message;
    setErrors(issues);
    if (Object.keys(issues).length) {
      setFormOpen(true);
      setTimeout(
        () => document.querySelector('[aria-invalid="true"]')?.focus(),
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
      setSelected(r.items[0]?.id ?? null);
      setFormOpen(editedWhilePending);
      setHealth(r);
      setMobilePane("list");
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
    if (fromMap) {
      document.getElementById("card-" + id)?.scrollIntoView({
        block: "nearest",
        behavior: reduced ? "instant" : "smooth",
      });
    }
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
      setMobilePane("list");
      notify("Add your pickup place and care hours to check this centre.");
      setTimeout(() => document.getElementById(draft.pickup ? "deadline" : "pickup-search")?.focus(), 0);
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
      if (seq === dialogSeq.current) setComparison(r);
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
    setPreparation({ p, request });
    setDialogError(null);
    setDialog("preparation");
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
        setPreparation({ p: r.items[0], request: r.request });
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
    if (tourOpen || busy || dialogBusy || reusePlace?.state === "pending") return;
    tourOffered.current = true;
    tourSnapshot.current = { draft, results, selected, compareIds, comparison, compareSort, profile, enquiry, questionSelection, formOpen, mobilePane, choosing, errors, failure, reopening, reusePlace, mapTarget: mapView.current, pickupQuery: document.querySelector("#pickup-search")?.value ?? draft.pickup?.label ?? "", panelScroll: document.querySelector(".discovery-panel")?.scrollTop ?? 0 };
    tourData.current = null;
    requestSeq.current++; dialogSeq.current++; reuseSeq.current++;
    setBusy(false); setDialogBusy(false); setDialog(null); setChoosing(false);
    setTourOpen(true);
  };
  startTourRef.current = startTour;
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
      setFormOpen(s.formOpen); setMobilePane(s.mobilePane); setChoosing(s.choosing);
      setErrors(s.errors); setFailure(s.failure); setReopening(s.reopening); setReusePlace(s.reusePlace);
      setMapTarget(s.mapTarget);
      setPickupQueryReset({ value: s.pickupQuery });
    }
    setTourOpen(false);
    requestAnimationFrame(() => {
      const panel = document.querySelector(".discovery-panel");
      if (panel && s) panel.scrollTop = s.panelScroll;
      document.querySelector(status === "completed" ? "#pickup-search" : ".quick-tour-button")?.focus({ preventScroll: true });
    });
  };
  const showTourStep = async (step) => {
    const seq = ++tourSequence.current;
    setDialog(null); setFormOpen(true); setErrors({}); setFailure(null); setReopening(null); setReusePlace(null);
    setMobilePane(step === 3 ? "map" : "list");
    if (step === 0) return;
    const example = { ...initial(), pickup: { id: "demo-pickup", label: "KL Sentral · tutorial", lat: 3.1341, lng: 101.6865 }, date: todayKL(), deadline: "13:00", end: "18:00", age: "4", transport: "self" };
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
      setResults(r); setSelected(garden.id); setFormOpen(false);
      if (step === 3) { setCompareIds([]); return; }
      if (step === 4) { setProfile({ p: garden, request: r.request }); setDialog("details"); return; }
      if (step === 5) {
        setCompareIds([garden.id, river.id]);
        setComparison({ ...r, items: [garden, river] });
        setCompareSort("distance"); setDialog("compare"); return;
      }
      setEnquiry({ p: garden, request: r.request }); setDialog("enquiry");
    } finally { if (seq === tourSequence.current) setBusy(false); }
  };
  useEffect(() => {
    if (introPhase !== "ready" || mode !== "live" || dialog || tourOpen || tourOffered.current || busy || reusePlace?.state === "pending") return;
    let seen = false;
    try { seen = tourSeen(window.localStorage); } catch { /* A blocked store behaves like a first visit. */ }
    if (seen) { tourOffered.current = true; return; }
    const timer = setTimeout(() => startTourRef.current?.(), 400);
    return () => clearTimeout(timer);
  }, [introPhase, mode, dialog, tourOpen, busy, reusePlace]);
  useEffect(() => {
    if (tourOpen && introPhase !== "ready") finishTour("skipped");
  }, [introPhase]);
  const requestChanged =
    comparison && scenario(comparison.request) !== scenario(activeRequest);
  const retryDialog = () => loadComparison();
  return (
    <main
      className={`equalpath ${theme} mobile-${mobilePane}`}
      data-reduced={reduced}
      data-mode={tourOpen ? "demo" : mode}
      inert={introPhase !== "ready"}
      aria-hidden={introPhase !== "ready" || undefined}
    >
      <a className="skip-link" href="#request-form">
        Skip to your request
      </a>
      <header className="app-header">
        <button
          className="wordmark"
          aria-label="EqualPath home"
          onClick={() => {
            close();
            setMobilePane("list");
            onHome?.();
          }}
        >
          <strong>
            EQUALPATH<span>／</span>
          </strong>
          <small>CHILDCARE IN KL & SELANGOR</small>
        </button>
        <nav aria-label="Main navigation">
          <button
            className={!dialog ? "active" : ""}
            onClick={() => {
              close();
              setMobilePane("list");
            }}
          >
            <small>01</small>DISCOVER
          </button>
          <button
            data-tour="compare"
            className={dialog === "compare" ? "active" : ""}
            onClick={() => loadComparison()}
          >
            <small>02</small>COMPARE <em>{compareIds.length}</em>
          </button>
          <button
            className={dialog === "saved" ? "active" : ""}
            onClick={() => {
              close();
              reloadLibrary();
              setDialog("saved");
            }}
          >
            <small>03</small>SAVED <em>{library.favourites.length + library.templates.length}</em>
          </button>
          <button
            className={dialog === "preparation" ? "active" : ""}
            onClick={() => {
              close();
              setDialog("preparation");
            }}
          >
            <small>04</small>PREPARE
          </button>
        </nav>
        <div className="header-end">
          <button className="quick-tour-button" aria-label="Quick tour" disabled={busy || dialogBusy || reusePlace?.state === "pending"} onClick={startTour}><CircleHelp size={19}/><span>Quick tour</span></button>
          <span className={`data-badge ${mode === "demo" ? "demo" : ""}`}>
            {tourOpen ? "TUTORIAL" : mode === "demo" ? "DEMO" : "KL + SELANGOR"}
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
        aria-label="Find care for this request"
      >
        <div className="intro">
          <div className="eyebrow">
            KL + SELANGOR <span>／ 01</span>
          </div>
          <h1>Find childcare</h1>
          <p>Search by pickup place and care hours.</p>
        </div>
        {tourOpen && <p className="demo-notice">Tutorial · fictional centres and sample details. Your search will be restored when you finish or skip.</p>}
        {mode === "demo" && (
          <p className="demo-notice">
            Controlled examples — fictional providers, times and prices for
            trying daytime and evening care.{" "}
            <button onClick={() => switchMode("live")}>
              Back to real centres
            </button>
          </p>
        )}
        {!tourOpen && <SavedSearchReminder templates={library.templates} onReuse={useTemplate}
          onChoose={() => { setSavedTab("templates"); setDialog("saved"); }}
          disabled={busy || reusePlace?.state === "pending"} />}
        <div className="request-heading">
          <strong>YOUR PICKUP & CARE DETAILS</strong>
          {results && (
            <button onClick={() => setFormOpen((v) => !v)}>
              {formOpen ? "Hide form" : "Edit request"}{" "}
              <SlidersHorizontal size={13} />
            </button>
          )}
        </div>
        {browseSelection && !results && <p className="notice-panel">Checking {browseSelection.name}. Add your care details below.</p>}
        {!formOpen && activeRequest && (
          <div className="compact-request">
            <p>
              <MapPin size={14} />
              {activeRequest.pickup.label}
            </p>
            <div>
              <strong>{activeRequest.date}</strong>
              <span>
                By {activeRequest.deadline} → until {activeRequest.end}
              </span>
            </div>
            <small>
              {activeRequest.age === ""
                ? "Age unspecified"
                : activeRequest.age === "0"
                  ? "Under 1 year"
                  : `Age ${activeRequest.age}`}{" "}
              ·{" "}
              {activeRequest.transport === "self"
                ? "I’ll arrange transport"
                : activeRequest.transport === "institution"
                  ? "Centre pickup"
                  : "Pickup not specified"}
            </small>
          </div>
        )}
        {reopening && (
          <div className="notice-panel">
            <strong>Rechecking {reopening.name}</strong>
            <p>
              Choose a new date to see whether this centre meets your needs.
              We’ll check its latest details.
            </p>
            <button className="text-link" onClick={() => setReopening(null)}>
              Back to a new search
            </button>
            {failure && (
              <SavedChanges saved={reopening} failure={errorMessage(failure)} />
            )}
          </div>
        )}
        {reusePlace && (
          <p className="notice-panel" role="status">
            {reusePlace.message}
          </p>
        )}
        <form
          id="request-form"
          onSubmit={search}
          noValidate
          className={formOpen ? "request-form" : "request-form collapsed"}
        >
          <PlaceInput
            queryReset={pickupQueryReset}
            active={introPhase === "ready" && !dialog && !tourOpen}
            mode={mode}
            value={draft.pickup}
            onChange={(p) => setField("pickup", p)}
            error={errors.pickup}
            onMap={() => {
              setChoosing(true);
              setMobilePane("map");
              notify("Choose your pickup place on the map.");
            }}
          />
          {pickupAddress && <p className="pickup-address-status" role="status">
            {pickupAddress === "loading" ? "Finding the nearby street…" : <>Street address unavailable. Your selected location is kept. <button type="button" className="text-link" onClick={()=>setAddressRetry(n=>n+1)}>Retry address</button></>}
          </p>}
          <div data-tour="care-times">
          <div className="field">
            <label htmlFor="service-date">
              Date <span>Malaysia time</span>
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
          <div className="field-pair">
            <div className="field">
              <label htmlFor="deadline">Collect by</label>
              <TimeInput
                id="deadline"
                label="Collect by"
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
              <label htmlFor="care-end">Care until</label>
              <TimeInput
                id="care-end"
                label="Care until"
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
          </div>
          <div className="field-pair">
            <div className="field">
              <label htmlFor="age">
                Child’s age <span>Optional</span>
              </label>
              <select
                id="age"
                value={draft.age}
                onChange={(e) => setField("age", e.target.value)}
                aria-invalid={!!errors.age}
              >
                <option value="">Not specified</option>
                <option value="0">Under 1 year</option>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? "year" : "years"}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="transport">
                Pickup preference <span>Optional</span>
              </label>
              <select
                id="transport"
                value={draft.transport}
                onChange={(e) => setField("transport", e.target.value)}
              >
                <option value="">Not specified</option>
                <option value="institution">Centre pickup</option>
                <option value="self">I'll arrange delivery</option>
              </select>
            </div>
          </div>
          <details className="search-refinements">
            <summary>
              Refine the search <PlusIcon />
            </summary>
            <div className="field">
              <label htmlFor="provider-query">Centre name or area</label>
              <input
                id="provider-query"
                value={draft.query}
                onChange={(e) => setField("query", e.target.value)}
                placeholder="Optional name / neighbourhood"
              />
            </div>
            <div className="field">
              <label htmlFor="radius">Search radius</label>
              <select
                id="radius"
                value={draft.radius}
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
          <button
            ref={submitRef}
            type="submit"
            className="primary find-button"
            disabled={busy}
          >
            {busy ? (
              <>
                <span className="spinner" />
                Finding care options…
              </>
            ) : (
              <>
                {reopening
                  ? "Check saved centre"
                  : results
                    ? "Update results"
                    : "Find care options"}
                <ArrowRight size={18} />
              </>
            )}
          </button>
          <p className="form-foot">
            No account needed. Just tell us where and when.
          </p>
        </form>
        <div className="request-save-actions">
          <button
            className="text-link"
            onClick={() => editTemplate({ ...draft }, null)}
          >
            Save this search
          </button>
          <button className="text-link" onClick={() => { setSavedTab("templates"); setDialog("saved"); }}>
            Saved searches
          </button>
        </div>
        {failure && (
          <div className="error-box" role="alert">
            <strong>Search unavailable</strong>
            <p>{errorMessage(failure)}</p>
            <button className="text-link" onClick={() => search(null)}>
              Retry search <RotateCcw size={13} />
            </button>
          </div>
        )}
        {results && (dirty || busy) && (
          <div className="earlier-results" role="status">
            <strong>
              {busy ? "Updating results…" : "Showing the earlier request"}
            </strong>
            <p>{requestCaption(results.request)}</p>
            {!busy && (
              <button onClick={() => search(null)}>
                Apply edited request <ArrowRight size={12} />
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
                options={SORT_OPTIONS}
                available={results.ordering?.available}
                onChange={(sort) => {
                  const r = { ...draft, sort };
                  setDraft(r);
                  search(null, 0, r);
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
            {results.total > 20 && (
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
                  {results.page * 20 + 1}–
                  {Math.min((results.page + 1) * 20, results.total)} /{" "}
                  {results.total}
                </span>
                <button
                  disabled={
                    busy || dirty || (results.page + 1) * 20 >= results.total
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
            <p>{mapRestored ? "Back to your last map location." : "Explore centres around the map location."} Add care hours to check whether they fit.</p>
            {nearbyBusy && <p role="status">Finding nearby centres…</p>}
            {nearbyError && <p role="status">{errorMessage(nearbyError)} <button className="text-link" onClick={() => setNearbyReload((v) => v + 1)}>Retry nearby centres</button></p>}
            {!nearbyBusy && nearby && <p>{nearby.total} centres within {nearby.radius} km · showing {nearby.items.length}</p>}
            {!nearbyBusy && nearby?.total === 0 && <p>No centres nearby. Choose another pickup place.</p>}
            {items.map((p) => <button key={p.id} id={"card-" + p.id} className={`nearby-card ${selected === p.id ? "selected" : ""}`} onClick={() => select(p.id)} aria-label={`Select ${p.name}`} aria-pressed={selected === p.id}>
              <strong>{p.name}</strong><span>{[p.district, p.region].filter(Boolean).join(" · ")}</span><span>Fees · {feeSummary(p).label}</span>
            </button>)}
          </div>
        )}
        <footer className="panel-footer">
          <span className="connection-dot" />
          {mode === "demo"
            ? "Fictional examples"
            : health && !health.unavailable
              ? `${health.available.toLocaleString()} centres in the directory`
              : "Loading the directory…"}
          <button onClick={() => setDialog("sources")}>Data & sources</button>
        </footer>
      </aside>
      <div className="map-wrap">
        <MapCanvas
          key={mode}
          items={items}
          viewTarget={mapTarget}
          autoFit={!!results}
          onViewChange={(view) => {
            if (tourOpen) return;
            rememberMap(view);
          }}
          onChoose={() => { setChoosing(true); setMobilePane("map"); }}
          onCancel={() => { setChoosing(false); setMobilePane("list"); }}
          pickup={
            choosing ? draft.pickup : (activeRequest?.pickup ?? draft.pickup)
          }
          selected={selected}
          onSelect={select}
          onPick={(p) => {
            setField("pickup", p);
            setChoosing(false);
            setMobilePane("list");
            setFormOpen(true);
            notify(
              "Pickup selected. Finding the nearby street address…",
            );
          }}
          choosing={choosing}
          theme={theme}
          reduced={reduced}
          labels={labels}
          visible={mobilePane === "map"}
          onStatus={setMapStatus}
          introPhase={introPhase}
          introArea={introArea}
          introReduced={introReduced}
        />
        {active && !choosing && (
          <div className="map-preview">
            <span className="eyebrow">SELECTED CENTRE</span>
            <h3>{active.name}</h3>
            <p>
              {active.address || `${active.district} · ${active.region}`}
            </p>
            {active.fit && <p>{drivingLabel(active.driving)} · Fees: {feeSummary(active).label}</p>}
            <div>
              {active.fit ? <Status
                state={active.fit.counts.conflict ? "conflict" : "unknown"}
              /> : null}
              <button onClick={() => openDetails(active)}>
                {active.fit ? "Check conditions" : "Check this centre"} <ArrowUpRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="mobile-view-switch">
        <button
          aria-pressed={mobilePane === "list"}
          onClick={() => setMobilePane("list")}
        >
          <List size={17} />
          Search & results
        </button>
        <button
          aria-pressed={mobilePane === "map"}
          onClick={() => setMobilePane("map")}
        >
          <MapIcon size={17} />
          Map
        </button>
      </div>
      {compareIds.length > 0 && (
        <div className="compare-tray">
          <span>{compareIds.length} / 3 selected</span>
          <button onClick={() => loadComparison()}>
            Compare childcare <ArrowRight size={16} />
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
          {toast}
        </div>
      )}
      <DialogPresence immediate={reduced || introReduced || tourOpen}>
      {dialog && (
        <Dialog
          tourBehind={tourOpen}
          className={dialog === "details" ? "centre-dialog" : dialog === "preparation" ? "preparation-dialog" : dialog === "enquiry" ? "enquiry-dialog" : ""}
          titleAccessory={dialog === "details" && profile ? <RegistrationBadge p={profile.p} /> : null}
          title={
            dialog === "saved"
              ? "Saved for later"
              : dialog === "save-favourite"
                ? "Save this centre"
                : dialog === "save-template"
                  ? "Save this search"
                  : dialog === "preparation"
                    ? "Get ready for care"
                    : dialog === "details"
                      ? profile?.p.name
                      : dialog === "compare"
                        ? "Compare childcare"
                        : dialog === "enquiry"
                          ? "Questions for the centre"
                          : dialog === "settings"
                            ? "Display settings"
                            : dialog === "ordering"
                              ? "Why this order?"
                              : "About our information"
          }
          kicker={
            dialog === "preparation"
              ? "YOUR VISIT"
              : ["saved", "save-template", "save-favourite"].includes(dialog)
                ? "YOUR SAVED ITEMS"
                : dialog === "details"
                  ? "CENTRE DETAILS"
                  : dialog === "enquiry"
                    ? "BEFORE YOU GET IN TOUCH"
                    : dialog === "compare"
                      ? "YOUR SHORTLIST"
                      : "EQUALPATH / INFORMATION"
          }
          wide={["compare", "details", "preparation", "saved", "enquiry"].includes(dialog)}
          onClose={close}
        >
          {dialog === "saved" && (
            <SavedLibrary
              tab={savedTab}
              setTab={setSavedTab}
              library={library}
              failure={saveFailure}
              onRetry={reloadLibrary}
              onReuse={useTemplate}
              onReopen={reopenFavourite}
              onEditFavourite={(p) => editFavourite(p, "saved")}
              onEditTemplate={(t) => editTemplate(t, "saved")}
              onDelete={(type, id) =>
                changeLibrary((x) => ({
                  ...x,
                  [type]: x[type].filter((p) => p.id !== id),
                }))
              }
              onDiscover={close}
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
          {dialog === "save-template" && templateEditor && (
            <TemplateEditor
              mode={mode}
              value={templateEditor.value}
              onSave={saveTemplate}
              onCancel={() => setDialog(templateEditor.from)}
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
                    key={preparation.p.id + scenario(preparation.request)}
                    p={preparation.p}
                    request={preparation.request}
                    currentRequest={activeRequest}
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
                    ? "You’ve selected one childcare option. Choose another to compare fees, care hours and pickup."
                    : "Tap Compare on two or three childcare options to see them side by side."}
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
                    <p className="dialog-context">
                      {requestCaption(comparison.request)}
                    </p>
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
                        date={comparison.request.date}
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
                  questionSelection[enquiry.p.id + scenario(enquiry.request)]
                }
                onSelection={(ids) =>
                  setQuestionSelection((x) => ({
                    ...x,
                    [enquiry.p.id + scenario(enquiry.request)]: ids,
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
                or guarantee a place.
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
                  onChange={(e) => setReduced(e.target.checked)}
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
                Published care end times are used for this check. Specific care
                schedules and date exceptions take precedence. Transport
                coverage and actual acceptance are checked separately. Road-network
                drive times are estimates; live vacancy is not inferred.
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
                your last map location and pickup point, plus any centres and
                templates you save. Dates and child ages are not saved automatically.
                Place searches use OpenStreetMap data through Photon; map tiles
                come from the map provider.
                Driving estimates send only pickup and centre coordinates to the
                OSRM routing service. They use road data without live traffic.
                <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noreferrer"> OSRM / OpenStreetMap routing</a> · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">Fix the map</a>.
              </p>
              <p>
                Registration and historical listings do not prove present
                availability, suitability or care quality. Contact the specific
                institution to confirm the arrangement.
              </p>
              <button
                className="secondary"
                onClick={() => switchMode(mode === "live" ? "demo" : "live")}
              >
                {mode === "live"
                  ? "Try demo centres"
                  : "Return to real directory"}
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
