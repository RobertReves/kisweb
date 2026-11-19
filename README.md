# Kisvállalkozói weboldal-rendszer

```
template/          a sablon: ügyfelenként csak az itt lévő fájlok különböznek
  config.js          MINDEN ügyfél-specifikus adat (név, árak, nyitvatartás, színek, téma…)
  index.html, admin.html, adatvedelem.html, 404.html, manifest, robots, sitemap
  core/              a közös kód (app.js, admin.js, style.css) – itt fejlesztesz tovább
  examples/          kész configok más típusú vállalkozáshoz (bolt, szerviz)
worker/            EGY Cloudflare Worker + EGY D1 adatbázis az összes ügyfélnek
new-customer.ps1   új ügyfél létrehozása
tests/             worker.test.mjs (API + biztonság), client.test.cjs (oldal + chat)
```

## A sablonra építés (szabályok)
- Ügyfél-specifikus dolog csak a `config.js`-be kerül. A `core/` soha nem tartalmaz ügyfélnevet.
- Új szekció: HTML a `index.html`-ben `data-has="<configmező>"` attribútummal (üres configra eltűnik), kitöltés az `app.js` "oldal feltöltése" részében.
- Új vertikum (pl. étterem): másolj egy `examples/*.config.js`-t, állítsd a `schemaType`-ot, a `theme`-et.
- Témák: `classic`, `modern`, `bold`. Bemutatón az oldal címe után `?demo`: élőben váltható a téma és a szín.
- Mozgás: minden animáció a `@media(prefers-reduced-motion:no-preference)` blokkban él; a JS is kihagyja, ha a látogató csökkentettet kért.
- Frissítés ügyfeleknél: `-Core https://core.sajatdomain.hu/v1` móddal minden ügyfél a központi `core/`-t tölti, egy deploy mindenkit frissít. Hátrány: egy hiba mindenkit érint, ezért `v1`, `v2` mappákat használj, és a tesztet futtasd deploy előtt.

## Biztonság (mi van beépítve)
| Védelem | Hol |
|---|---|
| Cloudflare Turnstile (ember-ellenőrzés) foglaláskor és üzenetküldéskor | Worker `human()`, kliens `humanToken()` |
| Kérésszám-korlát IP-nként: foglalás 5/10 perc, üzenet 3/óra, lemondás 10/óra | Worker `hit()` (D1) |
| Telefonszámonként max 3 jövőbeli foglalás, ügyfelenként 80 foglalás/nap, 30 üzenet/nap | Worker |
| Admin zárolás: 8 hibás jelszó / 15 perc / IP után 429 | Worker `over()` |
| Admin jelszó csak SHA-256 lenyomatként az adatbázisban; állandó idejű összehasonlítás | Worker, `new-customer.ps1` |
| Foglalás atomi (nincs dupla foglalás versenyhelyzetben) | Worker `book()` |
| Origin-lista ügyfelenként, CORS csak a saját oldalnak | Worker |
| Bemenet-tisztítás (vezérlőkarakter, sortörés), névre/telefonra mintaellenőrzés, 4 KB törzslimit | Worker `line()`, `NAME`, `PHONE` |
| IP-t nem tárolunk, csak lenyomatot 24 óráig; foglalás 60 nap után törlődik | Worker `scheduled()` |
| CSP (csak saját kód, Turnstile, térkép futhat), `nosniff`, no-store, admin keretben nem fut | `new-customer.ps1`, `admin.js` |
| Minden kimenet `textContent`/escape-elt (nincs XSS a névből/üzenetből) | `app.js`, `admin.js` |

Nem véd: valaki, aki valódi böngészőben, valódi telefonszámokkal, lassan, kézzel foglal. Ez ellen a tulajdonos admin "Törlés" gombja és a telefonlimit az eszköz.

## Egyszeri telepítés (a Worker)
1. `npm i -g wrangler` , `wrangler login`
2. `cd worker` , `wrangler d1 create kisweb` , a `database_id`-t írd a `wrangler.toml`-ba
3. `wrangler d1 execute kisweb --remote --file schema.sql`
4. Telegram: @BotFather -> `/newbot` -> token: `wrangler secret put TG_TOKEN`
5. Turnstile: dash.cloudflare.com > Turnstile > Add site (a domain(ek)), a titkos kulcs: `wrangler secret put TURNSTILE_SECRET`. A site key megy a config.js `turnstile` mezőjébe. **Ne hagyd ki éles ügyfélnél**, titok nélkül a védelem ki van kapcsolva.
6. `wrangler deploy` -> a kapott cím az `-Api` paraméter

## Új ügyfél
1. `.\new-customer.ps1 -Slug szalon-eva -Name "Szalon Éva" -Url https://szalon-eva.hu -Api https://kisweb-api.<fiók>.workers.dev [-Core ...]`
2. `customers\<slug>\config.js` kitöltése, a kiírt `INSERT` lefuttatása, az admin jelszó átadása
3. A mappa külön GitHub repo, Settings > Pages. Cloudflare DNS: CNAME `<felhasználó>.github.io` (a CNAME fájl a repóban van)
4. Telegram: az ügyfél ír a botnak, a chat id-t `https://api.telegram.org/bot<TOKEN>/getUpdates` mutatja, `UPDATE tenants SET tg_chat=... WHERE slug=...`

## Tesztek
```
node --no-warnings tests/worker.test.mjs       # Node 22+
cd tests && npm i && node client.test.cjs
```
Helyi megtekintés: `cd template`, `python -m http.server 8080`, http://localhost:8080/?demo
