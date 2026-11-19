// Egy Cloudflare Worker + egy D1 adatbázis szolgál ki minden ügyfelet (ingyenes csomag).
// Védelem: Origin-lista, kérésszám-korlát IP-nként, Cloudflare Turnstile (ember-ellenőrzés), admin zárolás,
// bemenet-tisztítás, méretkorlát, atomi foglalás. Telepítés: lásd ../README.md
const SEC = { "content-type": "application/json", "x-content-type-options": "nosniff", "cache-control": "no-store" };
const J = (d, s = 200, h = {}) => new Response(JSON.stringify(d), { status: s, headers: { ...SEC, ...h } });
const mins = t => +t.slice(0, 2) * 60 + +t.slice(3);
const hhmm = m => String(m / 60 | 0).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Budapest" }).format(new Date());
const plusDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const DATE = /^\d{4}-\d\d-\d\d$/;
const NAME = /^[\p{L}\p{N}][\p{L}\p{N}\p{M}.,'’ -]{1,59}$/u;
const PHONE = /^[+\d][\d\s()./-]{5,29}$/;
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 karakter, nincs 0/O/1/I
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => ALPHA[b % 32]).join("");
// egysoros szöveg: vezérlőkarakterek és sortörések nélkül, hogy a Telegram-értesítést ne lehessen "meghamisítani"
const line = (v, max) => typeof v === "string" ? v.replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
const para = (v, max) => typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max) : "";

const sha = async s => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map(b => b.toString(16).padStart(2, "0")).join("");
function same(a, b) { // állandó idejű összehasonlítás
  const e = new TextEncoder(), x = e.encode(a), y = e.encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ (y[i] ?? 0);
  return d === 0;
}

// --- kérésszám-korlát (D1-ben; az ablakok maguktól lejárnak) ---
const win = (sec) => Math.floor(Date.now() / 1000 / sec);
async function hit(env, key, sec, max) { // true = még belefér
  const w = win(sec);
  const r = await env.DB.prepare("INSERT INTO hits(k,w,n,exp) VALUES(?1,?2,1,?3) ON CONFLICT(k,w) DO UPDATE SET n=n+1 RETURNING n").bind(key, w, (w + 1) * sec).first();
  return r.n <= max;
}
async function over(env, key, sec, max) { // csak olvas, nem számol
  const r = await env.DB.prepare("SELECT n FROM hits WHERE k=? AND w=?").bind(key, win(sec)).first();
  return (r?.n ?? 0) >= max;
}

// Cloudflare Turnstile: ha be van állítva a TURNSTILE_SECRET, minden foglalás/üzenet csak érvényes tokennel megy át.
async function human(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }) }).then(r => r.json()).catch(() => null);
  return !!r?.success; // ha a Cloudflare nem elérhető, nem engedünk át (fail closed)
}

const tg = (env, chat, text) => env.TG_TOKEN && chat
  ? fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, text }) }).catch(() => {})
  : null;

// shortcut: a nyitvatartást a kliens ismeri, a Worker nem; közvetlen API-hívással nyitvatartáson kívüli időpont is foglalható. A tulajdonos látja és törölheti; ha zavaró, tároljuk az órákat a tenants táblában.
async function book(env, t, raw, admin) {
  const b = { date: raw.date, start: raw.start, dur: raw.dur, name: line(raw.name, 60), phone: line(raw.phone, 30), service: line(raw.service, 80), staff: line(raw.staff ?? "", 40) };
  const ok = typeof b.date === "string" && DATE.test(b.date) && !isNaN(Date.parse(b.date)) && Number.isInteger(b.start) && b.start >= 0 && b.start < 1440
    && Number.isInteger(b.dur) && b.dur > 0 && b.dur <= 480 && NAME.test(b.name) && (admin && !b.phone || PHONE.test(b.phone)) && b.service;
  if (!ok) return J({ error: "bad" }, 400);
  const td = today();
  if (b.date < td || b.date > plusDays(td, 120)) return J({ error: "bad" }, 400);
  if (!admin) {
    if (JSON.parse(t.closed).includes(b.date)) return J({ error: "closed" }, 409);
    // telefonszámonként max 3 jövőbeli foglalás, ügyfelenként max 80 új foglalás naponta
    const digits = b.phone.replace(/\D/g, "");
    const own = await env.DB.prepare("SELECT COUNT(*) n FROM bookings WHERE site=? AND status='ok' AND date>=? AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone,' ',''),'+',''),'-',''),'(',''),')','')=?").bind(t.slug, td, digits).first();
    const day = await env.DB.prepare("SELECT COUNT(*) n FROM bookings WHERE site=? AND date(created)=date('now')").bind(t.slug).first();
    if (own.n >= 3 || day.n >= 80) return J({ error: "limit" }, 429);
  }
  const id = newId();
  // egyetlen atomi művelet: csak akkor szúr be, ha nincs átfedő foglalás ugyanannál a munkatársnál
  const r = await env.DB.prepare(
    `INSERT INTO bookings(id,site,date,start,dur,staff,service,name,phone)
     SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9
     WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE site=?2 AND date=?3 AND staff=?6 AND status='ok' AND start < ?4+?5 AND ?4 < start+dur)`
  ).bind(id, t.slug, b.date, b.start, b.dur, b.staff, b.service, b.name, b.phone).run();
  if (!r.meta.changes) return J({ error: "taken" }, 409);
  await tg(env, t.tg_chat, `Új foglalás${admin ? " (kézzel)" : ""}\n${b.date} ${hhmm(b.start)}\n${b.service}${b.staff ? " · " + b.staff : ""}\n${b.name}, ${b.phone}`);
  return J({ id });
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url), site = u.searchParams.get("site") || "", origin = req.headers.get("origin") || "";
    const t = await env.DB.prepare("SELECT * FROM tenants WHERE slug=?").bind(site).first();
    if (!t || !t.origin.split(",").includes(origin)) return J({ error: "forbidden" }, 403);
    const cors = { "access-control-allow-origin": origin, "access-control-allow-headers": "content-type,authorization", "access-control-max-age": "600", vary: "origin" };
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const R = (d, s) => J(d, s, cors), p = u.pathname;
    const ip = req.headers.get("cf-connecting-ip") || "?", who = (await sha(ip + site)).slice(0, 24); // nyers IP-t nem tárolunk

    let body = null;
    if (req.method === "POST") {
      const raw = await req.text();
      if (raw.length > 4096) return R({ error: "too_big" }, 413);
      try { body = JSON.parse(raw); } catch { /* alább 400 */ }
      if (!body || typeof body !== "object" || Array.isArray(body)) return R({ error: "bad" }, 400);
    }
    const q = k => u.searchParams.get(k) || "";

    /* ---- nyilvános ---- */
    if (p === "/info") return R({ banner: t.banner, closed: JSON.parse(t.closed) });

    if (p === "/busy") { // csak idősáv, személyes adat nélkül
      const [from, to] = [q("from"), q("to")];
      if (!DATE.test(from) || !DATE.test(to) || to < from || to > plusDays(from, 120)) return R({ error: "bad" }, 400);
      const { results } = await env.DB.prepare("SELECT date,start,dur,staff FROM bookings WHERE site=? AND status='ok' AND date BETWEEN ? AND ?").bind(site, from, to).all();
      return R({ busy: results.map(r => [r.date, r.start, r.dur, r.staff]) });
    }

    if (p === "/book" && body) {
      if (!(await hit(env, "book:" + who, 600, 5))) return R({ error: "rate" }, 429);   // 5 próbálkozás / 10 perc / IP
      if (!(await human(env, body.ts, ip))) return R({ error: "captcha" }, 403);
      return book(env, t, body, false).then(r => new Response(r.body, { status: r.status, headers: { ...Object.fromEntries(r.headers), ...cors } }));
    }

    if (p === "/cancel" && body) {
      if (!(await hit(env, "cancel:" + who, 3600, 10))) return R({ error: "rate" }, 429); // a 6 karakteres kód ne legyen kitalálható
      const id = line(body.id, 6).toUpperCase();
      if (id.length !== 6) return R({ error: "bad" }, 400);
      const r = await env.DB.prepare("UPDATE bookings SET status='cancelled' WHERE id=? AND site=? AND status='ok' AND date>=?").bind(id, site, today()).run();
      if (!r.meta.changes) return R({ error: "notfound" }, 404);
      await tg(env, t.tg_chat, `Lemondás érkezett (kód: ${id})`);
      return R({ ok: true });
    }

    if (p === "/msg" && body) {
      if (!(await hit(env, "msg:" + who, 3600, 3))) return R({ error: "rate" }, 429);        // 3 üzenet / óra / IP
      if (!(await hit(env, "tgmsg:" + site, 86400, 30))) return R({ error: "rate" }, 429);   // ügyfelenként 30 üzenet / nap: a tulajdonos Telegramja védve
      if (!(await human(env, body.ts, ip))) return R({ error: "captcha" }, 403);
      const text = para(body.text, 800), contact = line(body.contact ?? "", 100);
      if (text.length < 2) return R({ error: "bad" }, 400);
      await tg(env, t.tg_chat, `Üzenet az oldalról\n${contact || "(nincs elérhetőség)"}\n\n${text}`);
      return R({ ok: true });
    }

    /* ---- admin (Bearer token, a hash-ét tároljuk; 8 hibás próba / 15 perc / IP után zárolás) ---- */
    if (!p.startsWith("/admin/")) return R({ error: "notfound" }, 404);
    if (await over(env, "adm:" + who, 900, 8)) return R({ error: "locked" }, 429);
    const given = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
    if (!given || !same(await sha(given), t.token_hash)) { await hit(env, "adm:" + who, 900, 8); return R({ error: "unauthorized" }, 401); }

    if (p === "/admin/bookings") {
      const [from, to] = [q("from"), q("to") || q("from")];
      if (!DATE.test(from) || !DATE.test(to)) return R({ error: "bad" }, 400);
      const { results } = await env.DB.prepare("SELECT id,date,start,dur,staff,service,name,phone FROM bookings WHERE site=? AND status='ok' AND date BETWEEN ? AND ? ORDER BY date,start").bind(site, from, to).all();
      return R({ bookings: results });
    }
    if (p === "/admin/book" && body) return book(env, t, body, true).then(r => new Response(r.body, { status: r.status, headers: { ...Object.fromEntries(r.headers), ...cors } }));
    if (p === "/admin/cancel" && body) {
      const r = await env.DB.prepare("UPDATE bookings SET status='cancelled' WHERE id=? AND site=?").bind(line(body.id, 6), site).run();
      return R({ ok: !!r.meta.changes });
    }
    if (p === "/admin/settings" && body) {
      const closed = Array.isArray(body.closed) ? [...new Set(body.closed)].filter(d => typeof d === "string" && DATE.test(d)).sort().slice(0, 200) : [];
      if (typeof (body.banner ?? "") !== "string" || (body.banner ?? "").length > 200) return R({ error: "bad" }, 400);
      await env.DB.prepare("UPDATE tenants SET banner=?, closed=? WHERE slug=?").bind(line(body.banner ?? "", 200), JSON.stringify(closed), site).run();
      return R({ ok: true });
    }
    if (p === "/admin/stats") { // a havi riport: ebből látja az ügyfél, mit hozott neki az oldal
      const since = plusDays(today(), -30);
      const tot = await env.DB.prepare("SELECT COUNT(*) n, SUM(status='cancelled') c FROM bookings WHERE site=? AND date>=?").bind(site, since).first();
      const { results } = await env.DB.prepare("SELECT service, COUNT(*) n FROM bookings WHERE site=? AND date>=? AND status='ok' GROUP BY service ORDER BY n DESC LIMIT 3").bind(site, since).all();
      return R({ total: tot.n, cancelled: tot.c || 0, top: results.map(r => [r.service, r.n]) });
    }
    return R({ error: "notfound" }, 404);
  },

  // naponta egyszer: reggeli összefoglaló, 60 napnál régebbi foglalások és lejárt számlálók törlése (adatvédelem)
  async scheduled(_, env) {
    const td = today();
    await env.DB.prepare("DELETE FROM bookings WHERE date < date('now','-60 day')").run();
    await env.DB.prepare("DELETE FROM hits WHERE exp < ?").bind(Math.floor(Date.now() / 1000)).run();
    const { results: ts } = await env.DB.prepare("SELECT slug,tg_chat FROM tenants WHERE tg_chat!=''").all();
    for (const t of ts) {
      const { results: r } = await env.DB.prepare("SELECT start,service,name,phone,staff FROM bookings WHERE site=? AND date=? AND status='ok' ORDER BY start").bind(t.slug, td).all();
      if (r.length) await tg(env, t.tg_chat, `Mai foglalások (${td}):\n` + r.map(x => `${hhmm(x.start)} ${x.service}${x.staff ? " · " + x.staff : ""} – ${x.name}, ${x.phone}`).join("\n"));
    }
  },
};
