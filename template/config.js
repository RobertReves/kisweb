// Egyetlen fájl ügyfelenként: ezt kell átírni, a többi kód közös.
// Amit üresen hagysz (galéria, termékek, csapat…), az a szekció nem jelenik meg.
window.SITE = {
  slug: "szalon-eva",                 // azonosító; a Workerben is ez a név
  name: "Szalon Éva",
  schemaType: "HairSalon",            // Google-nak: HairSalon, BeautySalon, Store, Restaurant, AutoRepair…
  tagline: "Fodrász a belvárosban. Hozzáértés, nyugalom, tökéletes frizura.",
  accent: "#b8860b",
  theme: "classic",                   // classic (elegáns, talpas) | modern (letisztult) | bold (sötét, erős) — kipróbálás: az oldal címe után ?demo
  url: "https://szalon-eva.hu",
  booking: true,                      // false = nincs időpontfoglalás (pl. bolt): csak üzenet/érdeklődés

  phone: "+36 30 123 4567",
  whatsapp: "36301234567",            // nemzetközi formátum, + nélkül; üres = nincs
  email: "info@szalon-eva.hu",
  address: "1051 Budapest, Példa utca 12.",
  social: { facebook: "", instagram: "" },
  reviewUrl: "",                      // Google "értékelés írása" link (Google Cégprofil > Értékelések kérése)
  googleReviews: false,           // true = élő Google-vélemények (a Worker tölti és 12 óránként frissíti; kell hozzá: tenants.place_id + GOOGLE_KEY, lásd README)
  rating: { score: 4.9, count: 120 }, // csak valós adat! Üres = nem jelenik meg

  // Hétfő..Vasárnap; null = zárva
  hours: [["09:00","18:00"],["09:00","18:00"],["09:00","18:00"],["09:00","20:00"],["09:00","18:00"],["09:00","13:00"],null],
  closed: [],                         // ["2026-12-24","2026-12-25"]; a tulajdonos az admin felületen is megadhatja
  banner: "",                         // kiemelt sáv az oldal tetején, pl. "Karácsonykor 12-ig vagyunk nyitva"

  perks: [
    { t: "Online foglalás 0–24", d: "Éjjel is foglalhat, a chat azonnal válaszol." },
    { t: "15 év tapasztalat",    d: "Vágás, festés, alkalmi frizurák." },
    { t: "Prémium termékek",     d: "Kíméletes, szakmai hajápolók." },
  ],
  services: [
    { name: "Női hajvágás",    min: 60,  price: "6 500 Ft" },
    { name: "Férfi hajvágás",  min: 30,  price: "4 000 Ft" },
    { name: "Festés + vágás",  min: 150, price: "18 000 Ft-tól" },
    { name: "Alkalmi frizura", min: 60,  price: "9 000 Ft" },
  ],
  staff: [                            // 2+ fő esetén a vendég választhat; hours elhagyható (= üzleti nyitvatartás)
    { name: "Éva",  role: "Tulajdonos, fodrász" },
    { name: "Dóri", role: "Fodrász", hours: [null,["10:00","18:00"],["10:00","18:00"],["10:00","20:00"],["10:00","18:00"],null,null] },
  ],
  gallery: [],                        // ["img/1.jpg","img/2.jpg"]  (tömörített, max ~200 KB/kép)
  products: [],                       // bolthoz: [{ name:"Kovászos kenyér", price:"1 290 Ft", desc:"Frissen sütve", img:"img/kenyer.jpg" }]

  reviews: [
    { who: "Katalin", text: "Végre egy fodrász, aki tényleg meghallgat. Mindig elégedetten megyek haza." },
    { who: "Péter",   text: "Gyors, pontos, barátságos. Online is lehet foglalni, ez nagyon kényelmes." },
  ],
  faq: [
    { q: "Lehet bankkártyával fizetni?", a: "Igen, bankkártyát és készpénzt is elfogadunk." },
    { q: "Van parkolás?", a: "A szalon előtt fizetős parkolózóna van, a sarkon pedig mélygarázs." },
    { q: "Hogyan tudom lemondani az időpontot?", a: "A foglalás után kapott kóddal a chatben, vagy telefonon, legalább 24 órával korábban." },
    { q: "Kisgyereket is vágtok?", a: "Természetesen, gyerekeknek 3 000 Ft a hajvágás." },
    { q: "Be kell jelentkezni előre, vagy be lehet térni?", a: "Előzetes időpontfoglalással tudunk garantáltan fogadni, de ha éppen van szabad hely, betérőt is szívesen látunk." },
    { q: "Allergiás vagyok, milyen termékeket használtok?", a: "Kíméletes, szakmai termékekkel dolgozunk. Allergia esetén szóljon előre, és hipoallergén alternatívát választunk." },
    { q: "Kaphatok ajándékutalványt?", a: "Igen, ajándékutalványt bármilyen összegre vagy szolgáltatásra készítünk." },
    { q: "Mi van, ha késni fogok?", a: "15 percet tudunk várni; ennél nagyobb késésnél sajnos új időpontot kell egyeztetnünk." },
    { q: "Beszéltek angolul?", a: "Igen, angolul is szívesen segítünk." },
    { q: "Lehet számlát kérni?", a: "Természetesen, kérésre céges számlát is kiállítunk." },
  ],

  syn: [],           // a bot saját szinonimái, pl. [["hajvagas", "nyiras"]] (a gyakori szavakat ismeri)
  step: 30,          // időpontok lépésköze percben
  notice: 60,        // legkorábban ennyi perc múlva foglalható
  days: 30,          // ennyi napra előre foglalható
  legal: { name: "Szalon Éva E.V.", taxId: "12345678-1-23" }, // adatkezelő az adatvédelmi oldalhoz
  analytics: "",     // Cloudflare Web Analytics token (sütimentes, ingyenes)
  api: "",           // a Worker címe, pl. https://kisweb-api.valami.workers.dev ; üres = WhatsApp-üzenet
  turnstile: "",     // Cloudflare Turnstile site key (spam ellen; a titkos párja a Workerben van). Teszt: 1x00000000000000000000AA
  botDelay: [1000, 4000],  // a chatbot "gépelési" ideje ms-ban [legrövidebb, leghosszabb]
};
