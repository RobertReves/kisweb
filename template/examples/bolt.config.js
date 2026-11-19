// Példa: bolt / pékség (nincs időpontfoglalás, van termékkatalógus és érdeklődés). Másold a config.js helyére.
window.SITE = {
  slug: "kovacs-pekseg", name: "Kovács Pékség", schemaType: "Bakery", theme: "modern", accent: "#c2410c",
  tagline: "Frissen sült kenyér és péksütemény, minden reggel 5 órától.",
  url: "https://kovacs-pekseg.hu", booking: false,
  phone: "+36 20 987 6543", whatsapp: "36209876543", email: "pekseg@kovacs-pekseg.hu", address: "6720 Szeged, Minta tér 3.",
  social: { facebook: "", instagram: "" }, reviewUrl: "", rating: null,
  hours: [["05:00","18:00"],["05:00","18:00"],["05:00","18:00"],["05:00","18:00"],["05:00","18:00"],["05:00","13:00"],null],
  closed: [], banner: "Vasárnap zárva, hétfőn már 5-től várjuk!",
  perks: [{ t: "Helyben sütjük", d: "Nincs fagyasztott alapanyag." }, { t: "Előrendelés", d: "Üzenjen, és félrerakjuk." }, { t: "Helyi alapanyagok", d: "Szegedi gazdáktól." }],
  services: [], staff: [], gallery: [],
  products: [
    { name: "Kovászos kenyér 1 kg", price: "1 290 Ft", desc: "36 órás kovásszal, ropogós héjjal." },
    { name: "Vajas croissant", price: "490 Ft", desc: "Minden reggel friss." },
    { name: "Túrós táska", price: "420 Ft", desc: "Hagyományos recept." },
    { name: "Tortaelőrendelés", price: "6 900 Ft-tól", desc: "3 nappal előre, egyedi kérésre." },
  ],
  reviews: [{ who: "Judit", text: "A legjobb kenyér a városban, ráadásul mindig kedves a kiszolgálás." }],
  faq: [
    { q: "Lehet előrendelni?", a: "Igen, üzenjen nekünk, és a kért időpontra félretesszük." },
    { q: "Van gluténmentes termék?", a: "Pénteken és szombaton sütünk gluténmentes kenyeret, előrendelésre." },
  ],
  step: 30, notice: 60, days: 30, legal: { name: "Kovács Pékség Kft.", taxId: "" }, analytics: "", api: "", turnstile: "",
};
