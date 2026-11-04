// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/** Map panel — a REAL map (Leaflet + free OSM/CARTO dark tiles, no API key)
 *  with the assurance overlay: preset locations (city chips), the event route,
 *  checkpoint/venue sites with live statuses and a moving marker. Each
 *  location carries a `geo` block (center / route / sites in lat,lng) plus a
 *  stylized SVG city map that stays as the offline fallback when tiles or the
 *  network are unavailable. */
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { SITE_STATUS } from '../../colors.js';

const W = 100;
const H = 62;

const MAP_CSS = `
.ss-map-tip { background: rgba(2,6,23,0.85) !important; border: 1px solid rgba(56,189,248,0.35) !important;
  color: #e2e8f0 !important; border-radius: 6px !important; font: 600 10px/1.3 Inter, system-ui, sans-serif;
  padding: 2px 6px !important; box-shadow: 0 2px 8px rgba(0,0,0,0.45) !important; }
.ss-map-tip::before { border-top-color: rgba(56,189,248,0.35) !important; }
.ss-map-marker { display: flex; align-items: center; justify-content: center; }
.ss-map-marker i { width: 12px; height: 12px; border-radius: 9999px; background: #3b82f6; border: 2px solid #bfdbfe;
  box-shadow: 0 0 10px 2px rgba(59,130,246,0.75); display: block; }
.leaflet-container { background: #0b1220; font-family: Inter, system-ui, sans-serif; }
.leaflet-control-attribution { background: rgba(2,6,23,0.6) !important; color: #64748b !important;
  font-size: 8px !important; }
.leaflet-control-attribution a { color: #94a3b8 !important; }
`;

const MapPanel = ({ config, data, isDark, pick }) => {
    const pickLabel = (v) => (pick ? pick(v) : (typeof v === 'string' ? v : (v?.zh || v?.en || '')));
    // locations: the base config is the default city; altLocations carry the rest.
    const baseId = config.locId || 'default';
    const alt = config.altLocations || [];
    const locs = [{ id: baseId, label: config.locLabel }, ...alt.map((a) => ({ id: a.id, label: a.label }))];
    const [sel, setSel] = useState(null);
    const remoteLoc = data && data.location;
    useEffect(() => { setSel(null); }, [remoteLoc]); // a new intent resets the chip override
    const active = sel || remoteLoc || baseId;
    const altCfg = alt.find((a) => a.id === active);
    const sites = (altCfg ? altCfg.sites : config.sites) || [];
    const route = (altCfg ? altCfg.route : config.route) || [];
    const city = (altCfg ? altCfg.city : config.city) || {};
    const geo = (altCfg ? altCfg.geo : config.geo) || null;
    const rawMarker = data?.marker || null;
    const routeActive = data?.routeActive || false;
    // live data (marker / site status) is tagged with a location — only apply
    // it when it belongs to the city currently shown.
    const locMatch = !data || !data.loc || data.loc === active;
    const statusOverride = locMatch ? (data?.siteStatus || {}) : {};

    // ── Leaflet map (real tiles) ──
    const mapElRef = useRef(null);
    const mapRef = useRef(null);
    const layerRef = useRef(null);
    const markerRef = useRef(null);

    useEffect(() => {
        if (!geo || !mapElRef.current || mapRef.current) return undefined;
        try {
            const map = L.map(mapElRef.current, {
                zoomControl: false,
                attributionControl: true,
                center: geo.center,
                zoom: geo.zoom || 13,
                scrollWheelZoom: false,
            });
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                subdomains: 'abcd',
                maxZoom: 19,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
            }).addTo(map);
            mapRef.current = map;
            layerRef.current = L.layerGroup().addTo(map);
        } catch (e) { /* tile/network failure → SVG fallback stays visible */ }
        return () => {
            if (mapRef.current) { try { mapRef.current.remove(); } catch (e) { /* ignore */ } }
            mapRef.current = null;
            layerRef.current = null;
            markerRef.current = null;
        };
    }, [geo]);

    // redraw overlays whenever the location (or its geo) changes
    useEffect(() => {
        const map = mapRef.current;
        const group = layerRef.current;
        if (!map || !group || !geo) return;
        group.clearLayers();
        markerRef.current = null;
        try {
            if (geo.route && geo.route.length > 1) {
                const line = L.polyline(geo.route, { color: '#22d3ee', weight: 10, opacity: 0.22 });
                group.addLayer(line);
                group.addLayer(L.polyline(geo.route, {
                    color: routeActive ? '#22d3ee' : 'rgba(56,189,248,0.6)', weight: 3.5,
                    opacity: 0.95, dashArray: '6 6', className: isDark ? 'ss-dash-flow' : undefined,
                }));
                map.fitBounds(line.getBounds(), { padding: [14, 14] });
            }
            (geo.sites || []).forEach((s) => {
                const st = statusOverride[s.id] || s.status || 'idle';
                const meta = SITE_STATUS[st] || SITE_STATUS.idle;
                const dot = L.circleMarker(s.position, {
                    radius: 5.5, color: '#ffffff', weight: 1.2, fillColor: meta.fill, fillOpacity: 0.95,
                });
                dot.bindTooltip(pickLabel(s.label), { permanent: true, direction: 'top', offset: [0, -6], className: 'ss-map-tip' });
                group.addLayer(dot);
            });
        } catch (e) { /* keep the base map even if an overlay fails */ }
    }, [geo, statusOverride, routeActive, pick]);

    // moving marker (bank-driven, real coordinates)
    useEffect(() => {
        const map = mapRef.current;
        const group = layerRef.current;
        if (!map || !group || !geo) return;
        const ok = rawMarker && rawMarker.lat != null && rawMarker.lng != null
            && (!rawMarker.loc || rawMarker.loc === active);
        if (!ok) {
            if (markerRef.current) { try { group.removeLayer(markerRef.current); } catch (e) { /* ignore */ } markerRef.current = null; }
            return;
        }
        try {
            if (!markerRef.current) {
                markerRef.current = L.marker([rawMarker.lat, rawMarker.lng], {
                    icon: L.divIcon({ className: '', html: '<div class="ss-map-marker"><i></i></div>', iconSize: [14, 14], iconAnchor: [7, 7] }),
                    zIndexOffset: 500,
                });
                group.addLayer(markerRef.current);
            } else {
                markerRef.current.setLatLng([rawMarker.lat, rawMarker.lng]);
            }
        } catch (e) { /* ignore */ }
    }, [rawMarker, geo, active]);

    const hasMap = !!geo;
    // ── SVG stylized fallback base (offline-safe) ──
    const blocks = city.blocks || [];
    const roads = city.roads || [];      // secondary streets {points, w?}
    const arteries = city.arteries || []; // main roads {points, w?}
    const river = city.river || null;     // {points, label?}
    const parks = city.parks || [];       // [{points, label?}]
    const gridColor = isDark ? 'rgba(56,189,248,0.10)' : '#e4e4e7';
    const labelColor = isDark ? '#94a3b8' : '#52525b';
    const routeColor = isDark ? (routeActive ? '#22d3ee' : 'rgba(56,189,248,0.35)') : (routeActive ? '#06b6d4' : '#d4d4d8');
    const halo = isDark ? '#09090B' : '#ffffff';
    const baseFill = isDark ? 'rgba(30,41,59,0.42)' : 'rgba(244,244,245,0.9)';
    const blockFill = isDark ? 'rgba(148,163,184,0.07)' : '#ececec';
    const blockStroke = isDark ? 'rgba(148,163,184,0.10)' : '#e0e0e0';
    const roadColor = isDark ? 'rgba(148,163,184,0.20)' : '#ffffff';
    const arteryColor = isDark ? 'rgba(203,213,225,0.34)' : '#fafafa';
    const riverFill = isDark ? 'rgba(56,189,248,0.22)' : 'rgba(96,165,250,0.35)';
    const riverCore = isDark ? 'rgba(125,211,252,0.20)' : 'rgba(147,197,253,0.45)';
    const parkFill = isDark ? 'rgba(34,197,94,0.13)' : 'rgba(134,239,172,0.55)';
    const parkStroke = isDark ? 'rgba(34,197,94,0.22)' : 'rgba(74,222,128,0.6)';

    return (
        <div className="h-full w-full p-2 relative">
            <style>{MAP_CSS}</style>
            {/* location switcher (city chips) */}
            {locs.length > 1 && (
                <div className="absolute top-2.5 right-3 z-[900] flex items-center gap-1">
                    {locs.map((l) => (
                        <button
                            key={l.id}
                            type="button"
                            onClick={() => setSel(l.id)}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${
                                l.id === active
                                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40'
                                    : 'bg-slate-900/70 text-zinc-300 border-white/10 hover:text-white'
                            }`}
                        >
                            {pickLabel(l.label)}
                        </button>
                    ))}
                </div>
            )}

            {/* SVG stylized base — visible until (and if) the real map is ready */}
            <div className="absolute inset-2 rounded-xl overflow-hidden" style={{ visibility: hasMap ? 'hidden' : 'visible' }}>
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
                    <defs>
                        <filter id="ss-site-glow" x="-120%" y="-120%" width="340%" height="340%">
                            <feGaussianBlur stdDeviation="1.6" result="b" />
                            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                    </defs>
                    <rect x={0} y={0} width={W} height={H} rx={2.4} fill={baseFill} />
                    {blocks.map((b, i) => (
                        <rect key={`bl${i}`} x={b.x} y={b.y} width={b.w} height={b.h} rx={0.5}
                            fill={blockFill} stroke={blockStroke} strokeWidth={0.15} />
                    ))}
                    {parks.map((p, i) => (
                        <g key={`pk${i}`}>
                            <polygon points={p.points} fill={parkFill} stroke={parkStroke} strokeWidth={0.18} />
                            {p.label ? (
                                <text x={p.lx} y={p.ly} textAnchor="middle" fontSize={2.1} fontWeight={600}
                                    fill={isDark ? 'rgba(134,239,172,0.65)' : '#166534'}
                                    style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                                    {pickLabel(p.label)}
                                </text>
                            ) : null}
                        </g>
                    ))}
                    {river ? (
                        <g>
                            <polyline points={river.points} fill="none" stroke={riverFill} strokeWidth={river.w || 6} strokeLinecap="round" />
                            <polyline points={river.points} fill="none" stroke={riverCore} strokeWidth={(river.w || 6) * 0.45} strokeLinecap="round" />
                            {river.label ? (
                                <text x={river.lx} y={river.ly} textAnchor="middle" fontSize={2.1} fontWeight={600}
                                    fill={isDark ? 'rgba(125,211,252,0.6)' : '#1d4ed8'}
                                    style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                                    {pickLabel(river.label)}
                                </text>
                            ) : null}
                        </g>
                    ) : null}
                    {roads.map((r, i) => (
                        <polyline key={`rd${i}`} points={r.points} fill="none" stroke={roadColor}
                            strokeWidth={r.w || 1.2} strokeLinecap="round" />
                    ))}
                    {arteries.map((r, i) => (
                        <polyline key={`ar${i}`} points={r.points} fill="none" stroke={arteryColor}
                            strokeWidth={r.w || 2.2} strokeLinecap="round" />
                    ))}
                    {Array.from({ length: Math.floor(W / 10) + 1 }, (_, i) => (
                        <line key={`v${i}`} x1={i * 10} y1={0} x2={i * 10} y2={H} stroke={gridColor} strokeWidth={0.25} />
                    ))}
                    {Array.from({ length: Math.floor(H / 10) + 1 }, (_, i) => (
                        <line key={`h${i}`} x1={0} y1={i * 10} x2={W} y2={i * 10} stroke={gridColor} strokeWidth={0.25} />
                    ))}
                    {route.length > 1 && (
                        <g>
                            <polyline
                                points={route.map((p) => `${p.x},${p.y}`).join(' ')}
                                fill="none"
                                stroke={routeColor}
                                strokeOpacity={0.35}
                                strokeWidth={2.6}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            <polyline
                                points={route.map((p) => `${p.x},${p.y}`).join(' ')}
                                fill="none"
                                stroke={routeColor}
                                strokeWidth={0.9}
                                strokeDasharray="2 1.4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className={isDark ? 'ss-dash-flow' : undefined}
                            />
                            {route.map((p, i) => (
                                <circle key={`wp${i}`} cx={p.x} cy={p.y} r={0.55} fill={routeColor} opacity={0.85} />
                            ))}
                        </g>
                    )}
                    {sites.map((s) => {
                        const st = statusOverride[s.id] || s.status || 'idle';
                        const meta = SITE_STATUS[st] || SITE_STATUS.idle;
                        return (
                            <g key={s.id} className="ss-fade-up">
                                {(st === 'bad' || (isDark && st !== 'idle')) && (
                                    <circle cx={s.x} cy={s.y} r={4.6} fill={meta.fill} opacity={isDark ? 0.14 : 0.18}
                                        className={st === 'bad' ? 'ss-pulse-dot' : undefined} />
                                )}
                                <circle cx={s.x} cy={s.y} r={2.1} fill={meta.fill} stroke={halo} strokeWidth={0.5} filter={isDark ? 'url(#ss-site-glow)' : undefined} />
                                <text x={s.x} y={s.y - 3.4} textAnchor="middle" fontSize={2.6} fontWeight={700}
                                    fill={labelColor} style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                                    {pickLabel(s.label)}
                                </text>
                            </g>
                        );
                    })}
                    {rawMarker && rawMarker.x != null && (!rawMarker.loc || rawMarker.loc === active) && (
                        <g className="ss-marker">
                            <circle cx={rawMarker.x} cy={rawMarker.y} r={3.4} fill="none" stroke="#3b82f6" strokeWidth={0.55} className="ss-pulse-dot" />
                            <circle cx={rawMarker.x} cy={rawMarker.y} r={1.15} fill="#3b82f6" filter={isDark ? 'url(#ss-site-glow)' : undefined} />
                        </g>
                    )}
                </svg>
            </div>

            {/* real map (Leaflet + OSM/CARTO dark tiles, no API key) */}
            {hasMap && <div ref={mapElRef} className="absolute inset-2 rounded-xl overflow-hidden z-[5]" />}
        </div>
    );
};

export default MapPanel;
