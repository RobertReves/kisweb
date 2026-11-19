// Futtatás: cd tests && npm i && node client.test.cjs   (a böngészőt jsdom-mal helyettesíti)
const { JSDOM } = require("jsdom");
const fs = require("fs"), path = require("path"), assert = require("assert/strict");
const R = path.join(__dirname, "../template/");

async function load({ api = "", turnstile = "", reduced = true, config = "config.js" } = {}) {
  const html = fs.readFileSync(R + "index.html", "utf8").replace('<script src="config.js"></script>', "").replace('<script src="core/app.js"></script>', "");
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://szalon-eva.hu/" });
  const w = dom.window, calls = [];
  w.HTMLDialogElement.prototype.showModal = () => {};
  w.Element.prototype.scrollTo = () => {};
  w.matchMedia = q => ({ matches: /reduce/.test(q) ? reduced : false, addEventListener() {} });
  w.open = u => calls.push(["open", u]);
  w.requestAnimationFrame = cb => setTimeout(() => cb(w.performance.now()), 16);
  w.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe(el) { this.cb([{ isIntersecting: true, target: el }]); } unobserve() {} };
  w.eval(fs.readFileSync(R + config, "utf8"));
  Object.assign(w.SITE, { api, turnstile });
  w.fetch = async (url, init = {}) => {
    const u = new URL(url), body = init.body && JSON.parse(init.body); calls.push([u.pathname, body]);
    const ok = (d, status = 200) => ({ status, json: async () => d });
    if (u.pathname === "/busy") return ok({ busy: [] });
    if (u.pathname === "/info") return ok({ banner: "Ma 16-ig nyitva", closed: [] });
    if (u.pathname === "/book") return body.ts === "good" || !turnstile ? ok({ id: "ABC234" }) : ok({ error: "captcha" }, 403);
    if (u.pathname === "/cancel") return ok({ ok: true });
    if (u.pathname === "/msg") return ok({ ok: true });
    return ok({}, 404);
  };
  if (turnstile) {
    w.turnstile = { render: (_box, o) => setTimeout(() => o.callback("good"), 0) };
    const append = w.document.head.append.bind(w.document.head);
    w.document.head.append = (...n) => { append(...n); n.forEach(x => x.src?.includes("turnstile") && setTimeout(() => x.onload?.(), 0)); };
  }
  w.eval(fs.readFileSync(R + "core/app.js", "utf8"));
  const d = w.document, $ = s => d.querySelector(s), flush = () => new Promise(r => setTimeout(r, 30));
  const chips = () => [...d.querySelectorAll("#chips button")].map(b => b.textContent);
  const chip = async t => { const b = [...d.querySelectorAll("#chips button")].find(b => b.textContent.includes(t)); assert.ok(b, `nincs "${t}" gomb: ${chips()}`); b.click(); await flush(); };
  const type = async v => { $("#botin").value = v; $("#botform").dispatchEvent(new w.Event("submit", { cancelable: true })); await flush(); };
  const last = () => [...d.querySelectorAll(".m")].pop().textContent;
  return { w, d, $, calls, chips, chip, type, last, flush };
}

(async () => {
  // 1) oldal + bot, backend nélkül
  let t = await load();
  assert.equal(t.d.documentElement.dataset.theme, "classic");
  assert.equal(t.d.querySelectorAll("#h1 .w").length, 2, "főcím szavanként");
  assert.ok(t.$("#openbadge").textContent.length > 3);
  assert.ok(!t.d.querySelector("#gallery"), "üres galéria szekció eltűnik");
  assert.equal(t.d.querySelectorAll("#perks .card").length, 3);
  t.$("#mainbtn").click(); await t.flush();
  await t.chip("Női hajvágás"); await t.chip("Mindegy");
  const days = t.chips(); assert.ok(days.length >= 3, "vannak szabad napok");
  await t.chip(days.at(-1)); const times = t.chips(); assert.ok(times.length > 5);
  assert.ok(t.$("#chips").className === "many", "sok időpont rácsban jelenik meg");
  await t.chip(times[0]);
  await t.type("<b>x</b>"); assert.match(t.last(), /betűkkel/, "HTML a névben elutasítva");
  await t.type("Kiss Anna"); await t.type("123"); assert.match(t.last(), /telefonszám/);
  await t.type("+36 30 555 1234"); assert.match(t.last(), /Összefoglaló/);
  await t.chip("Igen"); assert.match(t.last(), /előkészítve/); await t.chip("Üzenet küldése");
  assert.ok(t.calls.some(c => c[0] === "open" && c[1].startsWith("https://wa.me/36301234567")), "WhatsApp link");
  await t.type("van parkolás?"); assert.match(t.last(), /parkol/i, "GYIK válaszol");
  await t.type("blablabla"); assert.match(t.last(), /nem vagyok biztos/);
  await t.type("mennyibe kerül a hajvágás?"); assert.match(t.last(), /6 500 Ft/);

  // 2) API-val + Turnstile-lal
  t = await load({ api: "https://api.test", turnstile: "k" });
  await t.flush(); assert.equal(t.$("#banner").textContent, "Ma 16-ig nyitva", "banner az API-ból");
  t.$("#mainbtn").click(); await t.flush();
  await t.chip("Férfi"); await t.chip("Éva"); const dd = t.chips(); await t.chip(dd[0]); await t.chip(t.chips()[0]);
  await t.type("Nagy Béla"); await t.type("06 30 123 4567"); await t.chip("Igen");
  const bookCall = t.calls.find(c => c[0] === "/book"); assert.ok(bookCall, "foglalás elküldve");
  assert.equal(bookCall[1].ts, "good", "Turnstile token a kérésben");
  assert.match(t.last(), /ABC234/, "lemondási kód megjelenik");
  assert.ok(t.w.localStorage.getItem("bk_szalon-eva"), "foglalás megjegyezve");
  await t.chip("Köszönöm"); await t.chip("lemondása"); assert.match(t.last(), /Lemondja/);
  await t.chip("Igen, lemondom"); assert.match(t.last(), /lemondtuk/); assert.equal(t.w.localStorage.getItem("bk_szalon-eva"), null);
  await t.type("üzenet"); await t.type("Szeretnék árajánlatot"); await t.type("Kiss P., 06 20 111 2222");
  assert.equal(t.calls.find(c => c[0] === "/msg")[1].ts, "good"); assert.match(t.last(), /továbbítottuk/);

  // 3) Turnstile hiba -> nem megy el a foglalás
  t = await load({ api: "https://api.test", turnstile: "k" });
  t.w.turnstile.render = (_b, o) => setTimeout(() => o["error-callback"](), 0);
  t.$("#mainbtn").click(); await t.flush();
  await t.chip("Férfi"); await t.chip("Éva"); await t.chip(t.chips()[0]); await t.chip(t.chips()[0]);
  await t.type("Nagy Béla"); await t.type("06 30 123 4567"); await t.chip("Igen");
  assert.ok(!t.calls.some(c => c[0] === "/book"), "token nélkül nem hívja a /book-ot");
  assert.match(t.last(), /Nem sikerült/);
  // 4) animált mód (nincs csökkentett mozgás): lépcsőzetes megjelenés, "gépel…" jelzés
  t = await load({ reduced: false });
  assert.ok(t.d.querySelectorAll(".rv.in .st").length > 8, "szekciók elemei animálva");
  assert.ok(t.d.querySelector(".card").style.getPropertyValue("--i") !== "", "lépcsőzés index");
  t.$("#mainbtn").click(); await new Promise(r => setTimeout(r, 30));
  assert.ok(t.d.querySelector(".typing"), "gépelés-jelzés látszik");
  await new Promise(r => setTimeout(r, 1500)); assert.ok(!t.d.querySelector(".typing")); assert.ok(t.chips().length > 3, "gombok a gépelés után");
  // 5) példa-configok betöltődnek és használhatók
  t = await load({ config: "examples/bolt.config.js" });
  assert.equal(t.d.documentElement.dataset.theme, "modern"); assert.equal(t.d.querySelectorAll("#products .prod").length, 4); assert.ok(!t.d.querySelector("#services"));
  assert.equal(t.$("#mainbtn").textContent, "Kérdezzen tőlünk"); assert.ok(!t.d.querySelector(".links a[href='#szolgaltatasok']"), "nincs halott menüpont");
  await t.type("van croissant?"); assert.match(t.last(), /croissant/i, "bot termékre keres"); await t.chip("Igen"); await t.type("Gábor, 06 20 111 2222"); await t.chip("Üzenet küldése"); assert.ok(t.calls.some(c => c[0] === "open" && decodeURIComponent(c[1]).includes("Érdeklődöm: Vajas croissant")), "érdeklődés WhatsApp-üzenetként"); 
  t = await load({ config: "examples/szerviz.config.js" }); assert.equal(t.d.documentElement.dataset.theme, "bold");
  console.log("OK");
})().catch(e => { console.error(e); process.exit(1); });
