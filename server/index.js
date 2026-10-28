import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db, save, nextId, net } from './store.js';
import { priority, analyzeClosure, STATUS } from './analysis.js';

const app = express();
const SECRET = process.env.JWT_SECRET || 'dev-secret-ubah-di-produksi';
app.use(cors());
app.use(express.json({ limit: '100kb' }));

const log = (u, action, object_type, object_id) =>
  { db.audit_logs.unshift({ id: nextId('audit'), user_id: u?.id ?? null, user_name: u?.name ?? '-', action, object_type, object_id, created_at: new Date().toISOString() }); db.audit_logs.length = Math.min(db.audit_logs.length, 300); };
const auth = (...roles) => (req, res, next) => {
  try {
    const u = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET);
    if (roles.length && !roles.includes(u.role)) return res.status(403).json({ error: 'Peran Anda tidak memiliki akses ke fitur ini.' });
    req.user = u; next();
  } catch { res.status(401).json({ error: 'Sesi tidak valid. Silakan masuk kembali.' }); }
};
const OFF = ['petugas', 'admin'];
const clean = (s, n) => String(s ?? '').replace(/[<>]/g, '').trim().slice(0, n);

// FR-01 Login dan hak akses – setiap peran memiliki pintu masuk sendiri (portal) dan dikunci di server.
const PORTALS = { petugas: 'Petugas Penanganan Banjir', pengguna: 'Pengguna', admin: 'Administrator' };
const fails = new Map();
app.post('/api/auth/login', (req, res) => {
  const portal = String(req.body.portal ?? '');
  if (!PORTALS[portal]) return res.status(400).json({ error: 'Portal masuk tidak dikenal.' });
  const email = clean(req.body.email, 100).toLowerCase(), key = req.ip + email, f = fails.get(key) || { n: 0, t: 0 };
  if (f.n >= 5 && Date.now() - f.t < 5 * 60e3) return res.status(429).json({ error: 'Terlalu banyak percobaan gagal. Coba lagi dalam beberapa menit.' });
  const u = db.users.find((x) => x.email === email);
  if (!u || !bcrypt.compareSync(String(req.body.password ?? ''), u.password_hash)) { fails.set(key, { n: f.n + 1, t: Date.now() }); return res.status(401).json({ error: 'Email atau kata sandi salah.' }); }
  if (u.role !== portal) { log({ id: u.id, name: u.name }, `ditolak masuk lewat portal ${portal}`, 'user', u.id); save(); return res.status(403).json({ error: `Akun ini bukan akun ${PORTALS[portal]}. Gunakan halaman masuk yang sesuai dengan peran Anda.` }); }
  fails.delete(key);
  const user = { id: u.id, name: u.name, email: u.email, role: u.role };
  log(user, 'login', 'user', u.id); save();
  res.json({ token: jwt.sign(user, SECRET, { expiresIn: '12h' }), user });
});

// ---------- Laporan warga (publik, tanpa login) ----------
const buckets = new Map();
const limited = (ip) => { const now = Date.now(), a = (buckets.get(ip) || []).filter((t) => now - t < 600e3); a.push(now); buckets.set(ip, a); return a.length > 5; };
function validateReport(b, allowPast) {
  const seg = db.segments.find((x) => x.id === +b.road_segment_id), depth = Number(b.reported_depth);
  if (!seg) return { error: 'Ruas jalan tidak ditemukan.' };
  if (b.reported_depth === '' || b.reported_depth == null || !Number.isFinite(depth) || depth < 0 || depth > 300) return { error: 'Kedalaman genangan harus berupa angka 0–300 cm.' };
  const at = allowPast && b.reported_at ? new Date(b.reported_at) : new Date();
  if (isNaN(at) || at > new Date(Date.now() + 60000)) return { error: 'Waktu laporan tidak valid.' };
  const photo = clean(b.photo_url, 300);
  if (photo && !/^https?:\/\//.test(photo)) return { error: 'Tautan foto harus diawali http:// atau https://.' };
  return { seg, depth: Math.round(depth), at, photo: photo || null, description: clean(b.description, 200) || '(tanpa catatan)' };
}
app.get('/api/public/segments', (req, res) => res.json(db.segments.map(({ id, road_name, region_id }) => ({ id, road_name, region_id }))));
app.post('/api/public/reports', (req, res) => {
  if (req.body.website) return res.status(201).json({ tracking_code: 'LW-000000' }); // kolom jebakan untuk bot
  if (limited(req.ip)) return res.status(429).json({ error: 'Terlalu banyak laporan dari perangkat ini. Coba lagi beberapa menit lagi.' });
  const v = validateReport(req.body, false); if (v.error) return res.status(400).json({ error: v.error });
  const code = 'LW-' + crypto.randomBytes(3).toString('hex').toUpperCase(), now = v.at.toISOString();
  const r = { id: nextId('report'), road_segment_id: v.seg.id, reported_depth: v.depth, description: v.description, photo_url: v.photo, reported_at: now, updated_at: now,
    verification_status: STATUS.U, source_type: 'warga', tracking_code: code, reporter_contact: clean(req.body.reporter_contact, 60) || null };
  db.reports.push(r); log(null, 'laporan warga masuk', 'flood_report', r.id); save();
  res.status(201).json({ tracking_code: code, verification_status: r.verification_status });
});
app.get('/api/public/reports/:code', (req, res) => {
  if (limited('cek' + req.ip)) return res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi nanti.' });
  const r = db.reports.find((x) => x.tracking_code === String(req.params.code).toUpperCase());
  if (!r) return res.status(404).json({ error: 'Kode laporan tidak ditemukan.' });
  res.json({ tracking_code: r.tracking_code, road_name: db.segments.find((x) => x.id === r.road_segment_id)?.road_name, reported_depth: r.reported_depth, reported_at: r.reported_at, updated_at: r.updated_at, verification_status: r.verification_status });
});

// FR-02, FR-08 Jaringan jalan & fasilitas
app.get('/api/network', auth(), (req, res) => res.json({ ...net(), params: db.params }));

// FR-03, FR-11, FR-12 Laporan
app.get('/api/reports', auth(), (req, res) => {
  const { status, min, hours, source } = req.query; const now = Date.now();
  let list = db.reports.filter((r) => (!status || r.verification_status === status) && (!source || r.source_type === source) && (!min || r.reported_depth >= +min) && (!hours || now - new Date(r.updated_at) <= +hours * 3600e3));
  list = list.map((r) => ({ ...r, stale: now - new Date(r.updated_at) > db.params.staleHours * 3600e3, road_name: db.segments.find((s) => s.id === r.road_segment_id)?.road_name, ...(req.user.role === 'pengguna' ? { reporter_contact: undefined } : {}) }));
  res.json(list.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)));
});
app.post('/api/reports', auth(), (req, res) => {
  const v = validateReport(req.body, true); if (v.error) return res.status(400).json({ error: v.error });
  const r = { id: nextId('report'), road_segment_id: v.seg.id, reported_depth: v.depth, description: v.description, photo_url: v.photo,
    reported_at: v.at.toISOString(), updated_at: v.at.toISOString(), verification_status: STATUS.U, source_type: req.user.role === 'pengguna' ? 'pengguna' : 'petugas' };
  db.reports.push(r); log(req.user, 'buat laporan', 'flood_report', r.id); save(); res.status(201).json(r);
});
// FR-04 Validasi laporan
app.patch('/api/reports/:id', auth(...OFF), (req, res) => {
  const r = db.reports.find((x) => x.id === +req.params.id);
  if (!r) return res.status(404).json({ error: 'Laporan tidak ditemukan.' });
  const a = req.body.action;
  if (a === 'verify') { r.verification_status = STATUS.V; r.updated_at = new Date().toISOString(); }
  else if (a === 'reject') { r.verification_status = STATUS.X; r.updated_at = new Date().toISOString(); }
  else if (a === 'refresh') { r.updated_at = new Date().toISOString(); if (req.body.reported_depth !== undefined) { const d = Number(req.body.reported_depth); if (!Number.isFinite(d) || d < 0 || d > 300) return res.status(400).json({ error: 'Kedalaman harus 0–300 cm.' }); r.reported_depth = Math.round(d); } }
  else return res.status(400).json({ error: 'Aksi tidak dikenal.' });
  log(req.user, `${a} laporan`, 'flood_report', r.id); save(); res.json(r);
});

// FR-05 – FR-07 Skor prioritas beserta penjelasan
app.get('/api/priority', auth(), (req, res) => {
  const p = priority(net(), db.reports, db.params);
  if (req.user.role === 'pengguna') { // use case: Pengguna hanya melihat peta & dashboard, bukan daftar prioritas/penjelasan skor
    p.ranked = p.ranked.map((r) => ({ segment_id: r.segment_id, road_name: r.road_name, reported_depth: r.reported_depth, depth_score: r.depth_score, updated_at: r.updated_at, verification_status: r.verification_status, stale: r.stale, category: { key: r.category.key, label: r.category.label } }));
  }
  res.json({ ...p, params: db.params });
});

// FR-09, FR-10 Simulasi penutupan satu ruas
app.post('/api/simulate', auth(...OFF), (req, res) => {
  const seg = db.segments.find((s) => s.id === +req.body.segment_id);
  if (!seg) return res.status(400).json({ error: 'Pilih ruas jalan yang valid.' });
  try {
    const result = analyzeClosure(net(), seg);
    db.simulation_runs.unshift({ id: nextId('sim'), selected_road_segment_id: seg.id, input_parameters: { segment_id: seg.id }, result_summary: { connected: result.facilities_still_connected, total: result.facilities_total, lost: result.lost_facility_ids }, created_by: req.user.id, created_at: new Date().toISOString() });
    log(req.user, 'simulasi penutupan', 'simulation_run', seg.id); save(); res.json(result);
  } catch (e) { res.status(500).json({ error: 'Simulasi gagal dijalankan: ' + e.message }); }
});

// FR-13 Ekspor ringkasan (CSV)
app.get('/api/export', auth(...OFF), (req, res) => {
  const { ranked } = priority(net(), db.reports, db.params);
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [['peringkat', 'ruas', 'skor', 'kategori', 'genangan_cm', 'skala_genangan', 'skala_akses', 'skala_alternatif', 'status_verifikasi', 'kedaluwarsa', 'alasan'].join(',')]
    .concat(ranked.map((r, i) => [i + 1, q(r.road_name), r.total_score, q(r.category.label), r.reported_depth, r.depth_score, r.facility_impact_score, r.alternative_access_score, r.verification_status, r.stale ? 'ya' : 'tidak', q(r.reasons.join(' | '))].join(',')));
  rows.push('', q('Alat bantu analisis, bukan keputusan resmi penanganan bencana. Data uji bersifat sintetis.'));
  log(req.user, 'ekspor ringkasan', 'export', 0); save();
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="floodops-ringkasan.csv"' }).send('\ufeff' + rows.join('\n'));
});

// Ringkasan bahasa alami opsional via OpenRouter (PRD 9.3). Hanya merangkum hasil yang sudah dihitung.
app.post('/api/ai/ringkasan', auth(...OFF), async (req, res) => {
  if (!process.env.OPENROUTER_API_KEY) return res.status(503).json({ error: 'OPENROUTER_API_KEY belum diatur pada file .env.' });
  const top = priority(net(), db.reports, db.params).ranked.slice(0, 5).map((r) => ({ ruas: r.road_name, skor: r.total_score, kategori: r.category.label, alasan: r.reasons, status: r.verification_status, kedaluwarsa: r.stale }));
  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini', messages: [
        { role: 'system', content: 'Anda asisten analisis banjir. Ringkas data berikut dalam Bahasa Indonesia, maksimal 5 kalimat, tanpa menambah fakta di luar data. Tegaskan bahwa ini alat bantu, bukan keputusan resmi.' },
        { role: 'user', content: JSON.stringify(top) }] }) });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: j.error?.message || 'Layanan AI menolak permintaan.' });
    res.json({ text: j.choices?.[0]?.message?.content ?? '' });
  } catch (e) { res.status(502).json({ error: 'Tidak dapat menghubungi layanan AI: ' + e.message }); }
});

// FR-14 Pengelolaan data (admin)
app.get('/api/audit', auth(...OFF), (req, res) => res.json(db.audit_logs.slice(0, 100)));
app.get('/api/users', auth('admin'), (req, res) => res.json(db.users.map(({ password_hash, ...u }) => u)));
app.post('/api/users', auth('admin'), (req, res) => {
  const email = clean(req.body.email, 100).toLowerCase(), pw = String(req.body.password ?? '');
  if (!/^\S+@\S+\.\S+$/.test(email) || pw.length < 8 || !['pengguna', 'petugas', 'admin'].includes(req.body.role) || !clean(req.body.name, 60)) return res.status(400).json({ error: 'Nama, email valid, peran, dan kata sandi minimal 8 karakter wajib diisi.' });
  if (db.users.some((u) => u.email === email)) return res.status(409).json({ error: 'Email sudah terdaftar.' });
  const u = { id: nextId('user'), name: clean(req.body.name, 60), email, role: req.body.role, password_hash: bcrypt.hashSync(pw, 10), created_at: new Date().toISOString() };
  db.users.push(u); log(req.user, 'tambah pengguna', 'user', u.id); save(); res.status(201).json({ id: u.id });
});
app.post('/api/facilities', auth('admin'), (req, res) => {
  const name = clean(req.body.facility_name, 80);
  if (!name || !db.nodes[req.body.node] || !['rumah_sakit', 'puskesmas', 'sekolah', 'pusat_evakuasi'].includes(req.body.facility_type)) return res.status(400).json({ error: 'Nama, jenis, dan simpul lokasi wajib valid.' });
  const f = { id: nextId('facility'), facility_name: name, name, facility_type: req.body.facility_type, node: req.body.node, region_id: db.nodes[req.body.node].name };
  db.facilities.push(f); log(req.user, 'tambah fasilitas', 'critical_facility', f.id); save(); res.status(201).json(f);
});
app.put('/api/params', auth('admin'), (req, res) => {
  const w = req.body.weights || {}, sum = +w.depth + +w.access + +w.alt, h = +req.body.staleHours;
  if (![w.depth, w.access, w.alt].every((x) => x >= 0) || Math.abs(sum - 1) > 1e-6 || !(h > 0)) return res.status(400).json({ error: 'Total bobot harus 100% dan batas kedaluwarsa > 0 jam.' });
  db.params = { ...db.params, weights: { depth: +w.depth, access: +w.access, alt: +w.alt }, staleHours: h };
  log(req.user, 'ubah parameter', 'params', 0); save(); res.json(db.params);
});

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (fs.existsSync(dist)) { app.use(express.static(dist)); app.get(/^(?!\/api).*/, (q, r) => r.sendFile(path.join(dist, 'index.html'))); }
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`FloodOps API berjalan di http://localhost:${PORT}`));
