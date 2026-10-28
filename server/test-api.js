// Uji integrasi API: menjalankan server pada port acak dengan data sementara, lalu memeriksa aturan peran. Jalankan: npm run test:api
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

const port = 4100 + Math.floor(Math.random() * 500), B = `http://localhost:${port}/api`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'floodops-'));
const srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(port), FLOODOPS_DATA_DIR: tmp }, stdio: 'ignore' });
const j = (path, o = {}, tok) => fetch(B + path, { method: o.method || 'GET', headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined }).then(async (r) => ({ s: r.status, d: await r.json().catch(() => ({})) }));
const login = (email, password, portal) => j('/auth/login', { method: 'POST', body: { email, password, portal } });
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('  ✓', name); };
try {
  for (let i = 0; i < 40; i++) { try { await fetch(B + '/public/segments'); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }
  await t('login hanya berhasil lewat portal yang sesuai (403 bila salah portal, 400 tanpa portal)', async () => {
    assert.equal((await login('petugas@floodops.id', 'petugas123', 'admin')).s, 403);
    assert.equal((await login('pengguna@floodops.id', 'pengguna123', 'petugas')).s, 403);
    assert.equal((await login('admin@floodops.id', 'admin123', undefined)).s, 400);
    for (const [e, p, po] of [['petugas', 'petugas123', 'petugas'], ['pengguna', 'pengguna123', 'pengguna'], ['admin', 'admin123', 'admin']]) assert.equal((await login(e + '@floodops.id', p, po)).s, 200);
  });
  const tok = {}; for (const r of ['petugas', 'pengguna', 'admin']) tok[r] = (await login(`${r}@floodops.id`, `${r}123`, r)).d.token;
  await t('Pengguna hanya melihat peta/dashboard: skor dan alasan disembunyikan di server', async () => {
    const p = (await j('/priority', {}, tok.pengguna)).d.ranked[0]; assert.equal(p.total_score, undefined); assert.equal(p.reasons, undefined); assert.ok(p.category.label);
    const q = (await j('/priority', {}, tok.petugas)).d.ranked[0]; assert.ok(q.total_score >= 0); assert.ok(q.reasons.length);
  });
  await t('hak akses: Pengguna ditolak simulasi/ekspor/verifikasi/pengelolaan (403); tanpa token 401', async () => {
    assert.equal((await j('/simulate', { method: 'POST', body: { segment_id: 12 } }, tok.pengguna)).s, 403);
    assert.equal((await j('/export', {}, tok.pengguna)).s, 403);
    assert.equal((await j('/reports/1', { method: 'PATCH', body: { action: 'verify' } }, tok.pengguna)).s, 403);
    assert.equal((await j('/users', {}, tok.petugas)).s, 403);
    assert.equal((await j('/priority')).s, 401);
  });
  await t('Skenario D via API: menutup Jl. Caringin–Cijerah memutus akses Cijerah', async () => {
    const r = (await j('/simulate', { method: 'POST', body: { segment_id: 12 } }, tok.petugas)).d;
    assert.equal(r.pairs_lost, 7); assert.ok(r.label.includes('SIMULASI'));
  });
  let code, id;
  await t('laporan warga tanpa login: validasi, kode pelacakan, status belum terverifikasi', async () => {
    assert.equal((await j('/public/reports', { method: 'POST', body: { road_segment_id: 8, reported_depth: -5 } })).s, 400);
    assert.equal((await j('/public/reports', { method: 'POST', body: { road_segment_id: 8, reported_depth: 45, reporter_contact: '0812' } })).s, 201);
    const r = await j('/public/reports', { method: 'POST', body: { road_segment_id: 8, reported_depth: 45, reporter_contact: '0812' } }); code = r.d.tracking_code;
    assert.match(code, /^LW-[0-9A-F]{6}$/); assert.equal((await j('/public/reports/' + code)).d.verification_status, 'belum_terverifikasi');
  });
  await t('kontak warga hanya terlihat Petugas/Admin; verifikasi mengubah status yang dilihat warga', async () => {
    const pet = (await j('/reports?source=warga', {}, tok.petugas)).d, mine = pet.find((r) => r.tracking_code === code); id = mine.id;
    assert.equal(mine.reporter_contact, '0812'); assert.equal((await j('/reports?source=warga', {}, tok.pengguna)).d.find((r) => r.tracking_code === code).reporter_contact, undefined);
    assert.equal((await j('/reports/' + id, { method: 'PATCH', body: { action: 'verify' } }, tok.petugas)).s, 200);
    assert.equal((await j('/public/reports/' + code)).d.verification_status, 'terverifikasi');
  });
  await t('pembatasan: laporan warga ke-6 dalam 10 menit ditolak (429)', async () => {
    let last; for (let i = 0; i < 6; i++) last = (await j('/public/reports', { method: 'POST', body: { road_segment_id: 8, reported_depth: 10 } })).s; assert.equal(last, 429);
  });
  await t('parameter: hanya Admin; bobot harus berjumlah 100%', async () => {
    assert.equal((await j('/params', { method: 'PUT', body: { weights: { depth: .4, access: .35, alt: .25 }, staleHours: 24 } }, tok.petugas)).s, 403);
    assert.equal((await j('/params', { method: 'PUT', body: { weights: { depth: .5, access: .5, alt: .5 }, staleHours: 24 } }, tok.admin)).s, 400);
  });
  await t('anti brute force: percobaan gagal ke-6 ditolak (429)', async () => {
    let last; for (let i = 0; i < 6; i++) last = (await login('admin@floodops.id', 'salah', 'admin')).s; assert.equal(last, 429);
  });
  console.log(`\n${n} kelompok uji API lulus.`);
} catch (e) { console.error('GAGAL:', e.message); process.exitCode = 1; } finally { srv.kill(); fs.rmSync(tmp, { recursive: true, force: true }); }
