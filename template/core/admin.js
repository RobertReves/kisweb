(() => {
if (top !== self) { top.location = location.href; return; } // clickjacking ellen: keretben nem fut
const C = window.SITE, API = C.api, app = document.querySelector("#app");
const H = (t, p, ...k) => {
  const e = document.createElement(t);
  for (const [n, v] of Object.entries(p || {})) n.includes("-") || n === "style" ? e.setAttribute(n, v) : (e[n] = v); // aria-label, data-x, style: attribútum
  e.append(...k.filter(x => x !== false && x != null)); return e;
};
const hhmm = m => String(m / 60 | 0).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
const ymd = d => d.toLocaleDateString("sv");
const mins = t => +t.slice(0, 2) * 60 + +t.slice(3);
const dow = d => (d.getDay() + 6) % 7;
const at = k => new Date(k + "T12:00");
const DN = ["H", "K", "Sze", "Cs", "P", "Szo", "V"];
// a hónap naptárrácsa: hétfővel kezdődő hetek, csak a szükséges sorok (4–6). ym = "ÉÉÉÉ-HH"
const monthGrid = ym => {
  const [y, m] = ym.split("-").map(Number), first = new Date(y, m - 1, 1, 12), lead = dow(first), n = new Date(y, m, 0).getDate();
  return Array.from({ length: Math.ceil((lead + n) / 7) * 7 }, (_, i) => new Date(y, m - 1, 1 - lead + i, 12));
};
const addMonth = (ym, n) => { const [y, m] = ym.split("-").map(Number), d = new Date(y, m - 1 + n, 1, 12); return ymd(d).slice(0, 7); };
const KEY = "tok_" + C.slug;
let tok = sessionStorage.getItem(KEY) || "", day = ymd(new Date()), mon = day.slice(0, 7); // a jelszó csak a lap bezárásáig él; mon = a naptár hónapja

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
  const cells = monthGrid(mon);
  try { [{ data: bk }, { data: st }, { data: info }] = await Promise.all([api(`/admin/bookings?from=${ymd(cells[0])}&to=${ymd(cells.at(-1))}`), api("/admin/stats"), api("/info")]); } catch { return; }
  const now = new Date(), today = ymd(now);
  const label = at(day).toLocaleDateString("hu-HU", { weekday: "long", month: "long", day: "numeric" });
  const shift = n => { day = ymd(new Date(at(day).getTime() + n * 864e5)); mon = day.slice(0, 7); main(); };

  const list = (bk.bookings || []).filter(b => b.date === day).map(b => {
    const past = b.date < today || (b.date === today && b.start + b.dur < now.getHours() * 60 + now.getMinutes());
    const acts = H("div", { className: "acts" },
      b.phone && H("a", { href: "tel:" + b.phone }, "Hívás"),
      b.phone && !past && H("a", { href: wa(b.phone, `Kedves ${b.name}! Emlékeztető: ${b.date} ${hhmm(b.start)}-kor várjuk a(z) ${C.name}-nál (${b.service}). Ha nem tud jönni, kérjük jelezze. Lemondási kód: ${b.id}`), target: "_blank", rel: "noopener" }, "Emlékeztető"),
      b.phone && past && C.reviewUrl && H("a", { href: wa(b.phone, `Köszönjük, hogy nálunk járt, ${b.name}! Ha elégedett volt, nagyon hálásak lennénk egy értékelésért: ${C.reviewUrl}`), target: "_blank", rel: "noopener" }, "Értékelés kérése"),
      H("button", { className: "del", onclick: async () => { if (confirm(`Törli: ${b.name}, ${hhmm(b.start)}?`)) { await api("/admin/cancel", { id: b.id }); main(); } } }, "Törlés"));
    return H("div", { className: "bk", id: "b-" + b.id }, H("div", { className: "t" }, `${hhmm(b.start)}–${hhmm(b.start + b.dur)} · ${b.service}${b.staff ? " · " + b.staff : ""}`), H("div", {}, `${b.name} · ${b.phone || "nincs telefonszám"}`), acts);
  });

  /* --- naptár: a hónap napjai, rajta a foglalások száma; a kijelölt nap idővonala munkatársanként --- */
  const all = bk.bookings || [], cnt = {};
  for (const b of all) cnt[b.date] = (cnt[b.date] || 0) + 1;
  const closedDays = new Set(info.closed || []);
  const calendar = H("div", {},
    H("div", { className: "nav" },
      H("button", { className: "btn ghost sm", "aria-label": "Előző hónap", onclick: () => { mon = addMonth(mon, -1); main(); } }, "◀"),
      H("b", {}, at(mon + "-01").toLocaleDateString("hu-HU", { year: "numeric", month: "long" })),
      H("button", { className: "btn ghost sm", onclick: () => { day = today; mon = today.slice(0, 7); main(); } }, "Ma"),
      H("button", { className: "btn ghost sm", "aria-label": "Következő hónap", onclick: () => { mon = addMonth(mon, 1); main(); } }, "▶")),
    H("div", { className: "cal" }, ...DN.map(n => H("span", { className: "dn" }, n)), ...cells.map(d => {
      const k = ymd(d), c = cnt[k] || 0;
      return H("button", { type: "button", "data-d": k, "aria-pressed": String(k === day),
        "aria-label": at(k).toLocaleDateString("hu-HU", { month: "long", day: "numeric", weekday: "long" }) + (closedDays.has(k) ? ", zárva" : "") + (c ? `, ${c} foglalás` : ""),
        className: ["d", k.slice(0, 7) !== mon && "o", k === day && "sel", k === today && "tod", closedDays.has(k) && "x", !C.hours[dow(d)] && "off"].filter(Boolean).join(" "),
        onclick: () => { day = k; mon = k.slice(0, 7); main(); } }, H("span", {}, String(d.getDate())), c > 0 && H("i", {}, String(c)));
    })));

  // idővonal: oszlop = munkatárs, a nyitvatartáson kívüli rész halvány, a foglalás blokkja a hosszával arányos
  const cols = C.staff?.length ? C.staff : [{ name: "" }], dayBks = all.filter(b => b.date === day), PM = 1; // 1 px = 1 perc
  const hoursOf = s => (s.hours || C.hours)[dow(at(day))];
  const spans = (closedDays.has(day) ? [] : cols.map(hoursOf).filter(Boolean)).map(h => [mins(h[0]), mins(h[1])]).concat(dayBks.map(b => [b.start, b.start + b.dur]));
  let timeline = H("p", { className: "muted" }, closedDays.has(day) ? "Ezen a napon zárva tartunk." : "Ezen a napon zárva vagyunk, nincs foglalás.");
  if (spans.length) {
    const t0 = Math.floor(Math.min(...spans.map(x => x[0])) / 60) * 60, t1 = Math.ceil(Math.max(...spans.map(x => x[1])) / 60) * 60, nowM = now.getHours() * 60 + now.getMinutes();
    const first = cols[0].name, owner = b => (cols.some(c => c.name === b.staff) ? b.staff : first);
    timeline = H("div", { className: "tl" },
      H("div", { className: "ax" }, H("b", { className: "cn" }, " "), H("div", { className: "body", style: `height:${(t1 - t0) * PM}px` }, ...Array.from({ length: (t1 - t0) / 60 + 1 }, (_, i) => H("span", { style: `top:${i * 60 * PM}px` }, hhmm(t0 + i * 60))))),
      ...cols.map(c => {
        const h = hoursOf(c);
        return H("div", { className: "col" }, H("b", { className: "cn" }, c.name || "Foglalások"),
          H("div", { className: "body", style: `height:${(t1 - t0) * PM}px` },
            h && !closedDays.has(day) && H("div", { className: "open", style: `top:${(mins(h[0]) - t0) * PM}px;height:${(mins(h[1]) - mins(h[0])) * PM}px` }),
            day === today && nowM >= t0 && nowM <= t1 && H("div", { className: "now", style: `top:${(nowM - t0) * PM}px` }),
            ...dayBks.filter(b => owner(b) === c.name).map(b => H("a", { className: "blk", href: "#b-" + b.id, title: `${hhmm(b.start)}–${hhmm(b.start + b.dur)} ${b.service} · ${b.name}`, style: `top:${(b.start - t0) * PM}px;height:${b.dur * PM}px` },
              H("b", {}, hhmm(b.start)), " " + b.name, b.dur >= 45 && H("small", {}, b.service)))));
      }));
  }

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
    H("div", { className: "box" }, calendar),
    H("div", { className: "box" },
      H("div", { className: "nav" }, H("button", { className: "btn ghost sm", "aria-label": "Előző nap", onclick: () => shift(-1) }, "◀"), H("b", {}, label), H("button", { className: "btn ghost sm", "aria-label": "Következő nap", onclick: () => shift(1) }, "▶")),
      timeline,
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
