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
let closed = new Set(C.closed || []), banner = C.banner || "", busy = [], calRedraw = () => {};

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
const live = !!(API && C.googleReviews); // élő Google-vélemények: a szekció addig marad, amíg a Worker válaszol
const drawReviews = list => $("#reviews").innerHTML = list.map(r => `<blockquote>${r.stars ? `<span class="stars" role="img" aria-label="${r.stars} csillag">${"★".repeat(r.stars)}${"☆".repeat(5 - r.stars)}</span>` : ""}„${esc(r.text)}”<cite>— ${esc(r.who)}${r.when ? " · " + esc(r.when) : ""}</cite></blockquote>`).join("");
drawReviews(C.reviews || []);
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
for (const s of document.querySelectorAll("[data-has]")) if (!(s.dataset.has === "reviews" && live) && (!C[s.dataset.has]?.length || (s.dataset.has === "staff" && !$("#staff").innerHTML))) s.remove();
if (!(API && canBook)) $("#naptar").remove(); // a naptár a foglalási szerver adataiból él
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
    const el = $("#rating"), t0 = performance.now() + 900;
    const tick = now => { const { score, count } = C.rating, k = Math.min(1, Math.max(0, (now - t0) / 1100)), e = 1 - (1 - k) ** 3; el.textContent = `★ ${(score * e).toFixed(1)} · ${Math.round(count * e)} értékelés`; if (k < 1) requestAnimationFrame(tick); }; // a Google-adat közben is beleíródhat
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
if (API) call("/info").then(({ data }) => { if (data.closed) closed = new Set([...closed, ...data.closed]); if (data.banner) banner = data.banner; refresh(); calRedraw(); }).catch(() => {});

if (C.analytics) document.head.append(Object.assign(document.createElement("script"), { defer: true, src: "https://static.cloudflareinsights.com/beacon.min.js", dataset: { cfBeacon: JSON.stringify({ token: C.analytics }) } }));

// Google-találat: helyi cég + GYIK + (ha van) értékelés
const ld = document.createElement("script");
ld.type = "application/ld+json";
const ldJson = () => JSON.stringify({
  "@context": "https://schema.org", "@type": C.schemaType || "LocalBusiness", name: C.name, url: C.url, telephone: C.phone, email: C.email,
  address: { "@type": "PostalAddress", streetAddress: C.address, addressCountry: "HU" },
  sameAs: Object.values(C.social || {}).filter(Boolean),
  openingHoursSpecification: C.hours.map((h, i) => h && { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][i], opens: h[0], closes: h[1] }).filter(Boolean),
  ...(C.rating && { aggregateRating: { "@type": "AggregateRating", ratingValue: C.rating.score, reviewCount: C.rating.count } }),
  mainEntityOfPage: { "@type": "FAQPage", mainEntity: (C.faq || []).map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
});
ld.textContent = ldJson();
document.head.append(ld);

// élő Google-vélemények (12 óránként frissülnek a Workerben); hiba esetén a config.js-ben lévők maradnak
const noReviews = () => { if (!C.reviews?.length) { $("#velemenyek")?.remove(); document.querySelector('.links a[href="#velemenyek"]')?.remove(); } }; // nincs mit mutatni: eltűnik a szekció és a menüpont
if (live) call("/reviews").then(({ data }) => {
  if (data.list?.length) {
    drawReviews(data.list);
    const g = $("#gsrc"); g.hidden = false; g.textContent = `Google-értékelések · ★ ${data.score} (${data.count})`;
    C.rating = { score: data.score, count: data.count };
    const r = $("#rating"); r.hidden = false; r.textContent = `★ ${data.score} · ${data.count} értékelés`;
    ld.textContent = ldJson();
    if (data.write && !C.reviewUrl) { const a = $("#reviewlink"); a.hidden = false; a.href = data.write; }
  } else noReviews();
}).catch(noReviews);

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

/* ---------- chatbot: a core/nlu.js érti, a core/compose.js fogalmazza, itt a végrehajtás ---------- */
const msgs = $("#msgs"), chips = $("#chips"), panel = $("#bot");
const Z = Compose.create(C, { closed: () => closed }); // mondatok (Z.reg: tegező/magázó)
const engine = NLU.create(C);
let ask = null, started = false, q = Promise.resolve(); // q: a bot üzenetei sorban, "gépel…" jelzéssel jelennek meg
// beszélgetési memória: topic, svc (az utoljára említett szolgáltatás), who, name, phone (csak a lap életében), draft (a futó foglalás), lastBot
const ctx = {};
const mine = () => { try { return JSON.parse(localStorage.getItem("bk_" + C.slug)); } catch { return null; } };
// görgetés az utolsó üzenethez; ha az hosszabb a látható területnél, az ELEJÉRE áll (különben a hosszú válasz eleje kicsúszna)
const scroll = (el = msgs.lastElementChild) => msgs.scrollTo({ top: el && el.offsetHeight > msgs.clientHeight * .7 ? el.offsetTop - 10 : msgs.scrollHeight, behavior: calm ? "auto" : "smooth" });

const bubble = (t, who) => { const d = document.createElement("div"); d.className = "m " + who; d.textContent = t; msgs.append(d); scroll(d); return d; };
const user = t => bubble(t, "me");
// a bot "gépel": hárompontos jelzés 1–4 mp-ig (a válasz hosszával nő, kis véletlennel), aztán egyben jelenik meg; csökkentett mozgásnál azonnal
const [dMin, dMax] = C.botDelay || [1000, 4000];
const pace = t => Math.min(dMax, Math.max(dMin, dMin + t.length * 12 + Math.random() * 400));
let pend = 0; // függő bot-üzenetek: amíg gépel, a régi gombok nem nyomhatók (különben elavult kérdésre válaszolna a vendég)
const say = t => { ctx.lastBot = t; pend++; chips.inert = true; q = q.then(async () => {
  try {
    if (calm) return bubble(t, "bot");
    const ty = document.createElement("div"); ty.className = "m bot typing"; ty.setAttribute("aria-label", "Az asszisztens ír…"); ty.innerHTML = "<i></i><i></i><i></i>"; msgs.append(ty); scroll(ty);
    await wait(pace(t)); ty.remove(); bubble(t, "bot");
  } finally { if (!--pend) chips.inert = false; }
}); return q; };
const offer = list => { q = q.then(() => {
  chips.className = list.length > 8 ? "many" : "";
  chips.replaceChildren(...list.map(([l, fn]) => { const b = document.createElement("button"); b.textContent = l; b.onclick = () => { ask = null; user(l); chips.replaceChildren(); fn(); }; return b; }));
  scroll();
}); return q; };
const homeList = () => [
  ...(canBook ? [["Időpontot foglalok", () => book()]] : []),
  ["Nyitvatartás", () => showHours()], ["Árak", () => showPrices()], ["Elérhetőség", showContact],
  ["Üzenetet hagyok", () => msg()],
  ...(canBook && API ? [["Foglalás lemondása", cancel]] : []),
];
const home = () => { ctx.draft = null; offer(homeList()); };
// válasz után: ha közben foglalás van folyamatban, oda tér vissza (a bot "emlékszik", hol tartottak), különben főmenü
const back = () => { const b = ctx.draft; if (!b) return home(); say(Z.resume()); resume(b); };
const wa = text => C.whatsapp ? `https://wa.me/${C.whatsapp}?text=${encodeURIComponent(text)}` : `mailto:${C.email}?subject=${encodeURIComponent(C.name)}&body=${encodeURIComponent(text)}`;

// d: egy konkrét nap (Date) nyitvatartása; at: perc – akkor nyitva vagyunk-e; egyik sem: a teljes hét
function showHours(d, at) { ctx.topic = "hours"; say(Z.hours({ date: d, at })); back(); }
// o: { svcs: csak ezek, sup: "min"|"max", budget: { max }|{ min } }
function showPrices(o = {}) {
  ctx.topic = "price"; say(Z.prices(o));
  if (o.svcs?.length && canBook && !ctx.draft) return offer([["Időpontot foglalok", () => book(o.svcs.length === 1 ? { s: o.svcs[0] } : { opts: o.svcs })], ["Minden ár", () => showPrices()]]);
  back();
}
function showContact() { say(Z.contact()); ctx.draft ? back() : offer([["Útvonaltervezés", () => { window.open(mapsDir, "_blank", "noopener"); home(); }]]); }

/* --- foglalás --- */
async function loadBusy() {
  if (!API) return busy = [];
  const from = ymd(new Date()), to = ymd(new Date(Date.now() + (C.days || 30) * 864e5));
  try { busy = (await call(`/busy?from=${from}&to=${to}`)).data.busy || []; } catch { busy = []; }
}
// szabad időpontok egy napra: [[percben, munkatárs]] – "bárki" esetén az első szabad munkatárs
function freeSlots(date, dur, who, all) { // all: a foglalt időpontok is benne vannak (munkatárs = null) – a naptár nézethez
  const key = ymd(date), now = new Date(), isToday = key === ymd(now), out = new Map();
  if (closed.has(key)) return [];
  for (const s of staff.filter(s => !who || s.name === who)) {
    const h = (s.hours || C.hours)[dow(date)]; if (!h) continue;
    for (let t = mins(h[0]); t + dur <= mins(h[1]); t += C.step || 30) {
      if (isToday && t < now.getHours() * 60 + now.getMinutes() + (C.notice ?? 60)) continue;
      if (busy.some(([d, bs, bd, bst]) => d === key && bst === s.name && t < bs + bd && bs < t + dur)) { if (all && !out.has(t)) out.set(t, null); continue; }
      if (!out.get(t)) out.set(t, s.name);
    }
  }
  return [...out].sort((a, b) => a[0] - b[0]);
}
// pre: amit a szabad szövegből már tudunk (s: szolgáltatás, opts: szűkített lista, who, date: "ÉÉÉÉ-HH-NN", at: perc, part: [tól, ig] perc) – a kész lépéseket kihagyja
async function book(pre = {}) {
  const b = ctx.draft = { ...pre };
  ctx.topic = "book";
  await loadBusy();
  next(b);
}
function next(b) {
  if (!b.s) { say(Z.askService()); return offer((b.opts || C.services).map(s => [`${s.name} · ${s.price}`, () => { b.s = s; next(b); }])); }
  if (staff.length > 1 && b.who === undefined) return pickStaff(b);
  if (b.date && (b.date < ymd(new Date()) || b.date > ymd(new Date(Date.now() + (C.days || 30) * 864e5)))) { say(Z.tooFar(C.days || 30)); delete b.date; }
  b.date ? pickTime(b, new Date(b.date + "T12:00:00")) : pickDay(b);
}
// a megszakított foglalás ott folytatódik, ahol abbamaradt
function resume(b) {
  if (!b.s || !b.date || b.start == null) return next(b);
  if (!b.name) return getName(b);
  if (!b.phone) return getPhone(b);
  confirmBooking(b);
}
// a vendég a futó foglalást módosította ("inkább kedden", "férfi hajvágás legyen", "Dórinál"): átírjuk, ami változott
function mergeDraft(r) {
  const b = ctx.draft, drop = () => { delete b.start; delete b.staff; };
  for (const k of r.corr?.reset || []) { if (k === "date") { delete b.date; drop(); } if (k === "time") { delete b.at; drop(); } if (k === "svc") { delete b.s; drop(); } }
  if (r.svcs.length === 1) { if (b.s !== r.svcs[0]) { b.s = r.svcs[0]; drop(); } } else if (r.svcs.length > 1 && !b.s) b.opts = r.svcs;
  if (r.who) { b.who = r.who.name; drop(); }
  if (r.date) { b.date = ymd(r.date); drop(); }
  if (r.at != null) { b.at = r.at; drop(); }
  if (r.part) { b.part = r.part; drop(); }
  ask = null; chips.replaceChildren();
  say(Z.changed(b)); next(b);
}
function pickStaff(b) {
  say(Z.askStaff());
  offer([["Mindegy", () => { b.who = ""; next(b); }], ...staff.map(s => [s.name, () => { b.who = s.name; next(b); }])]);
}
function pickDay(b) {
  const opts = [];
  for (let i = 0; i < (C.days || 30) && opts.length < 6; i++) {
    const d = new Date(Date.now() + i * 864e5);
    if (freeSlots(d, b.s.min, b.who).length) opts.push([i === 0 ? "Ma" : i === 1 ? "Holnap" : `${DAYS[dow(d)]} ${d.getMonth() + 1}.${d.getDate()}.`, () => pickTime(b, d)]);
  }
  if (!opts.length) { say(Z.noSlots()); return home(); }
  say(Z.askDay()); offer(opts);
}
const slotChosen = (b, t, who) => { b.start = t; b.staff = who; delete b.at; delete b.part; b.name && b.phone ? confirmBooking(b) : getName(b); }; // a korábban megadott név/telefon marad
function pickTime(b, d) {
  b.date = ymd(d);
  let sl = freeSlots(d, b.s.min, b.who);
  const { at, part } = b;
  if (!sl.length) { say(Z.noDay()); delete b.date; return pickDay(b); }
  const hit = at != null && sl.find(([t]) => t === at);
  if (hit) { say(Z.slotFree(at)); return slotChosen(b, hit[0], hit[1]); }
  if (at != null) { say(Z.slotBusy(at)); sl = sl.map(x => [x, Math.abs(x[0] - at)]).sort((a, c) => a[1] - c[1]).slice(0, 8).map(x => x[0]).sort((a, c) => a[0] - c[0]); } // a kért időhöz legközelebbiek
  else if (part) { const p = sl.filter(([t]) => t >= part[0] && t < part[1]); say(Z.slotsPart(p.length > 0)); if (p.length) sl = p; }
  else say(Z.askTime());
  offer(sl.slice(0, 24).map(([t, who]) => [hhmm(t), () => slotChosen(b, t, who)]));
}
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N}\p{M}.,'’ -]{1,59}$/u, PHONE_RE = /^[+\d][\d\s()./-]{5,29}$/;
function getName(b) {
  say(Z.askName({ known: ctx.name }));
  const take = v => { b.name = ctx.name = v.slice(0, 60); getPhone(b); };
  const free = () => { ask = v => NAME_RE.test(v) ? take(v) : say(Z.badName()); ask.kind = "name"; };
  free();
  if (ctx.name) offer([[ctx.name, () => take(ctx.name)], ["Más néven", () => { say(Z.askName()); free(); }]]);
}
function getPhone(b) {
  say(Z.askPhone({ known: ctx.phone }));
  const take = v => { b.phone = ctx.phone = v.slice(0, 30); ask = null; confirmBooking(b); };
  const free = () => { ask = v => PHONE_RE.test(v) && v.replace(/\D/g, "").length >= 7 ? take(v) : say(Z.badPhone()); ask.kind = "phone"; };
  free();
  if (ctx.phone) offer([[ctx.phone, () => take(ctx.phone)], ["Másik szám", () => { say(Z.askPhone()); free(); }]]);
}
function confirmBooking(b) {
  b.sum = `${b.s.name}${b.staff ? " · " + b.staff : ""}\n${b.date} ${hhmm(b.start)}\n${b.name}, ${b.phone}`;
  say(Z.summary(b));
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
    if (status === 409) { say("Ezt az időpontot közben valaki lefoglalta. Válasszon másikat."); await loadBusy(); delete b.start; delete b.staff; delete b.date; return pickDay(b); }
    if (status === 429) { say(`Túl sok kérés érkezett. Kérem próbálja később, vagy hívjon: ${C.phone}`); return home(); }
    if (status !== 200) throw 0;
    localStorage.setItem("bk_" + C.slug, JSON.stringify({ id: data.id, date: b.date, start: b.start, dur: b.s.min, service: b.s.name }));
    confetti();
    say(`Kész, az időpontot rögzítettük! Várjuk szeretettel.\nLemondási kód: ${data.id}`);
    ctx.draft = null;
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
// "mikor van legkorábban hely?": a következő szabad időpont megkeresése
async function earliest(r) {
  if (!canBook) { say(Z.callUs()); return home(); }
  await loadBusy();
  const s = r.svcs[0] || ctx.svc || [...C.services].sort((a, c) => a.min - c.min)[0], who = r.who?.name;
  for (let i = 0; i < (C.days || 30); i++) {
    const d = new Date(Date.now() + i * 864e5), sl = freeSlots(d, s.min, who);
    if (sl.length) { say(Z.earliest({ svc: s, date: d, start: sl[0][0] })); return offer([["Igen, foglalom", () => book({ s, who: who ?? "", date: ymd(d), at: sl[0][0] })], ["Másik időpont", () => book({ s })]]); }
  }
  say(Z.noSlots()); home();
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

/* --- nyilvános naptár: csak olvasható; szabad időpontra kattintva a chat foglalást indít előtöltve --- */
if ($("#naptar")) {
  const minDur = Math.min(...C.services.map(s => s.min)), horizon = new Date(Date.now() + (C.days || 30) * 864e5);
  const first = ymd(new Date()).slice(0, 7), last = ymd(horizon).slice(0, 7), dayLabel = d => d.toLocaleDateString("hu-HU", { weekday: "long", month: "long", day: "numeric" });
  let mon = first, sel = null;
  const monthOf = (ym, n) => ymd(new Date(+ym.slice(0, 4), +ym.slice(5) - 1 + n, 1, 12)).slice(0, 7);
  const drawCal = () => {
    const [y, m] = mon.split("-").map(Number), lead = dow(new Date(y, m - 1, 1, 12)), n = new Date(y, m, 0).getDate(), today = ymd(new Date()), end = ymd(horizon);
    if (!sel) { // alapból az első szabad nap van kijelölve
      for (let i = 0; i < (C.days || 30) && !sel; i++) { const d = new Date(Date.now() + i * 864e5); if (freeSlots(d, minDur, "").length) sel = ymd(d); }
      sel ??= today; mon = sel.slice(0, 7); return drawCal();
    }
    $("#calmon").textContent = new Date(y, m - 1, 1, 12).toLocaleDateString("hu-HU", { year: "numeric", month: "long" });
    $("#calprev").disabled = mon <= first; $("#calnext").disabled = mon >= last;
    const cells = [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => new Date(y, m - 1, i + 1, 12))];
    $("#cal").replaceChildren(...["H", "K", "Sze", "Cs", "P", "Szo", "V"].map(t => Object.assign(document.createElement("span"), { className: "dn", textContent: t })), ...cells.map(d => {
      const b = document.createElement("button"); b.type = "button";
      if (!d) { b.className = "d o"; b.disabled = true; b.tabIndex = -1; b.setAttribute("aria-hidden", "true"); return b; }
      const k = ymd(d), inRange = k >= today && k <= end, free = inRange && freeSlots(d, minDur, "").length > 0;
      b.className = ["d", !inRange && "o", inRange && !free && "full", free && "free", k === today && "tod", k === sel && "sel"].filter(Boolean).join(" ");
      b.disabled = !inRange; b.dataset.d = k; b.setAttribute("aria-pressed", String(k === sel));
      b.setAttribute("aria-label", dayLabel(d) + (!inRange ? "" : free ? ", van szabad időpont" : closed.has(k) ? ", zárva" : ", betelt"));
      b.append(Object.assign(document.createElement("span"), { textContent: d.getDate() }), document.createElement("i"));
      b.onclick = () => { sel = k; drawCal(); };
      return b;
    }));
    drawDay();
  };
  const drawDay = () => {
    const box = $("#calday"), d = new Date(sel + "T12:00:00");
    const slots = closed.has(sel) ? [] : freeSlots(d, minDur, "", true), h = Object.assign(document.createElement("b"), { textContent: dayLabel(d) });
    if (!slots.length) return box.replaceChildren(h, Object.assign(document.createElement("p"), { className: "muted", textContent: closed.has(sel) || !C.hours[dow(d)] ? "Ezen a napon zárva vagyunk." : "Erre a napra nincs szabad időpont." }));
    const wrap = Object.assign(document.createElement("div"), { className: "slots" });
    wrap.append(...slots.map(([t, who]) => who === null
      ? Object.assign(document.createElement("span"), { className: "slot x", textContent: hhmm(t), title: "Foglalt" })
      : Object.assign(document.createElement("button"), { className: "slot", textContent: hhmm(t), onclick: () => openBot("book", { date: sel, at: t, who: "" }) })));
    box.replaceChildren(h, Object.assign(document.createElement("p"), { className: "muted small", textContent: "Kattintson egy szabad időpontra, és a chatben néhány lépésben kérheti." }), wrap);
  };
  $("#calprev").onclick = () => { mon = monthOf(mon, -1); drawCal(); };
  $("#calnext").onclick = () => { mon = monthOf(mon, 1); drawCal(); };
  const reload = () => loadBusy().then(() => { calRedraw = drawCal; drawCal(); }); // az első rajzolás a foglaltsági adat megérkezése után
  reload();
  setInterval(() => { if (!document.hidden) reload(); }, 60000); // a frissen foglalt időpontok maguktól eltűnnek
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

/* --- szabad szöveg --- */
const fallback = t => { say(Z.fallback()); offer([["Továbbítom a kérdésemet", () => msg(t.slice(0, 800))], ...homeList()]); };
function answerDoc({ type, i }, conf) { // GYIK / termék / előny találat; jelentés alapján talált válasznál a bot kimondja, mit értett
  if (type === "faq") { say(conf === "mid" ? Z.hedged(C.faq[i].q, C.faq[i].a) : C.faq[i].a); return back(); }
  if (type === "perk") { say(`${C.perks[i].t}: ${C.perks[i].d}`); return back(); }
  const p = C.products[i];
  say(`${p.name}${p.price ? ": " + p.price : ""}\nSzeretne rákérdezni a készletre?`);
  offer([["Igen, kérdezek", () => msg(`Érdeklődöm: ${p.name}`)], ["Nem, köszönöm", back]]);
}
const yesNo = n => { const m = n.replace(/[^a-z0-9 ]/g, "").trim(); return [/^(igen|ok|oke|rendben|jovan|aha|persze|termeszetesen)( kerem| legyen| koszonom)?$/.test(m), /^(nem|nem koszonom|nem kell|megsem|inkabb nem)$/.test(m)]; }; // csak a teljes, rövid válasz számít: "nem értem", "nem szeretnék időpontot" külön kérés
// a beírt szöveg egy gomb felirata / igen / nem? Ugyanaz, mintha rákattintott volna
const chipFor = n => { const [yes, no] = yesNo(n); return [...chips.children].find(b => { const l = norm(b.textContent); return l === n || (n.length > 2 && l.startsWith(n)) || (yes && l.startsWith("igen")) || (no && /^(nem|megsem)/.test(l)); }); };
const pressChip = btn => { msgs.lastElementChild.remove(); btn.click(); }; // a saját buborék helyett a gomb sorát mutatjuk

function understand(text) {
  const n = NLU.norm(text), btn = chipFor(n);
  if (btn) return pressChip(btn);
  if (yesNo(n)[1]) { say("Rendben. Ha kell valami, itt vagyok."); return home(); }

  const r = engine.classify(text, ctx);
  if (r.svcs.length === 1) ctx.svc = r.svcs[0];
  if (r.who) ctx.who = r.who.name;
  if (r.kind === "kb") return answerDoc(r.hit, r.conf);
  if (r.kind === "fallback") return fallback(text);
  if (r.kind === "suggest") { say(Z.suggest()); return offer([...r.alts.map(a => [a.title, () => answerDoc(a)]), ["Egyik sem", () => fallback(text)]]); }
  if (ctx.draft && r.slot && r.kind === "intent" && r.intents[0] === "book") return mergeDraft(r); // a futó foglalás módosítása, nem új foglalás

  const sv = r.svcs;
  // tájékoztató témák: egy üzenetben válaszol mindre
  const info = { hours: () => Z.hours({ date: r.date, at: r.at }), price: () => Z.prices({ svcs: sv, sup: r.sup, budget: r.budget }), duration: () => Z.duration({ svcs: sv }), contact: () => Z.contact(), staff: () => Z.staff({ who: r.who }) };
  const run = {
    greet: () => { say(Z.greet({ name: ctx.name })); back(); },
    thanks: () => { say(Z.thanks()); back(); },
    bye: () => say(Z.bye()),
    who: () => { say(Z.who()); back(); },
    help: () => { say(Z.help()); back(); },
    rude: () => { say(Z.rude()); offer([["Üzenetet hagyok", () => msg()], ["Főmenü", home]]); },
    decline: () => { say(Z.decline()); home(); },
    confused: () => { say(Z.confused()); back(); },
    repeat: () => { say(ctx.lastBot || Z.nothingToRepeat()); if (!ctx.draft && !chips.children.length) home(); }, // a gombok ott maradnak, ahol voltak
    intro: () => { ctx.name = r.name; say(Z.nameAck(r.name)); back(); },
    book: () => canBook ? book({ s: sv.length === 1 ? sv[0] : undefined, opts: sv.length > 1 ? sv : undefined, who: r.who?.name, date: r.date && ymd(r.date), at: r.at, part: r.part }) : (say(Z.callUs()), home()),
    earliest: () => earliest(r),
    cancel: () => API ? cancel() : (say(`Lemondáshoz hívjon: ${C.phone}`), home()),
    mybooking: () => { const m = mine(); say(Z.mybooking(m)); m && API ? offer([["Foglalás lemondása", cancel], ["Köszönöm", home]]) : back(); },
    service: () => showPrices({ svcs: sv }),
    menu: () => showPrices(),
    msg: () => msg(),
  };
  if (r.kind === "clarify") { say(Z.clarify()); return offer([...r.intents.map(k => [NLU.LABEL[k], k in info ? () => runInfo([k]) : run[k]]), ["Egyik sem", () => fallback(text)]]); }
  function runInfo(ks) {
    ks = [...ks];
    ctx.topic = ks[0] === "price" ? "price" : ks[0] === "hours" ? "hours" : ctx.topic;
    if (ks.length === 1 && ks[0] === "price") return showPrices({ svcs: sv, sup: r.sup, budget: r.budget });
    if (ks.length === 1 && ks[0] === "hours") return showHours(r.date, r.at);
    if (ks.length === 1 && ks[0] === "contact") return showContact();
    if (ks.includes("price")) ks = ks.filter(k => k !== "duration"); // az árszöveg már tartalmazza az időtartamot
    say(ks.map(k => info[k]()).join("\n\n")); back();
  }
  r.intents.every(k => k in info) ? runInfo(r.intents) : r.intents.forEach(k => run[k]());
}

$("#botform").onsubmit = e => {
  e.preventDefault();
  const v = $("#botin").value.trim(); if (!v) return;
  $("#botin").value = ""; user(v);
  const reg = NLU.register(v); if (reg) Z.reg = reg; // a bot átveszi a vendég hangnemét (tegez/magáz)
  const n = norm(v);
  if (ask && /^(megsem|vissza|kilep|stop)\b/.test(n)) { ask = null; say("Rendben, nem folytatjuk."); return home(); } // bármikor kiszállhat a kérdezgetésből
  if (ask) {
    const btn = chipFor(n); if (btn) return pressChip(btn);
    if (ask.kind) { // név/telefon lépés közben jött kérdés vagy javítás: nem névnek/számnak vesszük
      const r = engine.classify(v, ctx);
      if (r.corr && ctx.draft) return mergeDraft(r);
      if (/\?\s*$/.test(v) || (r.kind === "kb" && r.conf === "high")) { ask = null; return understand(v); }
    }
    return ask(v);
  }
  understand(v);
};

// telefonon a chat teljes képernyős; a --vh a látható területhez (billentyűzet nélkül) igazodik
const phone = matchMedia("(max-width:640px)");
// --vh/--vt: a látható terület magassága és tetejének helye; iOS-en a billentyűzet eltolja a látható területet, a panel követi
const fit = () => { const v = window.visualViewport; panel.style.setProperty("--vh", (v?.height ?? innerHeight) + "px"); panel.style.setProperty("--vt", (v?.offsetTop ?? 0) + "px"); panel.classList.toggle("kb", !!v && v.height < innerHeight * .75); };
// a háttéroldal rögzítve marad, a görgetési hely megmarad (különben a chat bezárásakor az oldal elugorna)
let lockY = 0;
const lock = on => {
  const b = document.body;
  if (on && !b.classList.contains("lock")) { lockY = scrollY; b.style.top = -lockY + "px"; b.classList.add("lock"); }
  else if (!on && b.classList.contains("lock")) { b.classList.remove("lock"); b.style.top = ""; scrollTo({ top: lockY, behavior: "instant" }); }
};
function openBot(go, arg) {
  panel.hidden = false; $("#botfab").hidden = true;
  if (phone.matches) { lock(true); fit(); }
  if (!started) { started = true; say(Z.welcome()); home(); }
  if (go === "book") { user(arg?.at != null ? `Időpontot kérek: ${arg.date} ${hhmm(arg.at)}` : "Időpontot foglalok"); chips.replaceChildren(); book(arg); }
  if (go === "msg") { user("Üzenetet hagyok"); chips.replaceChildren(); msg(arg); }
  if (!phone.matches) $("#botin").focus({ preventScroll: true }); // telefonon ne ugorjon fel a billentyűzet magától
}
function closeBot() { panel.hidden = true; $("#botfab").hidden = false; lock(false); }
window.visualViewport?.addEventListener("resize", () => { if (!panel.hidden && phone.matches) { fit(); scroll(); } });
window.visualViewport?.addEventListener("scroll", () => { if (!panel.hidden && phone.matches) fit(); });
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
