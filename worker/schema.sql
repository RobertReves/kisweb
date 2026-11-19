-- Egy D1 adatbázis az összes ügyfélnek (slug választja szét őket).
CREATE TABLE IF NOT EXISTS tenants (
  slug   TEXT PRIMARY KEY,
  origin TEXT NOT NULL,             -- engedélyezett weboldal(ak), vesszővel: https://szalon-eva.hu,https://www.szalon-eva.hu
  token_hash TEXT NOT NULL,         -- az admin jelszó SHA-256 lenyomata (a jelszót sehol nem tároljuk)
  tg_chat TEXT NOT NULL DEFAULT '', -- a tulajdonos Telegram chat id-ja (üres = nincs értesítés)
  banner TEXT NOT NULL DEFAULT '',
  closed TEXT NOT NULL DEFAULT '[]', -- zárva tartott napok JSON tömbben
  place_id TEXT NOT NULL DEFAULT '', -- Google Places azonosító (üres = nincs élő Google-vélemény)
  reviews TEXT NOT NULL DEFAULT '',  -- a Google-válasz gyorsítótára (JSON), 12 óránként frissül
  reviews_at INTEGER NOT NULL DEFAULT 0 -- a gyorsítótár ideje (ms)
);
-- Meglévő adatbázis bővítése (egyszer, külön-külön futtatva):
--   ALTER TABLE tenants ADD COLUMN place_id TEXT NOT NULL DEFAULT '';
--   ALTER TABLE tenants ADD COLUMN reviews TEXT NOT NULL DEFAULT '';
--   ALTER TABLE tenants ADD COLUMN reviews_at INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  site TEXT NOT NULL, date TEXT NOT NULL, start INTEGER NOT NULL, dur INTEGER NOT NULL,
  staff TEXT NOT NULL DEFAULT '', service TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok', created TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS bookings_site_date ON bookings(site, date);
-- kérésszámláló a spam ellen; a kulcs az IP lenyomata (nyers IP-t nem tárolunk), naponta törlődik
CREATE TABLE IF NOT EXISTS hits (
  k TEXT NOT NULL, w INTEGER NOT NULL, n INTEGER NOT NULL, exp INTEGER NOT NULL,
  PRIMARY KEY (k, w)
);
