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

// circled numbers for dispatched-config callouts (match the authorization order)
const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];
// callout offset from the site (lat, lng delta) for the leader line
const CFG_OFFSET = [-0.0022, 0.0032];

const MAP_CSS = `
.ss-map-tip { background: rgba(2,6,23,0.85) !important; border: 1px solid rgba(56,189,248,0.35) !important;
  color: #e2e8f0 !important; border-radius: 6px !important; font: 600 10px/1.3 Inter, system-ui, sans-serif;
  padding: 2px 6px !important; box-shadow: 0 2px 8px rgba(0,0,0,0.45) !important; }
.ss-map-tip::before { border-top-color: rgba(56,189,248,0.35) !important; }
.ss-site-tip { min-width: 118px; }
.ss-site-tip .ss-site-name { font-size: 10px; font-weight: 700; color: #e2e8f0; white-space: nowrap; }
.ss-site-tip .ss-site-kpi { font-size: 9px; color: #94a3b8; margin-top: 1px; white-space: nowrap; }
.ss-site-tip .ss-site-kpi b { color: #67e8f9; font-weight: 700; }
.ss-site-tip .ss-site-cfg { font-size: 9px; font-weight: 700; color: #34d399; margin-top: 1px; white-space: nowrap; }
.ss-site-tip .ss-site-cfg::before { content: '⚡ '; }
.ss-site-tip .ss-site-name.ss-now { color: #67e8f9; }
.ss-site-badge { display: inline-block; margin-left: 4px; padding: 0 3px; border-radius: 3px;
  background: rgba(34,211,238,0.25); color: #67e8f9; font-size: 8px; font-weight: 700; vertical-align: 1px; }
/* in-place blink for map overlays: the shared ss-pulse-dot keyframes scale
   around the SVG canvas origin, which makes Leaflet halos DRIFT — override
   with a pure-opacity blink (no transform) inside the map. */
@keyframes ss-halo-blink { 0%, 100% { opacity: 0.9; } 50% { opacity: 0.12; } }
.leaflet-container .ss-pulse-dot, svg .ss-pulse-dot { animation: ss-halo-blink 1.2s ease-in-out infinite; transform: none; }
.ss-runner { font-size: 20px; line-height: 26px; text-align: center; filter: drop-shadow(0 2px 5px rgba(0,0,0,0.65)); }
.ss-runner i { display: inline-block; font-style: normal; animation: ss-runner-blink 0.9s ease-in-out infinite; }
@keyframes ss-runner-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
.ss-cfg-bubble { transform: translate(10px, -50%); background: rgba(6,78,59,0.94); color: #6ee7b7;
  border: 1px solid rgba(52,211,153,0.55); border-radius: 6px; padding: 3px 8px; white-space: normal;
  max-width: 175px; font: 700 9px/1.5 Inter, system-ui, sans-serif; box-shadow: 0 2px 8px rgba(0,0,0,0.4); }
.ss-cfg-bubble .ss-cfg-no { color: #ffffff; margin-right: 2px; }
.ss-cfg-bubble .ss-cfg-delta { display: block; color: #a7f3d0; font-weight: 600; margin-top: 1px; white-space: nowrap; }
.ss-map-marker { display: flex; align-items: center; justify-content: center; }
.ss-map-marker i { width: 12px; height: 12px; border-radius: 9999px; background: #3b82f6; border: 2px solid #bfdbfe;
  box-shadow: 0 0 10px 2px rgba(59,130,246,0.75); display: block; }
.leaflet-container { background: #0b1220; font-family: Inter, system-ui, sans-serif; }
.leaflet-control-attribution { background: rgba(2,6,23,0.6) !important; color: #64748b !important;
  font-size: 8px !important; }
.leaflet-control-attribution a { color: #94a3b8 !important; }
/* OSM standard tiles are bright — darken them to match the dark theme */
.leaflet-tile.ss-osm-dark { filter: invert(1) hue-rotate(180deg) brightness(0.86) contrast(0.92) saturate(0.55); }
`;

const MapPanel = ({ config, data, isDark, pick, progress }) => {
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
    const statusOverride = locMatch ? (data?.siteStatus || null) : null;
    // per-site live metrics + dispatched configs (bank-driven, loc-gated)
    const liveMetrics = locMatch ? (data?.metrics || null) : null;
    const liveConfigs = locMatch ? (data?.configs || null) : null;
    const fmtPct = (v) => `${Number(v).toFixed(1)}%`;
    const siteTip = (s, now) => {
        // KPIs appear only while the race is passing this site; dispatched
        // config strategies stay visible on every site that received one.
        const no = cfgOrder.get(s.id) || '';
        const m = (s.id === currentId) ? ((liveMetrics || {})[s.id] || s.metrics || null) : null;
        const cfg = (liveConfigs || {})[s.id] || s.config || null;
        const kpi = m
            ? `<div class="ss-site-kpi">${pick({ zh: `↑速率 <b>${Number(m.up).toFixed(0)}Mbps</b> · 卡顿 <b>${fmtPct(m.stall)}</b> · KQI <b>${Number(m.kqi).toFixed(0)}</b>`, en: `Up <b>${Number(m.up).toFixed(0)}Mbps</b> · Stall <b>${fmtPct(m.stall)}</b> · KQI <b>${Number(m.kqi).toFixed(0)}</b>` })}</div>`
            : '';
        const cfgLine = cfg ? `<div class="ss-site-cfg">${no || ''} ${pick({ zh: `已下发: ${cfg.zh}`, en: `Dispatched: ${cfg.en}` })}</div>` : '';
        const nameCls = now ? 'ss-site-name ss-now' : 'ss-site-name';
        const badge = now ? `<span class="ss-site-badge">${pick({ zh: '当前', en: 'NOW' })}</span>` : '';
        return `<div class="ss-site-tip"><div class="${nameCls}">${pickLabel(s.label)}${badge}</div>${kpi}${cfgLine}</div>`;
    };

    // ── "where the race is" — project sites onto the route so the checkpoint
    // the marker is currently passing can light up (走到哪、哪亮).
    const routePts = (geo && geo.route) || [];
    const routeTotal = React.useMemo(() => {
        let total = 0;
        for (let i = 1; i < routePts.length; i += 1) total += Math.hypot(routePts[i][0] - routePts[i - 1][0], routePts[i][1] - routePts[i - 1][1]);
        return total;
    }, [geo]);
    const siteDists = React.useMemo(() => {
        if (!geo || !geo.route || geo.route.length < 2 || !geo.sites) return [];
        const proj = (pt) => {
            let acc = 0;
            let best = { at: 0, d: Infinity };
            for (let i = 1; i < geo.route.length; i += 1) {
                const a = geo.route[i - 1];
                const b = geo.route[i];
                const abx = b[0] - a[0]; const aby = b[1] - a[1];
                const len2 = abx * abx + aby * aby || 1e-9;
                const t = Math.min(1, Math.max(0, ((pt[0] - a[0]) * abx + (pt[1] - a[1]) * aby) / len2));
                const px = a[0] + abx * t; const py = a[1] + aby * t;
                const dist = Math.hypot(pt[0] - px, pt[1] - py);
                if (dist < best.d) best = { at: acc + Math.hypot(abx, aby) * t, d: dist };
                acc += Math.hypot(abx, aby);
            }
            return best.at;
        };
        return geo.sites.map((s) => ({ id: s.id, at: proj(s.position) }));
    }, [geo]);
    const markerDist = (routePts.length > 1 && progress != null)
        ? (Math.min(100, Math.max(0, progress)) / 100) * routeTotal : null;
    const currentId = React.useMemo(() => {
        if (markerDist == null || !siteDists.length) return null;
        let cur = siteDists[0].id;
        siteDists.forEach(({ id, at }) => { if (at <= markerDist + 1e-6) cur = id; });
        return cur;
    }, [markerDist, siteDists]);
    // sites the race has already reached (passed or current) — only these
    // reveal their KPI/dispatch info; future sites stay name-only.
    const reachedIds = React.useMemo(() => {
        const set = new Set();
        if (markerDist == null) return set;
        siteDists.forEach(({ id, at }) => { if (at <= markerDist + 1e-6) set.add(id); });
        return set;
    }, [markerDist, siteDists]);

    // ── Leaflet map (real tiles) ──
    const mapElRef = useRef(null);
    const mapRef = useRef(null);
    const layerRef = useRef(null);
    const markerLayerRef = useRef(null);
    const cfgLayerRef = useRef(null);
    const markerRef = useRef(null);
    const [tilesFailed, setTilesFailed] = useState(false);

    useEffect(() => {
        if (!geo || !mapElRef.current || mapRef.current) return undefined;
        // key-free tile sources in failover order: Esri dark gray canvas first
        // (dark, anonymous access), then standard OSM (bright, CSS-darkened).
        // CARTO's old free dark tiles now answer "Api Required", so they are gone.
        const SOURCES = [
            {
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
                attribution: 'Tiles &copy; Esri — Esri, DeLorme, NAVTEQ', maxZoom: 16, className: '',
            },
            {
                url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19, className: 'ss-osm-dark',
            },
        ];
        let map = null;
        let layer = null;
        let srcIdx = 0;
        let errCount = 0;
        const attach = (i) => {
            if (!map) return;
            if (layer) { try { map.removeLayer(layer); } catch (e) { /* ignore */ } }
            const s = SOURCES[i];
            layer = L.tileLayer(s.url, {
                maxZoom: s.maxZoom,
                attribution: s.attribution,
                className: s.className,
                crossOrigin: true,
            });
            errCount = 0;
            layer.on('tileerror', () => {
                errCount += 1;
                if (errCount >= 4 && srcIdx < SOURCES.length - 1) { srcIdx += 1; attach(srcIdx); }
                else if (errCount >= 4) setTilesFailed(true); // all sources down → SVG fallback
            });
            layer.addTo(map);
        };
        try {
            map = L.map(mapElRef.current, {
                zoomControl: false,
                attributionControl: true,
                center: geo.center,
                zoom: geo.zoom || 13,
                scrollWheelZoom: false,
            });
            mapRef.current = map;
            layerRef.current = L.layerGroup().addTo(map);
            markerLayerRef.current = L.layerGroup().addTo(map);
            cfgLayerRef.current = L.layerGroup().addTo(map);
            attach(srcIdx);
        } catch (e) { /* map init failure → SVG fallback stays visible */ }
        return () => {
            if (mapRef.current) { try { mapRef.current.remove(); } catch (e) { /* ignore */ } }
            mapRef.current = null;
            layerRef.current = null;
            markerLayerRef.current = null;
            cfgLayerRef.current = null;
            markerRef.current = null;
        };
    }, [geo]);

    // redraw overlays whenever the location (or its geo) changes
    useEffect(() => {
        const map = mapRef.current;
        const group = layerRef.current;
        if (!map || !group || !geo) return;
        group.clearLayers();
        try {
            if (geo.route && geo.route.length > 1) {
                // progressive route lighting: the path behind the runner is
                // bright cyan; the path ahead stays gray until it is run.
                const route = geo.route;
                const buildSlices = (target) => {
                    const traveled = [route[0]];
                    const ahead = [];
                    let acc = 0;
                    for (let i = 1; i < route.length; i += 1) {
                        const a = route[i - 1];
                        const b = route[i];
                        const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
                        if (target == null || acc + d <= target) {
                            traveled.push(b);
                        } else {
                            const f = d > 0 ? Math.min(1, Math.max(0, (target - acc) / d)) : 0;
                            const mid = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
                            traveled.push(mid);
                            ahead.push(mid, b);
                        }
                        acc += d;
                    }
                    return { traveled, ahead };
                };
                const { traveled, ahead } = buildSlices(markerDist);
                if (traveled.length > 1) {
                    group.addLayer(L.polyline(traveled, { color: '#22c55e', weight: 10, opacity: 0.25 }));
                    group.addLayer(L.polyline(traveled, { color: '#22c55e', weight: 3.5, opacity: 0.95 }));
                }
                if (ahead.length > 1) {
                    group.addLayer(L.polyline(ahead, {
                        color: isDark ? '#93c5fd' : '#3b82f6', weight: 4, opacity: 0.95,
                        dashArray: '12 8', className: isDark ? 'ss-dash-flow' : undefined,
                    }));
                }
                map.fitBounds(L.latLngBounds(route), { padding: [14, 14] });
            }
            (geo.sites || []).forEach((s) => {
                const st = (statusOverride || {})[s.id] || s.status || 'idle';
                const meta = SITE_STATUS[st] || SITE_STATUS.idle;
                const now = s.id === currentId;
                if (now) {
                    group.addLayer(L.circleMarker(s.position, {
                        radius: 11, color: '#22d3ee', weight: 1.2, fillColor: '#22d3ee', fillOpacity: 0.14,
                        className: isDark ? 'ss-pulse-dot' : undefined,
                    }));
                }
                const dot = L.circleMarker(s.position, {
                    radius: now ? 7.5 : 5.5, color: now ? '#67e8f9' : '#ffffff',
                    weight: now ? 1.8 : 1.2, fillColor: meta.fill, fillOpacity: 0.95,
                });
                dot.bindTooltip(siteTip(s, now), { permanent: true, direction: 'top', offset: [0, -6], className: 'ss-map-tip', interactive: false });
                group.addLayer(dot);
            });
        } catch (e) { /* keep the base map even if an overlay fails */ }
    }, [geo, statusOverride, liveMetrics, liveConfigs, routeActive, pick, currentId, reachedIds, markerDist, isDark]);

    // dispatched-config callouts: number them ①② in dispatch order (matching
    // the authorization sequence); the before→after comparison uses the
    // metrics history the APP records in panelData (survives tab unmount):
    // with a dispatch the last history entry is the post-dispatch value, so
    // the "before" is the entry right before it (the degraded one).
    const liveMetricsHist = locMatch ? (data?.metricsHist || null) : null;
    const cfgOrder = React.useMemo(() => {
        const order = new Map();
        let no = 0;
        Object.keys(liveConfigs || {}).forEach((id) => {
            order.set(id, CIRCLED[no % CIRCLED.length]);
            no += 1;
        });
        return order;
    }, [liveConfigs]);
    const liveCfgBefore = locMatch ? (data?.cfgBefore || null) : null;
    const cfgBefore = React.useMemo(() => {
        const before = {};
        Object.keys(liveConfigs || {}).forEach((id) => {
            // frozen at dispatch time by the App (see ScenarioShowcaseApp);
            // fall back to the geo baseline when no history preceded it
            before[id] = (liveCfgBefore || {})[id]
                || (geo?.sites || []).find((s) => s.id === id)?.metrics || null;
        });
        return before;
    }, [liveConfigs, liveCfgBefore]);
    useEffect(() => {
        const map = mapRef.current;
        const group = cfgLayerRef.current;
        if (!map || !group || !geo) return;
        group.clearLayers();
        if (!geo.sites) return;
        geo.sites.forEach((s) => {
            const cfg = (liveConfigs || {})[s.id];
            if (!cfg) return;
            const no = cfgOrder.get(s.id) || CIRCLED[0];
            const before = cfgBefore[s.id];
            const after = (liveMetrics || {})[s.id] || s.metrics || null;
            const delta = (before && after)
                ? `<span class="ss-cfg-delta">${pick({
                    zh: `↑${Number(before.up).toFixed(0)}→${Number(after.up).toFixed(0)}Mbps · KQI ${Number(before.kqi).toFixed(0)}→${Number(after.kqi).toFixed(0)}`,
                    en: `Up ${Number(before.up).toFixed(0)}→${Number(after.up).toFixed(0)}Mbps · KQI ${Number(before.kqi).toFixed(0)}→${Number(after.kqi).toFixed(0)}`,
                })}</span>`
                : '';
            try {
                // leader line pulled out from the base station
                const tip = [s.position[0] + CFG_OFFSET[0], s.position[1] + CFG_OFFSET[1]];
                group.addLayer(L.polyline([s.position, tip], {
                    color: '#34d399', weight: 1, opacity: 0.75, dashArray: '2 3', interactive: false,
                }));
                group.addLayer(L.marker(tip, {
                    icon: L.divIcon({
                        className: '',
                        html: `<div class="ss-cfg-bubble"><b class="ss-cfg-no">${no}</b>${pick({ zh: `已下发: ${cfg.zh}`, en: `Dispatched: ${cfg.en}` })}${delta}</div>`,
                        iconSize: [0, 0], iconAnchor: [0, 0],
                    }),
                    interactive: false, zIndexOffset: 250,
                }));
            } catch (e) { /* ignore */ }
        });
    }, [geo, liveConfigs, pick, cfgOrder, cfgBefore, liveMetrics]);

    // moving marker (bank-driven, real coordinates)
    // moving marker — synced with the unfolding event: when a race progress
    // (0-100) is provided the marker GLIDES along the real route continuously
    // (interpolated by distance); otherwise fall back to bank markers.
    useEffect(() => {
        const map = mapRef.current;
        const group = markerLayerRef.current;
        if (!map || !group || !geo) return;
        let pos = null;
        const routeOk = geo.route && geo.route.length > 1 && progress != null;
        if (routeOk) {
            // distance-interpolate along the route polyline
            const segs = [];
            let total = 0;
            for (let i = 1; i < geo.route.length; i += 1) {
                const a = geo.route[i - 1];
                const b = geo.route[i];
                const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
                segs.push({ a, b, d });
                total += d;
            }
            let target = (Math.min(100, Math.max(0, progress)) / 100) * total;
            for (let i = 0; i < segs.length; i += 1) {
                const { a, b, d } = segs[i];
                if (target <= d || i === segs.length - 1) {
                    const f = d > 0 ? Math.min(1, Math.max(0, target / d)) : 0;
                    pos = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
                    break;
                }
                target -= d;
            }
        } else {
            const ok = rawMarker && rawMarker.lat != null && rawMarker.lng != null
                && (!rawMarker.loc || rawMarker.loc === active);
            if (ok) pos = [rawMarker.lat, rawMarker.lng];
        }
        if (!pos) {
            if (markerRef.current) { try { group.removeLayer(markerRef.current); } catch (e) { /* ignore */ } markerRef.current = null; }
            return;
        }
        try {
            if (!markerRef.current) {
                markerRef.current = L.marker(pos, {
                    icon: L.divIcon({
                        className: '',
                        html: '<div class="ss-runner"><i>🏃</i></div>',
                        iconSize: [26, 26], iconAnchor: [13, 13],
                    }),
                    zIndexOffset: 600,
                });
                group.addLayer(markerRef.current);
            } else {
                markerRef.current.setLatLng(pos);
            }
        } catch (e) { /* ignore */ }
    }, [rawMarker, geo, active, progress]);

    const hasMap = !!geo;
    // ── SVG stylized fallback base (offline-safe) ──
    const blocks = city.blocks || [];
    const roads = city.roads || [];      // secondary streets {points, w?}
    const arteries = city.arteries || []; // main roads {points, w?}
    const river = city.river || null;     // {points, label?}
    const parks = city.parks || [];       // [{points, label?}]
    const gridColor = isDark ? 'rgba(56,189,248,0.10)' : '#e4e4e7';
    const labelColor = isDark ? '#94a3b8' : '#52525b';
    const routeColor = isDark ? '#22c55e' : '#16a34a'; // traveled path: clearly green
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
            <div className="absolute inset-2 rounded-xl overflow-hidden" style={{ visibility: hasMap && !tilesFailed ? 'hidden' : 'visible' }}>
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
                                stroke={isDark ? '#93c5fd' : '#3b82f6'}
                                strokeOpacity={0.95}
                                strokeWidth={1.3}
                                strokeDasharray="2.2 1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className={isDark ? 'ss-dash-flow' : undefined}
                            />
                            {(() => {
                                // bright path behind the runner (same slicing as Leaflet)
                                const segs = [];
                                let total = 0;
                                for (let i = 1; i < route.length; i += 1) {
                                    const d = Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y);
                                    segs.push(d); total += d;
                                }
                                const target = progress != null ? (Math.min(100, Math.max(0, progress)) / 100) * total : null;
                                if (target == null || target <= 0) return null;
                                const pts = [route[0]];
                                let acc = 0;
                                for (let i = 1; i < route.length; i += 1) {
                                    const a = route[i - 1]; const b = route[i];
                                    if (acc + segs[i - 1] <= target) {
                                        pts.push(b);
                                    } else {
                                        const f = segs[i - 1] > 0 ? (target - acc) / segs[i - 1] : 0;
                                        pts.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
                                        break;
                                    }
                                    acc += segs[i - 1];
                                }
                                if (pts.length < 2) return null;
                                return (
                                    <g>
                                        <polyline
                                            points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                                            fill="none"
                                            stroke={routeColor}
                                            strokeOpacity={0.35}
                                            strokeWidth={2.6}
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                        <polyline
                                            points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                                            fill="none"
                                            stroke={routeColor}
                                            strokeWidth={0.9}
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    </g>
                                );
                            })()}
                            {route.map((p, i) => (
                                <circle key={`wp${i}`} cx={p.x} cy={p.y} r={0.55} fill={routeColor} opacity={0.85} />
                            ))}
                        </g>
                    )}
                    {sites.map((s) => {
                        const st = statusOverride ? ((statusOverride || {})[s.id] || s.status || 'idle') : (s.status || 'idle');
                        const meta = SITE_STATUS[st] || SITE_STATUS.idle;
                        // current checkpoint highlight (projection onto the SVG route)
                        let nowSvg = false;
                        if (route.length > 1 && progress != null) {
                            const segs = [];
                            let total = 0;
                            for (let i = 1; i < route.length; i += 1) {
                                const d = Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y);
                                segs.push(d); total += d;
                            }
                            const target = (Math.min(100, Math.max(0, progress)) / 100) * total;
                            const ats = sites.map((s2) => {
                                let acc = 0; let best = { id: s2.id, at: 0, d: Infinity };
                                for (let i = 1; i < route.length; i += 1) {
                                    const a = route[i - 1]; const b = route[i];
                                    const abx = b.x - a.x; const aby = b.y - a.y;
                                    const len2 = abx * abx + aby * aby || 1e-9;
                                    const t = Math.min(1, Math.max(0, ((s2.x - a.x) * abx + (s2.y - a.y) * aby) / len2));
                                    const dd = Math.hypot(s2.x - (a.x + abx * t), s2.y - (a.y + aby * t));
                                    if (dd < best.d) best = { id: s2.id, at: acc + Math.hypot(abx, aby) * t, d: dd };
                                    acc += Math.hypot(abx, aby);
                                }
                                return best;
                            });
                            let cur = ats.length ? ats[0].id : null;
                            ats.forEach((a) => { if (a.at <= target + 0.01) cur = a.id; });
                            nowSvg = s.id === cur;
                        }
                        return (
                            <g key={s.id} className="ss-fade-up">
                                {nowSvg && (
                                    <circle cx={s.x} cy={s.y} r={6.5} fill="#22d3ee" opacity={0.16} className="ss-pulse-dot" />
                                )}
                                {(st === 'bad' || (isDark && st !== 'idle')) && (
                                    <circle cx={s.x} cy={s.y} r={4.6} fill={meta.fill} opacity={isDark ? 0.14 : 0.18}
                                        className={st === 'bad' ? 'ss-pulse-dot' : undefined} />
                                )}
                                <circle cx={s.x} cy={s.y} r={nowSvg ? 2.9 : 2.1} fill={meta.fill} stroke={nowSvg ? '#67e8f9' : halo}
                                    strokeWidth={nowSvg ? 0.8 : 0.5} filter={isDark ? 'url(#ss-site-glow)' : undefined} />
                                <text x={s.x} y={s.y - 3.4} textAnchor="middle" fontSize={2.6} fontWeight={700}
                                    fill={nowSvg ? '#67e8f9' : labelColor} style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
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

            {/* real map (Leaflet + key-free tiles: Esri dark gray, OSM fallback) */}
            {hasMap && <div ref={mapElRef} className="absolute inset-2 rounded-xl overflow-hidden z-[5]" style={{ visibility: tilesFailed ? 'hidden' : 'visible' }} />}
        </div>
    );
};

export default MapPanel;
