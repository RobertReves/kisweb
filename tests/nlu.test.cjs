// Futtatás: node tests/nlu.test.cjs  – az értelmező könyvtár (template/core/nlu.js) önálló tesztje, DOM nélkül.
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert/strict");
const NLU = require("../template/core/nlu.js");
const R = path.join(__dirname, "../template/");
const site = f => { const w = {}; vm.runInNewContext(fs.readFileSync(R + f, "utf8"), { window: w }); return w.SITE; };

const NOW = new Date(2026, 10, 18, 10, 0); assert.equal(NOW.getDay(), 3, "2026-11-18 szerda");
const salon = site("config.js"), bolt = site("examples/bolt.config.js");
const E = NLU.create(salon, { now: () => NOW }), B = NLU.create(bolt, { now: () => NOW });
const S = { noi: "Női hajvágás", ferfi: "Férfi hajvágás", fest: "Festés + vágás", alk: "Alkalmi frizura" };
const ymd = d => d && d.toLocaleDateString("sv");
let fails = [], total = 0;

// ---- 1) táblázatos eset-készlet: [szöveg, elvárt részletek, (ctx)] ----
// kind, intents (pontosan), has (tartalmazza), svc (nevek), date, at, part, who, hit
const cases = [
  // small talk
  ["szia", { intents: ["greet"] }], ["Jó napot kívánok!", { intents: ["greet"] }], ["hello", { intents: ["greet"] }],
  ["köszönöm szépen", { intents: ["thanks"] }], ["köszi", { intents: ["thanks"] }], ["viszlát", { intents: ["bye"] }], ["Viszontlátásra!", { intents: ["bye"] }],
  ["ki vagy te?", { intents: ["who"] }], ["te robot vagy?", { intents: ["who"] }], ["chatgpt vagy?", { intents: ["who"] }], ["segítség", { intents: ["help"] }],
  ["hülye vagy", { intents: ["rude"] }],
  // nyitvatartás
  ["mikor vagytok nyitva?", { intents: ["hours"] }], ["nyitvatartás", { intents: ["hours"] }], ["Hány órától vagytok nyitva?", { intents: ["hours"] }],
  ["meddig vagytok nyitva szombaton?", { intents: ["hours"], date: "2026-11-21" }], ["nyitva vagytok most?", { intents: ["hours"], date: "2026-11-18" }],
  ["zártok ma korán?", { intents: ["hours"], date: "2026-11-18" }], ["vasárnap is nyitva vagytok?", { intents: ["hours"], date: "2026-11-22" }],
  ["hétvégén nyitva?", { intents: ["hours"], date: "2026-11-21" }], ["december 24-én nyitva vagytok?", { intents: ["hours"], date: "2026-12-24" }],
  ["holnap 14:00-kor nyitva vagytok?", { has: ["hours"], date: "2026-11-19", at: 840 }],
  // árak, időtartam, kínálat
  ["mennyibe kerül a férfi hajvágás?", { intents: ["price"], svc: [S.ferfi] }], ["mennyi a festés?", { intents: ["price"], svc: [S.fest] }],
  ["mennyibe kerül egy alkalmi frizura", { intents: ["price"], svc: [S.alk] }], ["az árak", { intents: ["price"] }], ["árlista", { has: ["price"] }],
  ["mennyibe kerül a hajvágás?", { intents: ["price"], svc: [S.noi, S.ferfi] }], ["milyen drága a festés?", { has: ["price"], svc: [S.fest] }],
  ["meddig tart a női hajvágás?", { intents: ["duration"], svc: [S.noi] }], ["mennyi ideig tart a festés", { intents: ["duration"], svc: [S.fest] }],
  ["milyen szolgáltatások vannak?", { intents: ["menu"] }], ["mit csináltok?", { intents: ["menu"] }],
  ["árak és nyitvatartás", { has: ["price", "hours"] }], ["mennyi az ár és mikor vagytok nyitva?", { has: ["price", "hours"] }],
  // elérhetőség, csapat
  ["hol vagytok?", { intents: ["contact"] }], ["mi a telefonszámotok?", { intents: ["contact"] }], ["emberrel szeretnék beszélni", { intents: ["contact"] }], ["van e-mail címetek?", { has: ["contact"] }],
  ["kik dolgoznak nálatok?", { intents: ["staff"] }], ["ki az Éva?", { has: ["staff"], who: "Éva" }],
  // foglalás + kitalált adatok
  ["szeretnék időpontot foglalni", { intents: ["book"] }], ["szabad időpontok?", { intents: ["book"] }], ["foglalnék hajvágásra", { intents: ["book"], svc: [S.noi, S.ferfi] }],
  ["holnap 14:00 férfi hajvágás", { intents: ["book"], svc: [S.ferfi], date: "2026-11-19", at: 840 }],
  ["szombat délután festés", { intents: ["book"], svc: [S.fest], date: "2026-11-21", part: [720, 1080] }],
  ["Dóri szabad csütörtökön?", { intents: ["book"], who: "Dóri", date: "2026-11-19" }],
  ["holnap reggel szeretnék jönni", { intents: ["book"], date: "2026-11-19", part: [360, 600] }], ["este érnék rá holnapután", { intents: ["book"], date: "2026-11-20", part: [1020, 1320] }],
  ["jövő péntek 3 órakor", { intents: ["book"], date: "2026-11-27", at: 900 }], ["következő péntekre foglalnék", { intents: ["book"], date: "2026-11-20" }],
  ["fél 3-ra holnap", { intents: ["book"], date: "2026-11-19", at: 870 }], ["holnap háromnegyed 4", { intents: ["book"], date: "2026-11-19", at: 945 }],
  ["holnap negyed 5", { intents: ["book"], date: "2026-11-19", at: 975 }], ["holnap tízre", { intents: ["book"], date: "2026-11-19", at: 600 }], ["holnap háromkor", { intents: ["book"], date: "2026-11-19", at: 900 }],
  ["2 hét múlva délután festés", { intents: ["book"], date: "2026-12-02", part: [720, 1080] }], ["három nap múlva 10:30", { intents: ["book"], date: "2026-11-21", at: 630 }],
  ["24-én 9 órára női hajvágás", { intents: ["book"], date: "2026-11-24", at: 540, svc: [S.noi] }], ["12.24. 11:00 festés", { intents: ["book"], date: "2026-12-24", at: 660 }],
  ["2026-12-01 14.30 hajvágás", { intents: ["book"], date: "2026-12-01", at: 870 }], ["jövő héten hétfőn", { date: "2026-11-23" }],
  // tagadás, lemondás, saját foglalás
  ["nem szeretnék időpontot", { intents: ["decline"] }], ["nem akarok foglalni", { intents: ["decline"] }],
  ["lemondom az időpontot", { intents: ["cancel"] }], ["törölni szeretném a foglalásom", { intents: ["cancel"] }], ["mikor van az időpontom?", { intents: ["mybooking"] }],
  ["üzenetet szeretnék hagyni", { intents: ["msg"] }], ["panaszom van", { intents: ["msg"] }], ["ajánlatot kérnék", { intents: ["msg"] }],
  ["Szia, a hétvégén is dolgoztok?", { has: ["hours"], date: "2026-11-21" }], ["át szeretném tenni az időpontomat", { intents: ["cancel"] }], ["hogy jutok el hozzátok?", { intents: ["contact"] }],
  ["nincs kedvem foglalni, csak árat kérdezek", { intents: ["price"] }], ["mennyi ideig tart egy alkalmi frizura és mennyibe kerül", { intents: ["duration", "price"], svc: [S.alk] }],
  ["Jó napot! Szeretnék egy női hajvágásra időpontot kérni jövő hétre", { intents: ["book"], svc: [S.noi], date: "2026-11-23" }], ["pénteken 5 órakor van hely?", { intents: ["book"], date: "2026-11-20", at: 1020 }],
  ["lemondanám a holnapi időpontomat", { intents: ["cancel"] }], ["16-án szabad vagy?", { intents: ["book"], date: "2026-12-16" }],
  // csak egy nap / idő: előző témára vonatkozik
  ["és vasárnap?", { intents: ["hours"], date: "2026-11-22" }, { topic: "hours" }], ["inkább 15:00-ra", { intents: ["book"], at: 900 }, { topic: "book" }],
  ["délután?", { intents: ["book"], part: [720, 1080] }, { topic: "book" }],
  ["meddig tart?", { intents: ["duration"], svc: [S.noi] }, { svc: salon.services[0] }], ["és mennyibe kerül?", { intents: ["price"], svc: [S.noi] }, { svc: salon.services[0] }],
  ["az árak", { intents: ["price"], svc: [] }, { svc: salon.services[0] }], // többes szám: nem az előző szolgáltatás
  // bizonytalan: visszakérdez
  ["időpont árak", { kind: "clarify", has: ["book", "price"] }],
  // GYIK (szinonimákkal is)
  ["van parkolás?", { kind: "kb", hit: ["faq", 1] }], ["prakolás van?", { kind: "kb", hit: ["faq", 1] }], ["hova tegyem az autót?", { kind: "kb", hit: ["faq", 1] }],
  ["lehet kártyával fizetni?", { kind: "kb", hit: ["faq", 0] }], ["elfogadtok bankkártyát?", { kind: "kb", hit: ["faq", 0] }],
  ["kisgyereket is vágtok?", { kind: "kb", hit: ["faq", 3] }], ["gyerekeknek mennyi a hajvágás?", { kind: "kb", hit: ["faq", 3] }],
  ["mennyibe kerül a parkolás?", { kind: "kb", hit: ["faq", 1] }], ["szia, van parkolás?", { kind: "kb", hit: ["faq", 1] }],
  // nem érti
  ["blablabla", { kind: "fallback" }], ["asdf qwer", { kind: "fallback" }], ["", { kind: "fallback" }], ["???", { kind: "fallback" }], ["🙂🙂", { kind: "fallback" }], ["<script>alert(1)</script>", { kind: "fallback" }],
];
// jelentés-keresés: körülírások, közös szó nélkül is (GYIK: 0 kártya, 1 parkolás, 2 lemondás, 3 gyerek, 4 betérés, 5 allergia, 6 utalvány, 7 késés, 8 angol, 9 számla)
const faq = (text, i, extra = {}) => [text, { kind: "kb", hit: ["faq", i], ...extra }];
cases.push(
  [ "sorszámot kell húzni?", { kind: "kb-or-suggest", hit: ["faq", 4] } ], faq("be lehet menni időpont nélkül is?", 4),
  faq("érzékeny a bőröm, mit használtok?", 5), faq("érzékeny a fejbőröm", 5), faq("hipoallergén sampon van?", 5),
  faq("szeretnék utalványt venni a nővéremnek", 6), faq("ajándékba vennék valamit", 6),
  faq("10 percet késni fogok, gond?", 7), faq("ha elkések, mi lesz?", 7),
  faq("angolul is tudtok?", 8), faq("do you speak english", 8), faq("beszéltek németül?", 8),
  faq("tudtok számlát adni a cégemnek?", 9), faq("kellene egy ceges szamla", 9),
  faq("mivel lehet fizetni?", 0), faq("elfogadjátok a SZÉP kártyát?", 0), faq("van lehetőség kocsival jönni?", 1), faq("hova állhatok le az autómmal?", 1),
  faq("elhozhatom a kislányomat?", 3), faq("kisebb gyerekeknek külön ár van?", 3), faq("a babát is levágjátok?", 3),
  faq("prakolás van?", 1), faq("parkolsá lehetséges?", 1), faq("bankkártya?", 0),
);
// ami NEM a tudásbázisról szól: nem szabad kb-találatnak lennie
for (const t of ["mi a kedvenc színed?", "milyen az idő?", "ki nyerte a meccset?", "mennyi a gázszámla?", "alert(1)", "lorem ipsum dolor sit amet", "hogyan kell főzni egy rántottát?"]) cases.push([t, { kind: "none-of-kb" }]);
// árkérdés, bemutatkozás, javítás a futó foglalásban, névmás, új témák
const D = { draft: true };
cases.push(
  ["melyik a legolcsóbb szolgáltatás?", { has: ["price"], sup: "min" }], ["mi a legdrágább?", { has: ["price"], sup: "max" }],
  ["5000 alatt mit lehet csinálni?", { has: ["price"], budget: { max: 5000 } }], ["8 ezerig mi van?", { has: ["price"], budget: { max: 8000 } }],
  ["legfeljebb 12 000 Ft-ot szánok rá", { has: ["price"], budget: { max: 12000 } }], ["10 000 Ft felett mik vannak?", { has: ["price"], budget: { min: 10000 } }],
  ["Kiss Anna vagyok", { has: ["intro"], name: "Kiss Anna" }], ["a nevem Béla", { has: ["intro"], name: "Béla" }], ["Én Géza vagyok", { has: ["intro"], name: "Géza" }], ["Hol vagyok?", { name: undefined }],
  ["inkább kedden", { slot: true, date: "2026-11-24", corr: true }, D], ["másik napot kérek", { slot: true, corr: { reset: ["date"] } }, D], ["csütörtökön", { slot: true, date: "2026-11-19" }, D],
  ["inkább a férfi hajvágás", { slot: true, svc: [S.ferfi] }, D], ["és Dórinál?", { slot: true, who: "Dóri" }, D], ["Évával szeretnék", { who: "Éva" }],
  ["csütörtökön", { slot: false }], ["nála szabad szombaton?", { who: "Dóri", date: "2026-11-21" }, { who: "Dóri" }],
  ["mikor van legkorábban szabad időpont?", { intents: ["earliest"] }], ["mi a leghamarabbi?", { intents: ["earliest"] }],
  ["szeretnék üzenni", { intents: ["msg"] }], ["ismételd meg", { intents: ["repeat"] }], ["nem értem", { intents: ["confused"] }],
  ["be lehet menni időpont nélkül?", { kind: "kb", hit: ["faq", 4] }],
);
const boltCases = [
  ["van croissant?", { kind: "kb", hit: ["product", 1] }], ["mennyibe kerül a croissant?", { kind: "kb", hit: ["product", 1] }], ["kapható túrós táska?", { kind: "kb", hit: ["product", 2] }],
  ["tortát szeretnék rendelni", { kind: "kb", hit: ["product", 3] }], ["nyitva vagytok holnap?", { intents: ["hours"], date: "2026-11-19" }], ["árak", { intents: ["price"] }],
];

function check(eng, [text, want, ctx], label) {
  total++;
  const r = eng.classify(text, ctx || {}), got = [];
  const add = (cond, what) => { if (!cond) got.push(what); };
  if (want.kind === "kb-or-suggest") add((r.kind === "kb" && r.hit.i === want.hit[1]) || (r.kind === "suggest" && r.alts.some(a => a.i === want.hit[1] && a.type === want.hit[0])), `kind=${r.kind} ${JSON.stringify(r.hit || r.alts)}`);
  else if (want.kind === "none-of-kb") add(r.kind !== "kb", `kb-találat: ${JSON.stringify(r.hit)}`);
  else if (want.kind) add(r.kind === want.kind, `kind=${r.kind}`);
  else if (want.intents || want.has || want.svc || want.date !== undefined || want.at !== undefined) add(r.kind === "intent" || r.kind === "suggest" && false, `kind=${r.kind}`);
  if (want.intents) add(JSON.stringify(r.intents) === JSON.stringify(want.intents), `intents=${r.intents}`);
  if (want.has) add(want.has.every(k => (r.intents || r.scores && Object.keys(r.scores)).includes(k)), `has ${want.has} <- ${r.intents || Object.keys(r.scores)}`);
  if (want.svc) add(JSON.stringify(r.svcs.map(s => s.name).sort()) === JSON.stringify([...want.svc].sort()), `svc=${r.svcs.map(s => s.name)}`);
  if (want.date !== undefined) add(ymd(r.date) === want.date, `date=${ymd(r.date)}`);
  if (want.at !== undefined) add(r.at === want.at, `at=${r.at}`);
  if (want.part) add(JSON.stringify(r.part) === JSON.stringify(want.part), `part=${r.part}`);
  if (want.sup !== undefined) add(r.sup === want.sup, `sup=${r.sup}`);
  if (want.budget) add(JSON.stringify(r.budget) === JSON.stringify(want.budget), `budget=${JSON.stringify(r.budget)}`);
  if ("name" in want) add(r.name === want.name, `name=${r.name}`);
  if ("slot" in want) add(!!r.slot === want.slot, `slot=${r.slot}`);
  if (want.corr) add(want.corr === true ? !!r.corr : JSON.stringify(r.corr) === JSON.stringify(want.corr), `corr=${JSON.stringify(r.corr)}`);
  if (want.who) add(r.who?.name === want.who, `who=${r.who?.name}`);
  if (want.hit && want.kind !== "kb-or-suggest") add(r.hit?.type === want.hit[0] && r.hit?.i === want.hit[1], `hit=${JSON.stringify(r.hit)}`);
  if (got.length) fails.push(`${label} "${text}": ${got.join("; ")}`);
}
cases.forEach(c => check(E, c, "salon")); boltCases.forEach(c => check(B, c, "bolt"));

// regiszter: tegező / magázó felismerés
for (const [t, v] of [["szia, tudsz segíteni?", "i"], ["legyszi mondd meg", "i"], ["Jó napot kívánok, kérem", "f"], ["Tisztelt Cím", "f"], ["mennyibe kerül a hajvágás", undefined]]) { total++; if (NLU.register(t) !== v) fails.push(`register "${t}" = ${NLU.register(t)} (várt ${v})`); }
// ---- 2) ékezet, kis-nagybetű, írásjelek nem változtatnak az eredményen ----
const sig = r => JSON.stringify([r.kind, r.intents, r.hit, r.svcs.map(s => s.name), ymd(r.date), r.at, r.part, r.who?.name]);
for (const [text, want] of cases) {
  if (!text || want.name) continue; // a név felismerése a nagybetűre épül
  const base = sig(E.classify(text));
  for (const v of [text.toUpperCase(), NLU.norm(text), "  " + text + "  !!", text.replace(/[?!]/g, "")]) { total++; if (sig(E.classify(v)) !== base) fails.push(`variáns "${v}" eltér: "${text}"`); }
}

// ---- 3) elütéstűrés: minden 6+ betűs szóban egy betű csere/törlés/felcserélés ugyanazt adja (legalább 90%-ban) ----
const typoBase = cases.filter(([t, w]) => w.intents && !["greet", "bye", "who", "rude", "help", "thanks"].includes(w.intents[0]) && /\p{L}{7,}/u.test(t));
let tTot = 0, tOk = 0, tBad = [];
for (const [text, want, ctx] of typoBase) {
  const r0 = E.classify(text, ctx || {});
  const ws = [...text.matchAll(/\p{L}{7,}/gu)].map(m => m);
  for (const m of ws) for (const k of [2, 4]) {
    const w = m[0], i = Math.min(k, w.length - 3);
    for (const t of [w.slice(0, i) + w.slice(i + 1), w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2), w.slice(0, i) + (w[i] === "x" ? "y" : "x") + w.slice(i + 1)]) {
      if (i > 4) continue; // az 5. betű után a tő már nem számít
      const r = E.classify(text.slice(0, m.index) + t + text.slice(m.index + w.length), ctx || {});
      tTot++; if (JSON.stringify(r.intents) === JSON.stringify(r0.intents)) tOk++; else if (tBad.length < 8) tBad.push(`"${text.slice(0, m.index) + t + text.slice(m.index + w.length)}" -> ${r.kind}/${r.intents} (várt ${r0.intents})`);
    }
  }
}
total++; if (tOk / tTot < .9) fails.push(`elütéstűrés ${(100 * tOk / tTot).toFixed(1)}% (${tOk}/${tTot}); pl. ${tBad.join(" | ")}`);

// ---- 4) időpont/dátum egységtesztek ----
const P = (t, now = NOW) => NLU.parse(NLU.norm(t), now);
const eq = (a, b, m) => { total++; try { assert.deepEqual(a, b); } catch { fails.push(`${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); } };
eq(P("14:30").at, 870, "14:30"); eq(P("9:00").at, 540, "9:00"); eq(P("16.00").at, 960, "16.00"); eq(P("3 óra").at, 900, "3 óra"); eq(P("tizenegykor").at, 660, "tizenegykor");
eq(P("fél 1").at, 750, "fél 1 = 12:30"); eq(P("fél 12").at, 690, "fél 12 = 11:30"); eq(P("fél 7").at, 1110, "fél 7 = 18:30"); eq(P("tizenkettőkor").at, 720, "12");
eq(P("6.500 Ft").at, undefined, "ár nem idő"); eq(P("3.000 Ft").at, undefined, "ár nem idő 2"); eq(P("2 hajvágás").at, undefined, "darabszám nem idő");
eq(P("kenyér 1 kg").at, undefined, "1 kg nem idő"); eq(P("12.24.").at, undefined, "12.24. dátum, nem idő"); eq(ymd(P("12.24.").date), "2026-12-24", "12.24. dátum");
eq(ymd(P("11.17.").date), "2027-11-17", "elmúlt dátum = jövőre"); eq(P("február 30").date, null, "érvénytelen nap");
eq(P("vásárolni szeretnék").date, null, "'vásárolni' nem vasárnap"); eq(P("kedvenc").date, null, "'kedvenc' nem kedd"); eq(ymd(P("holnap").date), "2026-11-19", "holnap");
eq(ymd(P("szerda").date), "2026-11-18", "ma szerda: szerdán = ma"); eq(ymd(P("következő szerda").date), "2026-11-25", "következő szerda");
eq(ymd(P("jövő hétfő").date), "2026-11-23", "jövő hétfő"); eq(ymd(P("31-én").date), "2026-12-31", "31-én");
eq(ymd(P("30-ra", new Date(2026, 1, 15)).date), "2026-03-30", "30-ra: február nem létezik, jövő hónap");
eq(ymd(P("december 31", new Date(2026, 11, 31, 20)).date), "2026-12-31", "ma este december 31 még érvényes");
eq(ymd(P("január 2", new Date(2026, 11, 31)).date), "2027-01-02", "év váltás");

// ---- 5) szinonimák: a config saját szinonimája és a beépített is működik ----
const E2 = NLU.create({ ...salon, services: [{ name: "Női hajvágás", price: "1", min: 30 }], faq: [{ q: "Hozhatok kutyát?", a: "Igen." }, { q: "Van wifi?", a: "Igen." }], syn: [["hajvagas", "nyiras"]] }, { now: () => NOW });
total++; if (E2.classify("hova köthetem ki a macskát?").hit?.i !== 0) fails.push("beépített szinonima (macska~kutya) nem működik");
total++; if (E2.classify("van internet?").hit?.i !== 1) fails.push("beépített szinonima (internet~wifi) nem működik");
total++; if (E2.classify("mennyi a nyírás").svcs.length !== 1) fails.push("config szinonima (nyírás~hajvágás) nem működik");

// ---- 6) robusztusság: véletlen szöveg sem dob hibát, és mindig érvényes döntést ad ----
let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const alpha = "aáeéiíoóöőuúüű bcdfghjklmnprstvyz0123456789 .,:;!?-+/()'\"<>&🙂";
for (let i = 0; i < 3000; i++) {
  const s = Array.from({ length: Math.floor(rnd() * 60) }, () => alpha[Math.floor(rnd() * alpha.length)]).join("");
  total++; try { const r = E.classify(s, rnd() < .3 ? { topic: "book", svc: salon.services[0] } : {}); assert.ok(["intent", "kb", "clarify", "suggest", "fallback"].includes(r.kind)); if (r.kind === "intent") assert.ok(r.intents.length > 0); } catch (e) { fails.push(`fuzz "${s}": ${e.message}`); break; }
}
total++; try { E.classify("a".repeat(100000)); E.classify("14:".repeat(5000)); E.classify("12. ".repeat(5000)); } catch (e) { fails.push("hosszú bemenet: " + e.message); }
// üres config sem dobhat hibát
const E0 = NLU.create({}, { now: () => NOW }); total++; for (const t of ["szia", "mennyibe kerül?", "holnap 14:00", "van parkolás?"]) try { E0.classify(t); } catch (e) { fails.push(`üres config "${t}": ${e.message}`); }

// ---- 7) sebesség: 1000 kérdés fél másodpercen belül ----
const t0 = Date.now(); for (let i = 0; i < 1000; i++) E.classify(cases[i % cases.length][0]); total++;
if (Date.now() - t0 > 1500) fails.push(`lassú: 1000 kérdés ${Date.now() - t0} ms`);

console.log(`${total - fails.length}/${total} ellenőrzés rendben` + (tTot ? ` · elütéstűrés ${(100 * tOk / tTot).toFixed(1)}% (${tTot} eset) · ${Date.now() - t0} ms/1000 kérdés` : ""));
if (fails.length) { console.error(fails.map(f => " ✗ " + f).join("\n")); process.exit(1); }
console.log("OK");
