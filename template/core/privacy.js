// SABLON: az ügyfélnek jóvá kell hagynia; nem minősül jogi tanácsadásnak.
const C = window.SITE, e = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const L = C.legal || { name: C.name };
document.getElementById("p").innerHTML = `
<p><a href="./">← Vissza</a></p>
<h1>Adatkezelési tájékoztató</h1>
<p><b>Adatkezelő:</b> ${e(L.name)}${L.taxId ? ", adószám: " + e(L.taxId) : ""}<br>${e(C.address)}<br>${e(C.email)}, ${e(C.phone)}</p>
<h2>Mit kezelünk és miért?</h2>
<p><b>Időpontfoglalás:</b> név, telefonszám, a választott szolgáltatás és időpont. Cél: az időpont lefoglalása, visszaigazolása, emlékeztetése. Jogalap: szerződéskötéshez szükséges lépések (GDPR 6. cikk (1) b). Megőrzés: az időpontot követő 60 napig, utána automatikusan törlődik.</p>
<p><b>Üzenet:</b> az Ön által megadott név/elérhetőség és az üzenet szövege, a megkeresés megválaszolásához (GDPR 6. cikk (1) f), legfeljebb a válasz megadásáig.</p>
<p><b>Visszaélés elleni védelem:</b> a kérések gyakoriságának korlátozásához az IP-címből képzett, visszafejthetetlen lenyomatot használjuk, legfeljebb 24 óráig; magát az IP-címet nem tároljuk. ${C.turnstile ? "Foglaláskor és üzenetküldéskor a Cloudflare Turnstile ellenőrzi, hogy Ön valós látogató-e; ehhez a böngésző adatai a Cloudflare-hez kerülnek." : ""}</p>
<p><b>Sütik, követés:</b> az oldal nem használ sütit és nem készít profilt a látogatókról. ${C.analytics ? "Sütimentes, névtelen látogatottsági statisztikát (Cloudflare Web Analytics) használunk." : ""}</p>
<h2>Kinek adjuk át?</h2>
<p>Az adatokat a tárhelyszolgáltató (Cloudflare, Inc.) kezeli adatfeldolgozóként, és a foglalásról a tulajdonos privát üzenetet kap (Telegram). Az oldal térképe a Google Maps szolgáltatást tölti be.</p>
<h2>Jogai</h2>
<p>Kérhet tájékoztatást, helyesbítést, törlést, tiltakozhat az adatkezelés ellen. Írjon a ${e(C.email)} címre. Panaszával a Nemzeti Adatvédelmi és Információszabadság Hatósághoz (NAIH, <a href="https://naih.hu">naih.hu</a>) fordulhat.</p>`;
