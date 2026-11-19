// Példa: autószerviz (hosszú szolgáltatások, sötét "bold" téma). Másold a config.js helyére.
window.SITE = {
  slug: "gyors-szerviz", name: "Gyors Szerviz", schemaType: "AutoRepair", theme: "bold", accent: "#f59e0b",
  tagline: "Olajcsere, fék, műszaki vizsga-előkészítés. Pontos határidő, fix ár.",
  url: "https://gyors-szerviz.hu", booking: true,
  phone: "+36 70 555 1212", whatsapp: "36705551212", email: "info@gyors-szerviz.hu", address: "1138 Budapest, Műhely út 7.",
  social: { facebook: "" }, reviewUrl: "", rating: { score: 4.8, count: 86 },
  hours: [["08:00","17:00"],["08:00","17:00"],["08:00","17:00"],["08:00","17:00"],["08:00","16:00"],null,null],
  closed: [], banner: "",
  perks: [{ t: "Fix ár előre", d: "Munkadíj és alkatrész, meglepetés nélkül." }, { t: "Garancia", d: "12 hónap a munkára." }, { t: "Csere autó", d: "Hosszabb javításnál kérhető." }],
  services: [
    { name: "Olaj- és szűrőcsere", min: 60, price: "12 900 Ft-tól" },
    { name: "Fékbetét csere (tengelyenként)", min: 90, price: "18 000 Ft-tól" },
    { name: "Műszaki vizsga-előkészítés", min: 120, price: "15 000 Ft" },
    { name: "Diagnosztika", min: 60, price: "9 900 Ft" },
  ],
  staff: [{ name: "Gábor", role: "Műhelyvezető" }, { name: "Laci", role: "Szerelő" }],
  gallery: [], products: [],
  reviews: [{ who: "Tamás", text: "Pontosan annyiba került, amennyit előre mondtak. Végre korrekt szerviz." }],
  faq: [{ q: "Kell előre időpont?", a: "Igen, így nem kell várakoznia. Foglaljon a chatben, 1 perc." }, { q: "Hozhatom saját alkatrészt?", a: "Igen, de a garancia ilyenkor csak a munkára vonatkozik." }],
  step: 60, notice: 120, days: 30, legal: { name: "Gyors Szerviz Bt.", taxId: "" }, analytics: "", api: "", turnstile: "",
};
