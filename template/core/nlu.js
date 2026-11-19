/* nlu.js – offline értelmező könyvtár a chatbothoz. Nincs benne DOM és külső szolgáltatás: szöveg be, döntés ki.
   Böngészőben window.NLU, Node-ban require("nlu.js"). Használat: const e = NLU.create(SITE); e.classify("holnap 3 órakor hajvágás", ctx)
   Amit tud: ékezet-, elütés- és ragozástűrő kulcsszavak · szinonimák · IDF-súlyozott GYIK/termékkereső · dátum és idő
   ("holnap", "jövő péntek", "24-én", "fél 3", "háromra") · szolgáltatás/munkatárs felismerés · tagadás · több téma egyszerre ·
   tisztázó kérdés bizonytalanságnál · rövid memória (ctx) az utókérdésekhez ("és vasárnap?") · helyesírás-tűrés (ly=j, kettős betű) ·
   jelentés-keresés tanult modell nélkül: karakter-n-gram vektorok + fogalomcsoportok koszinusz-hasonlósága · "legolcsóbb", "5000 alatt" ·
   javítás ("inkább kedden") és névmás-feloldás a futó foglalási piszkozatban · tegező/magázó felismerés. */
(f => typeof module !== "undefined" && module.exports ? module.exports = f() : window.NLU = f())(() => {
"use strict";

/* ---------- alapok ---------- */
const norm = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const words = n => n.split(/[^a-z0-9]+/).filter(Boolean);
// ragozás: a szó első 6 betűje (a 3 betűs szavakat eldobja: névelők, "van", "egy"); két tő egyezik, ha az első 5 betűjük azonos
const ph = w => w.replace(/ly/g, "j").replace(/(.)\1+/g, "$1"); // ly = j, kettős betű = egy (kerrül ~ kerül, hajvágás ~ hajvaggás)
const stem = s => words(norm(s)).filter(w => w.length > 3).map(w => ph(w).slice(0, 6));
// pontosan 1 eltérés (csere, hiány, felesleg, felcserélés) a két szöveg között?
const one = (a, b) => {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0; while (a[i] === b[i]) i++;
  return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
};
// hasonlóság: 1 = azonos tő, .6 = egy elütéssel azonos (a 6. betűs ablak a betűhiányt/felesleget is elkapja), 0 = más. Elütést csak 6+ betűs tövön tűrünk.
const sim = (a, b) => {
  const a5 = a.slice(0, 5), b5 = b.slice(0, 5);
  if (a5 === b5) return 1;
  if (a.length < 6 || b.length < 6) return 0;
  if (a[0] !== b[0]) return 0; // az első betűt ritkán ütik el: kellene ≠ jelent
  return one(a5, b5) || one(a5, b.slice(0, 6)) || one(a.slice(0, 6), b5) ? .6 : 0;
};
const near = (a, b) => sim(a, b) > 0;
const STOP3 = new Set(["egy", "van", "meg", "ami", "ezt", "mit", "aki", "nem", "sem", "fel", "kis", "mar", "vagy"]);
const sstem = s => words(norm(s)).filter(w => w.length > 2 && !STOP3.has(w)).map(w => ph(w).slice(0, 6)); // szolgáltatásnévhez: a "női"/"férfi" is megkülönböztet
// szavak, amelyeket regex/dátumkereső keres: az elütött alakot (honapután) a helyesre cseréljük, a ragot eldobjuk
const VOCAB = ["haromnegyed", "negyed", "tizenketto", "tizenket", "tizenegy", "harom", "nyolc", "kilenc", "ketto", "holnaputan", "holnap", "hetfo", "szerda", "csutortok", "pentek", "szombat", "vasarnap", "reggel", "delelott", "delutan", "hetvege", "mulva", "kovetkezo",
  "emberrel", "valakivel", "operator", "ugyfelszolgalat", "visszahivni", "viszontlatasra", "szolgaltatasaitok"];
const snap = n => n.replace(/[a-z0-9]{5,}/g, w => {
  if (w.length < 5) return w;
  for (const v of VOCAB) if (w.startsWith(v)) return w; // már jó (esetleg ragozva)
  for (const v of VOCAB) if (one(w.slice(0, v.length), v) || one(w.slice(0, v.length + 1), v) || one(w.slice(0, v.length - 1), v)) return v;
  return w;
});
// kérdő és töltelék szavak: önmagukban nem jelentenek témát, ezért a tudásbázis-keresés kihagyja őket
const FILLER = (["milyen", "hogyan", "lehet", "lehetne", "kell", "kellene", "tudok", "tudom", "tudnek", "tudnam", "szeretn", "szeret", "kerem", "kerek", "kerlek", "valami", "valamit", "mennyi", "mikor", "melyik", "miert", "vagyok", "vagyun", "vagyto", "nalato", "nalad", "ugyan", "szoval", "esetleg", "igazan", "nagyon", "tehat", "persze", "szeretne", "lenne", "lesz", "volna", "kellen", "mondj", "mondan", "tudna", "tudnat", "irjon", "beszel"].map(x => ph(x).slice(0, 6)));
const isFiller = x => FILLER.some(f => sim(f, x) > 0); // elütéssel is
const anyNear = (xs, ys, sm = sim) => xs.some(x => ys.some(y => sm(x, y) > 0));

/* ---------- dátum és idő ---------- */
const NW = { egy: 1, ket: 2, ketto: 2, harom: 3, negy: 4, ot: 5, hat: 6, het: 7, nyolc: 8, kilenc: 9, tiz: 10, tizenegy: 11, tizenket: 12, tizenketto: 12 };
const byLen = ks => ks.sort((a, b) => b.length - a.length).join("|");
const NUM = `\\d{1,2}|${byLen(Object.keys(NW))}`;
const NUM_RA = byLen(Object.keys(NW).filter(k => k !== "het" && k !== "egy")); // "hétre" = a hétre, "egyre" = egyre több
const num = s => /^\d/.test(s) ? +s : NW[s];
const WD = ["hetfo", "kedd", "szerda", "csutortok", "pentek", "szombat", "vasarnap"];
const MO = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sze", "okt", "nov", "dec"];
const dow = d => (d.getDay() + 6) % 7;

// idő: "14:00", "14.30", "3 órakor", "háromra", "fél 3" (= 2:30), "negyed 4", "háromnegyed 4"; 7 előtt = délután. Visszaadja a maradék szöveget is.
function timeOf(n) {
  let m, at;
  if ((m = n.match(new RegExp(`\\bharomnegyed\\s+(${NUM})\\b`)))) at = (num(m[1]) - 1) * 60 + 45;
  else if ((m = n.match(new RegExp(`\\bnegyed\\s+(${NUM})\\b`)))) at = (num(m[1]) - 1) * 60 + 15;
  else if ((m = n.match(new RegExp(`\\bfel\\s+(${NUM})\\b`)))) at = (num(m[1]) - 1) * 60 + 30;
  else if ((m = n.match(/\b([01]?\d|2[0-3])(?::([0-5]\d)|\.(00|15|30|45)(?![.\d]))/))) at = +m[1] * 60 + +(m[2] ?? m[3]);
  else if ((m = n.match(/\b([01]?\d|2[0-3])\s?(?:-\s?(?:re|ra|kor)\b|ora\w*|h\b)/))) at = +m[1] * 60;
  else if ((m = n.match(new RegExp(`\\b(${byLen(Object.keys(NW))})\\s?(?:kor\\b|ora\\w*)|\\b(${NUM_RA})(?:re|ra)\\b`)))) at = NW[m[1] || m[2]] * 60;
  if (at != null) { if (at < 420) at += 720; return { at, rest: n.replace(m[0], " ") }; }
  const part = [[/reggel/, [360, 600]], [/delelott/, [540, 720]], [/ebed/, [660, 840]], [/delutan/, [720, 1080]], [/\beste|munka utan/, [1020, 1320]]].find(([re]) => re.test(n))?.[1];
  return { part, rest: n };
}
// dátum: ma, holnap, holnapután, hétfő, jövő péntek, hétvége, jövő héten, 3 nap múlva, 2 hét múlva, 24-én, 12.24., december 24., 2026-12-24
function dateOf(n, now) {
  const t0 = new Date(now); t0.setHours(12, 0, 0, 0);
  const plus = k => new Date(t0.getTime() + k * 864e5), today = plus(-.5);
  const mk = (mo, d, y = t0.getFullYear()) => { const x = new Date(y, mo, d, 12); return x.getMonth() !== mo ? null : x < today ? new Date(y + 1, mo, d, 12) : x; }; // elmúlt dátum = jövőre
  let m;
  if ((m = n.match(/\b(20\d\d)-(\d\d)-(\d\d)\b/))) return new Date(+m[1], m[2] - 1, +m[3], 12);
  if ((m = n.match(/\b(0?[1-9]|1[0-2])\.\s?(0?[1-9]|[12]\d|3[01])\b/))) return mk(m[1] - 1, +m[2]);
  if ((m = n.match(new RegExp(`\\b(${MO.join("|")})\\w*\\.?\\s*(\\d{1,2})\\b`)))) return mk(MO.indexOf(m[1]), +m[2]);
  if ((m = n.match(/\b([12]?\d|3[01])\s?-\s?(?:en|an|ra|re|ig|jen|jan)\b/)) && +m[1] > 0) { // "24-én": a hónap következő ilyen napja
    const d = +m[1], x = mk(t0.getMonth(), d);
    if (x && x.getFullYear() === t0.getFullYear()) return x;
    const y = new Date(t0.getFullYear(), t0.getMonth() + 1, d, 12); return y.getDate() === d ? y : null;
  }
  if (/holnaputan/.test(n)) return plus(2);
  if (/holnap/.test(n)) return plus(1);
  if (/\b(ma|most)\b/.test(n)) return t0;
  if ((m = n.match(new RegExp(`\\b(${NUM})\\s*(nap|het)\\s*mulva`)))) return plus(num(m[1]) * (m[2] === "nap" ? 1 : 7));
  const wd = WD.findIndex(d => n.includes(d));
  if (wd >= 0) return plus(/jovo/.test(n) ? 7 - dow(t0) + wd : (wd - dow(t0) + 7) % 7 || (/kovetkezo/.test(n) ? 7 : 0)); // "jövő péntek" = a jövő heti; "következő péntek" = a legközelebbi
  if (/\bjovo het(en|re)?\b/.test(n)) return plus(7 - dow(t0));
  if (/hetvege/.test(n)) return plus((5 - dow(t0) + 7) % 7);
  return null;
}
const parse = (n, now = new Date()) => { const t = timeOf(n); return { at: t.at, part: t.part, date: dateOf(t.rest, now) }; }; // az időt kivesszük, hogy ne dátumnak olvassa

/* ---------- témák ---------- */
// [minta, súly, kivétel]. Minta: regex a normalizált szövegre | szólista (elütés- és ragozástűrő, betöltéskor 6 betűre tövezve) | { all: [minta, minta] } (mindkettő kell).
// A pontszámok összeadódnak; a kivétel-regex kizárja a találatot.
const LEX = {
  greet: [[/\b(szia|szevasz|hello|helo|hali|hey|udv|csao)|jo (napot|reggelt|estet)|szep napot/, 1]],
  thanks: [[["koszonom", "koszi", "koszonet", "thanks", "halas"], 1.5]],
  bye: [[/viszont ?lat|viszlat|\bpapa\b|\bcsumi\b|\bbye\b/, 1.5]],
  who: [[/ki vagy|mi vagy|ember vagy|robot|\bbot\b|mesterseges|chatgpt|\bgpt\b|\bai\b/, 2]],
  help: [[["segitseg", "segiteni", "segitsetek", "help"], 1.5], [/mit tudsz|mire (jo|vagy)|mit lehet/, 1.5]],
  rude: [[/hulye|barom|\bszar\b|fasz|geci|kurva|idiot|retkes/, 3]],
  book: [[["idopont", "foglalas", "foglalni", "befer", "szabad", "jelentkezni"], 2, /foglalkoz|jelenleg|nelkul/], [/jelentkez|appoint|elmehetek|bemehetek/, 2, /nelkul/], [/\bjonni\b|jonnek/, 1.5]],
  cancel: [[["lemondom", "lemondani", "torolni", "torolje", "athelyez", "elhalaszt", "modositani", "modositas"], 3], [/visszamond|athely|atrak|attenn|\bat\b.{0,20}\b(tenni|rakni|vinni|tehetem)\b/, 3]],
  mybooking: [[/az idopontom|foglalasom|mikor van (az )?idopontom|mikorra foglaltam|mikor foglaltam/, 3, /lemon|torol|visszamond|athel|modos|elhal|tenni|rakni/]],
  hours: [[["nyitva", "nyitas", "nyitok", "nyitnak", "zaras", "zarva", "zarnak", "zartok", "ugyelet", "nyitvatartas"], 2.5], [/hany ora|meddig (vagytok|nyit|van|tartotok|lehet)|mikor (zart|nyit)|munkaido|mikortol/, 2.5], [/\bmikor\b/, .5]],
  price: [[["arak", "arat", "aral", "koltseg", "kerul", "forint", "draga", "olcso", "akcio", "kedvezmeny", "tarifa", "arlista"], 2.5], [["mennyi"], 2.5, /mennyi (ido|ideig)|menny.{0,3} idot/], [/\bar\b|\bft\b|\bdij|olcso/, 2.5], [["fizet", "fizetni"], .5]],
  duration: [[{ all: [["meddig", "ideig", "percig", "mennyi"], ["tart", "tartani", "tartja"]] }, 4], [/mennyi ideig|hany percig|mennyi ido|mennyi idot|hosszu a/, 4]],
  menu: [[{ all: [/\b(milyen|mit|mik|mivel)\b/, ["szolgaltatas", "kinalat", "vallalok", "csinaltok", "kinaltok", "vallaltok", "foglalkoztok"]] }, 3], [/szolgaltatasaitok/, 3]],
  contact: [[["telefon", "elerhetoseg", "email", "merre", "hivni", "hivhatok", "megkozelit"], 2.5], [/\bhol\b|\bcim|e-mail|hogy jut|hogyan jut|odaer|odajut/, 2.5], [/emberrel|valakivel|operator|ugyfelszolg|kollegaval|tulajjal/, 3]],
  staff: [[["munkatars", "kollega", "dolgozo", "dolgoznak", "csapat", "tulajdonos"], 2, /tulajjal/], [/kik vagytok/, 2]],
  msg: [[["uzenet", "uzenni", "uzenek", "panasz", "ajanlat", "megkeres", "elegedetlen"], 2.5], [/visszahiv|kerdesem|kerdesunk|kerdeset/, 2.5]],
  earliest: [[/legkorabb|leghamarabb|mielobb|minel elobb|elso szabad|legkozelebbi|legelso|legkorabbi/, 3]],
  repeat: [[/ismeteld|mondd (el )?(ujra|meg egyszer)|meg egyszer|mit mondtal|hogy mondtad|mondjad ujra/, 3]],
  confused: [[/nem ertem|nem ertettem|nem vilagos|mi az hogy|mire gondolsz|ertelmetlen|nem erte(m|k) ezt/, 3]],
  intro: [], // a névbemutatkozást a classify külön ismeri fel
};
const tk = p => p instanceof RegExp ? p : Array.isArray(p) ? p.map(x => ph(x).slice(0, 6)) : { all: p.all.map(tk) };
for (const l of Object.values(LEX)) for (const e of l) e[0] = tk(e[0]);
const hit = (p, n, qs, sm) => p instanceof RegExp ? p.test(n) : Array.isArray(p) ? anyNear(p, qs, sm) : p.all.every(x => hit(x, n, qs, sm));
const eaten = (p, qs, n, sm = sim) => { // a találatot adó tövek
  if (p instanceof RegExp) { const m = n.match(p); return m ? qs.filter(y => words(m[0]).some(w => sim(ph(w).slice(0, 6), y) === 1)) : []; }
  return Array.isArray(p) ? qs.filter(y => p.some(x => sm(x, y) > 0)) : p.all.flatMap(x => eaten(x, qs, n, sm));
};
const SEM_ANSWER = .5, SEM_SUGGEST = .2; // koszinusz-küszöbök: válasz (a második találat 1,4-szerese fölött) / "erre gondolt?" javaslat
// költségkeret: "5000 alatt", "8 ezerig", "legfeljebb 12000", "10 000 Ft felett" -> { max } vagy { min }
const budgetOf = n => {
  const val = x => /ezer/.test(x) ? parseInt(x, 10) * 1000 : parseInt(x.replace(/[ .]/g, ""), 10);
  const NUMX = "\\d{1,3}(?:[ .]\\d{3})+|\\d{3,6}|\\d{1,3}\\s?ezer";
  let m = n.match(new RegExp("(" + NUMX + ")\\s*(?:ft|forint)?\\s*(alatt|ig|felett|folott|tol)\\b"));
  if (m) return /alatt|ig/.test(m[2]) ? { max: val(m[1]) } : { min: val(m[1]) };
  m = n.match(new RegExp("(?:max|maximum|legfeljebb|keret|budget)\\D{0,8}(" + NUMX + ")"));
  return m ? { max: val(m[1]) } : undefined;
};
// tegező / magázó: "i" | "f" | undefined
const register = t => { const n = norm(t); return /\b(szia|szevasz|hali|sziasztok|csao|tudsz|vagy|nalatok|nalad|legyszi|kerlek|csinalsz|segitesz)\b/.test(n) ? "i" : /\b(kerem|jo napot|onok|on|tisztelt|udvozlom|szepen koszonom|tisztelettel)\b/.test(n) ? "f" : undefined; };
const INFO = ["hours", "price", "contact", "staff", "duration"];                     // egyszerre több is megválaszolható
const ACT = ["book", "cancel", "msg", "mybooking", "hours", "price", "contact"]; // ezek között kérdez vissza, ha döntetlen
const LABEL = { book: "Időpontot foglalok", price: "Árak", hours: "Nyitvatartás", contact: "Elérhetőség", msg: "Üzenetet hagyok", cancel: "Foglalás lemondása", mybooking: "Az időpontom" };
// fogalomcsoportok (szavak, a könyvtár tövezi): ugyanarra gondolnak, ezért a kereső egymás helyett is elfogadja őket, és a jelentés-vektor közös "fogalom" jegyet kap
const GROUPS = [
  ["parkolas", "parkolo", "parkolni", "auto", "autoval", "kocsi", "garazs", "melygarazs", "allni", "megallni"],
  ["fizetes", "fizetni", "kartya", "bankkartya", "keszpenz", "atutalas", "szepkartya", "terminal", "applepay", "googlepay"],
  ["gyerek", "gyermek", "kisgyerek", "baba", "kisfiu", "kislany", "csemete", "fiam", "lanyom", "iskolas", "ovodas"],
  ["kedvezmeny", "akcio", "engedmeny", "kupon", "utalvany", "nyugdijas", "diak", "torzsvendeg", "huseg", "szuletesnap"],
  ["idopont", "foglalas", "jelentkezes", "foglalni"],
  ["bejelentkezes", "elozetes", "elozetesen", "spontan", "betoppanni", "sorban", "varni", "varakozas", "varakozni", "sorszam"],
  ["lemondas", "torles", "athelyezes", "elhalasztas", "visszamondas"],
  ["nyitvatartas", "nyitva", "munkaido", "nyitas", "zaras", "ugyelet"],
  ["unnep", "unnepnap", "szunnap", "karacsony", "husvet", "szabadsag", "nyaralas"],
  ["ajandek", "ajandekutalvany", "ajandekkartya", "utalvany", "megleptes"],
  ["allergia", "allergias", "erzekeny", "intolerancia", "gluten", "glutenmentes", "laktoz", "laktozmentes", "vegan", "vegetarianus"],
  ["kutya", "allat", "haziallat", "macska", "kisallat"],
  ["wifi", "internet", "wlan"],
  ["akadalymentes", "kerekesszek", "lift", "lepcso", "babakocsi", "mozgasserult"],
  ["szallitas", "kiszallitas", "futar", "hazhozszallitas", "hazhoz", "csomag", "postazas"],
  ["rendeles", "megrendeles", "elorendeles", "rendelni", "megrendelni", "megrendelem"],
  ["minoseg", "markas", "marka", "termek", "premium", "szakmai", "bio", "alapanyag", "hozzavalo"],
  ["tapasztalat", "tapasztalt", "szakkepzett", "kepesites", "diploma", "referencia", "evek", "gyakorlat"],
  ["szamla", "szamlat", "adoszam", "ceges", "cegre", "afa", "nav"],
  ["angol", "nemet", "nyelv", "beszeltek", "english", "kulfoldi"],
  ["keses", "keseni", "kesni", "kesek", "kesem", "keso", "kesett", "elkesni", "elkesek", "elkesem", "kesedelem", "kesve"],
  ["elolleg", "foglalo", "kotber", "penalty", "nemjelenes"],
  ["wc", "mosdo", "toalett", "vece"],
  ["higienia", "tiszta", "fertotlenit", "maszk", "steril", "tisztasag"],
  ["velemeny", "ertekeles", "review", "ajanlas", "elegedett"],
  ["munkatars", "kollega", "dolgozo", "csapat", "tulajdonos", "szakember", "fodrasz", "kozmetikus", "szerelo"],
];

/* ---------- motor egy üzlet configjából ---------- */
function create(C, o = {}) {
  const clock = o.now || (() => new Date());
  const services = C.services || [], staff = (C.staff || []).filter(s => s.name);
  const syn = new Map();
  // C.syn: az üzlet saját szinonimái, pl. [["hajvagas","nyiras"]]
  const groups = [...GROUPS, ...(C.syn || [])].map(g => [...new Set(g.map(x => stem(x)[0]).filter(Boolean))]);
  for (const st of groups) for (const x of st) syn.set(x, new Set([...(syn.get(x) || []), ...st.filter(y => y !== x)]));
  const inGroup = (k, st) => st === k || sim(k, st) === 1 || (k.length >= 4 && st.startsWith(k));
  const groupsOf = st => groups.flatMap((g, i) => g.some(k => inGroup(k, st)) ? [i] : []);
  const expand = w => {
    const m = new Map(w.map(x => [x, 1]));
    for (const x of w) for (const [k, set] of syn) if (inGroup(k, x)) for (const y of set) if (!m.has(y)) m.set(y, .8);
    return m;
  };

  // ismert szavak (csoportok, kulcsszavak, szolgáltatás- és tudásbázis-tövek): az ilyen szóra nem keresünk elütés-egyezést, így két valódi szó nem téved össze
  const known = new Set();
  const addKnown = p => p instanceof RegExp || (Array.isArray(p) ? p.forEach(x => known.add(x.slice(0, 5))) : p.all.forEach(addKnown));
  for (const g of groups) g.forEach(x => known.add(x.slice(0, 5)));
  for (const l of Object.values(LEX)) for (const e of l) addKnown(e[0]);
  for (const sv of services) sstem(sv.name).forEach(x => known.add(x.slice(0, 5)));
  const simK = (a, b) => { const v = sim(a, b); return v === 1 || (v > 0 && !known.has(b.slice(0, 5))) ? v : 0; };

  // tudásbázis: GYIK, termékek, előnyök. Mező-súly: kérdés/név 1, válasz/leírás .5
  const kb = [
    ...(C.faq || []).map((f, i) => ({ type: "faq", i, title: f.q, f: [[f.q, 1], [f.a, .5]] })),
    ...(C.products || []).map((p, i) => ({ type: "product", i, title: p.name, f: [[p.name, 1], [p.desc || "", .5]] })),
    ...(C.perks || []).map((p, i) => ({ type: "perk", i, title: p.t, f: [[p.t, 1], [p.d, .5]] })),
  ];
  for (const d of kb) { d.s = new Map(); for (const [t, wt] of d.f) for (const x of stem(t)) { d.s.set(x, Math.max(d.s.get(x) || 0, wt)); known.add(x.slice(0, 5)); } }
  // IDF-súlyozott találat: a ritka szó többet ér; s = minden mező, q = csak kérdés/név. Rendezve, legjobb elöl
  function lookup(qm) {
    const idf = new Map([...qm.keys()].map(x => [x, Math.log(1 + kb.length / Math.max(1, kb.filter(d => [...d.s.keys()].some(k => simK(k, x) > 0)).length))]));
    const own = [...qm].filter(([, f]) => f === 1).length || 1;
    return kb.map(d => {
      let s = 0, q = 0, hit = 0;
      for (const [x, f] of qm) { let m = 0; for (const [k, wt] of d.s) m = Math.max(m, wt * simK(k, x)); s += m * f * idf.get(x); if (m >= .6) q += f * m * idf.get(x); if (m > 0 && f === 1) hit++; }
      const len = 1 + .03 * d.s.size;
      return { d, s: s / len, q: q / len, cov: hit / own };
    }).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  }
  /* jelentés-keresés tanult modell nélkül: minden szöveg egy ritka vektor = karakter 3-4-gramok (ragozás, elütés ellen)
     + fogalomcsoport-jegyek (parkolás ~ autó ~ kocsi). IDF-súlyozott koszinusz-hasonlóság a tudásbázis ellen. */
  const gramsOf = (ws, text) => {
    const m = new Map(), add = (g, v) => m.set(g, (m.get(g) || 0) + v);
    for (const w of ws) { const t = "^" + w + "$"; for (const n of [3, 4]) for (let i = 0; i + n <= t.length; i++) add(t.slice(i, i + n), 1); }
    for (const st of stem(text)) for (const g of groupsOf(st)) add("#" + g, 20);
    return m;
  };
  const wordsOf = t => words(norm(t)).filter(w => w.length > 3).map(ph);
  for (const d of kb) { d.v = new Map(); for (const [t, wt] of d.f) for (const [g, c] of gramsOf(wordsOf(t), t)) d.v.set(g, (d.v.get(g) || 0) + wt * c); }
  const df = new Map(); for (const d of kb) for (const g of d.v.keys()) df.set(g, (df.get(g) || 0) + 1);
  const idfG = g => Math.log(1 + kb.length / (df.get(g) || .5));
  for (const d of kb) { let n = 0; for (const [g, c] of d.v) { const x = c * idfG(g); d.v.set(g, x); n += x * x; } d.vn = Math.sqrt(n) || 1; }
  function semantic(text, skip) { // skip: a már témához kötött tövek kimaradnak
    const ws = words(norm(text)).filter(w => w.length > 3 && !skip(ph(w).slice(0, 6))).map(ph);
    const q = gramsOf(ws, ws.join(" ")); let qn = 0; for (const [g, c] of q) { const x = c * idfG(g); q.set(g, x); qn += x * x; }
    qn = Math.sqrt(qn) || 1;
    return kb.map(d => { let dot = 0; for (const [g, c] of q) { const y = d.v.get(g); if (y) dot += c * y; } return { d, c: dot / (qn * d.vn) }; }).filter(x => x.c > 0).sort((a, b) => b.c - a.c);
  }

  // pontszám témánként; used = a kérdés azon tövei, amelyeket már egy téma kulcsszava "elhasznált" (a tudásbázis-keresés ezeket kihagyja)
  const score = (n, qs) => {
    const sc = {}, used = new Set();
    for (const [k, l] of Object.entries(LEX)) {
      let v = 0; const e = [];
      for (const [p, w, not] of l) {
        if (not && not.test(n)) continue;
        if (hit(p, n, qs, simK)) { v += w; e.push(...eaten(p, qs, n, simK)); }
      }
      if (v) sc[k] = v;
      if (v >= 1) e.forEach(y => used.add(y)); // gyenge találat ("fizet" .5) nem veszi el a szót a tudásbázis elől
    }
    return { sc, used };
  };

  // ctx: { topic, svc } az előző fordulóból. Visszaad egy döntést: kind = intent | kb | clarify | suggest | fallback
  function classify(text, ctx = {}) {
    const n = snap(norm(text)), w = stem(n), qm = expand(w), qs = [...qm.keys()];
    const { at, part, date } = parse(n, clock());
    // szolgáltatás: a legtöbb szavával egyező név(ek) – "férfi hajvágás" a Férfi hajvágást jelenti, nem a Nőit is
    const sw = [...new Set([...qs, ...sstem(n)])];
    let svcs = services.map(s => [s, sstem(s.name).filter(x => sw.some(y => simK(x, y) > 0)).length]).filter(x => x[1]);
    const most = Math.max(0, ...svcs.map(x => x[1]));
    svcs = svcs.filter(x => x[1] === most).map(x => x[0]);
    const named = s => { const f = ph(words(norm(s.name))[0]); return words(n).some(x => ph(x).startsWith(f) && x.length <= f.length + 5); }; // Dórinál, Évával
    let who = staff.find(named);
    if (!who && ctx.who && /\b(nala|neki|ot|ove)\b/.test(n)) who = staff.find(s => s.name === ctx.who); // "ő", "nála": az előbb említett munkatárs
    const { sc, used } = score(n, w);
    // bemutatkozás: "Kiss Anna vagyok", "a nevem Béla"
    const NOT_NAME = new Set(["en", "ki", "hol", "itt", "most", "mar", "csak", "is", "meg", "nem", "ma"]);
    const nm = text.match(/(?:a nevem|nevem|h[ií]vnak|(?:^|\s)[ÉéEe]n)\s+(\p{Lu}[\p{L}'-]+(?:\s+\p{Lu}[\p{L}'-]+)?)/u) || text.match(/(\p{Lu}[\p{L}'-]+(?:\s+\p{Lu}[\p{L}'-]+)?)\s+(?:vagyok|a nevem)/u);
    const nameRaw = nm && nm[1].replace(/^[ÉE]n\s+/, ""), name = nameRaw && !NOT_NAME.has(norm(nameRaw)) ? nameRaw : undefined;
    if (name) sc.intro = 3;
    // árkérdés: "legolcsóbb", "5000 alatt"
    const sup = /legolcsobb|legkevesebb|legkisebb ar/.test(n) ? "min" : /legdragabb|legtobb|legnagyobb ar/.test(n) ? "max" : undefined;
    const budget = budgetOf(n);
    if (sup || budget) sc.price = (sc.price || 0) + 4;
    // javítás: "inkább kedden", "másik napot"
    const corr = /\b(inkabb|megis|helyett|masik|masikat|masra|masnap|masnapra|valtoztat|javit)\b/.test(n) ? { reset: [/masik nap|masnap|masik datum/.test(n) && "date", /masik (idopont|ora)/.test(n) && "time", /masik (szolgaltat|kezeles)|masra\b/.test(n) && "svc"].filter(Boolean) } : undefined;
    const timed = date || at != null || part;
    const slot = !!ctx.draft && !!(svcs.length || who || timed || corr); // a futó foglalási piszkozat kitöltése/javítása

    const asking = INFO.some(k => sc[k] >= 2); // kifejezett kérdés (nyitva? ár?): az entitások nem fordítják foglalássá
    if (!asking && svcs.length && timed) sc.book = (sc.book || 0) + 2;     // "holnap hajvágás" = foglalni akar
    if (!asking && date && (at != null || part)) sc.book = (sc.book || 0) + 2; // "szerdán délután" is
    if (slot && !asking) sc.book = (sc.book || 0) + 3;
    if (svcs.length) sc.service = 1.5;
    if (who) sc.staff = (sc.staff || 0) + 1.5;
    if (sc.book && !sc.cancel && /\b(nem|ne)\s+(szeretn\w*|akar\w*|kerek|kerem|kell\w*|foglal\w*)|nincs (kedvem|szuksegem|igenyem)/.test(n)) { // "nem szeretnék időpontot"
      delete sc.book;
      if (!Object.entries(sc).some(([k, v]) => k !== "service" && v >= 2)) sc.decline = 4; // "nem akarok foglalni, csak árat kérdezek" = az árat kérdezi
    }
    if (sc.staff && date && !who) { sc.hours = (sc.hours || 0) + sc.staff; delete sc.staff; } // "a hétvégén is dolgoztok?" = nyitvatartás
    if (!Object.keys(sc).length) { // csak egy nap / idő: az előző témára vonatkozik ("és vasárnap?", "inkább 15:00-ra")
      if (ctx.topic === "book" && timed) sc.book = 1;
      else if (date) sc.hours = 1;
    }
    const ranked = Object.entries(sc).filter(x => x[1] >= 1).sort((a, b) => b[1] - a[1]), top = ranked[0], second = ranked[1];
    const base = { svcs, who, date, at, part, name, sup, budget, corr, slot, scores: sc };

    // a kérdésre pontosan illő GYIK/termék többet ér egy általános témánál ("mennyibe kerül a parkolás?")
    // a témához és a szolgáltatás nevéhez tartozó szavak nélkül keresünk, így csak a "maradék" jelentés számít
    const spent = new Set([...used, ...svcs.flatMap(s => sstem(s.name))]);
    const isSpent = x => [...spent].some(u => near(u, x));
    const hits = lookup(expand(w.filter(x => !isSpent(x) && !isFiller(x)))), h0 = hits[0];
    const sem = semantic(n, x => isSpent(x) || isFiller(x)), s0 = sem[0];
    const generic = !top || INFO.includes(top[0]) || top[0] === "service" || top[1] < 2;
    if (h0 && generic && (!top ? h0.s >= .9 : h0.q >= 1.2 && (h0.cov >= .3 || top[1] < 2))) return { kind: "kb", hit: { type: h0.d.type, i: h0.d.i }, conf: h0.s >= 1.5 ? "high" : "mid", ...base };
    if (!top && s0 && s0.c >= SEM_ANSWER && s0.c >= 1.4 * (sem[1]?.c || 0)) return { kind: "kb", hit: { type: s0.d.type, i: s0.d.i }, conf: "mid", sem: s0.c, ...base }; // jelentés alapján (nincs közös szó)

    if (top) {
      // "és mennyibe kerül?" / "meddig tart?" – az előbb említett szolgáltatásra vonatkozik
      if (!svcs.length && ctx.svc && (top[0] === "duration" || (top[0] === "price" && /\bar\b|mennyi|kerul/.test(n) && !/\barak\b/.test(n)))) svcs = [ctx.svc];
      if (second && second[1] >= 1.5 && top[1] - second[1] < .6 && ACT.includes(top[0]) && ACT.includes(second[0]) && !(INFO.includes(top[0]) && INFO.includes(second[0])))
        return { kind: "clarify", intents: [top[0], second[0]], ...base, svcs };
      const intents = INFO.includes(top[0]) ? ranked.filter(([k, v]) => INFO.includes(k) && v >= Math.max(1, Math.min(2, .6 * top[1]))).map(x => x[0]) : [top[0]];
      return { kind: "intent", intents, ...base, svcs };
    }
    const seen = new Set(), alts = [...hits.filter(x => x.s >= .5).map(x => x.d), ...sem.filter(x => x.c >= SEM_SUGGEST).map(x => x.d)]
      .filter(d => !seen.has(d) && seen.add(d)).slice(0, 3).map(d => ({ type: d.type, i: d.i, title: d.title }));
    return { kind: alts.length ? "suggest" : "fallback", alts, ...base };
  }
  return { classify, lookup, semantic, kb, expand };
}

return { create, norm, stem, near, parse, timeOf, dateOf, budgetOf, register, LEX, LABEL };
});
