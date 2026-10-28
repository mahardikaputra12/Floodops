import { useEffect, useState } from 'react';
import { api, ago, STATUS_LABEL } from '../api.js';

export default function Reports({ net, canOp, refresh, reports: all }) {
  const [f, setF] = useState({ status: '', min: '', hours: '', source: '' }), [list, setList] = useState(all), [msg, setMsg] = useState(null);
  const [n, setN] = useState({ road_segment_id: '', reported_depth: 30, description: '', photo_url: '', old: false });
  const [audit, setAudit] = useState([]);
  const load = async () => { const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString(); try { setList(await api('/reports' + (q ? '?' + q : ''))); } catch (e) { setMsg({ e: e.message }); } };
  useEffect(() => { load(); }, [f, all]);
  useEffect(() => { if (canOp) api('/audit').then(setAudit).catch(() => {}); }, [all]);
  const act = async (id, action) => { try { await api('/reports/' + id, { method: 'PATCH', body: { action } }); await refresh(); setMsg({ o: 'Status laporan diperbarui.' }); } catch (e) { setMsg({ e: e.message }); } };
  const submit = async (e) => { e.preventDefault();
    try { await api('/reports', { method: 'POST', body: { ...n, road_segment_id: +n.road_segment_id, reported_at: n.old ? new Date(Date.now() - 30 * 3600e3).toISOString() : undefined } });
      setMsg({ o: 'Laporan terkirim dengan status belum terverifikasi.' }); setN({ ...n, description: '', photo_url: '' }); refresh(); } catch (x) { setMsg({ e: x.message }); } };
  return (<div className="grid two">
    <div className="card"><h2>Daftar laporan dan riwayat tindakan</h2>
      <div className="row" style={{ margin: '10px 0' }}>
        <select className="grow" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">Semua status</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input className="grow" type="number" min="0" placeholder="Min. kedalaman (cm)" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} />
        <select className="grow" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })}><option value="">Semua waktu</option><option value="6">6 jam terakhir</option><option value="24">24 jam terakhir</option><option value="72">3 hari terakhir</option></select>
        <select className="grow" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}><option value="">Semua sumber</option><option value="warga">Warga</option><option value="pengguna">Pengguna</option><option value="petugas">Petugas</option><option value="sintetis">Data uji</option></select></div>
      {canOp && <div className="row" style={{ marginBottom: 8 }}><button className="btn sm" onClick={() => setF({ status: 'belum_terverifikasi', min: '', hours: '', source: 'warga' })}>📣 Antrean laporan warga ({all.filter((r) => r.source_type === 'warga' && r.verification_status === 'belum_terverifikasi').length})</button><button className="btn sm" onClick={() => setF({ status: '', min: '', hours: '', source: '' })}>Reset filter</button></div>}
      <div className="scroll"><table><thead><tr><th>Ruas &amp; catatan</th><th>cm</th><th>Status</th><th>Pembaruan</th>{canOp && <th>Aksi</th>}</tr></thead><tbody>
        {list.map((r) => <tr key={r.id}><td><b>{r.road_name}</b><div className="mu">{r.description} · {r.source_type === 'warga' ? <span className="badge kd">Warga {r.tracking_code}</span> : r.source_type}{r.reporter_contact ? ` · kontak: ${r.reporter_contact}` : ''}{r.photo_url ? <> · <a href={r.photo_url} target="_blank" rel="noreferrer noopener">foto</a></> : null}</div></td><td>{r.reported_depth}</td>
          <td><span className={`badge s-${r.verification_status}`}>{STATUS_LABEL[r.verification_status]}</span> {r.stale && <span className="badge kd">Kedaluwarsa</span>}</td><td>{ago(r.updated_at)}</td>
          {canOp && <td style={{ whiteSpace: 'nowrap' }}>{r.verification_status !== 'ditolak' && <><button className="btn sm" onClick={() => act(r.id, 'verify')}>Verifikasi</button> <button className="btn sm danger" onClick={() => act(r.id, 'reject')}>Tolak</button> <button className="btn sm" onClick={() => act(r.id, 'refresh')}>Perbarui</button></>}</td>}</tr>)}
        {!list.length && <tr><td colSpan="5" className="mu">Tidak ada laporan.</td></tr>}</tbody></table></div>
      {canOp && <><h3>Riwayat tindakan petugas</h3><div className="list" style={{ maxHeight: 180 }}>{audit.slice(0, 12).map((a) => <div key={a.id} className="mu" style={{ padding: '4px 8px' }}>{a.user_name} · {a.action} #{a.object_id} · {ago(a.created_at)}</div>)}</div></>}
    </div>
    <div className="card"><h2>Input laporan kondisi jalan</h2>
      <form onSubmit={submit}><label>Ruas jalan</label><select required value={n.road_segment_id} onChange={(e) => setN({ ...n, road_segment_id: e.target.value })}><option value="">Pilih ruas…</option>{net?.segments.map((s) => <option key={s.id} value={s.id}>{s.road_name}</option>)}</select>
        <label>Kedalaman genangan (cm)</label><input type="number" required min="0" max="300" value={n.reported_depth} onChange={(e) => setN({ ...n, reported_depth: e.target.value })} />
        <label>Catatan</label><textarea rows="3" maxLength="200" value={n.description} onChange={(e) => setN({ ...n, description: e.target.value })} placeholder="Kondisi di lapangan" />
        <label>Tautan foto (opsional)</label><input type="url" placeholder="https://…" value={n.photo_url} onChange={(e) => setN({ ...n, photo_url: e.target.value })} />
        <label className="row" style={{ cursor: 'pointer' }}><input type="checkbox" style={{ width: 'auto' }} checked={n.old} onChange={(e) => setN({ ...n, old: e.target.checked })} /> Catat sebagai pengamatan 30 jam lalu (uji data kedaluwarsa)</label>
        <button className="btn pri" style={{ marginTop: 14 }}>Kirim laporan</button></form>
      {msg?.o && <div className="ok">{msg.o}</div>}{msg?.e && <div className="err">{msg.e}</div>}
      <p className="mu" style={{ marginTop: 12 }}>Waktu laporan dicatat otomatis. Laporan baru berstatus belum terverifikasi sampai diperiksa dan diverifikasi oleh petugas.</p></div>
  </div>);
}
