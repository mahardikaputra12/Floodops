import { useEffect, useState } from 'react';
import { api } from '../api.js';
import MapView from '../components/MapView.jsx';

export default function Simulation({ net, prio, canOp, initial }) {
  const [id, setId] = useState(initial || ''), [res, setRes] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const run = async (sid = id) => { if (!sid) return setErr('Pilih satu ruas jalan terlebih dahulu.'); setBusy(true); setErr('');
    try { setRes(await api('/simulate', { method: 'POST', body: { segment_id: +sid } })); } catch (e) { setRes(null); setErr(e.message); } setBusy(false); };
  useEffect(() => { if (initial) { setId(initial); run(initial); } }, [initial]);
  return (<div className="grid two">
    <div className="card"><div className="row" style={{ marginBottom: 10 }}><span className="sim">SIMULASI</span><span className="mu">Data simulasi dipisahkan dari laporan nyata dan tidak mengubah skor.</span></div>
      <MapView net={net} ranked={prio.ranked} selected={+id || null} onSelect={(s) => { setId(s); setRes(null); }} closed={res?.segment_id} lostFacilities={res?.lost_facility_ids ?? []} /></div>
    <div className="card"><h2>Simulasi penutupan satu ruas jalan</h2>
      <label>Ruas yang akan ditutup</label><select value={id} onChange={(e) => { setId(e.target.value); setRes(null); }}><option value="">Pilih ruas…</option>{net?.segments.map((s) => <option key={s.id} value={s.id}>{s.road_name}</option>)}</select>
      <p><button className="btn pri" disabled={!canOp || busy} onClick={() => run()}>{busy ? 'Menghitung…' : 'Jalankan simulasi'}</button>{!canOp && <span className="mu"> Khusus petugas/administrator</span>}</p>
      {err && <div className="err">{err}</div>}
      {res && <>
        <h3>Perbandingan sebelum dan sesudah penutupan: {res.road_name}</h3>
        <p><b>{res.pairs_total - res.pairs_lost}/{res.pairs_total}</b> hubungan permukiman–fasilitas masih dapat dijangkau melalui jaringan yang tersedia. {res.lost_pairs.length ? <span className="hi">{res.pairs_lost} hubungan tidak lagi terhubung dalam model; {res.lost_facility_ids.length} fasilitas kehilangan akses dari sebagian permukiman.</span> : <span className="lo">Tidak ada fasilitas yang terputus.</span>} <span className="mu">({res.facilities_still_connected}/{res.facilities_total} fasilitas tetap terhubung dari seluruh permukiman.)</span></p>
        <div className="scroll"><table><thead><tr><th>Permukiman</th><th>Fasilitas terdekat (sebelum)</th><th>Sesudah</th></tr></thead><tbody>
          {res.rows.map((r) => <tr key={r.settlement}><td>{r.settlement_name}</td><td>{r.before.facility}<div className="mu">{r.before.km} km</div></td>
            <td>{r.disconnected ? <b className="hi">Terputus</b> : <>{r.after.facility}<div className="mu">{r.after.km} km {r.detour_pct > 0 && <span className="md">(+{r.detour_pct}%)</span>}</div></>}</td></tr>)}</tbody></table></div>
        {res.lost_pairs.length > 0 && <><h3>Wilayah yang berpotensi mengalami gangguan akses</h3><p className="mu">{[...new Set(res.lost_pairs.map((l) => `${l.settlement_name} ↔ ${l.facility_name}`))].map((x, i) => <span key={i}>{x}<br /></span>)}</p></>}
        <div className="note" style={{ marginTop: 12 }}><b>Asumsi dan keterbatasan simulasi:</b><ul className="why">{res.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul></div></>}
      {!res && !err && <p className="mu">Pilih ruas pada peta atau daftar, lalu jalankan untuk melihat perubahan akses ke fasilitas penting.</p>}
    </div></div>);
}
