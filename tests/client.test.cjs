// Futtatás: cd tests && npm i && node client.test.cjs   (a böngészőt jsdom-mal helyettesíti)
const { JSDOM } = require("jsdom");
const fs = require("fs"), path = require("path"), assert = require("assert/strict");
const R = path.join(__dirname, "../template/");

const GOOGLE = { score: 4.86, count: 123, write: "https://search.google.com/local/writereview?placeid=X", list: [{ who: "Kata", stars: 5, text: "Szuper <img src=x onerror=alert(1)> hely", when: "2 hete" }, { who: "Ödön", stars: 4, text: "Rendes", when: "" }] };
async function load({ api = "", turnstile = "", reduced = true, config = "config.js", delay, google, reviews = GOOGLE, busy = [], phone = false, vv, tweak } = {}) {
  const html = fs.readFileSync(R + "index.html", "utf8").replace('<script src="config.js"></script>', "").replace('<script src="core/nlu.js"></script>', "").replace('<script src="core/compose.js"></script>', "").replace('<script src="core/app.js"></script>', "");
  const errs = [], vc = new (require("jsdom").VirtualConsole)(); vc.on("jsdomError", e => errs.push(e));
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://szalon-eva.hu/", virtualConsole: vc });
  const w = dom.window, calls = [];
  w.HTMLDialogElement.prototype.showModal = () => {};
  w.Element.prototype.scrollTo = () => {};
  w.matchMedia = q => ({ matches: /reduce/.test(q) ? reduced : /max-width/.test(q) ? phone : false, addEventListener() {} });
  w.scrollTo = o => calls.push(["scrollTo", o]);
  if (phone) Object.defineProperty(w, "scrollY", { value: 420 });
  const vvl = {}; if (vv) { w.visualViewport = { ...vv, addEventListener: (t, f) => vvl[t] = f }; Object.defineProperty(w, "innerHeight", { value: 800 }); }
  w.open = u => calls.push(["open", u]);
  w.requestAnimationFrame = cb => setTimeout(() => cb(w.performance.now()), 16);
  w.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe(el) { this.cb([{ isIntersecting: true, target: el }]); } unobserve() {} };
  { const D = w.Date, off = Date.parse(process.env.NOW || "2026-11-18T10:00:00") - Date.now(); w.Date = class extends D { constructor(...a) { a.length ? super(...a) : super(D.now() + off); } static now() { return D.now() + off; } }; } // rögzített "ma": szerda 10:00 (különben a teszt a hét napjától és napszaktól függne); másik nap: NOW=2026-11-19T23:46:00
  w.eval(fs.readFileSync(R + config, "utf8"));
  Object.assign(w.SITE, { api, turnstile, ...(delay && { botDelay: delay }), ...(google && { googleReviews: true }) }); tweak?.(w.SITE);
  w.fetch = async (url, init = {}) => {
    const u = new URL(url), body = init.body && JSON.parse(init.body); calls.push([u.pathname, body]);
    const ok = (d, status = 200) => ({ status, json: async () => d });
    if (u.pathname === "/busy") return ok({ busy });
    if (u.pathname === "/reviews") return reviews instanceof Error ? Promise.reject(reviews) : ok(reviews);
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
  w.eval(fs.readFileSync(R + "core/nlu.js", "utf8"));
  w.eval(fs.readFileSync(R + "core/compose.js", "utf8"));
  w.eval(fs.readFileSync(R + "core/app.js", "utf8"));
  const d = w.document, $ = s => d.querySelector(s), flush = () => new Promise(r => setTimeout(r, 30));
  const chips = () => [...d.querySelectorAll("#chips button")].map(b => b.textContent);
  const chip = async t => { const b = [...d.querySelectorAll("#chips button")].find(b => b.textContent.includes(t)); assert.ok(b, `nincs "${t}" gomb: ${chips()}`); b.click(); await flush(); };
  const type = async v => { $("#botin").value = v; $("#botform").dispatchEvent(new w.Event("submit", { cancelable: true })); await flush(); };
  const last = () => [...d.querySelectorAll(".m")].pop().textContent;
  return { w, d, $, calls, chips, chip, type, last, flush, errs, vvl };
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

  // 1b) okosabb értelmezés: elütés, kontextus, többes téma, előtöltött foglalás
  t = await load(); const all = () => [...t.d.querySelectorAll(".m.bot")].map(x => x.textContent).join("\n");
  await t.type("prakolás van?"); assert.match(t.last(), /parkol/i, "elütés (felcserélt betűk) is megtalálja a GYIK-et");
  await t.type("mennyibe kerül a parkolás?"); assert.match(t.last(), /parkol/i, "a pontos GYIK erősebb az általános ár-témánál");
  await t.type("hétfőn nyitva vagytok?"); assert.match(t.last(), /Hétfőn 09:00.*18:00/, "konkrét nap nyitvatartása");
  await t.type("és vasárnap?"); assert.match(t.last(), /Vasárnap zárva vagyunk/, "rövid utókérdés az előző témára");
  await t.type("mennyi az ár és mikor vagytok nyitva?"); assert.ok(/Ft/.test(all()) && /Kedd: 09:00–18:00/.test(all()), "két témára egyszerre válaszol");
  await t.type("köszi"); assert.match(t.last(), /[Ss]zívesen|Örülök|segíthettem/);
  await t.type("Árak"); assert.equal([...t.d.querySelectorAll(".m.me")].filter(x => x.textContent === "Árak").length, 1, "gomb szövegét beírva nincs dupla buborék");
  await t.type("foglalnék festésre holnap 14:00-ra");
  assert.ok(!t.chips().some(c => c.includes("Női hajvágás")), "a szolgáltatást a mondatból vette, nem kérdezi újra");
  assert.match(t.last(), /Kinél/, "a következő hiányzó adatot kérdezi");
  await t.chip("Mindegy"); assert.match(all(), /ezt le is foglalom|nincs szabad|ezek vannak|Melyik napon/, "a nap és az idő is előtöltve");
  await t.type("mégsem"); assert.ok(t.chips().includes("Nyitvatartás"), "'mégsem' után főmenü");
  await t.type("meddig tart a festés?"); assert.match(t.last(), /A festés \+ vágás kb\. 150 perc/, "időtartam");
  await t.type("holnap 14:00-kor nyitva vagytok?"); assert.match(t.last(), /14:00-kor (még |már )?(nyitva|zárva) vagyunk/, "adott időpontra nyitva-e");
  await t.type("nem szeretnék időpontot"); assert.match(t.last(), /nem foglalok/, "tagadás nem indít foglalást");
  await t.type("időpont árak"); assert.match(t.last(), /Pontosan miben/, "bizonytalan: visszakérdez"); assert.ok(t.chips().includes("Árak") && t.chips().includes("Időpontot foglalok"));
  await t.chip("Árak"); assert.match(t.last(), /6 500 Ft/, "visszakérdezés gombja működik");
  await t.type("mikor van az időpontom?"); assert.match(t.last(), /nem találok foglalást/, "nincs mentett foglalás");
  await t.type("hülye vagy"); assert.match(t.last(), /Sajnálom/, "sértésre udvarias");
  await t.type("mit csináltok?"); assert.match(t.last(), /Női hajvágás/, "kínálat");
  await t.type("holnap 14:00 férfi hajvágás"); await t.chip("Mindegy"); assert.match(all(), /Hogy hívják|nincs szabad|ezek vannak|Melyik napon/, "teljes mondatból foglalás indul");
  await t.type("mégsem");

  // 1c) beszélgetési memória: név, javítás, megszakítás utáni folytatás, ismétlés, hangnem
  t = await load(); const allB = () => [...t.d.querySelectorAll(".m.bot")].map(x => x.textContent).join("\n");
  await t.type("Kiss Anna vagyok"); assert.match(t.last(), /Kiss Anna/, "bemutatkozásra név szerint válaszol");
  await t.type("foglalnék férfi hajvágásra"); await t.chip("Mindegy"); assert.match(t.last(), /Melyik nap/, "a szolgáltatást a mondatból vette, napot kérdez");
  await t.type("van parkolás?"); assert.match(allB(), /parkol/i); assert.match(allB(), /Folytassuk a foglalást/, "kérdés után visszatér a foglaláshoz"); assert.match(t.last(), /Melyik nap/, "és újra a napot kérdezi");
  assert.ok(t.chips().length > 1, "a napválasztó gombok újra ott vannak"); assert.ok(!/Kinél|Melyik szolgáltatást/.test(t.last()), "nem kezdi elölről");
  await t.type("inkább csütörtökön"); assert.match(allB(), /átírtam/, "javítás a futó foglaláson");
  assert.ok(/Melyik időpont|szabad|nincs szabad|ezek vannak/i.test(allB()), "a csütörtöki időpontokat mutatja");
  const hh = t.chips().find(c => /^\d\d:\d\d$/.test(c)); if (hh) { await t.chip(hh); assert.match(t.last(), /Ugye Kiss Anna néven foglaljak/, "a bemutatkozáskor megadott névre rákérdez"); assert.deepEqual(t.chips().slice(0, 1), ["Kiss Anna"], "a név gomb"); }
  await t.chip("Kiss Anna"); assert.match(t.last(), /telefonszám/);
  await t.type("mennyibe kerül a festés?"); assert.match(allB(), /A festés \+ vágás 18 000 Ft/, "név/telefon lépésben feltett kérdésre válaszol, nem névnek veszi"); assert.match(allB().split("A festés + vágás 18 000 Ft")[1], /Folytassuk/); assert.match(t.last(), /telefonszám/, "a telefonszámot kéri újra");
  await t.type("+36 30 555 1234"); assert.match(t.last(), /Összefoglaló|Rendben\?/); assert.match(allB(), /Kiss Anna, \+36 30 555 1234/, "az összefoglalóban a megjegyzett név");
  await t.type("inkább másik napot"); assert.match(t.last(), /Melyik nap|Melyik időpont|nincs szabad/, "a javítás a jóváhagyás előtt is működik");
  await t.type("ismételd meg"); const rep1 = t.last(); await t.type("ismételd meg"); assert.equal(t.last(), rep1, "ismétlés"); await t.type("mégsem");
  await t.type("mikor van legkorábban időpont?"); assert.match(t.last(), /Legkorábban .*Foglaljam le/s, "legkorábbi szabad időpont"); await t.chip("Igen, foglalom"); assert.match(t.last(), /Ugye Kiss Anna|Hogy hívják|Melyik időpont|Kinél/, "a legkorábbi időpont lefoglalására indul");
  await t.type("mégsem");
  await t.type("blablabla"); assert.match(t.last(), /Hívjon minket/, "alapból magáz"); await t.type("szia, tudsz segíteni?"); await t.type("blablabla"); assert.match(t.last(), /Hívj minket/, "a vendég tegez: a bot is");
  t = await load(); await t.type("mennyibe kerül egy festés?"); await t.type("mi a legolcsóbb?"); assert.match(t.last(), /A legolcsóbb: Férfi hajvágás: 4 000 Ft/, "legolcsóbb");
  await t.type("5000 Ft alatt mit lehet csinálni?"); assert.match(t.last(), /5 000 Ft-ig/); assert.ok(!/Női hajvágás/.test(t.last()), "költségkeret");
  await t.type("sorszámot kell húzni?"); assert.ok(/Be kell jelentkezni|Erre gondol|Úgy értem/.test([...t.d.querySelectorAll(".m.bot")].pop().textContent), "jelentés alapján is talál"); // közös szó nélkül
  await t.type("be lehet menni időpont nélkül?"); assert.match(t.last(), /betérőt/, "nélkül: nem foglalás, hanem a GYIK");

  // 1d) "gépelés": előbb a hárompontos jelzés (a válasz még nincs ott), a késleltetés után egyben jelenik meg
  t = await load({ reduced: false, delay: [300, 300] }); t.$("#botfab").click(); await new Promise(r => setTimeout(r, 600));
  t.$("#botin").value = "van parkolás?"; t.$("#botform").dispatchEvent(new t.w.Event("submit", { cancelable: true }));
  await new Promise(r => setTimeout(r, 150));
  assert.ok(t.d.querySelector(".m.bot.typing"), "a jelzés látszik"); assert.equal(t.d.querySelector(".typing").children.length, 3, "három pont");
  assert.ok(![...t.d.querySelectorAll(".m.bot:not(.typing)")].some(m => /parkol/.test(m.textContent)), "a válasz a késleltetés alatt még nincs ott");
  await new Promise(r => setTimeout(r, 500)); assert.match(t.last(), /A szalon előtt fizetős parkolózóna van/, "a teljes válasz egyben megjelenik"); assert.ok(!t.d.querySelector(".typing"), "a jelzés eltűnik");

  // 1d-2) alapértelmezett késleltetés: 1 és 4 mp között (a rövid üdvözlés ~1 mp, a hosszú válasz legfeljebb 4 mp)
  t = await load({ reduced: false }); const t0 = Date.now(); t.$("#botfab").click();
  await new Promise(r => setTimeout(r, 800)); assert.ok(t.d.querySelector(".typing") && !t.d.querySelector(".m.bot:not(.typing)"), "0,8 mp-nél még gépel");
  while (t.d.querySelector(".typing") && Date.now() - t0 < 6000) await new Promise(r => setTimeout(r, 50));
  const took = Date.now() - t0; assert.ok(took >= 1000 && took <= 4400, "a válasz 1–4 mp-en belül érkezik: " + took); assert.ok(t.d.querySelector(".m.bot:not(.typing)"), "üdvözlés megjött");
  const q1 = Date.now(); t.$("#botin").value = "van parkolás?"; t.$("#botform").dispatchEvent(new t.w.Event("submit", { cancelable: true }));
  await new Promise(r => setTimeout(r, 200)); assert.equal(t.$("#chips").inert, true, "gépelés közben a régi gombok le vannak tiltva");
  while (t.d.querySelector(".typing") && Date.now() - q1 < 6000) await new Promise(r => setTimeout(r, 50));
  assert.ok(Date.now() - q1 <= 4400 && Date.now() - q1 >= 1000, "hosszabb válasz is legfeljebb 4 mp"); await new Promise(r => setTimeout(r, 30)); assert.equal(t.$("#chips").inert, false, "utána újra használhatók");

  // 1e) véletlen bejárás: gépelés és gombnyomás vegyesen, hiba nélkül (sosem fagy le, sosem dob kivételt)
  { const corpus = ["szia", "holnap 14:00 hajvágás", "inkább kedden", "mégsem", "igen", "nem", "Kiss Anna", "+36 30 555 1234", "mennyibe kerül?", "legolcsóbb", "5000 alatt", "van parkolás?", "ismételd", "nem értem", "ki vagy?", "Dóri", "<b>x</b>", "🙂", "a".repeat(300), "12.24.", "fél 3", "lemondom", "üzenet", "ajándékutalvány", "késni fogok", "???", "másik napot", "nála", "ma délután", "vasárnap nyitva?", "legkorábban"];
    let seed = 99; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (const opts of [{}, { api: "https://api.test" }, { config: "examples/bolt.config.js" }, { config: "examples/szerviz.config.js" }]) {
      const z = await load(opts); z.$("#botfab").click(); await z.flush();
      for (let i = 0; i < 160; i++) {
        const bs = [...z.d.querySelectorAll("#chips button")];
        if (bs.length && rnd() < .45) bs[Math.floor(rnd() * bs.length)].click(); else { z.$("#botin").value = corpus[Math.floor(rnd() * corpus.length)]; z.$("#botform").dispatchEvent(new z.w.Event("submit", { cancelable: true })); }
        await new Promise(r => setTimeout(r, 6));
      }
      await z.flush(); assert.equal(z.errs.length, 0, "véletlen bejárás hibát dobott: " + z.errs.map(e => e.message || e).join(" | ").slice(0, 400));
      assert.ok([...z.d.querySelectorAll(".m")].every(m => !/undefined|NaN|\[object/.test(m.textContent)), "rossz szöveg a beszélgetésben: " + [...z.d.querySelectorAll(".m")].map(m => m.textContent).find(t => /undefined|NaN|\[object/.test(t)));
    } }

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
  t = await load({ reduced: false, delay: [30, 60] });
  assert.ok(t.d.querySelectorAll(".rv.in .st").length > 8, "szekciók elemei animálva");
  assert.ok(t.d.querySelector(".card").style.getPropertyValue("--i") !== "", "lépcsőzés index");
  t.$("#mainbtn").click(); await new Promise(r => setTimeout(r, 15));
  assert.ok(t.d.querySelector(".typing"), "gépelés-jelzés látszik");
  await new Promise(r => setTimeout(r, 700)); assert.ok(!t.d.querySelector(".typing")); assert.ok(t.chips().length > 3, "gombok a gépelés után");
  // 4b) nyilvános naptár: csak olvasható, szabad időpontra kattintva előtöltött foglalás indul
  t = await load({ api: "https://api.test" }); await t.flush();
  assert.ok(t.$("#naptar") && t.d.querySelector(".links a[href='#naptar']"), "API-val van naptár és menüpont");
  assert.ok(t.d.querySelectorAll("#cal .d.free").length >= 3, "szabad napok jelölve"); assert.ok(t.$("#cal .d.sel"), "az első szabad nap ki van jelölve");
  assert.ok(!t.d.querySelector("#cal input, #calday input, #calday form"), "a naptár nem szerkeszthető");
  const selDay = t.$("#cal .d.sel").dataset.d, slotBtns = [...t.d.querySelectorAll("#calday button.slot")]; assert.ok(slotBtns.length >= 4, "időpontok a kijelölt napra");
  const t0txt = slotBtns[0].textContent, [h0, m0] = t0txt.split(":").map(Number);
  assert.ok(!t.$("#cal .d.o:not(:disabled)"), "a tartományon kívüli napok le vannak tiltva");
  slotBtns[0].click(); await t.flush();
  assert.ok(!t.$("#bot").hidden, "a chat megnyílt"); assert.ok([...t.d.querySelectorAll(".m.me")].some(m => m.textContent.includes(selDay) && m.textContent.includes(t0txt)), "a kért időpont a vendég üzenete");
  await t.chip("Férfi hajvágás"); assert.match(t.last(), /Hogy hívják|Ugye/, "szolgáltatás után már a névnél tart: a nap és az idő előtöltve (Kinél? sem kérdez)");
  assert.ok(!t.chips().includes("Éva"), "munkatársat nem kérdez");
  const wholeDay = [[selDay, 0, 1440, "Éva"], [selDay, 0, 1440, "Dóri"]];
  t = await load({ api: "https://api.test", busy: wholeDay }); await t.flush();
  assert.ok(t.$(`#cal .d[data-d='${selDay}']`).classList.contains("full") || t.$(`#cal .d[data-d='${selDay}']`).classList.contains("o"), "a teljesen foglalt nap 'betelt'");
  assert.notEqual(t.$("#cal .d.sel").dataset.d, selDay, "betelt napot nem jelöl ki alapból");
  t = await load({ api: "https://api.test", busy: [[selDay, h0 * 60 + m0, 30, "Éva"], [selDay, h0 * 60 + m0, 30, "Dóri"]] }); await t.flush();
  t.$(`#cal .d[data-d='${selDay}']`).click(); await t.flush();
  assert.ok([...t.d.querySelectorAll("#calday span.slot.x")].some(x => x.textContent === t0txt), "a foglalt időpont áthúzva, nem kattintható");
  assert.ok(![...t.d.querySelectorAll("#calday button.slot")].some(x => x.textContent === t0txt)); assert.ok(!JSON.stringify(t.calls).includes("Teszt"), "személyes adat nincs");
  t.$("#calnext").click(); assert.ok(t.$("#calmon").textContent.length > 4, "hónapváltás");
  t = await load(); assert.ok(!t.$("#naptar") && !t.d.querySelector(".links a[href='#naptar']"), "API nélkül nincs naptár (nincs adat)");
  t = await load({ tweak: c => c.demo = true }); await t.flush(); assert.ok(t.$("#naptar") && !t.calls.some(c => c[0] === "/busy"), "bemutatón szerver nélkül is van naptár, kitalált adattal");
  assert.ok(t.d.querySelectorAll("#cal .d.free").length >= 3 && t.d.querySelectorAll("#cal .d.full").length >= 1 && t.d.querySelectorAll("#calday .slot").length >= 4, "szabad és betelt napok is vannak");
  t = await load({ api: "https://api.test", config: "examples/bolt.config.js" }); assert.ok(!t.$("#naptar"), "foglalás nélküli boltnál nincs naptár");

  // 4c) élő Google-vélemények
  t = await load({ api: "https://api.test", google: true }); await t.flush();
  assert.ok(t.calls.some(c => c[0] === "/reviews"), "lekéri a véleményeket");
  assert.deepEqual([...t.d.querySelectorAll("#reviews blockquote")].map(b => b.querySelector("cite").textContent), ["— Kata · 2 hete", "— Ödön"], "a Google-vélemények kerülnek ki");
  assert.ok(!t.d.querySelector("#reviews img"), "a vélemény szövege nem futtathat HTML-t (XSS)"); assert.match(t.$("#reviews").textContent, /Szuper <img/, "a szöveg szövegként látszik");
  assert.equal(t.d.querySelectorAll("#reviews .stars").length, 2); assert.match(t.$("#gsrc").textContent, /Google.*4\.86.*123/); assert.equal(t.$("#gsrc").hidden, false);
  assert.match(t.$("#rating").textContent, /4\.86.*123/, "az átlag és a darabszám is frissül"); assert.equal(t.$("#reviewlink").href, GOOGLE.write, "értékelés-írás link a Google-tól");
  assert.match(t.d.querySelector("script[type='application/ld+json']").textContent, /"ratingValue":4\.86/, "a Google-találat jelölése is frissül");
  t = await load({ api: "https://api.test", google: true, reviews: new Error("hálózat") }); await t.flush(); assert.equal(t.d.querySelectorAll("#reviews blockquote").length, 2, "hiba esetén a config.js véleményei maradnak"); assert.ok(t.$("#velemenyek"));
  t = await load({ api: "https://api.test", google: true, reviews: {}, tweak: c => c.reviews = [] }); await t.flush(); assert.ok(!t.$("#velemenyek") && !t.d.querySelector(".links a[href='#velemenyek']"), "nincs mit mutatni: eltűnik a szekció és a menüpont");
  t = await load({ api: "https://api.test", google: true, reviews: {}, tweak: c => c.reviews = [] }); assert.ok(t.$("#velemenyek"), "válasz előtt a szekció még megvan (nem villan el)");
  t = await load({ google: true }); assert.ok(!t.calls.some(c => c[0] === "/reviews"), "API nélkül nem kér semmit");

  // 4d) telefon: a chat alatt az oldal rögzítve marad és a hely visszaáll; a látható területhez igazodik (billentyűzet)
  t = await load({ phone: true, vv: { height: 800, offsetTop: 0 } }); t.$("#barmain").click(); await t.flush();
  assert.ok(t.d.body.classList.contains("lock"), "a háttér rögzítve"); assert.equal(t.d.body.style.top, "-420px", "a görgetési hely megőrizve");
  assert.equal(t.$("#bot").style.getPropertyValue("--vh"), "800px"); assert.equal(t.$("#bot").classList.contains("kb"), false);
  t.w.visualViewport.height = 380; t.w.visualViewport.offsetTop = 60; t.vvl.resize(); // megjelent a billentyűzet, a látható terület eltolódott
  assert.equal(t.$("#bot").style.getPropertyValue("--vh"), "380px"); assert.equal(t.$("#bot").style.getPropertyValue("--vt"), "60px", "a panel követi a látható terület tetejét"); assert.ok(t.$("#bot").classList.contains("kb"));
  t.$("#botx").click(); assert.ok(!t.d.body.classList.contains("lock")); assert.equal(t.d.body.style.top, "");
  assert.ok(t.calls.some(c => c[0] === "scrollTo" && c[1].top === 420 && c[1].behavior === "instant"), "bezáráskor ugyanoda görget vissza");
  t.$("#botx").click(); t.$("#botfab").click(); t.$("#botx").click(); assert.ok(!t.calls.some(c => c[0] === "scrollTo" && c[1].top !== 420), "dupla zárás nem ugrik el");

  // 5) példa-configok betöltődnek és használhatók
  t = await load({ config: "examples/bolt.config.js" });
  assert.equal(t.d.documentElement.dataset.theme, "modern"); assert.equal(t.d.querySelectorAll("#products .prod").length, 4); assert.ok(!t.d.querySelector("#services"));
  assert.equal(t.$("#mainbtn").textContent, "Kérdezzen tőlünk"); assert.ok(!t.d.querySelector(".links a[href='#szolgaltatasok']"), "nincs halott menüpont");
  await t.type("van croissant?"); assert.match(t.last(), /croissant/i, "bot termékre keres"); await t.chip("Igen"); await t.type("Gábor, 06 20 111 2222"); await t.chip("Üzenet küldése"); assert.ok(t.calls.some(c => c[0] === "open" && decodeURIComponent(c[1]).includes("Érdeklődöm: Vajas croissant")), "érdeklődés WhatsApp-üzenetként"); 
  t = await load({ config: "examples/szerviz.config.js" }); assert.equal(t.d.documentElement.dataset.theme, "bold");
  console.log("OK"); process.exit(0); // a naptár 60 mp-es frissítője életben tartaná a jsdom-ot
})().catch(e => { console.error(e); process.exit(1); });
