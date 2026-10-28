// Pengujian otomatis sesuai PRD bagian 15 (Skenario A, B, C, D, E, F). Jalankan: npm test
import assert from 'node:assert/strict';
import { nodes, segments, facilities, seedReports } from './seed.js';
import { priority, analyzeClosure, totalScore, DEFAULT_PARAMS, indicatorValue } from './analysis.js';
const net = { nodes, segments, facilities };
const W = DEFAULT_PARAMS.weights; let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ✓', name); };

t('Skenario F – 27 kombinasi skala 1–3 sesuai perhitungan manual (integer)', () => {
  for (let a = 1; a <= 3; a++) for (let b = 1; b <= 3; b++) for (let c = 1; c <= 3; c++) {
    const manual = (40 * (a - 1) * 50 + 35 * (b - 1) * 50 + 25 * (c - 1) * 50) / 100;
    assert.equal(totalScore(a, b, c, W), Math.round(manual * 10) / 10);
  }
  assert.equal(totalScore(1, 1, 1, W), 0); assert.equal(totalScore(3, 3, 3, W), 100); assert.equal(indicatorValue(2), 50);
});
t('Skenario A – urutan prioritas menurun dan konsisten dengan rumus', () => {
  const { ranked } = priority(net, seedReports());
  for (let i = 1; i < ranked.length; i++) assert.ok(ranked[i - 1].total_score >= ranked[i].total_score);
  ranked.forEach((r) => assert.equal(r.total_score, totalScore(r.depth_score, r.facility_impact_score, r.alternative_access_score, W)));
});
t('Skenario B/D – Jl. Caringin–Cijerah (ruas 12) memutus akses Cijerah ke seluruh 7 fasilitas', () => {
  const r = analyzeClosure(net, segments.find((s) => s.id === 12));
  assert.equal(r.lost_pairs.filter((l) => l.settlement === 'I').length, 7);
  assert.equal(r.rows.find((x) => x.settlement === 'I').disconnected, true);
});
t('Skenario D – penutupan Jl. Jend. Sudirman (ruas 5) tidak memutus fasilitas apa pun', () => {
  assert.equal(analyzeClosure(net, segments.find((s) => s.id === 5)).lost_pairs.length, 0);
});
t('Skenario C – laporan belum terverifikasi ditandai & disebut dalam alasan', () => {
  const x = priority(net, seedReports()).ranked.find((r) => r.segment_id === 12);
  assert.equal(x.verification_status, 'belum_terverifikasi'); assert.ok(x.reasons.some((s) => s.includes('verifikasi lapangan')));
});
t('Skenario E – laporan melewati batas waktu ditandai kedaluwarsa', () => {
  const x = priority(net, seedReports()).ranked.find((r) => r.segment_id === 15);
  assert.equal(x.stale, true);
});
t('Laporan ditolak tidak dihitung; ruas tanpa laporan = data belum tersedia (bukan nol)', () => {
  const p = priority(net, seedReports());
  assert.ok(!p.ranked.some((r) => r.segment_id === 16)); assert.ok(p.noData.some((r) => r.segment_id === 16));
});
console.log(`\n${pass} kelompok uji lulus.`);
