// Futtatás: node --no-warnings tests/worker.test.mjs   (Node 22+)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import w from "../worker/worker.js";

const sha = s => createHash("sha256").update(s).digest("hex");
const db = new DatabaseSync(":memory:");
db.exec(readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8"));
const wrap = sql => { const mk = a => { const s = db.prepare(sql); return {
  first: async () => s.get(...a) ?? null,
  all: async () => ({ results: s.all(...a) }),
  run: async () => ({ meta: { changes: s.run(...a).changes } }),
}; }; return { ...mk([]), bind: (...a) => mk(a) }; };
const env = { DB: { prepare: wrap }, TG_TOKEN: "t" };
db.prepare("INSERT INTO tenants(slug,origin,token_hash,tg_chat) VALUES('a','https://a.hu',?,'1'),('b','https://b.hu',?,'')").run(sha("tokA"), sha("tokB"));

const places = [], sent = []; // Telegram + Turnstile hívások elfogása
globalThis.fetch = async (url, init) => {
  if (String(url).includes("places.googleapis.com")) { places.push([String(url), init.headers["X-Goog-Api-Key"]]); return places.fail ? new Response("{}", { status: 500 }) : Response.json({ rating: 4.86, userRatingCount: 123, reviews: [{ rating: 5, text: { text: "Szuper <b>hely</b>" }, authorAttribution: { displayName: "Kata" }, relativePublishTimeDescription: "2 hete" }, { rating: 4, text: { text: "" }, authorAttribution: { displayName: "Üres" } }] }); }
  if (String(url).includes("siteverify")) return Response.json({ success: init.body.get("response") === "good" });
  sent.push(JSON.parse(init.body).text); return Response.json({ ok: true });
};

let n = 0;
const call = (path, body, { origin = "https://a.hu", auth, site = "a", ip } = {}) => w.fetch(new Request(`https://api.x${path}${path.includes("?") ? "&" : "?"}site=${site}`, {
  method: body ? "POST" : "GET",
  headers: { origin, "content-type": "application/json", "cf-connecting-ip": ip ?? `10.0.0.${++n}`, ...(auth && { authorization: "Bearer " + auth }) },
  body: body && (typeof body === "string" ? body : JSON.stringify(body)),
}), env).then(async r => ({ s: r.status, d: await r.json().catch(() => ({})), h: r.headers }));

const future = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
const bk = (o = {}) => ({ date: future, start: 600, dur: 60, staff: "Éva", service: "Vágás", name: "Teszt Elek", phone: "+36 30 111 2222", ...o });

/* --- foglalás --- */
let r = await call("/book", bk()); assert.equal(r.s, 200); const id = r.d.id; assert.match(id, /^[A-Z2-9]{6}$/);
assert.equal(r.h.get("x-content-type-options"), "nosniff");
assert.equal((await call("/book", bk({ start: 630 }))).s, 409, "átfedés ugyanannál a munkatársnál");
assert.equal((await call("/book", bk({ start: 630, staff: "Dóri", phone: "06 30 999 8888" }))).s, 200, "másik munkatárs szabad");
assert.equal((await call("/book", bk({ start: 660 }))).s, 200, "közvetlenül utána szabad");
assert.equal((await call("/book", bk({ start: 780 }))).s, 200, "3. foglalás ugyanarról a számról");
assert.equal((await call("/book", bk({ start: 840 }))).s, 429, "4. foglalás ugyanarról a számról");

/* --- bemenet-validáció és -tisztítás --- */
assert.equal((await call("/book", bk({ date: "2000-01-01" }))).s, 400, "múltbeli dátum");
assert.equal((await call("/book", bk({ name: "x" }))).s, 400, "rövid név");
assert.equal((await call("/book", bk({ name: "<script>alert(1)</script>", phone: "06 20 000 0001" }))).s, 400, "HTML a névben");
assert.equal((await call("/book", bk({ phone: "nem szám" }))).s, 400, "rossz telefonszám");
assert.equal((await call("/book", bk({ start: "600" }))).s, 400, "szám helyett szöveg");
assert.equal((await call("/book", "[1,2]")).s, 400, "tömb törzs");
assert.equal((await call("/book", "{nem json")).s, 400, "hibás JSON");
assert.equal((await call("/book", { x: "a".repeat(5000) })).s, 413, "túl nagy törzs");
sent.length = 0;
await call("/book", bk({ start: 1300, phone: "06 20 000 0002", name: "Ál Ember\nÚj foglalás\n2099-01-01" }));
assert.ok(sent.at(-1).includes("Ál Ember Új foglalás 2099-01-01"), "sortörés nem hamisíthat értesítést");
assert.equal(sent.at(-1).split("\n").length, 4, "az értesítés pontosan 4 sor");

/* --- jogosultság / tenant-elkülönítés --- */
assert.equal((await call("/book", bk(), { origin: "https://evil.hu" })).s, 403, "idegen origin");
assert.equal((await call("/book", bk(), { site: "b" })).s, 403, "másik ügyfél origin-je nem jó");
assert.equal((await call("/book", bk(), { origin: "" })).s, 403, "origin nélkül (nem böngésző)");
r = await call(`/busy?from=${future}&to=${future}`); assert.ok(r.d.busy.length >= 3); assert.ok(r.d.busy.every(x => x.length === 4));
assert.ok(!JSON.stringify(r.d).includes("Teszt"), "nincs személyes adat a /busy-ban");
assert.equal((await call(`/admin/bookings?from=${future}`)).s, 401, "admin token nélkül");
assert.equal((await call(`/admin/bookings?from=${future}`, null, { auth: "tokB" })).s, 401, "másik ügyfél tokenje");
r = await call(`/admin/bookings?from=${future}`, null, { auth: "tokA" }); assert.equal(r.s, 200); assert.ok(r.d.bookings[0].name);

/* --- lemondás --- */
assert.equal((await call("/cancel", { id: "ZZZZZZ" })).s, 404);
assert.equal((await call("/cancel", { id: id.toLowerCase() })).s, 200, "lemondás kisbetűvel is");
assert.equal((await call("/book", bk({ start: 540 }))).s, 200, "lemondás felszabadítja a limitet és az idősávot");

/* --- zárva tartott nap, kézi foglalás --- */
assert.equal((await call("/admin/settings", { banner: "Zárva", closed: [future, "rossz", 5] }, { auth: "tokA" })).s, 200);
r = await call("/info"); assert.deepEqual(r.d, { banner: "Zárva", closed: [future] });
assert.equal((await call("/book", bk({ start: 1000, phone: "+36 1 222 3333" }))).s, 409, "zárva tartott nap");
assert.equal((await call("/admin/book", bk({ start: 1000, phone: "" }), { auth: "tokA" })).s, 200, "admin zárva napon is foglalhat");
r = await call("/admin/stats", null, { auth: "tokA" }); assert.ok(r.d.total >= 4);

/* --- spam elleni védelem --- */
const ip = "9.9.9.9", fresh = i => bk({ start: 100 + i * 5, phone: `06 70 000 ${1000 + i}` });
const codes = []; for (let i = 0; i < 7; i++) codes.push((await call("/book", fresh(i), { ip })).s);
assert.deepEqual(codes.slice(5), [429, 429], "6. és 7. foglalási kísérlet ugyanarról az IP-ről: kérésszám-korlát");
assert.notEqual((await call("/book", fresh(9), { ip: "9.9.9.10" })).s, 429, "másik IP-t nem érinti");
const m = []; for (let i = 0; i < 4; i++) m.push((await call("/msg", { text: "Szia", contact: "x" }, { ip: "8.8.8.8" })).s);
assert.deepEqual(m, [200, 200, 200, 429], "üzenet: 3 / óra / IP");
const cc = []; for (let i = 0; i < 11; i++) cc.push((await call("/cancel", { id: "AAAAA" + "ABCDEFGHJKL"[i] }, { ip: "7.7.7.7" })).s);
assert.equal(cc[10], 429, "lemondási kód találgatása korlátozva");
db.prepare("DELETE FROM hits").run();
for (let i = 0; i < 30; i++) assert.equal((await call("/msg", { text: "Szia", contact: "x" })).s, 200);
assert.equal((await call("/msg", { text: "Szia", contact: "x" })).s, 429, "ügyfelenként napi 30 üzenet");

// admin zárolás: 8 hibás próba után még a helyes jelszó is 429
for (let i = 0; i < 8; i++) assert.equal((await call(`/admin/stats`, null, { auth: "rossz" + i, ip: "6.6.6.6" })).s, 401);
assert.equal((await call(`/admin/stats`, null, { auth: "tokA", ip: "6.6.6.6" })).s, 429, "zárolt IP");
assert.equal((await call(`/admin/stats`, null, { auth: "tokA", ip: "6.6.6.7" })).s, 200, "másik IP rendben");

/* --- Turnstile --- */
env.TURNSTILE_SECRET = "s";
db.prepare("DELETE FROM hits").run();
assert.equal((await call("/book", bk({ start: 1200 }))).s, 403, "token nélkül");
assert.equal((await call("/book", { ...bk({ start: 1200 }), ts: "rossz" })).s, 403, "érvénytelen token");
assert.equal((await call("/msg", { text: "Szia", contact: "x", ts: "rossz" })).s, 403, "üzenet érvénytelen tokennel");
assert.equal((await call("/book", { ...bk({ start: 1200, date: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10), phone: "06 31 555 0000" }), ts: "good" })).s, 200, "érvényes token");
assert.equal((await call("/admin/book", bk({ start: 1380, phone: "" }), { auth: "tokA" })).s, 200, "admin Turnstile nélkül");
delete env.TURNSTILE_SECRET;

/* --- Google-vélemények --- */
assert.deepEqual((await call("/reviews")).d, {}, "place_id és kulcs nélkül üres");
db.prepare("UPDATE tenants SET place_id='ChIJ_x' WHERE slug='a'").run();
assert.deepEqual((await call("/reviews")).d, {}, "kulcs nélkül üres");
env.GOOGLE_KEY = "k";
r = await call("/reviews"); assert.equal(r.d.score, 4.9); assert.equal(r.d.count, 123);
assert.equal(r.d.list.length, 1, "szöveg nélküli vélemény kimarad"); assert.equal(r.d.list[0].who, "Kata"); assert.equal(r.d.list[0].stars, 5);
assert.match(r.d.write, /writereview\?placeid=ChIJ_x$/);
assert.equal(places.length, 1); assert.ok(places[0][0].includes("/places/ChIJ_x") && places[0][1] === "k", "a kulcs csak a Google felé megy");
await call("/reviews"); assert.equal(places.length, 1, "12 óráig gyorsítótárból");
assert.equal((await call("/reviews", null, { origin: "https://evil.hu" })).s, 403, "idegen origin");
db.prepare("UPDATE tenants SET reviews_at=? WHERE slug='a'").run(Date.now() - 13 * 3600e3); places.fail = true;
r = await call("/reviews"); assert.equal(r.d.count, 123, "Google-hiba: a régi adat marad"); assert.equal(places.length, 2);
await call("/reviews"); assert.equal(places.length, 2, "hiba után 1 percig nem próbálkozik újra");
db.prepare("UPDATE tenants SET reviews_at=? WHERE slug='a'").run(Date.now() - 13 * 3600e3); places.fail = false;
await call("/reviews"); assert.equal(places.length, 3, "lejárt gyorsítótár frissül");
assert.deepEqual((await call("/reviews", null, { site: "b", origin: "https://b.hu" })).d, {}, "másik ügyfélnek nincs");
delete env.GOOGLE_KEY;

await w.scheduled({}, env);
assert.equal(db.prepare("SELECT COUNT(*) n FROM hits WHERE exp < ?").get(Math.floor(Date.now() / 1000)).n, 0, "lejárt számlálók törlődnek");
console.log("OK");
