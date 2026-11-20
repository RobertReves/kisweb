# Kisvállalkozói weboldal-rendszer

```
template/          a sablon: ügyfelenként csak az itt lévő fájlok különböznek
  config.js          MINDEN ügyfél-specifikus adat (név, árak, nyitvatartás, színek, téma…)
  index.html, admin.html, adatvedelem.html, 404.html, manifest, robots, sitemap
  core/              a közös kód (app.js, nlu.js, admin.js, style.css) – itt fejlesztesz tovább
                     nlu.js = a chatbot értelmezője (DOM nélküli könyvtár: kulcsszó-pontozás, elütés- és ragozástűrés, dátum/idő, GYIK-keresés)
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
6. Google-vélemények (opcionális): Google Cloud > Places API (New) bekapcsolása, API-kulcs: `wrangler secret put GOOGLE_KEY`. Meglévő adatbázisnál a `schema.sql` végén lévő 3 `ALTER TABLE` egyszeri futtatása.
7. `wrangler deploy` -> a kapott cím az `-Api` paraméter

## Új ügyfél
1. `.\new-customer.ps1 -Slug szalon-eva -Name "Szalon Éva" -Url https://szalon-eva.hu -Api https://kisweb-api.<fiók>.workers.dev [-Core ...]`
2. `customers\<slug>\config.js` kitöltése, a kiírt `INSERT` lefuttatása, az admin jelszó átadása
3. A mappa külön GitHub repo, Settings > Pages. Cloudflare DNS: CNAME `<felhasználó>.github.io` (a CNAME fájl a repóban van)
4. Élő Google-vélemények: `UPDATE tenants SET place_id='ChIJ...' WHERE slug='...';` (Place ID kereső: developers.google.com/maps/documentation/places/web-service/place-id), a config.js-ben `googleReviews: true`. A Worker 12 óránként frissíti (ügyfelenként ~60 Google-hívás/hó), a Google legfeljebb 5 véleményt ad. Hiba vagy üres válasz esetén a config.js `reviews` listája marad.
5. Telegram: az ügyfél ír a botnak, a chat id-t `https://api.telegram.org/bot<TOKEN>/getUpdates` mutatja, `UPDATE tenants SET tg_chat=... WHERE slug=...`

## Tesztek
```
node --no-warnings tests/worker.test.mjs       # Node 22+
cd tests && npm i && node client.test.cjs
```
Helyi megtekintés: `cd template`, `python -m http.server 8080`, http://localhost:8080/?demo

## Chatbot (core/nlu.js + core/compose.js + core/app.js)
- Teljesen a böngészőben fut, tanult modell, WebGPU és külső szolgáltatás nélkül; a beírt szöveg sehova nem megy el.
- **nlu.js – megérti**: elütés-, ragozás- és helyesírás-tűrő kulcsszavak, fogalomcsoportok (autó ~ parkolás), jelentés-keresés (karakter-n-gram vektorok + fogalmak koszinusz-hasonlósága), dátum/idő ("jövő péntek", "fél 3", "24-én"), szolgáltatás/munkatárs, tagadás, "legolcsóbb", "5000 alatt", bemutatkozás, javítás ("inkább kedden").
- **compose.js – megfogalmazza**: tegez/magáz (átveszi a vendég hangnemét), változatos mondatok, következtetés a tényekből ("vasárnap zárva, legközelebb hétfőn 09:00-kor nyitunk"), bizonytalan találatnál kimondja, mit értett.
- **app.js – végrehajtja és emlékszik**: futó foglalás módosítása, kérdés után visszatér a foglaláshoz, megjegyzi a nevet/telefont (csak a lap életében), legkorábbi szabad időpont, szavankénti "gépelés".
- A tudását a `config.js`-ből veszi: `faq`, `products`, `perks`, `services`, `staff`. Minél több GYIK-kérdés, annál okosabb a bot.
- Saját szinonimák (opcionális): `syn: [["hajvagas", "nyiras"]]` a configban.
- **Gépelés**: a bot minden üzenete előtt hárompontos jelzés látszik, majd a szöveg betűnként "legépelődik"; az egész 1–4 mp (a válasz hosszától függ; `botDelay: [1000, 4000]` a configban, `[0, 0]` = azonnali). Gépelés közben a régi gombok le vannak tiltva. A "csökkentett mozgás" beállítás csak a díszítő animációkat kapcsolja ki (a jelzés ilyenkor áll), a válaszidő és a gépelés marad.
- **Naptár**: egy napra kattintva felugró ablak jön: szabad időpontok (kattintásra a chat előtöltve indítja a foglalást) vagy "betelt". Telefonon nincs alsó Hívás/Időpont sáv, csak a 💬 gomb.
- **Telefon**: a chat alatt a háttéroldal rögzítve van (bezáráskor ugyanoda áll vissza), a panel követi a billentyűzet miatt összement látható területet, a hosszú válasz elejére görget.
- **Nyilvános naptár** (`#naptar`, csak `api` + foglalás esetén): a vendég a szabad/betelt napokat és a napi időpontokat látja (személyes adat nélkül, percenként frissül); szabad időpontra kattintva a chat az előtöltött nappal és idővel indítja a foglalást.
- Admin (`admin.html`): havi naptár a foglalások számával, a kijelölt nap idővonala munkatársanként, lista a hívás/emlékeztető/törlés gombokkal.
- Tesztek: `cd tests && npm i && npm test` (értelmező ~3800, mondatösszeállító ~1100 ellenőrzés, kliens + véletlen bejárás + naptár + Google-vélemények + telefon, admin naptár, worker).
