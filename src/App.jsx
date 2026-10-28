import { useEffect, useState, useCallback } from 'react';
import { api, setToken } from './api.js';
import Icon from './components/Icon.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Reports from './pages/Reports.jsx';
import Simulation from './pages/Simulation.jsx';
import DataBanjir from './pages/DataBanjir.jsx';
import Admin from './pages/Admin.jsx';
import Lapor from './pages/Lapor.jsx';
import { Landing, PortalLogin } from './pages/Portal.jsx';

const useHash = () => { const [h, setH] = useState(location.hash || '#/'); useEffect(() => { const f = () => setH(location.hash || '#/'); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []); return h; };
const ROLE = { pengguna: 'Pengguna', petugas: 'Petugas Penanganan Banjir', admin: 'Administrator' };
// Menu per peran mengikuti use case: Pengguna = peta/dashboard + input laporan; Petugas = + prioritas, simulasi, ekspor; Admin = + pengelolaan data
const MENU = (role) => [
  ['MENU UTAMA', [['dash', 'grid', 'Dashboard Utama'], ['lap', 'file', role === 'pengguna' ? 'Input Laporan' : 'Dashboard Petugas']]],
  ['ANALISIS', [...(role !== 'pengguna' ? [['sim', 'route', 'Simulasi Penutupan']] : []), ['data', 'chart', 'Data Banjir']]],
  ...(role === 'admin' ? [['DUKUNGAN', [['adm', 'settings', 'Pengelolaan Data']]]] : [])
];

export default function App() {
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('fo_user')); } catch { return null; } });
  const [tab, setTab] = useState('dash'), [net, setNet] = useState(null), [prio, setPrio] = useState({ ranked: [], noData: [] }), [reports, setReports] = useState([]), [sim, setSim] = useState(null), [err, setErr] = useState(''), [at, setAt] = useState(null), [period, setPeriod] = useState('');
  const [theme, setTheme] = useState(() => localStorage.getItem('fo_theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const hash = useHash();
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('fo_theme', theme); }, [theme]);
  const login = (u) => { localStorage.setItem('fo_user', JSON.stringify(u)); location.hash = '#/'; setTab('dash'); setUser(u); };
  const logout = () => { setToken(''); localStorage.removeItem('fo_user'); location.hash = '#/'; setUser(null); };
  const refresh = useCallback(async () => {
    try { const [n, p, r] = await Promise.all([api('/network'), api('/priority'), api('/reports')]); setNet(n); setPrio(p); setReports(r); setAt(new Date()); setErr(''); }
    catch (e) { setErr(e.message + ' – menampilkan data terakhir jika tersedia.'); }
  }, []);
  useEffect(() => { if (user) refresh(); }, [user, refresh]);
  if (!user) {
    if (hash.startsWith('#/lapor')) return <Lapor />;
    if (hash.startsWith('#/masuk/')) return <PortalLogin portal={hash.split('/')[2]} onLogin={login} />;
    return <Landing />;
  }
  const canOp = user.role !== 'pengguna', menu = MENU(user.role), flat = menu.flatMap(([, i]) => i);
  const cur = flat.find((t) => t[0] === tab) || flat[0], pending = reports.filter((r) => r.verification_status === 'belum_terverifikasi').length;
  const goSim = (id) => { setSim(id); setTab('sim'); };
  const P = { user, net, prio, reports, refresh, canOp, goSim, period, theme, at };
  return (<div className="shell">
    <aside className="side">
      <div className="brand"><img src="/logo.png" alt="" />FloodOps</div>
      {menu.map(([g, items]) => <div key={g} style={{ display: 'contents' }}><div className="grp">{g}</div>{items.map(([k, i, n]) => <button key={k} className={'nav' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}><Icon n={i} /><span>{n}</span></button>)}</div>)}
      <div className="sidecard"><b>Catatan penting</b>FloodOps adalah alat bantu analisis. Skor dan simulasi bukan keputusan resmi penanganan bencana.</div>
      <div className="sw"><span>Mode gelap</span><button className={'tg' + (theme === 'dark' ? ' on' : '')} aria-label="Ubah mode gelap" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}><i /></button></div>
      <div className="me"><div className="av">{user.name[0]}</div><div style={{ flex: 1, minWidth: 0 }}><b>{user.name}</b><div className="mu">{ROLE[user.role]}</div></div><button className="btn sm ic" title="Keluar" onClick={logout}><Icon n="logout" s={15} /></button></div>
    </aside>
    <div className="page">
      <div className="topbar"><div><h1>{cur[2]}</h1><div className="sub">{ROLE[user.role]} · wilayah uji coba Kota Bandung (data sintetis/ilustratif)</div></div>
        <div className="tools">
          <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Periode laporan" style={{ width: 'auto' }}><option value="">Semua waktu</option><option value="6">6 jam terakhir</option><option value="24">24 jam terakhir</option><option value="72">3 hari terakhir</option></select>
          <button className="btn ic" title="Muat ulang data" onClick={refresh}><Icon n="refresh" /></button>
          {canOp && <button className="btn ic" title="Laporan menunggu verifikasi" onClick={() => setTab('lap')}><Icon n="bell" />{pending > 0 && <span className="dot">{pending}</span>}</button>}
          <button className="btn pri" onClick={() => setTab('lap')}><Icon n="plus" s={16} />Laporan baru</button>
          <button className="btn mob" onClick={logout} title="Keluar"><Icon n="logout" s={16} /></button>
        </div></div>
      <main className="main">
        {err && <div className="note" style={{ marginBottom: 14 }}>{err}</div>}
        {tab === 'dash' && <Dashboard {...P} />}{tab === 'lap' && <Reports {...P} />}{tab === 'sim' && canOp && <Simulation {...P} initial={sim} />}{tab === 'data' && <DataBanjir />}{tab === 'adm' && user.role === 'admin' && <Admin {...P} />}
      </main></div></div>);
}
