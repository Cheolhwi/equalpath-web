// On-device AI for Ask for me (13 Oct 2026, user: "弄一个本地浏览器的llm…要有多层fallback").
// Answers are tried in this order, and each answer is checked before it is
// shown (no time, date or amount that the listing doesn't have, no promise of
// a place):
//   1. Chrome's built-in AI (Prompt API), when this browser has it;
//   2. an open Qwen3.5 / Qwen3 model run in the browser with WebLLM (WebGPU), downloaded
//      once from Hugging Face after the parent asks for it, then kept in this
//      browser's cache — the largest one the device can take first, a smaller
//      one if that fails (13 Oct 2026, user: "qwen2.5-1.5b也太蠢了…qwen 3的不行吗");
//   3. the listing rules in shared/centre-answers.mjs, which always answer.
// Questions never leave the device.
import { inventedFacts, offListing, promisesPlace } from "../shared/centre-answers.mjs";

const LM_OPTIONS = { expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] };
// Qwen3.5 first (13 Oct 2026, user: "用qwen3.5可以吗"), Qwen3 if it won't run.
export const MODELS = [
  { id: "Qwen3.5-4B-q4f16_1-MLC", size: "about 2.5 GB" },
  { id: "Qwen3.5-2B-q4f16_1-MLC", size: "about 1.3 GB" },
  { id: "Qwen3.5-0.8B-q4f16_1-MLC", size: "about 550 MB" },
  { id: "Qwen3-1.7B-q4f16_1-MLC", size: "about 1 GB" },
  { id: "Qwen3-0.6B-q4f16_1-MLC", size: "about 400 MB" },
];
const byId = (id) => MODELS.find((m) => m.id === id);
const modelUrl = (id) => `https://huggingface.co/mlc-ai/${id}/resolve/main/`;
// Computers with plenty of memory start with Qwen3.5-4B, smaller computers
// with Qwen3.5-2B, phones with Qwen3.5-0.8B; each falls back to smaller ones.
const TIERS = {
  large: ["Qwen3.5-4B-q4f16_1-MLC", "Qwen3.5-2B-q4f16_1-MLC", "Qwen3-1.7B-q4f16_1-MLC"],
  medium: ["Qwen3.5-2B-q4f16_1-MLC", "Qwen3-1.7B-q4f16_1-MLC", "Qwen3-0.6B-q4f16_1-MLC"],
  phone: ["Qwen3.5-0.8B-q4f16_1-MLC", "Qwen3-0.6B-q4f16_1-MLC"],
};
const tier = () => {
  try {
    if (matchMedia("(max-width: 760px)").matches) return "phone";
    return navigator.deviceMemory && navigator.deviceMemory < 8 ? "medium" : "large";
  } catch { return "medium"; }
};
const order = () => TIERS[tier()].map(byId);
export const firstModel = () => order()[0];

let state = { chrome: "unknown", web: "unknown", model: null, progress: null, note: "" };
const listeners = new Set();
const set = (patch) => { state = { ...state, ...patch }; listeners.forEach((fn) => fn(state)); };
export const aiState = () => state;
export function onAiState(fn) { listeners.add(fn); return () => listeners.delete(fn); }

const debug = (what) => { try { console.info(`[Ask for me] ${what}`); } catch { /* optional */ } };

// What this browser can do, without downloading anything.
let detecting = null;
export function detectAi() {
  detecting ??= (async () => {
    set({ chrome: "checking", web: "checking" });
    let chrome = "unavailable";
    try { const LM = globalThis.LanguageModel; if (LM?.availability) chrome = await LM.availability(LM_OPTIONS); } catch { chrome = "unavailable"; }
    set({ chrome: ["available", "downloadable", "downloading"].includes(chrome) ? chrome : "unavailable" });
    let web = "unavailable";
    try {
      const adapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
      if (adapter) {
        web = "available";
        const cache = await caches.open("webllm/model");
        for (const m of MODELS) if (await cache.match(new URL("tensor-cache.json", modelUrl(m.id)).href)) { web = "cached"; set({ model: m }); break; }
      }
    } catch { /* no WebGPU or no cache access */ }
    set({ web });
  })();
  return detecting;
}

// When a chat opens: a model downloaded earlier is loaded from the cache.
export async function prepareAiForChat() {
  await detectAi();
  if (state.web === "cached") void enableWebModel();
}

// On a visit (13 Oct 2026, user: "设计成用户访问浏览器自动下载的"): the model downloads in
// the background once the page has settled, so it's ready when the parent
// asks. Not on mobile data or with Data Saver on, and a model downloaded
// earlier waits until a chat opens (loading it takes a lot of graphics memory).
let autoStarted = false;
export function autoStartAi() {
  if (autoStarted || typeof window === "undefined") return;
  autoStarted = true;
  const conn = navigator.connection;
  if (conn?.saveData || conn?.type === "cellular" || /(^|-)2g$/.test(conn?.effectiveType ?? "")) { debug("No automatic model download on mobile data or Data Saver."); return; }
  const go = async () => {
    await detectAi();
    // Qwen downloads even when Chrome's AI is there (13 Oct 2026, user: "即使有 Chrome AI，
    // 也照样在后台下载 Qwen 备用…多层fallback"): it answers Chinese, and backs Chrome up.
    if (state.web !== "available") return;
    debug(`Downloading ${firstModel().id} in the background.`);
    void enableWebModel();
  };
  const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 4000));
  setTimeout(() => idle(go, { timeout: 10000 }), 3000);
}

// Chrome's model downloads only after a click (the browser requires it).
export async function enableChromeAi() {
  const LM = globalThis.LanguageModel;
  if (!LM?.create) return false;
  set({ chrome: "downloading", progress: 0, note: "" });
  try {
    const s = await LM.create({ ...LM_OPTIONS, monitor(m) { m.addEventListener("downloadprogress", (e) => set({ progress: Math.round((e.loaded ?? 0) * 100) })); } });
    s.destroy?.();
    set({ chrome: "available", progress: null });
    return true;
  } catch (e) { debug(`Chrome AI could not start: ${e?.message ?? e}`); set({ chrome: "unavailable", progress: null, note: "Chrome’s AI couldn’t start on this device." }); return false; }
}

let engine = null, loadingEngine = null;
export function enableWebModel() {
  loadingEngine ??= (async () => {
    const { CreateWebWorkerMLCEngine } = await import("@mlc-ai/web-llm");
    const tries = state.model ? [state.model, ...order().filter((m) => m.id !== state.model.id)] : order();
    for (const m of tries) {
      set({ web: "loading", model: m, progress: 0, note: "" });
      try {
        engine = await CreateWebWorkerMLCEngine(new Worker(new URL("./llm-worker.js", import.meta.url), { type: "module" }), m.id,
          { initProgressCallback: (r) => set({ progress: Math.round((r.progress ?? 0) * 100) }) });
        set({ web: "ready", progress: null });
        return true;
      } catch (e) { debug(`${m.id} could not load: ${e?.message ?? e}`); engine = null; }
    }
    set({ web: "failed", progress: null, note: "The AI model couldn’t run in this browser, so answers come from the listing." });
    loadingEngine = null;
    return false;
  })();
  return loadingEngine;
}

// A short prompt (13 Oct 2026, user: "回答太机械了…system prompt…对于小模型建议设计的短一点"):
// small models follow a few plain rules better than a long list.
const system = (facts) => [
  "You are EqualPath's friendly helper for a parent in Kuala Lumpur planning a few hours of childcare.",
  "Answer only from the FACTS, warmly and naturally in 2-3 sentences: start with the direct answer, pick the one or two facts that matter most (never list them all), and link them to the parent's visit.",
  "If the FACTS don't say, say so and suggest asking the centre. Never say there is a place or a booking.",
  "Keep times and amounts exactly as written. No lists, no emojis, no role-play. Reply in the parent's language.",
  "If the question isn't about these centres, reply only: OFF_TOPIC",
  "FACTS:", ...facts.map((f) => `- ${f.text ?? f}`),
].join("\n");

// An answer is shown only if it keeps to the facts.
// The parent's language (13 Oct 2026, user: "用户问英文就是英文，问中文就是中文").
export const questionLanguage = (q) => (/[\u4e00-\u9fff]/.test(q) ? "zh" : "en");
const LANGUAGE_HINT = { zh: "\n\n(Reply in Simplified Chinese.)", en: "\n\n(Reply in English.)" };
export function answerProblem(text, facts, lang = "en") {
  if (!text || text.length < 4 || text.length > 1200) return "length";
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  if (lang === "zh" && cjk < 4) return "didn't answer in Chinese";
  if (lang === "en" && cjk > 0) return "didn't answer in English";
  if (/\bas an ai\b|language model|<\/?think>/i.test(text)) return "talked about itself";
  if (/\bOFF_TOPIC\b/.test(text)) return "said it was off topic";
  if (promisesPlace(text)) return "promised a place";
  const off = offListing(text, facts, lang);
  if (off) return off;
  const extra = inventedFacts(text, facts);
  return extra.length ? `added ${extra.join(", ")}` : null;
}

const chromeSessions = new Map();
async function askChrome(key, facts, question) {
  const LM = globalThis.LanguageModel;
  if (state.chrome !== "available" || !LM?.create) return null;
  let s = chromeSessions.get(key);
  if (!s) { s = LM.create({ ...LM_OPTIONS, initialPrompts: [{ role: "system", content: system(facts) }] }); chromeSessions.set(key, s); }
  const session = await s;
  return (await session.prompt(question, { signal: AbortSignal.timeout(20000) })).trim();
}
async function askWeb(facts, question, history) {
  if (state.web !== "ready" || !engine) return null;
  const run = engine.chat.completions.create({
    messages: [{ role: "system", content: `${system(facts)}\nAnswer in the same language as the question.` }, ...(state.model?.id.startsWith("Qwen3.5") ? [] : history.slice(-4)), { role: "user", content: question }],
    temperature: 0.4, max_tokens: 260,
    // Qwen3 answers straight away instead of "thinking" first.
    extra_body: { enable_thinking: false },
  });
  const reply = await Promise.race([run, new Promise((_, no) => setTimeout(() => no(new Error("took too long")), 45000))]);
  return reply?.choices?.[0]?.message?.content?.replace(/<think>[\s\S]*?<\/think>/g, "").trim() ?? null;
}

// The first layer that gives an answer that keeps to the facts, in the
// parent's language; null means "use the listing rules". English goes to
// Chrome's AI first; Chinese goes to Qwen first (Chrome's model is made for
// English), and asks Qwen to start downloading if it isn't there yet.
export async function askLocalAi(key, facts, question, history = []) {
  const lang = questionLanguage(question), asked = question + LANGUAGE_HINT[lang];
  if (lang === "zh" && state.web === "available" && !loadingEngine) void enableWebModel();
  const chrome = ["chrome", () => askChrome(key, facts, asked)], web = ["web", () => askWeb(facts, asked, history)];
  for (const [via, run] of lang === "zh" ? [web, chrome] : [chrome, web]) {
    try {
      const text = await run();
      if (text == null) continue;
      const why = answerProblem(text, facts, lang);
      if (!why) return { text, via, lang };
      debug(`${via === "chrome" ? "Chrome AI" : "WebLLM"} answer not shown: ${why}`);
    } catch (e) { debug(`${via === "chrome" ? "Chrome AI" : "WebLLM"} failed: ${e?.message ?? e}`); }
  }
  return null;
}

export function forgetAiChat(key) {
  const s = chromeSessions.get(key);
  chromeSessions.delete(key);
  s?.then((x) => x.destroy?.(), () => {});
}
export function forgetAllAiChats() { for (const k of [...chromeSessions.keys()]) forgetAiChat(k); }
