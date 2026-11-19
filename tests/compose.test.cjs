// Futtatás: node compose.test.cjs  – a mondatösszeállító (template/core/compose.js) tesztje, DOM nélkül.
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert/strict");
const Compose = require("../template/core/compose.js");
const R = path.join(__dirname, "../template/");
const site = f => { const w = {}; vm.runInNewContext(fs.readFileSync(R + f, "utf8"), { window: w }); return w.SITE; };
const salon = site("config.js"), bolt = site("examples/bolt.config.js");
const NOW = new Date(2026, 10, 18, 10, 0); // szerda 10:00
const day = (m, d) => new Date(2026, m - 1, d, 12);
const mk = (C, o = {}) => Compose.create(C, { now: () => NOW, closed: () => new Set(["2026-11-25"]), rand: seeded(5), ...o });
function seeded(s) { return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }
let fails = [], total = 0;
const ok = (cond, msg) => { total++; if (!cond) fails.push(msg); };
const has = (text, ...parts) => parts.forEach(p => ok(text.includes(p), `"${text}" nem tartalmazza: ${p}`));

const z = mk(salon);
// ---- nyitvatartás: következtetés a tényekből ----
has(z.hours({ date: day(11, 21) }), "Szombaton", "09:00", "13:00");
has(z.hours({ date: day(11, 22) }), "Vasárnap zárva vagyunk", "Legközelebb hétfőn 09:00-kor nyitunk");
has(z.hours({ date: day(11, 18) }), "Ma 09:00 és 18:00 között", "most is nyitva");
has(z.hours({ date: day(11, 19) }), "Holnap");
has(z.hours({ date: day(11, 20) }), "Pénteken 09:00 és 18:00");
has(z.hours({ date: day(11, 25) }), "Szerdán (11.25.) zárva tartunk", "Legközelebb csütörtökön (11.26.) 09:00-kor");
has(z.hours({ date: day(11, 19), at: 14 * 60 }), "Holnap 14:00-kor nyitva vagyunk (09:00–20:00)"); // csütörtök: 9–20
has(z.hours({ date: day(11, 19), at: 21 * 60 }), "21:00-kor már zárva vagyunk, 20:00-ig tartunk nyitva");
has(z.hours({ date: day(11, 20), at: 14 * 60 }), "Pénteken 14:00-kor nyitva vagyunk (09:00–18:00)");
has(z.hours({ date: day(11, 19), at: 7 * 60 }), "07:00-kor még zárva vagyunk, 09:00-kor nyitunk");
has(z.hours({ date: day(11, 22), at: 10 * 60 }), "egész nap zárva vagyunk");
has(z.hours({ at: 17 * 60 }), "Ma 17:00-kor nyitva vagyunk");
const week = z.hours(); has(week, "Hétfő: 09:00–18:00", "Vasárnap: zárva", "Most nyitva vagyunk, 18:00-ig.");
has(mk(salon, { now: () => new Date(2026, 10, 18, 19, 0) }).hours({ date: day(11, 18) }), "mára már zárva vagyunk", "Legközelebb holnap 09:00-kor");
has(mk(salon, { now: () => new Date(2026, 10, 18, 7, 30) }).hours({ date: day(11, 18) }), "Ma 09:00-kor nyitunk");
has(mk(salon, { now: () => new Date(2026, 10, 21, 15, 0) }).status(), "Most zárva vagyunk", "hétfőn 09:00-kor"); // szombat 15:00: 13-kor zártunk, vasárnap zárva
has(mk(salon, { now: () => new Date(2026, 10, 18, 7, 0) }).status(), "Most még zárva vagyunk, 09:00-kor nyitunk");
has(mk({ ...salon, hours: [null, null, null, null, null, null, null] }).hours({ date: day(11, 19) }), "zárva vagyunk");
// ---- árak ----
ok(Compose.priceNum("18 000 Ft-tól") === 18000 && Compose.priceNum("6 500 Ft") === 6500 && Compose.priceNum("érdeklődjön") === null && Compose.priceNum(undefined) === null, "priceNum");
const [noi, ferfi, fest, alk] = salon.services;
has(z.prices({ svcs: [noi] }), "A női hajvágás 6 500 Ft, kb. 60 perc.");
has(z.prices({ svcs: [alk] }), "Az alkalmi frizura 9 000 Ft", "kb. 60 perc");
has(z.prices({ svcs: [noi, ferfi] }), "Női hajvágás: 6 500 Ft (60 perc)", "Férfi hajvágás: 4 000 Ft (30 perc)");
has(z.prices({ sup: "min" }), "A legolcsóbb: Férfi hajvágás: 4 000 Ft"); has(z.prices({ sup: "max" }), "A legdrágább: Festés + vágás: 18 000 Ft-tól");
has(z.prices({ sup: "min", svcs: [noi, alk] }), "Női hajvágás");
const b5 = z.prices({ budget: { max: 5000 } }); has(b5, "5 000 Ft-ig", "Férfi hajvágás"); ok(!b5.includes("Női"), "5000 alatt nincs női hajvágás");
const b10 = z.prices({ budget: { min: 10000 } }); has(b10, "10 000 Ft fölött", "Festés"); ok(!b10.includes("Férfi"), "10000 fölött nincs férfi");
has(z.prices({ budget: { max: 1000 } }), "nincs szolgáltatásunk", "A legolcsóbb: Férfi hajvágás");
has(z.prices({ budget: { min: 99999 } }), "A legdrágább: Festés");
const all = z.prices(); ok(/Árlista|Ezek az áraink/.test(all), "árlista fejléc"); has(all, "Női hajvágás: 6 500 Ft (60 perc)", "Alkalmi frizura");
const bp = mk(bolt).prices(); has(bp, "Vajas croissant: 490 Ft", "Tortaelőrendelés: 6 900 Ft-tól");
has(z.duration({ svcs: [fest] }), "A festés + vágás kb. 150 perc."); has(z.duration(), "Női hajvágás: kb. 60 perc", "Festés + vágás: kb. 150 perc");
has(z.contact(), salon.address, salon.phone, salon.email); has(z.staff(), "Éva – Tulajdonos, fodrász", "Dóri – Fodrász"); has(z.staff({ who: salon.staff[1] }), "Dóri"); ok(!z.staff({ who: salon.staff[1] }).includes("Éva"), "csak Dóri");
// ---- tegező / magázó ----
const zi = mk(salon); zi.reg = "i";
has(zi.greet({ hour: 9 }), "Szia"); has(z.greet({ hour: 9 }), "Jó reggelt"); has(z.greet({ hour: 14 }), "Jó napot"); has(z.greet({ hour: 20 }), "Jó estét"); has(z.greet({ hour: 9, name: "Béla" }), "Béla");
has(zi.callUs(), "Hívj minket"); has(z.callUs(), "Hívjon minket"); has(zi.askName(), "Hogy hívnak?"); has(z.askName(), "Hogy hívják?"); has(zi.badPhone(), "kérlek"); has(z.badPhone(), "kérem");
has(zi.fallback(), "Hívj minket", "nem vagyok biztos"); has(z.fallback(), "Hívjon minket", "nem vagyok biztos"); has(zi.summary({ sum: "X" }), "Így jó?"); has(z.summary({ sum: "X" }), "Rendben?");
{ const outs = Array.from({ length: 30 }, () => zi.prices({ budget: { max: 7000 } })); ok(outs.every(t => !t.includes("választhat:")), "tegezve nincs magázó alak"); ok(outs.some(t => t.includes("választhatsz")), "tegező alak előfordul"); has(z.prices({ budget: { max: 5000 } }), "ezt tudjuk ajánlani"); }
has(z.askName({ known: "Kiss Anna" }), "Kiss Anna"); has(z.askPhone({ known: "+36301234567" }), "+36301234567"); has(z.askPhone(), "telefonszám");
// ---- változatosság: egymás után ugyanaz nem ismétlődik, de a készlet kimerül-e? ----
const real = Compose.create(salon, { now: () => NOW });
for (const [name, call] of [["thanks", () => real.thanks()], ["bye", () => real.bye()], ["decline", () => real.decline()], ["hours", () => real.hours({ date: day(11, 21) })], ["nameAck", () => real.nameAck("Éva")]]) {
  const seen = new Set(); let prev = null, repeat = false;
  for (let i = 0; i < 60; i++) { const t = call(); if (t === prev) repeat = true; prev = t; seen.add(t); }
  ok(!repeat, `${name}: kétszer egymás után ugyanaz`); ok(seen.size >= 2, `${name}: nincs változatosság`);
}
// determinisztikus magfeltétel: ugyanaz a mag = ugyanaz a szöveg
const run = seed => { const q = mk(salon, { rand: seeded(seed) }); return [q.thanks(), q.thanks(), q.bye(), q.decline(), q.hours({ date: day(11, 21) })].join("|"); };
ok(run(3) === run(3), "ugyanazzal a maggal ugyanaz"); ok(new Set([1, 2, 3, 4, 5, 6].map(run)).size > 1, "más maggal más szöveg");
// ---- foglalás-szövegek, javítás visszaigazolása ----
has(z.changed({ s: noi, who: "Éva", date: "2026-11-19", at: 14 * 60 }), "Női hajvágás · Éva", "holnap", "14:00");
has(z.changed({ s: noi }), "Női hajvágás"); ok(!z.changed({ s: noi }).includes("undefined"), "changed: nincs undefined");
has(z.earliest({ svc: noi, date: day(11, 19), start: 9 * 60 + 30 }), "Legkorábban holnap 09:30-kor", "Női hajvágás"); has(z.earliest(), "Sajnos nincs szabad időpont");
has(z.mybooking({ service: "Női hajvágás", date: "2026-11-20", start: 600 }), "Női hajvágás, 2026-11-20 10:00"); has(z.mybooking(null), "nem találok foglalást");
has(z.hedged("Van parkolás?", "Igen."), "„Van parkolás?”", "Igen."); has(z.help(), "női hajvágás"); has(mk({ ...salon, services: [] }).help(), "mikor vagytok nyitva");
has(z.slotFree(14 * 60), "14:00"); has(z.slotBusy(14 * 60), "14:00-kor már nincs"); has(z.tooFar(30), "30 napra");
// ---- robusztusság: üres/hiányos config, véletlen bemenet: sosem "undefined"/"NaN"/"null" a szövegben ----
const bad = /undefined|NaN|\bnull\b|\[object/;
const configs = [salon, bolt, {}, { name: "X" }, { name: "X", hours: [] }, { name: "X", services: [{ name: "Y", price: "ingyen", min: 10 }], hours: [["09:00", "17:00"], null, null, null, null, null, null] }, { ...salon, services: [], staff: [] }];
let seed = 11; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
for (const C of configs) for (const reg of ["f", "i"]) {
  const q = Compose.create(C, { now: () => new Date(2026, 10, 18 + Math.floor(rnd() * 20), Math.floor(rnd() * 24)), closed: () => new Set(["2026-11-25"]), rand: rnd }); q.reg = reg;
  const dates = [undefined, day(11, 18 + Math.floor(rnd() * 20))], ats = [undefined, 0, 600, 1439];
  const outs = [q.greet(), q.welcome(), q.thanks(), q.bye(), q.who(), q.help(), q.rude(), q.decline(), q.confused(), q.nameAck("A"), q.fallback(), q.suggest(), q.clarify(), q.status(), q.contact(), q.staff(), q.callUs(),
    q.prices(), q.prices({ sup: "min" }), q.prices({ sup: "max" }), q.prices({ budget: { max: 5000 } }), q.prices({ budget: { min: 5000 } }), q.duration(), q.askService(), q.askStaff(), q.askDay(), q.askTime(), q.askName(), q.askPhone(), q.badName(), q.badPhone(),
    q.slotFree(600), q.slotBusy(600), q.slotsPart(true), q.noDay(), q.noSlots(), q.tooFar(30), q.mybooking(null), q.earliest(), q.hedged("a", "b")];
  for (const date of dates) for (const at of ats) outs.push(q.hours({ date, at }));
  for (const t of outs) { total++; if (typeof t !== "string" || !t.trim() || bad.test(t)) fails.push(`rossz szöveg (${C.name}/${reg}): ${JSON.stringify(t)}`); }
}
// fuzz: sok véletlen szolgáltatás/ár nem dob hibát
for (let i = 0; i < 300; i++) {
  const C = { name: "F", phone: "1", hours: Array.from({ length: 7 }, () => rnd() < .3 ? null : ["0" + Math.floor(rnd() * 9) + ":00", "1" + Math.floor(rnd() * 9) + ":30"]), services: Array.from({ length: Math.floor(rnd() * 5) }, (_, k) => ({ name: ["Női x", "Zöld", "Ábra", "123", "WC"][k], price: ["1 000 Ft", "ingyen", "", "9 999 Ft-tól"][Math.floor(rnd() * 4)], min: Math.floor(rnd() * 200) })) };
  total++; try { const q = Compose.create(C, { rand: rnd }); q.prices({ sup: "min" }); q.prices({ budget: { max: 5000 } }); q.prices({ svcs: C.services.slice(0, 1) }); q.hours({ date: day(11, 1 + Math.floor(rnd() * 28)), at: 600 }); q.duration(); } catch (e) { fails.push("fuzz: " + e.message); break; }
}
console.log(`${total - fails.length}/${total} ellenőrzés rendben`);
if (fails.length) { console.error(fails.slice(0, 30).map(f => " ✗ " + f).join("\n")); process.exit(1); }
console.log("OK");
