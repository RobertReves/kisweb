(() => {
if (top !== self) { top.location = location.href; return; } // clickjacking ellen: keretben nem fut
const C = window.SITE, API = C.api, app = document.querySelector("#app");
const H = (t, p, ...k) => { const e = Object.assign(document.createElement(t), p || {}); e.append(...k.filter(x => x !== false && x != null)); return e; };
const hhmm = m => String(m / 60 | 0).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
const ymd = d => d.toLocaleDateString("sv");
const KEY = "tok_" + C.slug;
let tok = sessionStorage.getItem(KEY) || "", day = ymd(new Date()); // a jelszó csak a lap bezárásáig él

const api = async (path, body) => {
  const r = await fetch(`${API}${path}${path.includes("?") ? "&" : "?"}site=${C.slug}`, { method: body ? "POST" : "GET", headers: { authorization: "Bearer " + tok, "content-type": "application/json" }, body: body && JSON.stringify(body) });
  if (r.status === 401 || r.status === 429) { sessionStorage.removeItem(KEY); tok = ""; login(r.status === 429 ? "Túl sok hibás próba. Kérem várjon 15 percet." : "Hibás jelszó."); throw 0; }
  return { status: r.status, data: await r.json().catch(() => ({})) };
};
// 06.. / +36.. -> 36.. a WhatsApp-hoz
const waNum = p => { const d = p.replace(/\D/g, ""); return d.startsWith("06") ? "36" + d.slice(2) : d; };
const wa = (p, text) => `https://wa.me/${waNum(p)}?text=${encodeURIComponent(text)}`;

function login(err = "") {
  const pw = H("input", { type: "password", placeholder: "Jelszó", autocomplete: "current-password" });
  const f = H("form", { onsubmit: e => { e.preventDefault(); tok = pw.value.trim(); sessionStorage.setItem(KEY, tok); main(); } }, pw, H("button", { className: "btn" }, "Belépés"));
  app.replaceChildren(H("h1", {}, C.name), H("p", { className: "muted" }, "Foglalások kezelése"), err && H("p", {}, err), f);
}

async function main() {
  if (!API) return app.replaceChildren(H("p", {}, "Az admin felülethez a foglalási szerver (api) szükséges."));
  if (!tok) return login();
  let bk, st, info;
  try { [{ data: bk }, { data: st }, { data: info }] = await Promise.all([api(`/admin/bookings?from=${day}`), api("/admin/stats"), api("/info")]); } catch { return; }
  const now = new Date(), today = ymd(now);
  const label = new Date(day + "T12:00").toLocaleDateString("hu-HU", { weekday: "long", month: "long", day: "numeric" });
  const shift = n => { day = ymd(new Date(Date.parse(day + "T12:00") + n * 864e5)); main(); };

  const list = (bk.bookings || []).filter(b => b.date === day).map(b => {
    const past = b.date < today || (b.date === today && b.start + b.dur < now.getHours() * 60 + now.getMinutes());
    const acts = H("div", { className: "acts" },
      b.phone && H("a", { href: "tel:" + b.phone }, "Hívás"),
      b.phone && !past && H("a", { href: wa(b.phone, `Kedves ${b.name}! Emlékeztető: ${b.date} ${hhmm(b.start)}-kor várjuk a(z) ${C.name}-nál (${b.service}). Ha nem tud jönni, kérjük jelezze. Lemondási kód: ${b.id}`), target: "_blank", rel: "noopener" }, "Emlékeztető"),
      b.phone && past && C.reviewUrl && H("a", { href: wa(b.phone, `Köszönjük, hogy nálunk járt, ${b.name}! Ha elégedett volt, nagyon hálásak lennénk egy értékelésért: ${C.reviewUrl}`), target: "_blank", rel: "noopener" }, "Értékelés kérése"),
      H("button", { className: "del", onclick: async () => { if (confirm(`Törli: ${b.name}, ${hhmm(b.start)}?`)) { await api("/admin/cancel", { id: b.id }); main(); } } }, "Törlés"));
    return H("div", { className: "bk" }, H("div", { className: "t" }, `${hhmm(b.start)}–${hhmm(b.start + b.dur)} · ${b.service}${b.staff ? " · " + b.staff : ""}`), H("div", {}, `${b.name} · ${b.phone || "nincs telefonszám"}`), acts);
  });

  // kézi foglalás (telefonon / személyesen kért időpont)
  const f = { w: { value: C.staff?.[0]?.name || "" } };
  const sel = (n, opts) => (f[n] = H("select", {}, ...opts.map(o => H("option", { value: o[0] }, o[1]))));
  const inp = (n, p) => (f[n] = H("input", p));
  const form = H("form", { onsubmit: async e => {
    e.preventDefault();
    const s = C.services[f.s.value], t = f.t.value;
    const { status } = await api("/admin/book", { date: day, start: +t.slice(0, 2) * 60 + +t.slice(3), dur: s.min, staff: f.w.value, service: s.name, name: f.n.value, phone: f.p.value });
    status === 409 ? alert("Ez az idősáv már foglalt ennél a munkatársnál.") : main();
  } },
    H("label", {}, "Szolgáltatás"), sel("s", C.services.map((s, i) => [i, `${s.name} (${s.min} perc)`])),
    C.staff?.length > 1 && H("label", {}, "Munkatárs"), C.staff?.length > 1 && sel("w", C.staff.map(s => [s.name, s.name])),
    H("label", {}, "Időpont"), inp("t", { type: "time", step: 300, required: true }),
    H("label", {}, "Név"), inp("n", { required: true, minLength: 2, maxLength: 60 }),
    H("label", {}, "Telefon (nem kötelező)"), inp("p", { type: "tel", maxLength: 30 }),
    H("button", { className: "btn" }, "Foglalás rögzítése"));

  // zárva tartott napok + kiemelt üzenet
  let closed = [...(info.closed || [])];
  const tags = H("div", { className: "tags" });
  const drawTags = () => tags.replaceChildren(...closed.map(d => H("span", {}, d, H("button", { type: "button", "aria-label": "Eltávolít", onclick: () => { closed = closed.filter(x => x !== d); drawTags(); } }, "✕"))));
  drawTags();
  const cd = H("input", { type: "date", min: today }), bn = H("input", { value: info.banner || "", maxLength: 200, placeholder: "pl. Karácsonykor 12-ig vagyunk nyitva" });
  const settings = H("div", {},
    H("label", {}, "Kiemelt üzenet az oldal tetején (üresen hagyva nincs)"), bn,
    H("label", {}, "Zárva tartott napok (ilyenkor nem lehet foglalni)"), H("div", { className: "nav" }, cd, H("button", { className: "btn sm", type: "button", onclick: () => { if (cd.value && !closed.includes(cd.value)) closed.push(cd.value); cd.value = ""; drawTags(); } }, "Hozzáad")), tags,
    H("p", {}, H("button", { className: "btn", onclick: async () => { await api("/admin/settings", { banner: bn.value, closed }); alert("Mentve."); } }, "Beállítások mentése")));

  app.replaceChildren(
    H("div", { className: "nav" }, H("h1", {}, C.name), H("button", { className: "btn ghost sm", onclick: () => { sessionStorage.removeItem(KEY); location.reload(); } }, "Kilépés")),
    H("div", { className: "box" },
      H("div", { className: "nav" }, H("button", { className: "btn ghost sm", "aria-label": "Előző nap", onclick: () => shift(-1) }, "◀"), H("b", {}, label), H("button", { className: "btn ghost sm", "aria-label": "Következő nap", onclick: () => shift(1) }, "▶")),
      ...(list.length ? list : [H("p", { className: "muted" }, "Erre a napra nincs foglalás.")])),
    H("details", { className: "box" }, H("summary", {}, "Új foglalás kézzel"), form),
    H("div", { className: "box" }, H("h2", {}, "Elmúlt 30 nap"),
      H("p", {}, `${st.total ?? 0} foglalás érkezett az oldalon át` + (st.cancelled ? `, ebből ${st.cancelled} lemondva` : "") + "."),
      st.top?.length && H("p", { className: "muted" }, "Legnépszerűbb: " + st.top.map(([s, n]) => `${s} (${n})`).join(", "))),
    H("div", { className: "box" }, H("h2", {}, "Beállítások"), settings),
    H("p", { className: "muted" }, "Tipp: telefonon a böngésző menüjében válassza a „Hozzáadás a kezdőképernyőhöz” lehetőséget."));
}
main();
})();
