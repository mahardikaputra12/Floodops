// Penyimpanan data lokal berbasis file JSON agar proyek langsung jalan tanpa konfigurasi.
// Skema tabel PostgreSQL/Supabase yang setara ada di supabase/schema.sql (PRD bagian 12).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodes, segments, facilities, seedReports, seedUsers } from './seed.js';
import { DEFAULT_PARAMS } from './analysis.js';
const dir = process.env.FLOODOPS_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const file = path.join(dir, 'db.json');
const fresh = () => ({ nodes, segments, facilities, reports: seedReports(), users: seedUsers(), params: DEFAULT_PARAMS, simulation_runs: [], audit_logs: [], seq: { report: 100, user: 100, sim: 1, audit: 1, facility: 100 } });
export let db;
try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { db = fresh(); }
// Migrasi data lama: peran/sumber 'relawan' diganti 'pengguna'
for (const u of db.users) if (u.role === 'relawan') { u.role = 'pengguna'; u.name = u.name.replace('Relawan', 'Pengguna'); u.email = u.email.replace('relawan@', 'pengguna@'); }
for (const r of db.reports) if (r.source_type === 'relawan') r.source_type = 'pengguna';
export const save = () => { try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(db, null, 1)); } catch (e) { console.error('Gagal menyimpan data:', e.message); } };
export const resetDb = () => { db = fresh(); save(); return db; };
export const nextId = (k) => db.seq[k]++;
export const net = () => ({ nodes: db.nodes, segments: db.segments, facilities: db.facilities });
save();
