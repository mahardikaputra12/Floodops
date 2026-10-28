import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
const COLOR = { tinggi: '#e5484d', menengah: '#f59e0b', rendah: '#2f80ed', none: '#94a3b8' };
const FAC = { rumah_sakit: ['R', '#e5484d'], puskesmas: ['P', '#0b6bcb'], sekolah: ['S', '#8b5cf6'], pusat_evakuasi: ['E', '#0f9d8a'] };

// Peta Leaflet + OpenStreetMap: ruas diwarnai menurut kategori prioritas, ketebalan menurut kedalaman genangan.
export default function MapView({ net, ranked = [], selected, onSelect, closed, lostFacilities = [] }) {
  const el = useRef(), map = useRef(), layer = useRef(), fitted = useRef(false);
  useEffect(() => {
    map.current = L.map(el.current).setView([-6.935, 107.63], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => map.current.remove();
  }, []);
  useEffect(() => {
    if (!net) return;
    const g = layer.current; g.clearLayers();
    const by = Object.fromEntries(ranked.map((r) => [r.segment_id, r]));
    const pts = [];
    net.segments.forEach((s) => {
      const a = net.nodes[s.a], b = net.nodes[s.b], r = by[s.id], isClosed = closed === s.id;
      const ll = [[a.lat, a.lng], [b.lat, b.lng]]; pts.push(...ll);
      const line = L.polyline(ll, { color: isClosed ? '#111827' : COLOR[r?.category.key ?? 'none'], weight: r ? 4 + r.depth_score * 2 : 4, opacity: selected === s.id ? 1 : 0.8, dashArray: isClosed ? '2 9' : null, lineCap: 'round' }).addTo(g);
      line.bindTooltip(`${s.road_name}${r ? (r.total_score != null ? ` · skor ${r.total_score}` : ` · ${r.category.label}`) : ' · data belum tersedia'}`, { sticky: true });
      line.on('click', () => onSelect?.(s.id));
      if (selected === s.id) L.polyline(ll, { color: '#fff', weight: 2, dashArray: '1 6', interactive: false }).addTo(g);
      if (isClosed) L.marker([(a.lat + b.lat) / 2, (a.lng + b.lng) / 2], { interactive: false, icon: L.divIcon({ className: '', html: '<div class="pin" style="background:#111827">✕</div>', iconSize: [22, 22], iconAnchor: [11, 11] }) }).addTo(g);
    });
    Object.values(net.nodes).forEach((n) => L.circleMarker([n.lat, n.lng], { radius: n.settlement ? 6 : 4, color: '#fff', weight: 2, fillColor: n.settlement ? '#0b6bcb' : '#475569', fillOpacity: 1 }).bindTooltip(n.name + (n.settlement ? ' (permukiman)' : '')).addTo(g));
    net.facilities.forEach((f, i) => {
      const n = net.nodes[f.node], [t, c] = FAC[f.facility_type] || ['?', '#555'], lost = lostFacilities.includes(f.id);
      L.marker([n.lat + 0.0022 + (i % 2) * 0.0004, n.lng + 0.0022], { icon: L.divIcon({ className: '', html: `<div class="pin" style="background:${lost ? '#e5484d' : c};${lost ? 'outline:3px solid #e5484d55' : ''}">${t}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] }) }).bindTooltip(f.facility_name + (lost ? ' – akses terputus (simulasi)' : '')).addTo(g);
    });
    if (!fitted.current && pts.length) { map.current.fitBounds(pts, { padding: [24, 24] }); fitted.current = true; }
  }, [net, ranked, selected, closed, lostFacilities.join()]);
  return (<>
    <div ref={el} className="map" />
    <div className="legend">
      <span><i style={{ background: COLOR.tinggi }} />Prioritas tinggi</span><span><i style={{ background: COLOR.menengah }} />Menengah</span><span><i style={{ background: COLOR.rendah }} />Lebih rendah</span><span><i style={{ background: COLOR.none }} />Data belum tersedia</span>
      <span>● Permukiman</span><span>R RS · P Puskesmas · S Sekolah · E Evakuasi</span><span>Garis tebal = genangan lebih dalam</span>
    </div></>);
}
