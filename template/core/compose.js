/* compose.js – a bot mondatainak összeállítása. Nincs benne DOM: tények be, szöveg ki. Böngészőben window.Compose, Node-ban require.
   Amit tud: tegező/magázó (z.reg = "i" | "f") · változatos megfogalmazás úgy, hogy ugyanaz nem ismétlődik egymás után ·
   következtetés a tényekből (a zárt nap után "legközelebb hétfőn nyitunk", "legolcsóbb", "5000 Ft-ig") · a kérdező szavainak visszatükrözése.
   Használat: const z = Compose.create(SITE, { closed: () => new Set(), now: () => new Date() }); z.reg = "i"; z.hours({ date, at }) */
(f => typeof module !== "undefined" && module.exports ? module.exports = f() : window.Compose = f())(() => {
"use strict";

const DAYS = ["Hétfő", "Kedd", "Szerda", "Csütörtök", "Péntek", "Szombat", "Vasárnap"];
const ON = ["hétfőn", "kedden", "szerdán", "csütörtökön", "pénteken", "szombaton", "vasárnap"];
const pad = n => String(n).padStart(2, "0");
const hhmm = m => `${pad(m / 60 | 0)}:${pad(m % 60)}`;
const mins = t => +t.slice(0, 2) * 60 + +t.slice(3);
const dow = d => (d.getDay() + 6) % 7;
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const lc = s => /^\p{Lu}\p{Ll}/u.test(s) ? s[0].toLowerCase() + s.slice(1) : s; // "Női hajvágás" -> "női hajvágás", "WC" marad
const art = w => /^[aáeéiíoóöőuúüű]/i.test(w) ? "az" : "a";
const fmt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const priceNum = p => { const m = String(p ?? "").replace(/\s/g, "").match(/\d+/); return m ? +m[0] : null; }; // "18 000 Ft-tól" -> 18000
const dayDiff = (d, now) => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);

function create(C, o = {}) {
  const rand = o.rand || Math.random, closed = o.closed || (() => new Set()), clock = o.now || (() => new Date());
  const z = { reg: "f" }; // "f" = magázó (alap), "i" = tegező
  const last = {};
  // változat-választás: az utoljára használt nem jön újra közvetlenül
  const pick = (key, formal, informal) => {
    const l = z.reg === "i" && informal ? informal : formal, k = key + z.reg;
    if (l.length === 1) return l[0];
    const i = last[k] === undefined ? Math.floor(rand() * l.length) : (last[k] + 1 + Math.floor(rand() * (l.length - 1))) % l.length;
    last[k] = i; return l[i];
  };
  const phone = () => C.phone || "";
  const hoursOf = d => closed().has(ymd(d)) ? null : C.hours?.[dow(d)] || null;
  // "ma", "holnap", "szombaton", 7+ nap múlva "szerdán (11.25.)" – a hét napját mondjuk, ahogy a vendég is (nem "holnapután")
  const rel = (d, now) => { const k = dayDiff(d, now); return k === 0 ? "ma" : k === 1 ? "holnap" : k >= 7 || k < 0 ? `${ON[dow(d)]} (${d.getMonth() + 1}.${d.getDate()}.)` : ON[dow(d)]; };
  const nextOpen = (from, now) => {
    for (let i = 1; i <= 14; i++) { const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i, 12), h = hoursOf(d); if (h) return { d, h, rel: rel(d, now) }; }
    return null;
  };
  const svcLine = s => `${s.name}: ${s.price} (${s.min} perc)`;

  /* ---------- kis beszélgetés ---------- */
  z.greet = ({ hour = clock().getHours(), name = "" } = {}) => {
    const hi = hour < 10 ? "Jó reggelt" : hour < 18 ? "Jó napot" : "Jó estét", n = name ? `, ${name}` : "";
    return pick("greet", [`${hi}${n}! Miben segíthetek?`, `${hi}${n}! Miben lehetek a segítségére?`], [`Szia${n}! Miben segíthetek?`, `Szia${n}! Mivel segíthetek?`]);
  };
  z.welcome = () => C.name ? pick("welcome", [`Üdvözlöm a(z) ${C.name} oldalán! Miben segíthetek?`], [`Szia! Üdv a(z) ${C.name} oldalán. Miben segíthetek?`]) : pick("welcome", ["Üdvözlöm! Miben segíthetek?"], ["Szia! Miben segíthetek?"]);
  z.thanks = () => pick("thanks", ["Szívesen! Ha bármi más van, csak írjon.", "Nagyon szívesen!", "Örülök, hogy segíthettem."], ["Szívesen! Ha van még kérdésed, írj nyugodtan.", "Nincs mit!", "Örülök, hogy segíthettem."]);
  z.bye = () => pick("bye", ["Viszontlátásra!", "További szép napot kívánok!"], ["Szia, viszlát!", "További szép napot!"]);
  z.who = () => { const of = C.name ? `A ${C.name} virtuális asszisztense vagyok.` : "Virtuális asszisztens vagyok."; return pick("who", [`${of} A böngészőjében futok, nem küldök el semmit sehova. Nyitvatartásról, árakról kérdezhet, és időpontot is foglalok.`],
    [`${of} A böngésződben futok, nem küldök el semmit sehova. Nyitvatartásról, árakról kérdezhetsz, és időpontot is foglalok.`]); };
  z.help = () => {
    const ex = C.services?.[0] ? `holnap délután ${lc(C.services[0].name)}` : "mikor vagytok nyitva";
    return pick("help", [`Kérdezhet szabadon (pl. „${ex}”), vagy válasszon:`], [`Kérdezz szabadon (pl. „${ex}”), vagy válassz:`]);
  };
  z.rude = () => pick("rude", ["Sajnálom, ha bosszúságot okoztam. Ha gond van, hagyjon üzenetet, és a csapat jelentkezik."], ["Sajnálom, ha bosszúságot okoztam. Ha gond van, hagyj üzenetet, és a csapat jelentkezik."]);
  z.decline = () => pick("decline", ["Rendben, nem foglalok semmit. Van más kérdése?", "Rendben, semmit nem foglalok. Segíthetek még valamiben?"], ["Oké, nem foglalok semmit. Van más kérdésed?", "Rendben, semmit nem foglalok. Segíthetek még valamiben?"]);
  z.confused = () => pick("confused", ["Elnézést, próbálom egyszerűbben: nyitvatartásról és árakról kérdezhet, időpontot foglalhat, vagy üzenetet hagyhat. Mit szeretne?"],
    ["Bocsi, próbálom egyszerűbben: nyitvatartásról és árakról kérdezhetsz, időpontot foglalhatsz, vagy üzenetet hagyhatsz. Mit szeretnél?"]);
  z.nameAck = name => pick("nameAck", [`Örülök, ${name}! Miben segíthetek?`, `Üdvözlöm, ${name}! Miben segíthetek?`], [`Örülök, ${name}! Miben segíthetek?`, `Szia, ${name}! Mit tehetek érted?`]);
  z.nothingToRepeat = () => "Még nem mondtam semmit, amit ismételhetnék. Miben segíthetek?";
  z.fallback = () => pick("fallback", [`Ebben nem vagyok biztos. Hívjon minket: ${phone()}, vagy továbbítom a kérdést a csapatnak:`], [`Ebben nem vagyok biztos. Hívj minket: ${phone()}, vagy továbbítom a kérdést a csapatnak:`]);
  z.suggest = () => pick("suggest", ["Erre gondolt?"], ["Erre gondolsz?"]);
  z.clarify = () => "Pontosan miben segíthetek?";
  // bizonytalan (jelentés alapján talált) válasz: a bot kimondja, mit értett
  z.hedged = (question, answer) => `${pick("hedge", ["Úgy értem, erre gondol:", "Ha jól értem, ezt kérdezi:"], ["Úgy értem, erre gondolsz:", "Ha jól értem, ezt kérded:"])}\n„${question}”\n${answer}`;

  /* ---------- nyitvatartás: a tényekből következtet ---------- */
  z.status = () => {
    const now = clock(), h = hoursOf(now), m = now.getHours() * 60 + now.getMinutes();
    if (h && m >= mins(h[0]) && m < mins(h[1])) return `Most nyitva vagyunk, ${h[1]}-ig.`;
    if (h && m < mins(h[0])) return `Most még zárva vagyunk, ${h[0]}-kor nyitunk.`;
    const nx = nextOpen(now, now);
    return nx ? `Most zárva vagyunk, ${nx.rel} ${nx.h[0]}-kor nyitunk.` : "Most zárva vagyunk.";
  };
  // date: egy konkrét nap; at: perc (nyitva vagyunk-e akkor?); egyik sem: a teljes hét
  z.hours = ({ date, at } = {}) => {
    const now = clock();
    if (!date && at == null) return (C.hours || []).map((h, i) => `${DAYS[i]}: ${h ? h.join("–") : "zárva"}`).join("\n") + "\n\n" + z.status();
    const d = date || now, h = hoursOf(d), R = cap(rel(d, now)), k = dayDiff(d, now), m = now.getHours() * 60 + now.getMinutes();
    const nx = nextOpen(d, now), next = nx ? ` Legközelebb ${nx.rel} ${nx.h[0]}-kor nyitunk.` : "";
    if (closed().has(ymd(d))) return `${R} zárva tartunk.${next}`;
    if (!h) return at != null ? `${R} egész nap zárva vagyunk.${next}` : `${R} zárva vagyunk.${next}`;
    const [open, close] = [mins(h[0]), mins(h[1])];
    if (at != null) {
      const t = hhmm(at);
      return at >= open && at < close ? `${R} ${t}-kor nyitva vagyunk (${h[0]}–${h[1]}).` : at < open ? `${R} ${t}-kor még zárva vagyunk, ${h[0]}-kor nyitunk.` : `${R} ${t}-kor már zárva vagyunk, ${h[1]}-ig tartunk nyitva.`;
    }
    if (k === 0) return m < open ? `Ma ${h[0]}-kor nyitunk, ${h[1]}-ig vagyunk itt.` : m < close ? `Ma ${h[0]} és ${h[1]} között vagyunk nyitva, most is nyitva vagyunk.` : `Ma ${h[0]} és ${h[1]} között voltunk nyitva, mára már zárva vagyunk.${next}`;
    return pick("hours", [`${R} ${h[0]} és ${h[1]} között vagyunk nyitva.`, `${R} ${h[0]}–${h[1]} között várjuk Önöket.`], [`${R} ${h[0]} és ${h[1]} között vagyunk nyitva.`, `${R} ${h[0]}–${h[1]} között várunk titeket.`]);
  };

  /* ---------- árak, időtartam ---------- */
  // svcs: a kérdező által megnevezett szolgáltatások; sup: "min" | "max"; budget: { max } | { min }
  z.prices = ({ svcs = [], sup, budget } = {}) => {
    const S = C.services || [], P = C.products || [], pool = svcs.length ? svcs : S, priced = pool.filter(s => priceNum(s.price) != null);
    if (budget && priced.length) {
      const ok = priced.filter(s => (budget.max == null || priceNum(s.price) <= budget.max) && (budget.min == null || priceNum(s.price) >= budget.min));
      const lim = budget.max != null ? `${fmt(budget.max)} Ft-ig` : `${fmt(budget.min)} Ft fölött`;
      if (ok.length === 1) return `${cap(lim)} ezt tudjuk ajánlani:\n${svcLine(ok[0])}`;
      if (ok.length) return `${cap(lim)} ${pick("budget", ["ezeket tudjuk ajánlani:", "ezek közül választhat:"], ["ezeket tudjuk ajánlani:", "ezek közül választhatsz:"])}\n${ok.map(svcLine).join("\n")}`;
      const edge = [...priced].sort((a, b) => priceNum(a.price) - priceNum(b.price))[budget.max != null ? 0 : priced.length - 1];
      return budget.max != null ? `${fmt(budget.max)} Ft-ból sajnos nincs szolgáltatásunk. A legolcsóbb: ${svcLine(edge)}.` : `${fmt(budget.min)} Ft fölött nincs szolgáltatásunk. A legdrágább: ${svcLine(edge)}.`;
    }
    if (sup && priced.length) {
      const v = priced.map(s => priceNum(s.price)), t = sup === "min" ? Math.min(...v) : Math.max(...v), best = priced.filter(s => priceNum(s.price) === t);
      return `A ${sup === "min" ? "legolcsóbb" : "legdrágább"}: ${best.map(svcLine).join("; ")}.`;
    }
    if (svcs.length === 1) { const s = svcs[0]; return `${cap(art(lc(s.name)))} ${lc(s.name)} ${s.price}, kb. ${s.min} perc.`; }
    if (svcs.length > 1) return `${pick("pricesMany", ["Ezeket találtam:", "Erre ezek a szolgáltatások illenek:"], ["Ezeket találtam:", "Erre ezek illenek:"])}\n${svcs.map(svcLine).join("\n")}`;
    const l = [...S.map(svcLine), ...P.map(p => `${p.name}: ${p.price || "érdeklődjön"}`)];
    return l.length ? `${pick("pricesAll", ["Árlista:", "Ezek az áraink:"], ["Árlista:", "Ezek az áraink:"])}\n${l.join("\n")}` : (z.reg === "i" ? `Árakért hívj minket: ${phone()}` : `Árakért hívjon minket: ${phone()}`);
  };
  z.duration = ({ svcs = [] } = {}) => {
    const l = svcs.length ? svcs : C.services || [];
    if (l.length === 1) return `${cap(art(lc(l[0].name)))} ${lc(l[0].name)} kb. ${l[0].min} perc.`;
    return l.length ? l.map(s => `${s.name}: kb. ${s.min} perc`).join("\n") : (z.reg === "i" ? `Hívj minket: ${phone()}` : `Hívjon minket: ${phone()}`);
  };
  z.contact = () => [pick("contact", ["Itt talál minket:", "Így érhet el minket:"], ["Itt találsz minket:", "Így érsz el minket:"]), C.address, C.phone && `Telefon: ${C.phone}`, C.email].filter(Boolean).join("\n");
  z.staff = ({ who } = {}) => {
    const l = who ? [who] : (C.staff || []).filter(s => s.name);
    return l.length ? l.map(s => `${s.name}${s.role ? " – " + s.role : ""}`).join("\n") : (z.reg === "i" ? `Hívj minket: ${phone()}` : `Hívjon minket: ${phone()}`);
  };
  z.callUs = () => z.reg === "i" ? `Hívj minket: ${phone()}` : `Hívjon minket: ${phone()}`;

  /* ---------- foglalás ---------- */
  const when = (b, now) => [b.s && b.s.name + (b.who ? " · " + b.who : ""), b.date && rel(new Date(b.date + "T12:00:00"), now), b.at != null && hhmm(b.at)].filter(Boolean).join(", ");
  z.resume = () => pick("resume", ["Folytassuk a foglalást:"], ["Folytassuk a foglalást:"]);
  z.askService = () => pick("askSvc", ["Melyik szolgáltatást szeretné?"], ["Melyik szolgáltatást szeretnéd?"]);
  z.askStaff = () => pick("askStaff", ["Kinél szeretne időpontot?"], ["Kinél szeretnél időpontot?"]);
  z.askDay = () => pick("askDay", ["Melyik napon?", "Melyik nap felelne meg?"], ["Melyik napon?", "Melyik nap lenne jó?"]);
  z.askTime = () => pick("askTime", ["Melyik időpont megfelelő?"], ["Melyik időpont jó neked?"]);
  z.askName = ({ known } = {}) => known ? `Ugye ${known} néven foglaljak?` : pick("askName", ["Hogy hívják?"], ["Hogy hívnak?"]);
  z.askPhone = ({ known } = {}) => known ? `Ugyanezen a telefonszámon érjük el (${known})?` : pick("askPhone", ["Milyen telefonszámon érjük el? (Csak az időpont miatt használjuk.)"], ["Milyen telefonszámon érünk el? (Csak az időpont miatt használjuk.)"]);
  z.badName = () => pick("badName", ["Kérem, a nevét betűkkel adja meg."], ["Kérlek, a neved betűkkel add meg."]);
  z.badPhone = () => pick("badPhone", ["Ez nem tűnik telefonszámnak, kérem írja be újra (pl. +36 30 123 4567)."], ["Ez nem tűnik telefonszámnak, kérlek írd be újra (pl. +36 30 123 4567)."]);
  z.summary = b => pick("summary", [`Összefoglaló:\n${b.sum}\nRendben?`], [`Összefoglaló:\n${b.sum}\nÍgy jó?`]);
  z.slotFree = at => `A ${hhmm(at)} szabad, ezt le is foglalom.`;
  z.slotBusy = at => `${hhmm(at)}-kor már nincs szabad hely, de ezek vannak:`;
  z.slotsPart = found => found ? "Ezek a szabad időpontok:" : "Arra a napszakra nincs hely, de ezek szabadok:";
  z.noDay = () => "Arra a napra nincs szabad időpont.";
  z.noSlots = () => `Sajnos nincs szabad időpont. ${z.callUs()}`;
  z.tooFar = days => `Legfeljebb ${days} napra előre foglalhat.`;
  // a futó foglalásba beírt változtatás visszaigazolása
  z.changed = b => `Rendben, átírtam: ${when(b, clock())}.`;
  z.earliest = ({ svc, date, start } = {}) => date ? `Legkorábban ${rel(date, clock())} ${hhmm(start)}-kor van szabad időpont${svc ? ` (${svc.name})` : ""}. Foglaljam le?` : z.noSlots();
  z.mybooking = m => m ? `Az Ön időpontja: ${m.service}, ${m.date} ${hhmm(m.start)}.` : `Ezen az eszközön nem találok foglalást. Ha foglalt, ${z.callUs().toLowerCase()}`;

  return z;
}

return { create, hhmm, priceNum, fmt, art, lc };
});
