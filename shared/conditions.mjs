import { minutes, timeLabel, isShortCare, ageBounds } from "./request.mjs";
import { feePriorityValue, feePriorityGroup, shortFeeFrom } from "./result-summary.mjs";
const result = (id, label, state, reason, source = null, question = null) => ({
  id,
  label,
  state,
  reason,
  source,
  question,
});
const dayFor = (date) =>
  ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][
    new Date(date + "T12:00:00+08:00").getUTCDay()
  ];
export function applicableWindows(windows, date) {
  return (windows ?? []).filter(
    (w) =>
      (!w.days || w.days.includes(dayFor(date))) &&
      (!w.from || date >= w.from) &&
      (!w.until || date <= w.until) &&
      !(w.excludedDates ?? []).includes(date),
  );
}
export function checkAge(age, r) {
  if (age?.basis === 'type_reference') {
    const selected = r.age !== '', [lo, hi] = ageBounds(r.age);
    const matches = lo >= age.min && hi <= age.max;
    const outside = hi <= age.min || lo > age.max || (lo === age.max && age.maxInclusive === false);
    const partial = selected && !matches && !outside && String(r.age).includes('-');
    // Confirm the official range separately from a child's request match.
    // An optional, unselected age is not a provider question or a passed fit.
    return {
      ...result('age', 'Age', selected ? (matches ? 'supported' : partial ? 'unknown' : 'conflict') : 'reference',
        `${age.wording} · Official type age range. ${selected ? (matches ? 'The selected age is within this range.' : partial ? 'Only part of your chosen age group is covered. Ask about your child’s exact age.' : 'The selected age is outside this range.') : 'Select an age to check whether it falls within this range.'}`,
        age.source,
        selected && !matches ? 'Is there a separate programme covering this age group?' : null,
      ),
      statusLabel: partial ? 'Ask the centre' : selected && !matches ? 'Outside type range' : 'Confirmed range',
      basis: 'type_reference',
      requestMatch: selected ? (matches ? 'within_type_range' : partial ? 'partly_within_type_range' : 'outside_type_range') : 'not_selected',
    };
  }
  if (age?.alternative) return result(
    'age', 'Age', 'unknown',
    `${age.wording}; another source lists ${age.alternative.wording}. Ask this centre which ages it can take.`,
    age.source, 'Which published age range applies to this temporary visit?',
  );
  if (r.age === "")
    return result(
      "age",
      "Age",
      "unknown",
      age ? `${age.wording}. Select the child’s age to check this range.` : "Age has not been selected.",
      age?.source,
      "Does your service accept the child’s age group?",
    );
  if (!age)
    return result(
      "age",
      "Age",
      "unknown",
      "This centre has not listed the ages it can take.",
      null,
      `Do you accept children ${r.age === "0" ? "under 1 year" : `aged ${r.age}`} for temporary care?`,
    );
  const [lo, hi] = ageBounds(r.age),
    min = age.min ?? 0,
    max = age.max ?? Infinity;
  const disjoint =
    hi <= min || lo > max || (lo === max && age.maxInclusive === false);
  if (disjoint)
    return result(
      "age",
      "Age",
      "conflict",
      `${age.wording}. Your child’s age is outside this range.`,
      age.source,
      "Is there a separate temporary programme for this age group?",
    );
  if (
    age.endpointKnown &&
    (lo > min || (lo === min && age.minInclusive !== false)) &&
    hi <= max
  )
    return result(
      "age",
      "Age",
      "supported",
      `${age.wording}. Your child’s age is within this range.`,
      age.source,
    );
  return result(
    "age",
    "Age",
    "unknown",
    `${age.wording}. Ask the centre about the exact ages it can take.`,
    age.source,
    "Can you confirm the exact ages accepted for this temporary visit?",
  );
}
function assessRegular(p, r) {
  const age = checkAge(p.age, r);
  age.question = age.question?.replace(/temporary care/g, "regular care").replace(/temporary visit|temporary programme/g, "programme") ?? null;
  if (r.age === "") { age.state = "reference"; age.question = null; }
  const states = [age], transport = p.transport ?? {};
  states.push(result("transport", "Centre pickup",
    !r.transport ? "reference" : r.transport === "self" || transport.exists === true ? "supported" : transport.exists === false ? "conflict" : "unknown",
    !r.transport ? "You haven’t chosen who will handle pickup." : r.transport === "self" ? "You’ll handle pickup." : transport.wording ?? "Ask whether the centre offers pickup.",
    transport.source, r.transport === "institution" && transport.exists !== true ? "Do you offer pickup for regular childcare?" : null));
  if (r.transport === "institution") {
    const coverage = transport.coverage;
    const state = coverage?.placeIds?.includes(r.pickup.id) ? "supported" : coverage?.placeIds && coverage?.exhaustive ? "conflict" : "unknown";
    states.push(result("coverage", "Pickup area", state, coverage?.wording ?? "Ask whether pickup covers your location.", coverage?.source ?? transport.source,
      state === "supported" ? null : `Can you arrange regular pickup from ${r.pickup.label}?`));
  }
  const counts = { supported: 0, conflict: 0, unknown: 0, reference: 0 };
  for (const c of states) counts[c.state]++;
  return { conditions: states, counts, summary: counts.conflict ? "Some details do not fit" : counts.unknown ? "Ask the centre about missing details" : "Listed details checked",
    acceptance: "Ask the centre if your child can join.", requestVersion: JSON.stringify(r), factVersion: p.version };
}
export function assess(p, r) {
  if (!isShortCare(r)) return assessRegular(p, r);
  const states = [checkAge(p.age, r)],
    ad = p.admission,
    transport = p.transport ?? {},
    source = transport.source;
  states.push(
    result(
      "admission",
      "Care for a few hours",
      ad?.value === true && !ad.requirements?.length
        ? "supported"
        : ad?.value === false
          ? "conflict"
          : "unknown",
      ad?.wording ??
        "We don’t know if this centre offers care for just a few hours.",
      ad?.source,
      ad?.value === true && !ad.requirements?.length
        ? null
        : ad?.question ?? "Can my child come for a few hours on this date?",
    ),
  );
  if (r.transport === "self") {
    states.push(
      result(
        "transport",
        "Centre pickup",
        "supported",
        "You’ll handle pickup. The centre does not need to pick up your child.",
      ),
      result(
        "coverage",
        "Pickup area",
        "supported",
        "You’ll handle pickup, so the centre’s pickup area does not matter.",
      ),
      result(
        "pickup",
        "Leave pickup address by",
        "supported",
        `You’ll handle pickup by ${r.deadline}.`,
      ),
    );
  } else {
    states.push(
      result(
        "transport",
        "Centre pickup",
        !r.transport
          ? "unknown"
          : transport.exists === true
            ? "supported"
            : transport.exists === false
              ? "conflict"
              : "unknown",
        !r.transport
          ? "You haven’t chosen who will handle pickup."
          : [transport.type, transport.wording ?? "This centre has not listed a pickup service."].filter(Boolean).join(' · '),
        source,
        "Can you pick up my child for this visit?",
      ),
    );
    let coverage = "unknown",
      why =
        "Ask if the centre can pick up from your address.";
    if (r.transport && transport.coverage?.placeIds) {
      coverage = transport.coverage.placeIds.includes(r.pickup.id)
        ? "supported"
        : transport.coverage.exhaustive
          ? "conflict"
          : "unknown";
      why = transport.coverage.wording;
    }
    states.push(
      result(
        "coverage",
        "Pickup area",
        coverage,
        why,
        transport.coverage?.source ?? source,
        "Can you pick up from this address? Is there a seat for my child?",
      ),
    );
    const ws = applicableWindows(p.pickupWindows, r.date),
      deadline = minutes(r.deadline);
    let state = "unknown",
      reason = "No pickup times are listed for this date.";
    if (r.transport && ws.length) {
      const allBefore = ws.every((w) => w.end <= deadline),
        allAfter = ws.every((w) => w.start > deadline);
      state = allBefore ? "supported" : allAfter ? "conflict" : "unknown";
      reason = `Published pickup: ${ws.map((w) => `${timeLabel(w.start)}–${timeLabel(w.end)}`).join(", ")}. ${allBefore ? "The listed pickup times are early enough." : allAfter ? "The listed pickup times are too late." : "Some listed times are too late. Ask for the exact pickup time."}`;
    }
    states.push(
      result(
        "pickup",
        "Leave pickup address by",
        state,
        reason,
        ws[0]?.source,
        "Can you finish pickup by this time?",
      ),
    );
  }
  // Revised product rule: sourced opening hours supply the default care window.
  // A more specific published care schedule takes precedence, even on a day off.
  const hasCareSchedule = (p.careWindows ?? []).length > 0,
    care = applicableWindows(hasCareSchedule ? p.careWindows : p.businessHours?.windows, r.date),
    end = minutes(r.end),
    exception = (p.dateExceptions ?? []).find((x) => x.date === r.date);
  let state = "unknown",
    reason = "No care hours are published for this date.",
    careSource = p.businessHours?.source;
  if (exception) {
    reason = `${exception.label ?? exception.displayed_label ?? "Date-specific hours unresolved"}. Confirm temporary care for this date.`;
    careSource = exception.source ?? careSource;
  } else if (care.length) {
    state = care.some((w) => end >= w.start && end <= w.end)
      ? "supported"
      : "conflict";
    reason = `Published care hours: ${care.map((w) => `${timeLabel(w.start)}–${timeLabel(w.end)}`).join(", ")}. Your pickup from childcare: ${r.end}.`;
    careSource = care[0].source;
  } else if (!hasCareSchedule && (p.businessHours?.closedDays ?? []).includes(dayFor(r.date))) {
    state = "conflict";
    reason = "The centre is listed as closed on this day.";
  }
  if(!exception&&!hasCareSchedule&&p.businessHours?.alternative){
    const alt=p.businessHours.alternative,ws=applicableWindows(alt.windows,r.date),closed=alt.closedDays.includes(dayFor(r.date));
    if(ws.length||closed){
      const alternateState=!closed&&ws.some(w=>end>=w.start&&end<=w.end)?'supported':'conflict';
      if(state!==alternateState){state='unknown';reason+=` Another listing ${closed?'says closed':`lists ${ws.map(w=>`${timeLabel(w.start)}–${timeLabel(w.end)}`).join(', ')}`}; the sources disagree for your requested time.`;careSource=alt.source;}
    }
  }
  if (
    !exception &&
    p.lateRule?.latestEnd != null &&
    end > p.lateRule.latestEnd
  ) {
    state = "conflict";
    reason += ` The latest pickup time is ${timeLabel(p.lateRule.latestEnd)}.`;
    careSource = p.lateRule.source;
  }
  states.push(
    result(
      "care",
      "Care ends at",
      state,
      reason,
      careSource,
      "Can my child stay until this time? What happens if I’m late?",
    ),
  );
  states.push(
    result(
      "transfer",
      "Travel time",
      "unknown",
      "Ask when your child will arrive. Driving times do not include drop-off time or current traffic.",
      null,
      r.transport === "self"
        ? "What time should my child arrive?"
        : "How long is the drive? When will my child arrive?",
    ),
  );
  const counts = { supported: 0, conflict: 0, unknown: 0, reference: 0 };
  for (const c of states) counts[c.state]++;
  return {
    conditions: states,
    counts,
    summary: counts.conflict
      ? "Some details do not fit"
      : counts.unknown
        ? "Ask the centre about missing details"
        : "Listed details checked",
    acceptance: "Ask the centre if they can take your child.",
    requestVersion: JSON.stringify(r),
    factVersion: p.version,
  };
}
export function businessHoursFor(p, date) {
  const ws = applicableWindows(p.businessHours?.windows, date);
  if(hoursDisagree(p,date))return 'Sources differ · check details';
  return ws.length
    ? ws.map((w) => `${timeLabel(w.start)}–${timeLabel(w.end)}`).join(", ")
    : (p.businessHours?.closedDays ?? []).includes(dayFor(date))
      ? "Listed closed"
      : p.businessHours?.windows?.length ? "Not listed for this day" : "Not published";
}
export function careEndTimeFor(p, date) {
  return careEndScheduleFor(p, date).label;
}
export function careEndScheduleFor(p, date) {
  const exception = (p.dateExceptions ?? []).find(x=>x.date===date);
  if (exception) return {end:null,label:'Date-specific hours need confirmation',source:exception.source ?? p.businessHours?.source};
  const specific = (p.careWindows ?? []).length > 0;
  const windows = applicableWindows(specific ? p.careWindows : p.businessHours?.windows, date);
  if (!specific && hoursDisagree(p,date)) return {end:null,label:'Sources differ · check details',source:p.businessHours?.source};
  if (!windows.length) return {end:null,label:specific ? 'Not listed for this day' : businessHoursFor(p,date),source:p.businessHours?.source};
  const windowEnd = Math.max(...windows.map(w=>w.end));
  const end = Math.min(windowEnd,p.lateRule?.latestEnd ?? Infinity);
  return {end,label:timeLabel(end),source:end<windowEnd ? p.lateRule.source : windows.find(w=>w.end===windowEnd)?.source ?? p.businessHours?.source};
}
export function weeklyCareEndTimes(p, date) {
  const start = new Date(date+'T12:00:00Z');
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay()+6)%7);
  return ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((day,i)=>{
    const d=new Date(start);d.setUTCDate(d.getUTCDate()+i);
    const selectedDate=d.toISOString().slice(0,10);
    return {day,date:selectedDate,...careEndScheduleFor(p,selectedDate)};
  });
}
export function hoursDisagree(p,date){
  const a=p.businessHours?.alternative;if(!a)return false;
  const signature=h=>{
    const ws=applicableWindows(h.windows,date);return ws.length?ws.map(w=>`${w.start}-${w.end}`).sort().join(','):h.closedDays?.includes(dayFor(date))?'closed':null;
  };
  const original=signature(p.businessHours),other=signature(a);
  return original!==null&&other!==null&&original!==other;
}
export function costFor(p, r) {
  if (!isShortCare(r)) return { available: false, reason: "Ask the centre for a programme quote.", missing: ["programme fee", "registration, meals and transport charges"], published: p.fees ?? [] };
  const rule = p.feeRule,
    missing = [
      "one-off care rate",
      "minimum charge and rounding",
      "registration / materials / meals",
      "late-collection charges",
      ...(r.transport === "institution" ? ["transport charge"] : []),
    ];
  if (
    !rule?.validated ||
    !rule.complete ||
    !["hour", "visit"].includes(rule.basis) ||
    !Number.isFinite(rule.rate) ||
    rule.rate < 0 ||
    !Number.isFinite(rule.minimumMinutes) ||
    !Number.isFinite(rule.roundingMinutes) ||
    rule.roundingMinutes <= 0 ||
    !Array.isArray(rule.includedExtras) ||
    (r.transport === "institution" && !rule.transportIncluded)
  )
    return {
      available: false,
      reason: "A complete one-off fee total is unavailable.",
      missing,
      published: p.fees ?? [],
    };
  const duration = minutes(r.end) - minutes(r.deadline),
    charged = Math.max(
      rule.minimumMinutes,
      Math.ceil(duration / rule.roundingMinutes) * rule.roundingMinutes,
    ),
    total = rule.basis === "hour" ? (charged / 60) * rule.rate : rule.rate;
  return {
    available: true,
    total: Math.round(total * 100) / 100,
    currency: rule.currency,
    durationMinutes: duration,
    chargedMinutes: charged,
    minimumMinutes: rule.minimumMinutes,
    roundingMinutes: rule.roundingMinutes,
    calculation:
      rule.basis === "hour"
        ? `${charged} minutes ÷ 60 × ${rule.rate}`
        : `One visit × ${rule.rate}`,
    includedExtras: rule.includedExtras,
    source: rule.source,
    notice:
      "Reference estimate for the stated duration. Confirm actual arrival, charges and acceptance with the provider.",
    published: p.fees ?? [],
  };
}
export function enquiries(p, r, fit = assess(p, r)) {
  const questions = fit.conditions
    .filter((c) => c.state !== "supported" && c.question)
    .map((c) => ({ id: c.id, text: c.question, reason: c.state }));
  questions.splice(Math.min(1, questions.length), 0, {
    id: "capacity",
    text: isShortCare(r) ? `Can you take my child on ${r.date} until ${r.end}? How early should I ask, and what papers should I bring?` : "Can my child join? What do I need to bring?",
    reason: "availability",
  });
  const cost = costFor(p, r);
  questions.push({
    id: "fees",
    text: !isShortCare(r) ? "What is the programme fee, including registration, meals and any pickup charges?" : cost.available
      ? "Can you confirm this reference price and any changes for our actual arrival and collection?"
      : "What is the one-off charge, including minimum duration, transport, meals, registration and late collection?",
    reason: "charges",
  });
  return [...new Map(questions.map((q) => [q.id, q])).values()];
}
export const priorityValue = (p, sort, date) =>
    sort === "distance"
      ? p.distanceKm
      : sort === "price"
        ? feePriorityValue(p)
      : sort === "pickup"
        ? p.transport?.exists === true
          ? 1
          : p.transport?.exists === false
            ? 0
            : null
        : sort === "closing"
          ? careEndScheduleFor(p,date).end
          : p.name.toLocaleLowerCase("en");
// Use the same published contact fields that the user can actually see/open.
// A website URL alone is not a phone or an explicit WhatsApp destination.
export const hasContact = p => Boolean(
  (typeof p.phone?.display === "string" && p.phone.display.trim()) ||
  p.whatsapp?.some(contact => typeof contact.href === "string" && contact.href.trim()),
);
const preferContactable = items => {
  const contactable = items.filter(hasContact);
  return contactable.length ? contactable : items;
};
export function sortProviders(items, sort, date) {
  return [...items].sort((a, b) => {
    // Conflicts always rank below every result without a known conflict,
    // within the supplied page or comparison, regardless of secondary ordering.
    const conflicts = p => p.fit?.counts?.conflict ?? 0;
    const group = Number(conflicts(a) > 0) - Number(conflicts(b) > 0);
    if (group) return group;
    if (conflicts(a) !== conflicts(b)) return conflicts(a) - conflicts(b);
    const contact = Number(hasContact(b)) - Number(hasContact(a));
    if (contact) return contact;
    if (sort === "price" && feePriorityGroup(a) !== feePriorityGroup(b)) return feePriorityGroup(a) - feePriorityGroup(b);
    let x = priorityValue(a,sort,date),
      y = priorityValue(b,sort,date);
    if (x === -Infinity) x = null;
    if (y === -Infinity) y = null;
    if (x == null && y != null) return 1;
    if (y == null && x != null) return -1;
    if (x != null && y != null && x !== y)
      return typeof x === "string"
        ? x.localeCompare(y)
        : sort === "closing" || sort === "pickup"
          ? y - x
          : x - y;
    return a.id.localeCompare(b.id);
  });
}
export function suggestProviders(items, request) {
  const relevant = new Set(["admission", "care", ...(request.age !== "" ? ["age"] : []), ...(request.transport === "institution" ? ["transport", "coverage", "pickup"] : [])]);
  const score = p => p.fit.conditions.filter(c => relevant.has(c.id) && c.state === "supported").length;
  // Only suggest centres that can be located on the current result map.
  // Never fill the remaining suggestion slots with unreachable centres while
  // a contactable, conflict-free option exists on this nearest-results page.
  const pool = preferContactable(items.filter(p => p.location && !p.fit.counts.conflict));
  const ids = pool.filter(p => request.sort !== "price" || feePriorityValue(p) != null)
    .sort((a,b) => {
      const sort=request.sort;
      if (sort === "price" && feePriorityGroup(a) !== feePriorityGroup(b)) return feePriorityGroup(a) - feePriorityGroup(b);
      if (["distance","price","closing","pickup"].includes(sort)) {
        const x=priorityValue(a,sort,request.date), y=priorityValue(b,sort,request.date);
        if(x==null && y!=null)return 1;
        if(y==null && x!=null)return -1;
        if(x!=null && y!=null && x!==y)return sort==="distance" || sort==="price" ? x-y : y-x;
      }
      return score(b)-score(a) || a.distanceKm-b.distanceKm || a.id.localeCompare(b.id);
    })
    .slice(0,3).map(p => p.id);
  return items.map(p => ({ ...p, suggested: ids.includes(p.id) }));
}

export function bestForPriority(items, sort, date) {
  const labels={distance:"Nearest option",price:"Lowest monthly fee",closing:"Latest care end",pickup:"Offers pickup"};
  if (!labels[sort]) return {ids:[],message:"Alphabetical order doesn’t select a best match."};
  const pool=preferContactable(items.filter(p=>!p.fit?.counts?.conflict));
  const eligible=sortProviders(pool.filter(p=>priorityValue(p,sort,date)!=null && (sort!=="pickup" || p.transport?.exists===true)),sort,date);
  if (!eligible.length) return {ids:[],message:"Not enough details to compare these centres."};
  const value=priorityValue(eligible[0],sort,date);
  // Equal published values are equal winners, not broken by an arbitrary ID.
  const ids=eligible.filter(p=>(sort!=="price" || feePriorityGroup(p)===feePriorityGroup(eligible[0])) && Math.abs(priorityValue(p,sort,date)-value)<0.000001).map(p=>p.id);
  const shortFee=sort==='price'&&eligible[0].careType==='short_term'?shortFeeFrom(eligible[0]):null;
  const label=shortFee?({total:'Lowest estimated total',hour:'Lowest hourly fee',visit:'Lowest visit fee',session:'Lowest session fee',day:'Lowest daily fee'})[shortFee.basis]:labels[sort];
  return {ids,label,message:ids.length>1 ? "More than one centre matches this choice." : shortFee ? "Hourly and daily prices are compared separately." : "See the marked centre below."};
}
