import { useState } from 'react';
import { api, ago, STATUS_LABEL } from '../api.js';
import MapView from '../components/MapView.jsx';
import Detail from '../components/Detail.jsx';
import Icon from '../components/Icon.jsx';
import { ScoreBars, Donut } from '../components/Charts.jsx';

const KEY = { tinggi: 'hi', menengah: 'md', rendah: 'lo' };
export default function Dashboard({ user, net, prio, reports, canOp, goSim, period, theme, at }) {
  const [sel, setSel] = useState(null), [st, setSt] = useState(''), [reg, setReg] = useState(''), [q, setQ] = useState(''), [ai, setAi] = useState(''), [msg, setMsg] = useState('');
  const inPeriod = (iso) => !period || Date.now() - new Date(iso) <= period * 3600e3;
  const regionOf = (id) => net?.segments.find((s) => s.id === id)?.region_id;
  const ranked = prio.ranked.filter((r) => (!st || r.verification_status === st) && (!reg || regionOf(r.segment_id) === reg) && inPeriod(r.updated_at));
  const list = ranked.filter((r) => !q || r.road_name.toLowerCase().includes(q.toLowerCase()));
  const high = ranked.filter((r) => r.category.key === 'tinggi'), fac = new Set(high.flatMap((r) => r.affected || []));
  const active = reports.filter((r) => r.verification_status !== 'ditolak' && inPeriod(r.updated_at));
  const unv = active.filter((r) => r.verification_status === 'belum_terverifikasi').length, stale = active.filter((r) => r.stale).length, deep = ranked.filter((r) => r.depth_score === 3).length;
  const counts = { tinggi: ranked.filter((r) => r.category.key === 'tinggi').length, menengah: ranked.filter((r) => r.category.key === 'menengah').length, rendah: ranked.filter((r) => r.category.key === 'rendah').length, none: prio.noData.length };
  const item = prio.ranked.find((r) => r.segment_id === sel), seg = net?.segments.find((s) => s.id === sel);
  const regions = [...new Set((net?.segments ?? []).map((s) => s.region_id))];
  const exportCsv = async () => { try { const r = await api('/export', { raw: true }); const b = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'floodops-ringkasan.csv'; a.click(); setMsg('Ringkasan diunduh.'); } catch (e) { setMsg(e.message); } };
  const aiSum = async () => { setAi('Memproses…'); try { setAi((await api('/ai/ringkasan', { method: 'POST' })).text); } catch (e) { setAi(e.message); } };
  const K = ({ c, i, l, n, pill, pc }) => <div className="kpi" style={{ '--kc': c }}><div className="kl row" style={{ gap: 6 }}><Icon n={i} s={15} />{l}</div><div className="kn">{n}</div><span className={'pill ' + pc}>{pill}</span></div>;
  const mode = canOp ? 'score' : 'depth';
  return (<>
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="ch"><h2>Ringkasan operasi</h2><span className="mu">Terakhir diperbarui: {at ? at.toLocaleTimeString('id', { hour: '2-digit', minute: '2-digit' }) : '–'}</span></div>
      <div className="kpis">
        <K c="var(--ac)" i="file" l="Jumlah laporan aktif" n={active.length} pill={`${unv} belum terverifikasi`} pc="p-a" />
        <K c="var(--hi)" i="alert" l="Ruas prioritas tinggi" n={high.length} pill={`dari ${ranked.length} ruas bernilai`} pc="p-r" />
        {canOp ? <K c="var(--lo)" i="heart" l="Fasilitas berpotensi terganggu" n={fac.size} pill="pada ruas prioritas tinggi" pc="p-b" /> : <K c="var(--lo)" i="heart" l="Ruas genangan > 50 cm" n={deep} pill="berdasarkan laporan" pc="p-b" />}
        <K c="var(--md)" i="clock" l="Laporan kedaluwarsa" n={stale} pill="perlu diperbarui" pc="p-m" />
      </div></div>
    <div className="grid two">
      <div className="card"><div className="ch"><h2>{canOp ? 'Skor prioritas per ruas' : 'Kedalaman genangan per ruas (cm)'}</h2><span className="mu">8 teratas · klik batang untuk detail</span></div>
        {ranked.length ? <ScoreBars items={[...ranked].sort((a, b) => mode === 'score' ? b.total_score - a.total_score : b.reported_depth - a.reported_depth)} mode={mode} theme={theme} onPick={(id) => canOp && setSel(id)} /> : <p className="mu">Belum ada data untuk filter ini.</p>}
        <div className="row" style={{ marginTop: 10 }}><select className="grow" value={reg} onChange={(e) => setReg(e.target.value)} aria-label="Filter wilayah"><option value="">Semua wilayah</option>{regions.map((r) => <option key={r}>{r}</option>)}</select>
          <select className="grow" value={st} onChange={(e) => setSt(e.target.value)} aria-label="Filter status verifikasi"><option value="">Semua status</option>{Object.entries(STATUS_LABEL).filter(([k]) => k !== 'ditolak').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div></div>
      <div className="card"><div className="ch"><h2>Peta sebaran ruas</h2><span className="mu">Peta dasar © OpenStreetMap</span></div>
        <MapView net={net} ranked={ranked} selected={sel} onSelect={(id) => canOp && setSel(id)} /></div>
    </div>
    <div className="grid tri">
      <div className="card"><div className="ch"><h2>{canOp ? 'Daftar Prioritas Terbaru' : 'Laporan Terbaru'}</h2>
        {canOp && <div className="row"><button className="btn sm" onClick={exportCsv}>⬇ Ekspor</button><button className="btn sm" onClick={aiSum}>✨ Ringkasan AI</button></div>}</div>
        {canOp ? <>
          <div style={{ position: 'relative', marginBottom: 10 }}><input placeholder="Cari ruas jalan…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari ruas" /></div>
          {msg && <div className="ok">{msg}</div>}{ai && <div className="note" style={{ margin: '8px 0' }}>{ai}</div>}
          <div className="list">{list.map((r, i) => <div key={r.segment_id} className={'item' + (sel === r.segment_id ? ' on' : '')} onClick={() => setSel(r.segment_id)}>
            <div><div className="n">{i + 1}. {r.road_name}</div><span className={`badge s-${r.verification_status}`}>{STATUS_LABEL[r.verification_status]}</span> {r.stale && <span className="badge kd">Kedaluwarsa</span>}</div>
            <div className="score" style={{ color: `var(--${KEY[r.category.key]})` }}>{r.total_score}</div></div>)}
            {!list.length && <p className="mu">Tidak ada ruas yang cocok.</p>}</div>
          {prio.noData.length > 0 && <p className="mu">Data belum tersedia untuk {prio.noData.length} ruas (tidak dianggap nol).</p>}</> :
          <div className="list">{reports.filter((r) => r.verification_status !== 'ditolak').slice(0, 10).map((r) => <div key={r.id} className="item" style={{ cursor: 'default' }}>
            <div><div className="n">{r.road_name}</div><span className="mu">{r.reported_depth} cm · {ago(r.updated_at)}</span></div><span className={`badge s-${r.verification_status}`}>{STATUS_LABEL[r.verification_status]}</span></div>)}</div>}
      </div>
      <div className="card">{canOp ? (sel ? <Detail item={item} segment={seg} canSim={canOp} onSim={goSim} /> : <><h2>Detail ruas jalan</h2><p className="mu">Klik ruas pada peta, batang grafik, atau daftar prioritas untuk melihat skor, rincian indikator, dan alasan penilaian.</p></>)
        : <><h2>Tentang tampilan ini</h2><p className="mu">Sebagai Pengguna Anda dapat melihat peta, dashboard, dan memasukkan laporan kondisi jalan. Skor prioritas, penjelasan skor, simulasi, dan ekspor tersedia untuk Petugas Penanganan Banjir.</p><button className="btn pri" onClick={() => document.querySelector('.topbar .btn.pri').click()}>Buat laporan</button></>}</div>
      <div className="card"><div className="ch"><h2>Distribusi kategori</h2></div><Donut counts={counts} theme={theme} />
        <p className="mu" style={{ marginTop: 12 }}>Warna menunjukkan kategori: merah tinggi, kuning menengah, biru lebih rendah.</p></div>
    </div>
    <p className="mu">FloodOps merupakan alat bantu analisis untuk mendukung pengambilan keputusan berdasarkan data yang tersedia. Skor prioritas bukan keputusan resmi penanganan bencana dan tidak menggantikan sistem peringatan dini.</p>
  </>);
}
