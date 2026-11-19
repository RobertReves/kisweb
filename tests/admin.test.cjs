// Futtatás: node admin.test.cjs  – az admin naptár és idővonal (jsdom, rögzített "ma": 2026-11-18, szerda 10:00)
const { JSDOM } = require("jsdom");
const fs = require("fs"), path = require("path"), assert = require("assert/strict");
const R = path.join(__dirname, "../template/");

const NOW = new Date(2026, 10, 18, 10, 0).getTime();
const BOOKINGS = [
  { id: "AAA111", date: "2026-11-18", start: 600, dur: 60, staff: "Éva", service: "Női hajvágás", name: "Kiss Anna", phone: "+36301234567" },
  { id: "BBB222", date: "2026-11-18", start: 840, dur: 150, staff: "Dóri", service: "Festés + vágás", name: "Nagy Béla", phone: "06201112222" },
  { id: "CCC333", date: "2026-11-19", start: 570, dur: 30, staff: "", service: "Férfi hajvágás", name: "Szabó Géza", phone: "" },
  { id: "DDD444", date: "2026-12-02", start: 660, dur: 60, staff: "Éva", service: "Női hajvágás", name: "Tóth Eszter", phone: "+36309998888" },
];

async function load() {
  const html = fs.readFileSync(R + "admin.html", "utf8").replace('<script src="config.js"></script>', "").replace('<script src="core/admin.js"></script>', "");
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://szalon-eva.hu/admin.html" });
  const w = dom.window, calls = [];
  w.eval(`(() => { const D = Date; class F extends D { constructor(...a) { a.length ? super(...a) : super(${NOW}); } static now() { return ${NOW}; } } Date = F; })()`); // rögzített "ma"
  w.eval(fs.readFileSync(R + "config.js", "utf8"));
  Object.assign(w.SITE, { api: "https://api.test" });
  w.sessionStorage.setItem("tok_szalon-eva", "titok");
  w.confirm = () => true; w.alert = () => {};
  w.fetch = async (url, init = {}) => {
    const u = new URL(url); calls.push([u.pathname, Object.fromEntries(u.searchParams), init.body && JSON.parse(init.body)]);
    const ok = d => ({ status: 200, json: async () => d });
    if (u.pathname === "/admin/bookings") { const [f, t] = [u.searchParams.get("from"), u.searchParams.get("to")]; return ok({ bookings: BOOKINGS.filter(b => b.date >= f && b.date <= t) }); }
    if (u.pathname === "/admin/stats") return ok({ total: 4, cancelled: 0, top: [] });
    if (u.pathname === "/info") return ok({ banner: "", closed: ["2026-11-25"] });
    if (u.pathname === "/admin/cancel") return ok({ ok: true });
    return { status: 404, json: async () => ({}) };
  };
  w.eval(fs.readFileSync(R + "core/admin.js", "utf8"));
  const flush = () => new Promise(r => setTimeout(r, 30)), d = w.document;
  await flush();
  const cell = k => d.querySelector(`.cal .d[data-d="${k}"]`);
  const click = async el => { el.click(); await flush(); };
  return { w, d, calls, flush, cell, click, grid: () => [...d.querySelectorAll(".cal .d")], blocks: () => [...d.querySelectorAll(".tl .blk")], lastRange: () => calls.filter(c => c[0] === "/admin/bookings").at(-1)[1] };
}

(async () => {
  let t = await load();
  // 1) rács: hétfővel kezd, teljes hetek, a nov. 2026 5 sor (nov. 1 vasárnap -> 6 sor!)
  const g = t.grid(); assert.equal(g.length, 42, "2026. november: vasárnappal kezdődik, 6 sor");
  assert.equal(g[0].dataset.d, "2026-10-26", "nov. 1. vasárnap: a rács okt. 26-án (hétfő) indul"); assert.equal(g.at(-1).dataset.d, "2026-12-06", "és vasárnapra végződik");
  assert.deepEqual(t.lastRange(), { from: "2026-10-26", to: "2026-12-06", site: "szalon-eva" }, "egyetlen lekérdezés a rács teljes időszakára");
  // 2) jelölések: ma, kijelölt, darabszám, zárva tartott nap, zárt hétköznap, másik hónap halvány
  const today = t.cell("2026-11-18"); assert.ok(today.classList.contains("tod") && today.classList.contains("sel"));
  assert.equal(today.querySelector("i").textContent, "2", "ma két foglalás"); assert.equal(t.cell("2026-11-19").querySelector("i").textContent, "1"); assert.ok(!t.cell("2026-11-20").querySelector("i"), "üres napon nincs szám");
  assert.ok(t.cell("2026-11-25").classList.contains("x"), "zárva tartott nap"); assert.ok(t.cell("2026-11-22").classList.contains("off"), "vasárnap zárva (nyitvatartás)");
  assert.ok(t.cell("2026-10-26").classList.contains("o") && !t.cell("2026-11-10").classList.contains("o"), "más hónapba nyúló napok halványak");
  assert.equal(t.cell("2026-12-02").querySelector("i").textContent, "1", "a rács másik hónapba nyúló napjai is betöltődnek");
  assert.equal(t.cell("2026-11-18").getAttribute("aria-label").includes("2 foglalás"), true, "aria-label attribútum"); assert.equal(today.getAttribute("aria-pressed"), "true");
  // 3) idővonal: két oszlop, blokk a kezdéshez és hosszhoz igazítva (nyitás 9:00 -> 0 px)
  assert.deepEqual([...t.d.querySelectorAll(".tl .col .cn")].map(x => x.textContent), ["Éva", "Dóri"]);
  const [b1, b2] = t.blocks(); assert.equal(t.blocks().length, 2);
  assert.match(b1.getAttribute("style"), /top:60px;height:60px/, "10:00 kezdés, 60 perc (9:00 = 0 px)"); assert.match(b2.getAttribute("style"), /top:300px;height:150px/, "14:00, 150 perc");
  assert.match(t.d.querySelector(".tl .now").getAttribute("style"), /top:60px/, "a 'most' vonal 10:00-nál");
  assert.ok(t.d.querySelector(".tl .col:nth-child(3) .open"), "nyitvatartási sáv a munkatárs óráiból"); // Dóri 10-18
  assert.match(t.d.querySelectorAll(".tl .open")[1].getAttribute("style"), /top:60px;height:480px/, "Dóri: 10:00–18:00");
  assert.equal(t.d.querySelectorAll(".bk").length, 2, "alatta a napi lista"); assert.ok(t.d.querySelector("#b-AAA111"), "a blokk a listaelemre linkel");
  // 4) nap váltása: foglalás munkatárs nélkül az első oszlopba kerül; a lista és az idővonal követi
  await t.click(t.cell("2026-11-19")); assert.ok(t.cell("2026-11-19").classList.contains("sel") && !t.cell("2026-11-18").classList.contains("sel"));
  assert.equal(t.blocks().length, 1); assert.ok(t.d.querySelector(".tl .col:nth-child(2) .blk"), "munkatárs nélküli foglalás az első oszlopban"); assert.match(t.d.querySelector(".bk").textContent, /Szabó Géza/);
  assert.ok(!t.d.querySelector(".tl .now"), "a 'most' vonal csak a mai napon");
  await t.click(t.cell("2026-11-22")); assert.match(t.d.querySelector(".box p.muted").textContent, /zárva/, "zárt napon nincs idővonal, csak üzenet"); assert.equal(t.d.querySelectorAll(".tl").length, 0);
  await t.click(t.cell("2026-11-25")); assert.match(t.d.querySelector(".box p.muted").textContent, /zárva tartunk/, "zárva tartott nap");
  // 5) hónapváltás: új lekérdezés az új rács időszakára; a ◀ ▶ nap-léptetés is átvált hónapot
  await t.click(t.d.querySelector('[aria-label="Következő hónap"]'));
  assert.deepEqual(t.lastRange(), { from: "2026-11-30", to: "2027-01-03", site: "szalon-eva" }, "december rácsa");
  assert.equal(t.cell("2026-12-02").querySelector("i").textContent, "1");
  await t.click(t.cell("2026-12-02")); assert.equal(t.blocks().length, 1); assert.match(t.d.querySelector(".bk").textContent, /Tóth Eszter/);
  await t.click(t.d.querySelector('[aria-label="Előző nap"]')); await t.click(t.d.querySelector('[aria-label="Előző nap"]'));
  assert.equal(t.d.querySelector(".cal .d.sel").dataset.d, "2026-11-30", "két nap vissza = november 30., a naptár hónapot vált");
  assert.equal(t.lastRange().from, "2026-10-26", "novemberi rács újra");
  await t.click(t.d.querySelector(".nav .btn.ghost.sm:nth-of-type(2)")); // "Ma"
  assert.equal(t.d.querySelector(".cal .d.sel").dataset.d, "2026-11-18", "Ma gomb");
  // 6) törlés a listából: a szerver felé megy, utána újratölt
  const before = t.calls.length; await t.click(t.d.querySelector(".bk .del"));
  assert.ok(t.calls.slice(before).some(c => c[0] === "/admin/cancel" && c[2].id === "AAA111"), "törlés elküldve");
  // 7) a rács sorainak száma hónaponként a valódi gombokkal: dec. 35, jan. 35, feb. 28 (hétfőn kezdődik), márc. 35
  const sizes = [t.grid().length]; for (let i = 0; i < 4; i++) { await t.click(t.d.querySelector('[aria-label="Következő hónap"]')); sizes.push(t.grid().length); }
  assert.deepEqual(sizes, [42, 35, 35, 28, 35], "nov. (jelenlegi 'ma' gomb után) -> dec. -> jan. -> feb. -> márc.");
  console.log("OK");
})().catch(e => { console.error(e); process.exit(1); });
