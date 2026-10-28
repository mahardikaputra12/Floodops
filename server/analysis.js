// Mesin analisis FloodOps: skor prioritas (PRD 10.1–10.2) dan simulasi penutupan jalan (PRD 10.3).
export const DEFAULT_PARAMS = {
  weights: { depth: 0.4, access: 0.35, alt: 0.25 }, // 40% / 35% / 25%
  staleHours: 24,   // batas kedaluwarsa laporan
  depthLow: 20,     // skala 1: <= 20 cm
  depthMid: 50      // skala 2: 21–50 cm, skala 3: > 50 cm
};
export const STATUS = { V: 'terverifikasi', U: 'belum_terverifikasi', X: 'ditolak' };

export const indicatorValue = (scale) => ((scale - 1) / 2) * 100;
export const totalScore = (d, a, l, w) =>
  Math.round((w.depth * indicatorValue(d) + w.access * indicatorValue(a) + w.alt * indicatorValue(l)) * 10) / 10;
export const depthScale = (cm, p) => (cm <= p.depthLow ? 1 : cm <= p.depthMid ? 2 : 3);
export const category = (t) =>
  t >= 70 ? { key: 'tinggi', label: 'Prioritas tinggi', advice: 'Segera ditinjau dan diverifikasi oleh petugas.' }
  : t >= 40 ? { key: 'menengah', label: 'Prioritas menengah', advice: 'Perlu diperiksa dan dipantau.' }
  : { key: 'rendah', label: 'Prioritas lebih rendah', advice: 'Tetap dipantau jika kondisi berubah.' };

// ---------- graf jaringan jalan (simpul = persimpangan, sisi = ruas jalan) ----------
export function shortest(net, src, ban = []) {
  const adj = {}; const dist = {}; const prev = {}; const done = {};
  Object.keys(net.nodes).forEach((k) => { adj[k] = []; dist[k] = Infinity; });
  net.segments.forEach((s) => { if (!ban.includes(s.id)) { adj[s.a].push([s.b, s.road_length, s.id]); adj[s.b].push([s.a, s.road_length, s.id]); } });
  dist[src] = 0;
  for (;;) {
    let u = null;
    for (const k in dist) if (!done[k] && dist[k] < Infinity && (u === null || dist[k] < dist[u])) u = k;
    if (u === null) break;
    done[u] = true;
    for (const [w, c, id] of adj[u]) if (dist[u] + c < dist[w]) { dist[w] = dist[u] + c; prev[w] = [u, id]; }
  }
  return { dist, prev };
}
const settlements = (net) => Object.keys(net.nodes).filter((k) => net.nodes[k].settlement);
function nearest(net, dist) {
  let best = { facility: null, km: Infinity };
  net.facilities.forEach((f) => { if (dist[f.node] < best.km) best = { facility: f, km: dist[f.node] }; });
  return best;
}

// Jumlah jalur pengganti (maks. 2) antara dua ujung ruas setelah ruas dinonaktifkan.
export function alternativeCount(net, seg) {
  let ban = [seg.id], c = 0;
  for (let i = 0; i < 2; i++) {
    const { dist, prev } = shortest(net, seg.a, ban);
    if (dist[seg.b] === Infinity) break;
    c++;
    for (let x = seg.b; x !== seg.a;) { const [p, id] = prev[x]; ban = ban.concat(id); x = p; }
  }
  return c;
}

// Simulasi: nonaktifkan satu ruas lalu hitung ulang keterhubungan permukiman -> fasilitas penting.
export function analyzeClosure(net, seg) {
  const lost = [], rows = [];
  for (const s of settlements(net)) {
    const d0 = shortest(net, s).dist, d1 = shortest(net, s, [seg.id]).dist;
    net.facilities.forEach((f) => { if (d0[f.node] < Infinity && d1[f.node] === Infinity) lost.push({ settlement: s, settlement_name: net.nodes[s].name, facility_id: f.id, facility_name: f.name }); });
    const b = nearest(net, d0), a = nearest(net, d1);
    rows.push({
      settlement: s, settlement_name: net.nodes[s].name,
      before: { facility: b.facility?.name ?? null, km: b.km === Infinity ? null : +b.km.toFixed(2) },
      after: { facility: a.facility?.name ?? null, km: a.km === Infinity ? null : +a.km.toFixed(2) },
      detour_pct: b.km && a.km !== Infinity ? Math.round((a.km / b.km - 1) * 100) : null,
      disconnected: a.km === Infinity
    });
  }
  const lostFacilityIds = [...new Set(lost.map((l) => l.facility_id))];
  return {
    segment_id: seg.id, road_name: seg.road_name, label: 'SIMULASI – bukan kondisi nyata',
    facilities_total: net.facilities.length,
    facilities_still_connected: net.facilities.length - lostFacilityIds.length,
    pairs_total: settlements(net).length * net.facilities.length, pairs_lost: lost.length,
    lost_pairs: lost, lost_facility_ids: lostFacilityIds, rows,
    max_detour_pct: Math.max(0, ...rows.map((r) => r.detour_pct ?? 0)),
    assumptions: [
      'Hasil merupakan perkiraan berdasarkan jaringan dan data yang tersedia, bukan jaminan kondisi lapangan.',
      'Panjang jalan dipakai sebagai pengganti waktu tempuh; hanya satu ruas yang dinonaktifkan.',
      'Keterhubungan jalan pada peta tidak menjamin jalan tersebut aman dilalui.'
    ]
  };
}

export function structure(net, seg) {
  const a = analyzeClosure(net, seg), al = alternativeCount(net, seg);
  const access = a.lost_pairs.length ? 3 : a.max_detour_pct > 25 ? 2 : 1;
  const alt = al >= 2 ? 1 : al === 1 ? 2 : 3;
  return { access, alt, closure: a, altCount: al };
}

const isStale = (r, p, now) => now - new Date(r.updated_at).getTime() > p.staleHours * 3600e3;

// ---------- skor prioritas + penjelasan ----------
export function priority(net, reports, params = DEFAULT_PARAMS, now = Date.now()) {
  const ranked = [], noData = [];
  for (const seg of net.segments) {
    const rs = reports.filter((r) => r.road_segment_id === seg.id && r.verification_status !== STATUS.X)
      .sort((x, y) => new Date(y.updated_at) - new Date(x.updated_at));
    const r = rs[0];
    if (!r) { noData.push({ segment_id: seg.id, road_name: seg.road_name }); continue; }
    const st = structure(net, seg), d = depthScale(r.reported_depth, params);
    const total = totalScore(d, st.access, st.alt, params.weights);
    const stale = isStale(r, params, now), reasons = [];
    reasons.push(d === 3 ? `Kedalaman genangan yang dilaporkan cukup tinggi (${r.reported_depth} cm, lebih dari ${params.depthMid} cm).`
      : d === 2 ? `Kedalaman genangan yang dilaporkan tingkat menengah (${r.reported_depth} cm).`
      : `Kedalaman genangan yang dilaporkan rendah (${r.reported_depth} cm).`);
    reasons.push(st.access === 3 ? `Akses menuju fasilitas penting atau permukiman berpotensi terputus: ${[...new Set(st.closure.lost_pairs.map((l) => `${l.settlement_name} ↔ ${l.facility_name}`))].slice(0, 3).join('; ')}.`
      : st.access === 2 ? `Akses menuju fasilitas penting berpotensi terganggu (rute terdekat memanjang hingga ${st.closure.max_detour_pct}%), tetapi alternatif masih tersedia.`
      : 'Tidak ada gangguan akses penting yang teridentifikasi dalam model.');
    reasons.push(st.alt === 3 ? 'Jalur alternatif tidak ditemukan dalam jaringan yang dianalisis.'
      : st.alt === 2 ? 'Jalur alternatif terbatas dalam jaringan yang dianalisis.' : 'Beberapa jalur alternatif tersedia.');
    if (r.verification_status === STATUS.U) reasons.push('Laporan masih memerlukan verifikasi lapangan.');
    if (stale) reasons.push(`Laporan melewati batas waktu pembaruan (${params.staleHours} jam) dan perlu diperiksa kembali.`);
    ranked.push({
      segment_id: seg.id, road_name: seg.road_name, report_id: r.id, reported_depth: r.reported_depth,
      updated_at: r.updated_at, verification_status: r.verification_status, source_type: r.source_type, stale,
      depth_score: d, facility_impact_score: st.access, alternative_access_score: st.alt,
      values: { depth: indicatorValue(d), access: indicatorValue(st.access), alt: indicatorValue(st.alt) },
      weights: params.weights, total_score: total, category: category(total), reasons,
      affected: [...new Set(st.closure.lost_pairs.map((l) => `${l.settlement_name} ↔ ${l.facility_name}`))],
      calculated_at: new Date(now).toISOString()
    });
  }
  ranked.sort((a, b) => b.total_score - a.total_score);
  return { ranked, noData };
}
