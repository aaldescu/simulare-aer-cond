// Stocare planuri de apartament în SQLite (node:sqlite, built-in în Node 22).
// Un plan = geometria (grid) + proprietățile apartamentului (nord, înălțime,
// scară) + o poză opțională de fundal (BLOB).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(__dirname, 'data');
mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(join(DATA_DIR, 'plans.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS plans (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    cols       INTEGER NOT NULL,
    rows       INTEGER NOT NULL,
    grid       TEXT    NOT NULL,          -- string de cifre 0..4, o celulă / caracter
    north      REAL    NOT NULL DEFAULT 0,-- unghi 0..360, direcția nordului pe ecran
    height     REAL    NOT NULL DEFAULT 2.6,
    scale      REAL    NOT NULL DEFAULT 0.33,
    photo      BLOB,                       -- poza de fundal (opțională)
    photo_mime TEXT,
    created_at TEXT    NOT NULL,
    updated_at TEXT    NOT NULL
  );
`);

// migrare: coloanele de transformare a pozei (mărime + poziție), ca la reeditare
// poza să revină exact unde ai lăsat-o
function ensureColumn(name, def) {
  const cols = db.prepare(`PRAGMA table_info(plans)`).all().map(c => c.name);
  if (!cols.includes(name)) db.exec(`ALTER TABLE plans ADD COLUMN ${name} ${def}`);
}
ensureColumn('photo_scale', 'REAL NOT NULL DEFAULT 1');
ensureColumn('photo_x', 'REAL NOT NULL DEFAULT 0');
ensureColumn('photo_y', 'REAL NOT NULL DEFAULT 0');

// dataURL "data:image/png;base64,...." <-> {buf, mime}
function decodePhoto(dataUrl) {
  if (!dataUrl) return { buf: null, mime: null };
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) return { buf: null, mime: null };
  return { buf: Buffer.from(m[2], 'base64'), mime: m[1] };
}
function encodePhoto(buf, mime) {
  if (!buf || !mime) return null;
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return `data:${mime};base64,${b.toString('base64')}`;
}

// listă ușoară pentru dropdown / management (fără grid și fără poză)
export function listPlans() {
  const rows = db.prepare(`
    SELECT id, name, cols, rows, north, height, scale,
           (photo IS NOT NULL) AS has_photo, created_at, updated_at
    FROM plans ORDER BY updated_at DESC
  `).all();
  return rows.map(r => ({ ...r, has_photo: !!r.has_photo }));
}

export function getPlan(id) {
  const r = db.prepare(`SELECT * FROM plans WHERE id = ?`).get(id);
  if (!r) return null;
  const { photo, photo_mime, ...rest } = r;
  return { ...rest, photo: encodePhoto(photo, photo_mime) };
}

export function createPlan(p) {
  const now = new Date().toISOString();
  const { buf, mime } = decodePhoto(p.photo);
  const info = db.prepare(`
    INSERT INTO plans (name, cols, rows, grid, north, height, scale, photo, photo_mime,
      photo_scale, photo_x, photo_y, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    p.name, p.cols, p.rows, p.grid,
    p.north ?? 0, p.height ?? 2.6, p.scale ?? 0.33,
    buf, mime,
    p.photo_scale ?? 1, p.photo_x ?? 0, p.photo_y ?? 0,
    now, now
  );
  return getPlan(Number(info.lastInsertRowid));
}

export function updatePlan(id, p) {
  const cur = db.prepare(`SELECT * FROM plans WHERE id = ?`).get(id);
  if (!cur) return null;
  const now = new Date().toISOString();
  // poza: dacă vine 'photo' în payload o înlocuim (null = șterge); dacă lipsește, o păstrăm
  let buf = cur.photo, mime = cur.photo_mime;
  if (Object.prototype.hasOwnProperty.call(p, 'photo')) {
    const dec = decodePhoto(p.photo);
    buf = dec.buf; mime = dec.mime;
  }
  db.prepare(`
    UPDATE plans SET name=?, cols=?, rows=?, grid=?, north=?, height=?, scale=?,
      photo=?, photo_mime=?, photo_scale=?, photo_x=?, photo_y=?, updated_at=? WHERE id=?
  `).run(
    p.name ?? cur.name, p.cols ?? cur.cols, p.rows ?? cur.rows, p.grid ?? cur.grid,
    p.north ?? cur.north, p.height ?? cur.height, p.scale ?? cur.scale,
    buf, mime,
    p.photo_scale ?? cur.photo_scale, p.photo_x ?? cur.photo_x, p.photo_y ?? cur.photo_y,
    now, id
  );
  return getPlan(id);
}

export function deletePlan(id) {
  const info = db.prepare(`DELETE FROM plans WHERE id = ?`).run(id);
  return info.changes > 0;
}
