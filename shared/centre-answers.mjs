// Ask for me (13 Oct 2026, user: "把ask for me改成本地网页ai模型去基于我们的childcare信息去回答用户的问题"):
// answers come only from what EqualPath lists about a centre. These are the
// facts (one line each, grouped by topic) and the rules that answer when no
// on-device model is available. Nothing here contacts a centre or guesses
// whether a place is free.
import { applicableWindows } from "./conditions.mjs";
import { feeSummary, feesForCare, formatFee } from "./result-summary.mjs";
import { categoryLabel, displayAddress, displayName } from "./display.mjs";
import { plainReason } from "./plain-copy.mjs";
import { centreExtras } from "./preparation.mjs";
import { DISCOVERY_PREFERENCES, reviewTopicEvidence } from "./review-profile.mjs";

const clock = (n) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const day = (date) => { try { return new Date(`${date}T12:00:00+08:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" }); } catch { return date; } };
const DAY_NAMES = { MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu", FRI: "Fri", SAT: "Sat", SUN: "Sun" };
const months = (m) => m % 12 === 0 ? `${m / 12} year${m === 12 ? "" : "s"}` : m < 24 ? `${m} months` : `${Math.floor(m / 12)} years ${m % 12} months`;
// The visit checks worth repeating, with the topic each one answers.
const CHECKS = { age: ["Age", "age"], admission: ["Care for a few hours", "about"], opening: ["Care starts at", "hours"], care: ["Care ends at", "hours"],
  transport: ["Centre pickup", "pickup"], coverage: ["Pickup area", "pickup"], pickup: ["Pickup time", "pickup"] };
const STATE = { supported: "fits", conflict: "doesn’t fit", unknown: "not listed — ask the centre", reference: "for reference" };

export const TOPICS = ["place", "visit", "fees", "extras", "hours", "age", "pickup", "drive", "address", "contact", "reviews", "registration", "about"];

// Each request is one child's visit (deadline = care start, end = collection).
export function listingFacts(p, requests = []) {
  const facts = [], add = (topic, text, also = null) => { if (text) facts.push({ topic, text: String(text).replace(/\s+/g, " ").trim(), ...(also ? { also } : {}) }); };
  const name = displayName(p.name), date = requests[0]?.date;
  add("about", `${name} is a ${categoryLabel(p)}${p.district ? ` in ${p.district}` : ""}.`);
  for (const n of p.notes ?? []) add("about", n);
  if (p.admission?.wording) add("about", `Short visits: ${p.admission.wording}`);
  else if (p.admission?.value === false) add("about", "The listing says it doesn’t take children for a few hours.");
  add("address", p.address && `Address: ${displayAddress(p.address)}.`);
  // Hours on the visit day, then the week.
  const windows = (w) => (w ?? []).map((x) => `${clock(x.start)}–${clock(x.end)}`).join(" and ");
  let onDay = "";
  if (date) {
    const care = applicableWindows(p.careWindows?.length ? p.careWindows : p.businessHours?.windows, date);
    onDay = windows(care);
    add("hours", care.length ? `On ${day(date)} the listed ${p.careWindows?.length ? "care" : "opening"} hours are ${onDay}.` : null);
    if (!care.length && (p.businessHours?.windows?.length || p.careWindows?.length)) add("hours", `No hours are listed for ${day(date)}.`);
  }
  if (p.businessHoursLabel && p.businessHoursLabel !== onDay) add("hours", `Opening hours: ${p.businessHoursLabel}.`);
  const ends = p.careEndTimeLabel && !onDay.endsWith(p.careEndTimeLabel) && p.careEndTimeLabel !== p.businessHoursLabel;
  if (ends) add("hours", `Care ends at: ${p.careEndTimeLabel}.`);
  if (p.businessHours?.closedDays?.length) add("hours", `Closed: ${p.businessHours.closedDays.map((d) => DAY_NAMES[d] ?? d).join(", ")}.`);
  if (Number.isFinite(p.lateRule?.latestEnd) && !onDay.endsWith(clock(p.lateRule.latestEnd))) add("hours", `Latest collection listed: ${clock(p.lateRule.latestEnd)}.`);
  if (p.lateRule?.wording) add("hours", `Late collection: ${p.lateRule.wording}.`);
  // Ages.
  if (p.age?.wording) add("age", `Ages taken: ${p.age.wording}.`);
  else if (Number.isFinite(p.age?.min) || Number.isFinite(p.age?.max))
    add("age", `Ages taken: ${Number.isFinite(p.age.min) ? `from ${months(p.age.min)}` : ""}${Number.isFinite(p.age.max) ? ` ${p.age.maxInclusive ? "up to" : "under"} ${months(p.age.max)}` : ""}.`);
  // Fees.
  const fee = feeSummary(p);
  if (p.cost?.available) add("fees", `Estimated total for this visit: ${fee.label.replace(/ estimated total$/, "")}, before any extra charges.`);
  for (const f of feesForCare(p).slice(0, 4)) add("fees", `Listed fee: ${formatFee(f)}${f.conditions && !/Extra charges:|Registration fee:/.test(f.conditions) ? ` (${f.conditions.replace(/\.$/, "")})` : ""}.`);
  if (!p.cost?.available && !feesForCare(p).length) add("fees", "No short-visit price is listed.");
  if (p.feeRule?.minimumMinutes) add("fees", `Minimum charge: ${p.feeRule.minimumMinutes / 60} hour${p.feeRule.minimumMinutes === 60 ? "" : "s"}.`);
  if (p.feeRule?.includedExtras?.length) add("extras", `Included in the price: ${p.feeRule.includedExtras.join(", ")}.`);
  for (const x of centreExtras(p).parts) add("extras", `Extra charge listed: ${x.text}.`);
  // Getting there.
  if (p.transport?.exists === true) add("pickup", `Pickup service: ${p.transport.wording ?? "listed"}`);
  else if (p.transport?.exists === false) add("pickup", "The centre doesn’t list a pickup service.");
  if (p.transport?.coverage?.wording) add("pickup", `Pickup area: ${p.transport.coverage.wording}`);
  if (p.pickupWindows?.length) add("pickup", `Pickup times listed: ${windows(p.pickupWindows)}.`);
  if (p.driving?.state === "available" && Number.isFinite(p.driving.minutes)) add("drive", `About ${p.driving.minutes} min by car from your starting point (no traffic).`);
  // Contacts.
  if (p.phone?.display) add("contact", `Phone: ${p.phone.display}.`);
  for (const w of p.whatsapp ?? []) add("contact", `WhatsApp: ${w.display}.`);
  if (p.website) add("contact", `Website: ${p.website}`);
  if (!p.phone && !(p.whatsapp ?? []).length) add("contact", "No phone or WhatsApp number is listed.");
  // This visit, as checked against the listing.
  const selfDrive = requests.length && requests.every((r) => r.transport !== "institution");
  for (const c of p.fit?.conditions ?? []) if (CHECKS[c.id] && STATE[c.state] && !(selfDrive && CHECKS[c.id][1] === "pickup"))
    add("visit", `For your visit — ${CHECKS[c.id][0]}: ${STATE[c.state]}${c.reason ? ` (${plainReason(c.reason).replace(/\.$/, "")})` : ""}.`, CHECKS[c.id][1]);
  if (requests.length) add("visit", `Your visit: ${day(date)}, ${requests.map((r, i) => `${requests.length > 1 ? `${r.label ?? `Child ${i + 1}`} ` : ""}${r.deadline}–${r.end}${r.age !== "" && r.age != null ? `, age ${r.age === "0" ? "under 1" : r.age}` : ""}`).join("; ")}.`);
  // What parents say (13 Oct 2026, user: the answer listed every topic): only
  // the few themes mentioned most, with how many reviews there are.
  const { praised, concerns, total } = reviewThemes(p);
  if (praised.length) add("reviews", `Across ${total ? `${total} parent reviews` : "parent reviews"}, the things praised most in the past year: ${praised.map((x) => `${x.label} (${x.n} mentions)`).join(", ")}.`);
  if (concerns.length) add("reviews", `Recent reviews also raise: ${concerns.map((x) => `${x.label} (${x.n} complaints)`).join(", ")}.`);
  else if (praised.length) add("reviews", "No complaint comes up repeatedly in recent reviews.");
  if (!praised.length && !concerns.length) add("reviews", "There aren’t enough recent parent reviews to say much.");
  if (p.registration?.authority) add("registration", `Registration: ${p.registration.authority}${p.registration.number ? ` ${p.registration.number}` : ""}${p.registration.until ? `, valid until ${p.registration.until}` : ""}.`);
  add("place", "EqualPath can’t see whether there is a place on your date. Only the centre can say.");
  return facts;
}

// Which topics a question is about (English, Chinese and Malay words).
const WORDS = {
  place: /\b(place|places|space|vacan\w*|availab\w*|slot|book\w*|full|accept\w*|kosong|tempat)\b|名额|空位|位置|有位|预约|订/i,
  fees: /\b(fee|fees|price|prices|cost|costs|charge|charges|pay|rm|myr|rate|expensive|cheap|how much|harga|bayar|yuran|kos)\b|费用|学费|收费|免费|价格|价钱|多少钱|贵|便宜|钱/i,
  extras: /\b(extra|extras|meal|meals|food|lunch|snack|diaper|diapers|nappy|registration fee|deposit|materials?|socks?|included|makan)\b|额外|饭|餐|午餐|尿布|押金|包含/i,
  hours: /\b(hour|hours|open|opens|opening|close|closes|closing|time|times|late|until|when|weekend|saturday|sunday|jam|buka|tutup)\b|几点|时间|营业|开门|关门|周末|晚/i,
  age: /\b(age|ages|old|year|years|month|months|baby|babies|infant|toddler|umur|bayi)\b|年龄|岁|婴儿|宝宝/i,
  pickup: /\b(pick ?up|collect|transport|bus|van|fetch|drop ?off|ambil|hantar)\b|接送|来接|接孩子|送孩子|校车|载/i,
  drive: /\b(drive|driving|far|distance|minutes?|car|traffic|jauh)\b|开车|多远|距离|车程/i,
  address: /\b(address|where|location|located|parking|park|alamat|mana)\b|地址|在哪|位置在|停车/i,
  contact: /\b(phone|call|number|contact|whatsapp|website|email|telefon|hubungi)\b|电话|联系|微信|网站/i,
  reviews: /\b(review|reviews|parents? say|rating|teacher|teachers|staff|clean|safe|safety|good|bad|quality|recommend|guru)\b|评价|口碑|老师|干净|安全|好不好|怎么样/i,
  registration: /\b(regist\w*|licen[cs]\w*|jkm|kpm|certified|approved|permit|daftar|lesen)\b|注册|执照|认证|牌照/i,
  visit: /\b(fit|fits|suit|suits|my child|my son|my daughter|this visit|work for|ok for|can (?:i|we|my))\b|适合|可以吗|行不行|我的孩子/i,
  about: /\b(what is|about|type|kind|programme|program|activities|tell me)\b|介绍|是什么|活动/i,
};
export function topicsOf(question) {
  const q = String(question ?? "");
  return TOPICS.filter((t) => WORDS[t]?.test(q));
}

// A plain answer from the listing, in friendly sentences (13 Oct 2026, user:
// "回答太机械了"). `found` is false when the listing has nothing on the question.
const and = (xs) => xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;
const CHECK_WORDS = { age: "your child’s age", admission: "care for a few hours", opening: "the start time", care: "the collection time", transport: "the centre’s pickup", coverage: "the pickup area", pickup: "the pickup time" };
const KIND = { TASKA: "a TASKA (a registered childcare centre for young children)", TADIKA: "a TADIKA (a kindergarten for 4–6 year olds)", TABIKA: "a TABIKA (a community kindergarten)" };
function sentences(p, requests) {
  const name = displayName(p.name), date = requests[0]?.date, r = requests[0], two = requests.length > 1;
  const visit = r ? (two ? requests.map((x, i) => `${x.label ?? `Child ${i + 1}`} ${x.deadline}–${x.end}`).join(" and ") : `${r.deadline}–${r.end}`) : "";
  const checks = (p.fit?.conditions ?? []).filter((c) => CHECK_WORDS[c.id] && !(requests.every((x) => x.transport !== "institution") && ["transport", "coverage", "pickup"].includes(c.id)));
  const fit = (id) => checks.find((c) => c.id === id);
  const reason = (c) => plainReason(c.reason ?? "").replace(/\.$/, "");
  const phone = p.phone?.display, wa = (p.whatsapp ?? []).map((w) => w.display);
  const contact = phone && wa.length ? `You can call ${phone} or WhatsApp ${wa[0]}.` : phone ? `You can call them on ${phone}.` : wa.length ? `You can WhatsApp them on ${wa[0]}.` : p.website ? `There’s no phone number listed, but their website is ${p.website}.` : "There’s no phone or WhatsApp number listed, sadly.";
  const care = date ? applicableWindows(p.careWindows?.length ? p.careWindows : p.businessHours?.windows, date) : [];
  const open = care.map((w) => `${clock(w.start)}–${clock(w.end)}`).join(" and ");
  const fees = feesForCare(p), extras = centreExtras(p).parts;
  const { praised, concerns, total } = reviewThemes(p);
  return {
    about: () => `${name} is ${KIND[p.category] ?? `a ${categoryLabel(p).toLowerCase()}`}${p.district ? ` in ${p.district}` : ""}.${p.admission?.value === true ? " It offers care for just a few hours." : p.admission?.value === false ? " Its listing says it doesn’t take children for just a few hours." : ""}`,
    visit: () => {
      if (!checks.length) return `I don’t have enough from the listing to check your visit${date ? ` on ${day(date)}` : ""}.`;
      const good = checks.filter((c) => c.state === "supported"), bad = checks.filter((c) => c.state === "conflict"), ask = checks.filter((c) => c.state === "unknown");
      return [
        good.length ? `${bad.length ? "For" : "Good news — for"} your visit${date ? ` on ${day(date)}` : ""}${visit ? ` (${visit})` : ""}, ${and(good.map((c) => CHECK_WORDS[c.id]))} ${good.length > 1 ? "all fit" : "fits"} what the centre lists.` : "",
        ...bad.map((c) => `${c === bad[0] && good.length ? "But " : ""}${reason(c)}.`),
        ask.length ? `You’ll still want to ask them about ${and(ask.map((c) => CHECK_WORDS[c.id]))}.` : "",
      ].filter(Boolean).join(" ");
    },
    fees: () => {
      const rate = fees[0] ? formatFee(fees[0]).replace(" / hour", " an hour").replace(" / day", " a day").replace(" / visit", " a visit").replace(" / session", " a session") : null;
      const min = p.feeRule?.minimumMinutes ? `, ${p.feeRule.minimumMinutes / 60}-hour minimum` : "";
      if (p.cost?.available) return `For your visit it should come to about ${p.cost.currency ?? "MYR"} ${p.cost.total}${rate ? ` (${rate}${min})` : ""}, before any extra charges.`;
      if (rate) return `The listed price is ${rate}${min}. Ask the centre for the exact total for your visit.`;
      return "There’s no short-visit price listed, so it’s best to ask the centre what it would cost.";
    },
    extras: () => [
      p.feeRule?.includedExtras?.length ? `The price includes ${and(p.feeRule.includedExtras.map((x) => x.toLowerCase()))}.` : "",
      extras.length ? `Extra charges listed: ${and(extras.map((x) => x.text))}.` : "",
    ].filter(Boolean).join(" ") || "The listing doesn’t mention any extra charges — worth double-checking with them.",
    hours: () => {
      const c = fit("care"), o = fit("opening"), bad = [o, c].filter((x) => x?.state === "conflict");
      const base = open ? `On ${day(date)} it’s open ${open}` : p.businessHoursLabel ? `It’s open ${p.businessHoursLabel}` : "The listing doesn’t show its hours";
      if (bad.length) return `${base}. ${bad.map((x) => `${reason(x)}.`).join(" ")}`;
      return `${base}${(o?.state === "supported" || c?.state === "supported") && visit ? `, so your ${visit} visit fits` : ""}.`;
    },
    age: () => {
      const a = fit("age"), words = p.age?.wording?.replace(/\s*\(controlled example\)/, "");
      if (!words) return "The listing doesn’t say which ages it takes — ask the centre.";
      const years = r?.age === "0" ? "baby" : r?.age ? `${r.age}-year-old` : null;
      return `It takes children ${lower(words)}${a?.state === "supported" && years && !two ? `, so your ${years} fits` : a?.state === "conflict" ? ` — your child’s age is outside that` : a?.state === "unknown" ? " — check your child’s age with them" : ""}.`;
    },
    pickup: () => p.transport?.exists === true
      ? `It runs a pickup service${p.transport.wording ? `: ${lower(p.transport.wording.replace(/\.$/, ""))}` : ""}.${p.transport.coverage?.wording ? ` ${p.transport.coverage.wording}` : ""}`
      : p.transport?.exists === false ? `It doesn’t list a pickup service, so you’d bring your child yourself${p.driving?.state === "available" ? ` — about ${p.driving.minutes} minutes by car` : ""}.`
      : "The listing doesn’t mention pickup, so ask the centre whether they can collect your child.",
    drive: () => p.driving?.state === "available" ? `It’s about ${p.driving.minutes} minutes by car from your starting point, not counting traffic.` : "I don’t have a drive time for this centre.",
    address: () => p.address ? `It’s at ${displayAddress(p.address)}.` : "The listing doesn’t give an address.",
    contact: () => contact,
    reviews: () => praised.length || concerns.length
      ? [praised.length ? `${concerns.length ? "Parents are mostly positive" : "Parents seem to like it"}${total ? ` — across ${total} reviews` : ""}, the things mentioned most are ${and(praised.slice(0, 2).map((x) => x.label))}.` : "",
        concerns.length ? `${praised.length ? "That said, a" : "A"} few recent reviews raise ${and(concerns.map((x) => x.label))}, so it’s worth asking about.` : praised.length ? "I didn’t see any complaint that keeps coming up." : ""].filter(Boolean).join(" ")
      : "There aren’t enough recent parent reviews to go on yet.",
    registration: () => p.registration?.authority ? `It’s registered with ${p.registration.authority}${p.registration.number ? ` (${p.registration.number})` : ""}${p.registration.until ? `, valid until ${p.registration.until}` : ""}.` : "The listing doesn’t show a registration record.",
    place: () => `I can’t see whether there’s a place${date ? ` on ${day(date)}` : ""} — only the centre can tell you. ${contact}`,
  };
}
// The few review themes that stand out: up to three praised, up to two concerns.
function reviewThemes(p) {
  const praised = [], concerns = [];
  for (const t of DISCOVERY_PREFERENCES) {
    const e = reviewTopicEvidence(p, t.id);
    if (e.state === "supported") praised.push({ label: t.label.toLowerCase(), n: e.recentPositive });
    if (e.state === "concern") concerns.push({ label: t.label.toLowerCase(), n: e.recentNegative });
  }
  const top = (xs, k) => xs.sort((a, b) => b.n - a.n).slice(0, k);
  return { praised: top(praised, 3), concerns: top(concerns, 2), total: p.reviewProfile?.sampleCount ?? null };
}
const lower = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);
// The same answers in Chinese, for questions asked in Chinese (13 Oct 2026, user:
// "用户问英文就是英文，问中文就是中文"). Listing wording itself stays as published.
const zhDay = (date) => { try { return new Date(`${date}T12:00:00+08:00`).toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Kuala_Lumpur" }); } catch { return date; } };
const zhAnd = (xs) => xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join("、")}和${xs.at(-1)}`;
const ZH_CHECKS = { age: "孩子的年龄", admission: "短时托育", opening: "开始时间", care: "接孩子的时间", transport: "中心接送", coverage: "接送范围", pickup: "接送时间" };
const ZH_KIND = { TASKA: "TASKA（面向幼儿的注册托育中心）", TADIKA: "TADIKA（4–6 岁幼儿园）", TABIKA: "TABIKA（社区幼儿园）" };
const ZH_THEMES = { caring_teachers: "老师亲切", secure_pickup: "接送安全", clean_environment: "环境干净", healthy_meals: "餐食健康", engaging_activities: "活动有趣", responsive_team: "沟通及时",
  flexible_short_care: "预约灵活", convenient_hours: "时间方便", smooth_pickup: "交接顺畅", clear_late_rules: "迟到规则清楚", predictable_fees: "价格透明", value_for_money: "性价比高" };
const zhRate = (f) => formatFee(f).replace(" / hour", "/小时").replace(" / day", "/天").replace(" / visit", "/次").replace(" / session", "/节").replace(" / month", "/月").replace(/^Estimated /, "估计 ").replace(/^From /, "起价 ");
function sentencesZh(p, requests) {
  const name = displayName(p.name), date = requests[0]?.date, r = requests[0], two = requests.length > 1;
  const visit = r ? (two ? requests.map((x, i) => `${(x.label ?? `Child ${i + 1}`).replace("Child ", "孩子 ")} ${x.deadline}–${x.end}`).join("，") : `${r.deadline}–${r.end}`) : "";
  const checks = (p.fit?.conditions ?? []).filter((c) => ZH_CHECKS[c.id] && !(requests.every((x) => x.transport !== "institution") && ["transport", "coverage", "pickup"].includes(c.id)));
  const fit = (id) => checks.find((c) => c.id === id);
  const phone = p.phone?.display, wa = (p.whatsapp ?? []).map((w) => w.display);
  const contact = phone && wa.length ? `可以打电话 ${phone}，或者 WhatsApp ${wa[0]}。` : phone ? `可以打电话 ${phone} 联系他们。` : wa.length ? `可以 WhatsApp ${wa[0]} 联系他们。` : p.website ? `列表上没有电话，可以看看他们的网站 ${p.website}。` : "可惜列表上没有电话或 WhatsApp。";
  const care = date ? applicableWindows(p.careWindows?.length ? p.careWindows : p.businessHours?.windows, date) : [];
  const open = care.map((w) => `${clock(w.start)}–${clock(w.end)}`).join(" 和 ");
  const fees = feesForCare(p), extras = centreExtras(p).parts;
  const themes = (kind) => DISCOVERY_PREFERENCES.map((t) => ({ id: t.id, e: reviewTopicEvidence(p, t.id) })).filter((x) => x.e.state === kind)
    .sort((a, b) => (kind === "supported" ? b.e.recentPositive - a.e.recentPositive : b.e.recentNegative - a.e.recentNegative)).map((x) => ZH_THEMES[x.id] ?? x.id);
  const praised = themes("supported").slice(0, 2), concerns = themes("concern").slice(0, 2), total = p.reviewProfile?.sampleCount;
  const min = p.feeRule?.minimumMinutes ? `，最少 ${p.feeRule.minimumMinutes / 60} 小时` : "";
  return {
    about: () => `${name} 是一家 ${ZH_KIND[p.category] ?? "托育中心"}${p.district ? `，位于 ${p.district}` : ""}。${p.admission?.value === true ? "可以只托几个小时。" : p.admission?.value === false ? "列表上说不接受只托几个小时。" : ""}`,
    visit: () => {
      if (!checks.length) return `列表上的信息不够，没法核对你${date ? ` ${zhDay(date)}` : ""}这次的安排。`;
      const good = checks.filter((c) => c.state === "supported"), bad = checks.filter((c) => c.state === "conflict"), ask = checks.filter((c) => c.state === "unknown");
      return [
        good.length ? `${bad.length ? "" : "好消息："}你${date ? ` ${zhDay(date)}` : ""}${visit ? `（${visit}）` : ""}这次，${zhAnd(good.map((c) => ZH_CHECKS[c.id]))}都符合中心列出的条件。` : "",
        bad.length ? `不过${zhAnd(bad.map((c) => ZH_CHECKS[c.id]))}不符合（${bad.map((c) => plainReason(c.reason ?? "").replace(/\.$/, "")).join("；")}）。` : "",
        ask.length ? `还需要问问中心：${zhAnd(ask.map((c) => ZH_CHECKS[c.id]))}。` : "",
      ].filter(Boolean).join("");
    },
    fees: () => p.cost?.available ? `这次大概 ${p.cost.currency ?? "MYR"} ${p.cost.total}${fees[0] ? `（${zhRate(fees[0])}${min}）` : ""}，不含额外费用。`
      : fees[0] ? `列出的价格是 ${zhRate(fees[0])}${min}，这次的具体总价请问中心。` : "列表上没有短时托育的价格，最好直接问中心。",
    extras: () => [p.feeRule?.includedExtras?.length ? `价格已包含：${p.feeRule.includedExtras.join("、")}。` : "", extras.length ? `列出的额外收费：${extras.map((x) => x.text).join("；")}。` : ""].join("") || "列表上没提额外收费，最好再跟中心确认一下。",
    hours: () => {
      const c = fit("care"), o = fit("opening"), bad = [o, c].filter((x) => x?.state === "conflict");
      const base = open ? `${zhDay(date)}的开放时间是 ${open}` : p.businessHoursLabel ? `开放时间是 ${p.businessHoursLabel}` : "列表上没有写开放时间";
      if (bad.length) return `${base}，不过${zhAnd(bad.map((x) => ZH_CHECKS[x.id]))}不符合。`;
      return `${base}${(o?.state === "supported" || c?.state === "supported") && visit ? `，你的 ${visit} 没问题` : ""}。`;
    },
    age: () => {
      const a = fit("age"), m = (n) => n % 12 === 0 ? `${n / 12} 岁` : n < 24 ? `${n} 个月` : `${Math.floor(n / 12)} 岁 ${n % 12} 个月`;
      const words = Number.isFinite(p.age?.min) && Number.isFinite(p.age?.max) ? `${m(p.age.min)}到${p.age.maxInclusive ? "" : "不满 "}${m(p.age.max)}`
        : Number.isFinite(p.age?.min) ? `${m(p.age.min)}以上` : p.age?.wording?.replace(/\s*\(controlled example\)/, "");
      if (!words) return "列表上没写收几岁的孩子，可以问问中心。";
      return `收 ${words}的孩子${a?.state === "supported" && r?.age && !two ? `，你家 ${r.age === "0" ? "不到 1 岁" : `${r.age} 岁`}的孩子符合` : a?.state === "conflict" ? "，你家孩子的年龄不在这个范围内" : a?.state === "unknown" ? "，最好跟中心确认一下孩子的年龄" : ""}。`;
    },
    pickup: () => p.transport?.exists === true ? `中心提供接送服务${p.transport.wording ? `（${p.transport.wording.replace(/\.$/, "")}）` : ""}。${p.transport.coverage?.wording ? `接送范围：${p.transport.coverage.wording}` : ""}`
      : p.transport?.exists === false ? `列表上没有接送服务，需要你自己送孩子过去${p.driving?.state === "available" ? `，开车大约 ${p.driving.minutes} 分钟` : ""}。`
      : "列表上没提接送，可以问问中心能不能来接孩子。",
    drive: () => p.driving?.state === "available" ? `从你的出发点开车大约 ${p.driving.minutes} 分钟（不含堵车）。` : "这家中心暂时没有车程数据。",
    address: () => p.address ? `地址是 ${displayAddress(p.address)}。` : "列表上没有地址。",
    contact: () => contact,
    reviews: () => praised.length || concerns.length
      ? `${praised.length ? `家长评价${concerns.length ? "大体不错" : "挺好"}${total ? `——在 ${total} 条评价里` : ""}，最常提到的是${zhAnd(praised)}。` : ""}${concerns.length ? `不过最近有几条评价提到${zhAnd(concerns)}的问题，值得问一问。` : praised.length ? "最近没有反复出现的投诉。" : ""}`
      : "最近的家长评价还不够多，暂时说不了太多。",
    registration: () => p.registration?.authority ? `已在 ${p.registration.authority} 注册${p.registration.number ? `（${p.registration.number}）` : ""}${p.registration.until ? `，有效期到 ${p.registration.until}` : ""}。` : "列表上没有注册记录。",
    place: () => `我看不到${date ? ` ${zhDay(date)}` : ""}还有没有名额，只有中心能确认。${contact}`,
  };
}
const ORDER = ["place", "visit", "fees", "extras", "hours", "age", "pickup", "drive", "address", "contact", "reviews", "registration", "about"];

export function answerFromListing(question, p, requests = []) {
  let topics = topicsOf(question);
  // "Registration fee" is a fee, not the registration record.
  if (/registration fee|注册费/i.test(question)) topics = topics.filter((t) => t !== "registration").concat("extras", "fees");
  const zh = /[\u4e00-\u9fff]/.test(question), say = zh ? sentencesZh(p, requests) : sentences(p, requests);
  if (!topics.length) return { text: zh ? `列表上没有写这个，最好直接问 ${displayName(p.name)}。${say.contact()}` : `The listing doesn’t cover that, I’m afraid — it’s best to ask ${displayName(p.name)} directly. ${say.contact()}`, topics, found: false };
  const picked = ORDER.filter((t) => topics.includes(t)).slice(0, 4);
  // "About" alone, or with others: the others say more.
  const use = picked.length > 1 ? picked.filter((t) => t !== "about") : picked;
  return { text: use.map((t) => say[t]()).join(zh ? "" : " "), topics, found: true };
}

// Short starters for the chat, most useful first.
export function suggestedQuestions(p, requests = [], extra = []) {
  const two = requests.length > 1;
  return [...new Set([
    ...extra,
    two ? "Does this centre fit both children?" : "Does this centre fit my child’s visit?",
    "How much will it cost?",
    "What are the hours on my date?",
    p.transport?.exists === true ? "How does pickup work?" : "Is there a pickup service?",
    "What do parents say about it?",
    "How do I contact them?",
  ])].slice(0, 6);
}

// Times, dates and money in a text, normalised so "RM54" = "MYR 54.00" and
// "1:20 pm" = "13:20". A model's answer may not bring in any of its own.
const KEEP = /\b(?:\d{1,2}[:.]\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm)|(?:rm|myr)\s?\d+(?:[.,]\d+)?|\d+(?:\.\d+)?\s?(?:rm|myr|ringgit))\b/gi;
function norm(token) {
  const t = token.toLowerCase().replace(/\s+/g, "");
  let m = /^(\d{1,2})[:.](\d{2})(am|pm)?$/.exec(t);
  if (m) { let h = +m[1]; if (m[3] === "pm" && h < 12) h += 12; if (m[3] === "am" && h === 12) h = 0; return `t${h}:${m[2]}`; }
  if ((m = /^(\d{1,2})(am|pm)$/.exec(t))) { let h = +m[1]; if (m[2] === "pm" && h < 12) h += 12; if (m[2] === "am" && h === 12) h = 0; return `t${h}:00`; }
  if ((m = /^(?:rm|myr)(\d+(?:[.,]\d+)?)$/.exec(t)) || (m = /^(\d+(?:\.\d+)?)(?:rm|myr|ringgit)$/.exec(t))) return `m${Number(m[1].replace(",", "."))}`;
  return t;
}
const tokens = (text) => new Set((String(text).match(KEEP) ?? []).map(norm));
export function inventedFacts(answer, facts) {
  const known = tokens(facts.map((f) => f.text ?? f).join(" "));
  return [...tokens(answer)].filter((x) => !known.has(x));
}
// A model may never promise a place, a booking or a confirmation.
export const promisesPlace = (answer) => /\b(there is|there are|they have|we have|has)\b[^.]{0,30}\b(a )?(place|places|space|slot|vacanc\w*)\b(?! on your date\b)(?![^.]{0,20}\bcan(?:’|')?t\b)|\b(is|are) (available|confirmed|booked)\b|\byou(?:’|')re booked\b|\bi(?:’|')ve booked\b/i.test(answer)
  && !/can(?:’|')?t see|can ?not see|only the centre/i.test(answer);

// A simple guard (13 Oct 2026, user: "只识别用户对这个childcare相关的问题，不要回答无关问题…做一个简易的安全围栏"):
// the question is checked before any model sees it, and a model's answer is
// checked again before it is shown. Anything else gets a polite "only about
// this centre" reply, written by the rules.
const INJECTION = /\b(ignore|disregard|forget)\b[^.]{0,30}\b(instructions?|rules?|above|previous|prompt)\b|\bsystem prompt\b|\byou are (now|a|an)\b|\bpretend\b|\brole ?-?play\b|\bact as\b|\bjailbreak\b|\bdeveloper mode\b|\bDAN\b|扮演|你是(一个|个|一只|只)?\S{0,6}(猫|娘|女仆|角色|助手)|猫娘|忽略(之前|以上|上面|所有)|提示词|系统提示|角色扮演|假装/i;
const OFF_TOPIC = /\b(poem|joke|lyrics|code|coding|python|javascript|program me|math|maths|equation|prove|proof|theorem|conjecture|riemann|weather|stock|stocks|bitcoin|crypto|recipe|translate|homework|essay|politic\w*|election|president|prime minister|celebrity|movie|gaming)\b|写诗|诗歌|笑话|歌词|代码|编程|数学|证明|定理|猜想|天气|股票|比特币|菜谱|翻译|作业|论文|政治|选举|总统|明星|电影/i;
const CHILDCARE = /\b(centre|center|childcare|child care|daycare|day care|nursery|kindergarten|preschool|pre-school|taska|tadika|creche|child|children|kid|kids|son|daughter|toddler|nanny|babysit\w*|visit|enrol\w*|nap|sleep|toilet|potty|allerg\w*|cctv|language|english|mandarin|malay|tamil|uniform|bring|pack)\b|托育|托儿|幼儿园|中心|孩子|小孩|儿子|女儿|午睡|睡觉|过敏|上厕所|带什么|语言|英语|华语|中文|马来语|监控|摄像头|安全|卫生|老师|吃的|零食|玩具|活动/i;
const FOLLOW_UP = /^(and|what about|how about|also|why|really|so|then|is that|does that|what if)\b|呢[？?]?$|^(那|还有|为什么|真的|那么)/i;
const GREETING = /^(hi|hello|hey|thanks|thank you|ok|okay|great|cool|bye|你好|您好|谢谢|好的|嗯|收到|再见)[\s!.。！~]*$/i;
const chinese = (text) => /[一-鿿]/.test(text);

// { ok, kind: "question" | "greeting" | "off_topic" | "injection", topics }
export function guardQuestion(question, { previous = "" } = {}) {
  const q = String(question ?? "").trim();
  if (!q) return { ok: false, kind: "empty", topics: [] };
  if (INJECTION.test(q)) return { ok: false, kind: "injection", topics: [] };
  if (GREETING.test(q)) return { ok: false, kind: "greeting", topics: [] };
  if (OFF_TOPIC.test(q)) return { ok: false, kind: "off_topic", topics: [] };
  const topics = topicsOf(q), strong = topics.filter((t) => t !== "about");
  if (strong.length || CHILDCARE.test(q)) return { ok: true, kind: "question", topics };
  // A short follow-up ("and on Saturday?") continues the last question.
  if (previous && q.length <= 40 && FOLLOW_UP.test(q)) {
    const carried = topicsOf(previous);
    if (carried.length) return { ok: true, kind: "question", topics: carried, followUp: true };
  }
  return { ok: false, kind: "off_topic", topics };
}

export function guardReply(kind, names, question = "") {
  const who = names.join(" and "), zh = chinese(question);
  if (kind === "greeting") {
    const thanks = /thank|谢|收到|好的|ok|great|cool|bye|再见/i.test(question);
    return zh
      ? `${thanks ? "不客气！" : "你好！"}还可以问我关于 ${who} 的问题，比如费用、当天开放时间、收几岁的孩子、接送、家长评价或怎么联系。`
      : `${thanks ? "You’re welcome!" : "Hello!"} Ask me about ${who} — fees, hours on your date, ages, pickup, what parents say or how to contact ${names.length > 1 ? "them" : "it"}.`;
  }
  return zh
    ? `抱歉，我只能回答关于 ${who} 的托育问题，比如费用、当天开放时间、收几岁的孩子、接送、家长评价或怎么联系。`
    : `Sorry, I can only help with questions about ${who} — fees, hours on your date, ages, pickup, what parents say or how to contact ${names.length > 1 ? "them" : "it"}.`;
}

// A model's answer has to stay with the listing: no emoji or role-play, and it
// must share something with the facts (a number, a word or the centre's name),
// or say the listing doesn't cover it.
const EMOJI = /\p{Extended_Pictographic}/u;
const ROLEPLAY = /喵|nya\b|meow|猫娘|catgirl|主人|master\b/i;
const STOP = new Set(["the", "and", "for", "with", "this", "that", "your", "you", "are", "can", "not", "from", "listing", "listed", "centre", "center", "visit", "about", "there", "their", "they", "will", "have", "has", "what", "when", "which", "only", "ask", "also"]);
const words = (text) => new Set((String(text).toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !STOP.has(w)));
const ZH_TOPIC = /家长|评价|费用|价格|收费|时间|开放|营业|年龄|岁|接送|地址|电话|联系|中心|托育|孩子|名额|列表|资料|列出|注册|开车/;
export function offListing(answer, facts, lang = "en") {
  if (EMOJI.test(answer)) return "used emoji";
  if (ROLEPLAY.test(answer)) return "role-played";
  if (OFF_TOPIC.test(answer) && !OFF_TOPIC.test(facts.map((f) => f.text ?? f).join(" "))) return "went off topic";
  const factText = facts.map((f) => f.text ?? f).join(" ");
  const digits = new Set(factText.match(/\d+/g) ?? []);
  if ((answer.match(/\d+/g) ?? []).some((d) => digits.has(d))) return null;
  const known = words(factText);
  if ([...words(answer)].filter((w) => known.has(w)).length >= 2) return null;
  if (/listing|doesn(?:’|')t say|ask the centre|ask the center|没有写|没写|列表|请问|询问/i.test(answer)) return null;
  // A Chinese answer can't share English words with the facts; it has to stay
  // on a childcare subject instead (the checks above already ran).
  if (lang === "zh" && ZH_TOPIC.test(answer)) return null;
  return "didn't use the listing";
}
