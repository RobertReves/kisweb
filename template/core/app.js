(() => {
const C = window.SITE, API = C.api || "";
const $ = s => document.querySelector(s);
const DAYS = ["Hétfő","Kedd","Szerda","Csütörtök","Péntek","Szombat","Vasárnap"];
const dow = d => (d.getDay() + 6) % 7;
const mins = t => +t.slice(0, 2) * 60 + +t.slice(3);
const hhmm = m => String(m / 60 | 0).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
const ymd = d => d.toLocaleDateString("sv"); // YYYY-MM-DD helyi időben
const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const tel = C.phone.replace(/[^\d+]/g, "");
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const wait = ms => new Promise(r => setTimeout(r, ms));
const calm = matchMedia("(prefers-reduced-motion:reduce)").matches; // csökkentett mozgás kérése esetén nincs animáció
const touch = matchMedia("(hover:none)").matches;
const staff = C.staff?.length ? C.staff : [{ name: "" }];
const canBook = C.booking !== false && C.services?.length;
const mapsDir = "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(C.address);
let closed = new Set(C.closed || []), banner = C.banner || "", busy = [];

const call = async (path, body) => {
  const r = await fetch(`${API}${path}${path.includes("?") ? "&" : "?"}site=${C.slug}`, { method: body ? "POST" : "GET", headers: { "content-type": "application/json" }, body: body && JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};

/* ---------- oldal feltöltése ---------- */
const root = document.documentElement;
root.dataset.theme = C.theme || "classic";
root.style.setProperty("--a", C.accent);
document.title = `${C.name} – ${C.tagline.split(".")[0]}`;
$("#brand").textContent = C.name;
// a főcím szavanként animálva jelenik meg
$("#h1").replaceChildren(...C.name.split(" ").flatMap((w, i, a) => { const s = document.createElement("span"); s.className = "w"; s.style.setProperty("--i", i); s.textContent = w; return i < a.length - 1 ? [s, " "] : [s]; }));
$("#tag").textContent = C.tagline;
$("#callbtn").href = $("#barcall").href = "tel:" + tel;
$("#callbtn").textContent = "Hívás: " + C.phone;
const mainLabel = canBook ? "Időpontfoglalás" : "Kérdezzen tőlünk";
const mainAct = canBook ? "book" : "msg";
for (const b of [$("#mainbtn"), $("#barmain")]) { b.textContent = mainLabel; b.dataset.bot = mainAct; }
if (C.rating) { const r = $("#rating"); r.hidden = false; r.textContent = `★ ${C.rating.score} · ${C.rating.count} értékelés`; }
$("#perks").innerHTML = (C.perks || []).map((p, i) => `<div class="card"><span class="num">0${i + 1}</span><b>${esc(p.t)}</b><p>${esc(p.d)}</p></div>`).join("");
$("#services").innerHTML = (C.services || []).map(s => `<li><span>${esc(s.name)}<small>${s.min} perc</small></span><b>${esc(s.price)}</b></li>`).join("");
$("#products").innerHTML = (C.products || []).map((p, i) => `<article class="card prod">${p.img ? `<img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy">` : ""}<b>${esc(p.name)}</b><p>${esc(p.desc || "")}</p><div class="row"><span>${esc(p.price || "")}</span><button class="btn sm" data-ask="${i}">Érdeklődöm</button></div></article>`).join("");
$("#staff").innerHTML = staff.length > 1 || staff[0].name ? staff.map(s => `<div class="card person"><span class="av">${esc(s.name[0] || "")}</span><b>${esc(s.name)}</b><p>${esc(s.role || "")}</p></div>`).join("") : "";
$("#gallery").innerHTML = (C.gallery || []).map(g => `<button class="g" data-src="${esc(g)}" aria-label="Kép nagyítása"><img src="${esc(g)}" alt="" loading="lazy"></button>`).join("");
$("#reviews").innerHTML = (C.reviews || []).map(r => `<blockquote>„${esc(r.text)}”<cite>— ${esc(r.who)}</cite></blockquote>`).join("");
if (C.reviewUrl) { const a = $("#reviewlink"); a.hidden = false; a.href = C.reviewUrl; }
$("#faq").innerHTML = (C.faq || []).map(f => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("");
$("#hours").innerHTML = C.hours.map((h, i) => `<li class="${i === dow(new Date()) ? "today" : ""}"><span>${DAYS[i]}</span><span>${h ? h.join(" – ") : "Zárva"}</span></li>`).join("");
$("#contact").innerHTML = `${esc(C.address)}<br><a href="tel:${tel}">${esc(C.phone)}</a> · <a href="mailto:${esc(C.email)}">${esc(C.email)}</a>`;
$("#dir").href = mapsDir;
$("#map").src = "https://maps.google.com/maps?output=embed&q=" + encodeURIComponent(C.address);
$("#social").innerHTML = Object.entries(C.social || {}).filter(([, v]) => v).map(([k, v]) => `<a href="${esc(v)}" target="_blank" rel="noopener">${k[0].toUpperCase() + k.slice(1)}</a>`).join(" · ");
$("#year").textContent = new Date().getFullYear();
$("#foot").textContent = C.name;
// üres szekciók elrejtése
for (const s of document.querySelectorAll("[data-has]")) if (!C[s.dataset.has]?.length || (s.dataset.has === "staff" && !$("#staff").innerHTML)) s.remove();
if (!(C.perks || []).length) $("#perks").remove();
document.querySelectorAll(".links a").forEach(l => { if (!document.querySelector(l.getAttribute("href"))) l.remove(); }); // nincs ilyen szekció -> nincs menüpont

// galéria nagyítás
document.addEventListener("click", e => {
  const g = e.target.closest("[data-src]"); if (!g) return;
  $("#lb img").src = g.dataset.src; $("#lb").showModal();
});
$("#lb").onclick = e => e.target === $("#lb") && $("#lb").close();

/* ---------- animációk ---------- */
if (!calm && "IntersectionObserver" in window) {
  // lépcsőzetes megjelenés görgetéskor
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: .12 });
  document.querySelectorAll(".rv").forEach(s => {
    s.querySelectorAll(":scope > h2, :scope > .list > li, :scope > .cards > *, :scope > #faq > details, :scope > .gallery > *, :scope > p, :scope > iframe").forEach((x, i) => { x.classList.add("st"); x.style.setProperty("--i", i); });
    if (s.id === "perks") [...s.children].forEach((x, i) => { x.classList.add("st"); x.style.setProperty("--i", i); });
    s.classList.add("pre"); io.observe(s);
  });
  // fénykör az egér alatt a kártyákon (csak egérrel)
  if (!touch) document.addEventListener("pointermove", e => {
    const c = e.target.closest?.(".card, blockquote"); if (!c) return;
    const r = c.getBoundingClientRect(); c.style.setProperty("--mx", e.clientX - r.left + "px"); c.style.setProperty("--my", e.clientY - r.top + "px");
  }, { passive: true });
  // az értékelés szám felfut
  if (C.rating) {
    const el = $("#rating"), end = C.rating.score, tot = C.rating.count, t0 = performance.now() + 900;
    const tick = now => { const k = Math.min(1, Math.max(0, (now - t0) / 1100)), e = 1 - (1 - k) ** 3; el.textContent = `★ ${(end * e).toFixed(1)} · ${Math.round(tot * e)} értékelés`; if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
}
// fejléc árnyék + görgetési csík (egy rAF-fal, nem terheli a telefont)
{
  const top = $(".top"), prog = $("#prog"); let q = false;
  const upd = () => { q = false; const y = scrollY, h = document.documentElement.scrollHeight - innerHeight; top.classList.toggle("scrolled", y > 24); prog.style.setProperty("--p", h > 0 ? y / h : 0); };
  addEventListener("scroll", () => { if (!q) { q = true; requestAnimationFrame(upd); } }, { passive: true }); upd();
}
function confetti() {
  if (calm) return;
  const cols = [C.accent, "#2e9e5b", "#4d7cfe", "#f5a623", "#e0457b"], f = document.createDocumentFragment();
  for (let i = 0; i < 44; i++) { const p = document.createElement("i"); p.className = "cf"; p.style.cssText = `--x:${Math.random() * 100}vw;--c:${cols[i % 5]};--d:${1.4 + Math.random() * 1.4}s;--dx:${(Math.random() - .5) * 160}px;--rot:${Math.random() * 900 - 450}deg`; f.append(p); }
  document.body.append(f); setTimeout(() => document.querySelectorAll(".cf").forEach(p => p.remove()), 3200);
}

/* ---------- nyitva / zárva, banner, SEO ---------- */
function openState() {
  const n = new Date(), m = n.getHours() * 60 + n.getMinutes();
  const hrs = d => closed.has(ymd(d)) ? null : C.hours[dow(d)];
  const h = hrs(n);
  if (h && m >= mins(h[0]) && m < mins(h[1])) return { on: true, t: `Most nyitva · ${h[1]}-ig` };
  for (let i = 0; i < 14; i++) {
    const d = new Date(n.getTime() + i * 864e5), hh = hrs(d);
    if (hh && (i > 0 || m < mins(hh[0]))) return { on: false, t: `Zárva · nyit: ${i === 0 ? "ma" : i === 1 ? "holnap" : DAYS[dow(d)].toLowerCase()} ${hh[0]}` };
  }
  return { on: false, t: "Zárva" };
}
function refresh() {
  const s = openState(), b = $("#openbadge");
  b.textContent = s.t; b.className = "badge " + (s.on ? "on" : "off");
  const bn = $("#banner"); bn.hidden = !banner; bn.textContent = banner;
}
refresh();
if (API) call("/info").then(({ data }) => { if (data.closed) closed = new Set([...closed, ...data.closed]); if (data.banner) banner = data.banner; refresh(); }).catch(() => {});

if (C.analytics) document.head.append(Object.assign(document.createElement("script"), { defer: true, src: "https://static.cloudflareinsights.com/beacon.min.js", dataset: { cfBeacon: JSON.stringify({ token: C.analytics }) } }));

// Google-találat: helyi cég + GYIK + (ha van) értékelés
const ld = document.createElement("script");
ld.type = "application/ld+json";
ld.textContent = JSON.stringify({
  "@context": "https://schema.org", "@type": C.schemaType || "LocalBusiness", name: C.name, url: C.url, telephone: C.phone, email: C.email,
  address: { "@type": "PostalAddress", streetAddress: C.address, addressCountry: "HU" },
  sameAs: Object.values(C.social || {}).filter(Boolean),
  openingHoursSpecification: C.hours.map((h, i) => h && { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][i], opens: h[0], closes: h[1] }).filter(Boolean),
  ...(C.rating && { aggregateRating: { "@type": "AggregateRating", ratingValue: C.rating.score, reviewCount: C.rating.count } }),
  mainEntityOfPage: { "@type": "FAQPage", mainEntity: (C.faq || []).map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
});
document.head.append(ld);

/* ---------- ember-ellenőrzés (Cloudflare Turnstile, csak ha a config megadja a kulcsot) ---------- */
let tsReady = null;
function turnstile() {
  tsReady ??= new Promise(res => { const s = Object.assign(document.createElement("script"), { src: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit", async: true, onload: () => res(true), onerror: () => res(false) }); document.head.append(s); });
  return tsReady;
}
async function humanToken() { // token a /book és /msg híváshoz; üres, ha nincs bekapcsolva
  if (!C.turnstile) return "";
  if (!(await turnstile())) return "";
  const box = $("#ts"); box.replaceChildren();
  return new Promise(res => {
    const done = t => { box.replaceChildren(); res(t); };
    const timer = setTimeout(() => done(""), 30000);
    window.turnstile.render(box, { sitekey: C.turnstile, appearance: "interaction-only", callback: t => { clearTimeout(timer); done(t); }, "error-callback": () => { clearTimeout(timer); done(""); } });
  });
}

/* ---------- chatbot (szabályalapú, nincs külső szolgáltatás) ---------- */
const msgs = $("#msgs"), chips = $("#chips"), panel = $("#bot");
let ask = null, started = false, q = Promise.resolve(); // q: a bot üzenetei sorban, "gépel…" jelzéssel jelennek meg
const mine = () => { try { return JSON.parse(localStorage.getItem("bk_" + C.slug)); } catch { return null; } };
const scroll = () => msgs.scrollTo({ top: msgs.scrollHeight, behavior: calm ? "auto" : "smooth" });

const bubble = (t, who) => { const d = document.createElement("div"); d.className = "m " + who; d.textContent = t; msgs.append(d); scroll(); };
const user = t => bubble(t, "me");
const say = t => { q = q.then(async () => {
  if (!calm) { const ty = document.createElement("div"); ty.className = "m bot typing"; ty.innerHTML = "<i></i><i></i><i></i>"; msgs.append(ty); scroll(); await wait(Math.min(900, 280 + t.length * 7)); ty.remove(); }
  bubble(t, "bot");
}); return q; };
const offer = list => { q = q.then(() => {
  chips.className = list.length > 8 ? "many" : "";
  chips.replaceChildren(...list.map(([l, fn]) => { const b = document.createElement("button"); b.textContent = l; b.onclick = () => { ask = null; user(l); chips.replaceChildren(); fn(); }; return b; }));
  scroll();
}); return q; };
const home = () => offer([
  ...(canBook ? [["Időpontot foglalok", book]] : []),
  ["Nyitvatartás", showHours], ["Árak", showPrices], ["Elérhetőség", showContact],
  ["Üzenetet hagyok", msg],
  ...(canBook && API ? [["Foglalás lemondása", cancel]] : []),
]);
const wa = text => C.whatsapp ? `https://wa.me/${C.whatsapp}?text=${encodeURIComponent(text)}` : `mailto:${C.email}?subject=${encodeURIComponent(C.name)}&body=${encodeURIComponent(text)}`;

function showHours() { say(C.hours.map((h, i) => `${DAYS[i]}: ${h ? h.join("–") : "zárva"}`).join("\n") + "\n\n" + openState().t); home(); }
function showPrices() {
  const l = [...(C.services || []).map(s => `${s.name}: ${s.price} (${s.min} perc)`), ...(C.products || []).map(p => `${p.name}: ${p.price || "érdeklődjön"}`)];
  say(l.length ? l.join("\n") : `Árakért hívjon minket: ${C.phone}`); home();
}
function showContact() { say(`${C.address}\nTelefon: ${C.phone}\n${C.email}`); offer([["Útvonaltervezés", () => { window.open(mapsDir, "_blank", "noopener"); home(); }]]); }

/* --- foglalás --- */
async function loadBusy() {
  if (!API) return busy = [];
  const from = ymd(new Date()), to = ymd(new Date(Date.now() + (C.days || 30) * 864e5));
  try { busy = (await call(`/busy?from=${from}&to=${to}`)).data.busy || []; } catch { busy = []; }
}
// szabad időpontok egy napra: [[percben, munkatárs]] – "bárki" esetén az első szabad munkatárs
function freeSlots(date, dur, who) {
  const key = ymd(date), now = new Date(), isToday = key === ymd(now), out = new Map();
  if (closed.has(key)) return [];
  for (const s of staff.filter(s => !who || s.name === who)) {
    const h = (s.hours || C.hours)[dow(date)]; if (!h) continue;
    for (let t = mins(h[0]); t + dur <= mins(h[1]); t += C.step || 30) {
      if (isToday && t < now.getHours() * 60 + now.getMinutes() + (C.notice ?? 60)) continue;
      if (busy.some(([d, bs, bd, bst]) => d === key && bst === s.name && t < bs + bd && bs < t + dur)) continue;
      if (!out.has(t)) out.set(t, s.name);
    }
  }
  return [...out].sort((a, b) => a[0] - b[0]);
}
async function book() {
  const b = {};
  say("Melyik szolgáltatást szeretné?");
  await loadBusy();
  offer(C.services.map(s => [`${s.name} · ${s.price}`, () => { b.s = s; staff.length > 1 ? pickStaff(b) : pickDay(b); }]));
}
function pickStaff(b) {
  say("Kinél szeretne időpontot?");
  offer([["Mindegy", () => { b.who = ""; pickDay(b); }], ...staff.map(s => [s.name, () => { b.who = s.name; pickDay(b); }])]);
}
function pickDay(b) {
  const opts = [];
  for (let i = 0; i < (C.days || 30) && opts.length < 6; i++) {
    const d = new Date(Date.now() + i * 864e5);
    if (freeSlots(d, b.s.min, b.who).length) opts.push([i === 0 ? "Ma" : i === 1 ? "Holnap" : `${DAYS[dow(d)]} ${d.getMonth() + 1}.${d.getDate()}.`, () => pickTime(b, d)]);
  }
  if (!opts.length) { say(`Sajnos nincs szabad időpont. Hívjon minket: ${C.phone}`); return home(); }
  say("Melyik napon?"); offer(opts);
}
function pickTime(b, d) {
  b.date = ymd(d);
  say("Melyik időpont megfelelő?");
  offer(freeSlots(d, b.s.min, b.who).slice(0, 24).map(([t, who]) => [hhmm(t), () => { b.start = t; b.staff = who; getName(b); }]));
}
function getName(b) {
  say("Hogy hívják?");
  ask = v => { if (!/^[\p{L}\p{N}][\p{L}\p{N}\p{M}.,'’ -]{1,59}$/u.test(v)) return say("Kérem, a nevét betűkkel adja meg."); b.name = v.slice(0, 60); getPhone(b); };
}
function getPhone(b) {
  say("Milyen telefonszámon érjük el? (Csak az időpont miatt használjuk.)");
  ask = v => {
    if (!/^[+\d][\d\s()./-]{5,29}$/.test(v) || v.replace(/\D/g, "").length < 7) return say("Ez nem tűnik telefonszámnak, kérem írja be újra (pl. +36 30 123 4567).");
    b.phone = v.slice(0, 30); ask = null; confirmBooking(b);
  };
}
function confirmBooking(b) {
  b.sum = `${b.s.name}${b.staff ? " · " + b.staff : ""}\n${b.date} ${hhmm(b.start)}\n${b.name}, ${b.phone}`;
  say(`Összefoglaló:\n${b.sum}\nRendben?`);
  offer([["Igen, foglalom", () => send(b)], ["Mégsem", () => { say("Rendben, nem foglaltam semmit."); home(); }]]);
}
let busyNow = false; // dupla kattintás ellen
async function send(b) {
  if (!API) { // backend nélkül: előre kitöltött üzenet, egy kattintás
    say("Az üzenet előkészítve. Küldje el, és hamarosan visszaigazoljuk.");
    return offer([["Üzenet küldése", () => { window.open(wa("Időpontot szeretnék foglalni:\n" + b.sum), "_blank", "noopener"); home(); }]]);
  }
  if (busyNow) return; busyNow = true;
  try {
    const ts = await humanToken();
    if (C.turnstile && !ts) throw 0;
    const { status, data } = await call("/book", { date: b.date, start: b.start, dur: b.s.min, staff: b.staff, service: b.s.name, name: b.name, phone: b.phone, ts });
    if (status === 409) { say("Ezt az időpontot közben valaki lefoglalta. Válasszon másikat."); await loadBusy(); return pickDay(b); }
    if (status === 429) { say(`Túl sok kérés érkezett. Kérem próbálja később, vagy hívjon: ${C.phone}`); return home(); }
    if (status !== 200) throw 0;
    localStorage.setItem("bk_" + C.slug, JSON.stringify({ id: data.id, date: b.date, start: b.start, dur: b.s.min, service: b.s.name }));
    confetti();
    say(`Kész, az időpontot rögzítettük! Várjuk szeretettel.\nLemondási kód: ${data.id}`);
    offer([["Naptárba teszem", () => { ics(b, data.id); home(); }], ["Útvonaltervezés", () => { window.open(mapsDir, "_blank", "noopener"); home(); }], ["Köszönöm", home]]);
  } catch { say(`Nem sikerült a foglalás. Kérem hívjon: ${C.phone}`); home(); }
  finally { busyNow = false; }
}
function ics(b, id) {
  const d = b.date.replaceAll("-", ""), f = m => hhmm(m).replace(":", "") + "00";
  const txt = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//kisweb//HU", "BEGIN:VEVENT", `UID:${id}@${C.slug}`, `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d+/g, "")}`,
    `DTSTART:${d}T${f(b.start)}`, `DTEND:${d}T${f(b.start + b.s.min)}`, `SUMMARY:${b.s.name} – ${C.name}`, `LOCATION:${C.address}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([txt], { type: "text/calendar" })), download: "idopont.ics" }).click();
}
function cancel() {
  const m = mine();
  if (m) { say(`Lemondja ezt az időpontot?\n${m.service}, ${m.date} ${hhmm(m.start)}`); return offer([["Igen, lemondom", () => doCancel(m.id)], ["Nem", home]]); }
  say("Kérem, írja be a 6 karakteres lemondási kódot (a foglaláskor kapta).");
  ask = v => { ask = null; doCancel(v.trim().toUpperCase()); };
}
async function doCancel(id) {
  const { status } = await call("/cancel", { id }).catch(() => ({ status: 0 }));
  if (status === 200) { localStorage.removeItem("bk_" + C.slug); say("Az időpontot lemondtuk. Köszönjük, hogy szólt!"); }
  else say(status === 404 ? "Ezt a kódot nem találom, vagy az időpont már elmúlt." : status === 429 ? "Túl sok próbálkozás, kérem próbálja később." : `Nem sikerült. Kérem hívjon: ${C.phone}`);
  home();
}

/* --- üzenet / érdeklődés --- */
function msg(prefill = "") {
  const go = text => {
    say("Hogyan érjük el? (név és telefonszám vagy e-mail)");
    ask = async c => {
      ask = null;
      if (!API) { say("Az üzenet előkészítve, küldje el egy kattintással."); return offer([["Üzenet küldése", () => { window.open(wa(`${text}\n\n${c}`), "_blank", "noopener"); home(); }]]); }
      const ts = await humanToken();
      const { status } = C.turnstile && !ts ? { status: 0 } : await call("/msg", { text, contact: c.slice(0, 100), ts }).catch(() => ({ status: 0 }));
      say(status === 200 ? "Köszönjük, továbbítottuk! Hamarosan jelentkezünk." : status === 429 ? `Túl sok üzenet érkezett. Kérem hívjon: ${C.phone}` : `Nem sikerült elküldeni. Kérem hívjon: ${C.phone}`); home();
    };
  };
  if (prefill) return go(prefill);
  say("Írja le kérdését vagy üzenetét:");
  ask = t => { if (t.length < 2) return say("Kérem írjon egy kicsit többet."); go(t.slice(0, 800)); };
}

// szabad szöveg: ékezetek nélküli kulcsszavak; a magyar ragozást a szó első 5 betűjével kezeli
const stem = s => norm(s).split(/[^a-z0-9]+/).filter(w => w.length > 3).map(w => w.slice(0, 5));
const best = (words, items, text) => {
  let hit = null, score = 0;
  for (const it of items) { const s = stem(text(it)); const k = words.filter(x => s.includes(x)).length; if (k > score) { score = k; hit = it; } }
  return hit;
};
const intents = [
  [/\b(szia|hello|hali|jo napot|jo reggelt|jo estet)\b/, () => { say("Szia! Miben segíthetek?"); home(); }],
  [/lemond|torol|modosit/, () => API ? cancel() : (say(`Lemondáshoz hívjon: ${C.phone}`), home())],
  [/idopont|foglal|szabad|appoint/, () => canBook ? book() : (say(`Hívjon minket: ${C.phone}`), home())],
  [/nyitva|nyitas|nyitok|zaras|zarva|mikor|hany ora/, showHours],
  [/\bar\b|arak|aral|mennyi|koltseg|kerul|fizet/, showPrices],
  [/telefon|cim|hol |elerhet|email|merre|hivni/, showContact],
  [/uzenet|panasz|ajanlat|kerdesem/, () => msg()],
];
function understand(text) {
  const n = norm(text);
  for (const [re, fn] of intents) if (re.test(n)) return fn();
  const w = stem(text), f = best(w, C.faq || [], f => f.q + " " + f.a);
  if (f) { say(f.a); return home(); }
  const p = best(w, C.products || [], p => p.name + " " + (p.desc || ""));
  if (p) { say(`${p.name}${p.price ? ": " + p.price : ""}\nSzeretne rákérdezni a készletre?`); return offer([["Igen, kérdezek", () => msg(`Érdeklődöm: ${p.name}`)], ["Nem, köszönöm", home]]); }
  say(`Ebben nem vagyok biztos. Hívjon minket: ${C.phone}, vagy válasszon:`); home();
}

$("#botform").onsubmit = e => {
  e.preventDefault();
  const v = $("#botin").value.trim(); if (!v) return;
  $("#botin").value = ""; user(v);
  if (ask) ask(v); else understand(v);
};

// telefonon a chat teljes képernyős; a --vh a látható területhez (billentyűzet nélkül) igazodik
const phone = matchMedia("(max-width:640px)");
const fit = () => panel.style.setProperty("--vh", (window.visualViewport?.height ?? innerHeight) + "px");
function openBot(go, arg) {
  panel.hidden = false; $("#botfab").hidden = true;
  if (phone.matches) { document.body.classList.add("lock"); fit(); }
  if (!started) { started = true; say(`Üdvözlöm a(z) ${C.name} oldalán! Miben segíthetek?`); home(); }
  if (go === "book") { user("Időpontot foglalok"); chips.replaceChildren(); book(); }
  if (go === "msg") { user("Üzenetet hagyok"); chips.replaceChildren(); msg(arg); }
  if (!phone.matches) $("#botin").focus({ preventScroll: true }); // telefonon ne ugorjon fel a billentyűzet magától
}
function closeBot() { panel.hidden = true; $("#botfab").hidden = false; document.body.classList.remove("lock"); }
window.visualViewport?.addEventListener("resize", () => { if (!panel.hidden && phone.matches) { fit(); scroll(); } });
addEventListener("keydown", e => { if (e.key === "Escape" && !panel.hidden) closeBot(); });
$("#botfab").onclick = () => openBot();
$("#botx").onclick = closeBot;
document.addEventListener("click", e => {
  const b = e.target.closest("[data-bot]"); if (b) return openBot(b.dataset.bot === "chat" ? undefined : b.dataset.bot);
  const p = e.target.closest("[data-ask]"); if (p) openBot("msg", `Érdeklődöm: ${C.products[+p.dataset.ask].name}`);
});
setTimeout(() => { if (!started && !calm) $("#botfab").classList.add("nudge"); }, 8000); // egyszer, finoman jelzi magát

/* ---------- demó-választó: ?demo az URL végén, ügyfélbemutatóhoz ---------- */
if (new URLSearchParams(location.search).has("demo")) {
  const d = document.createElement("div"); d.id = "demo";
  const mk = (txt, fn, cls = "") => Object.assign(document.createElement("button"), { textContent: txt, className: cls, onclick: fn });
  for (const t of ["classic", "modern", "bold"]) d.append(mk(t, () => root.dataset.theme = t));
  for (const c of ["#b8860b", "#c2185b", "#1e6fd9", "#2e8b57", "#e4572e"]) { const b = mk("", () => root.style.setProperty("--a", c), "dot"); b.style.background = c; b.setAttribute("aria-label", c); d.append(b); }
  document.body.append(d);
}
})();
