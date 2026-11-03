// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/** Map panel — a stylized CITY MAP (streets, blocks, river, parks) with live
 *  assurance overlay: sites (cells / venues) with statuses, the event route
 *  and a moving marker. Multiple preset LOCATIONS (city maps) can be declared;
 *  a chip switcher selects one and customer intents auto-switch it.
 *  Config-driven city layers, no external map tiles. */
import React, { useEffect, useState } from 'react';
import { SITE_STATUS } from '../../colors.js';

const W = 100;
const H = 62;

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
    const blocks = city.blocks || [];
    const roads = city.roads || [];      // secondary streets {points, w?}
    const arteries = city.arteries || []; // main roads {points, w?}
    const river = city.river || null;     // {points, label?}
    const parks = city.parks || [];       // [{points, label?}]
    // live data (marker / site status) is tagged with a location — only apply
    // it when it belongs to the city currently shown.
    const locMatch = !data || !data.loc || data.loc === active;
    const statusOverride = locMatch ? (data?.siteStatus || {}) : {};
    const rawMarker = data?.marker || null;
    const marker = rawMarker && (!rawMarker.loc || rawMarker.loc === active) ? rawMarker : null;
    const routeActive = data?.routeActive || false;

    const gridColor = isDark ? 'rgba(56,189,248,0.10)' : '#e4e4e7';
    const labelColor = isDark ? '#94a3b8' : '#52525b';
    const routeColor = isDark ? (routeActive ? '#22d3ee' : 'rgba(56,189,248,0.35)') : (routeActive ? '#06b6d4' : '#d4d4d8');
    const halo = isDark ? '#09090B' : '#ffffff';
    // map base palette
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
            {/* location switcher (city chips) */}
            {locs.length > 1 && (
                <div className="absolute top-2.5 right-3 z-10 flex items-center gap-1">
                    {locs.map((l) => (
                        <button
                            key={l.id}
                            type="button"
                            onClick={() => setSel(l.id)}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors ${
                                l.id === active
                                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40'
                                    : 'bg-white/5 text-zinc-400 border-white/10 hover:text-zinc-200'
                            }`}
                        >
                            {pickLabel(l.label)}
                        </button>
                    ))}
                </div>
            )}
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
                <defs>
                    <filter id="ss-site-glow" x="-120%" y="-120%" width="340%" height="340%">
                        <feGaussianBlur stdDeviation="1.6" result="b" />
                        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                </defs>

                {/* city base */}
                <rect x={0} y={0} width={W} height={H} rx={2.4} fill={baseFill} />

                {/* city blocks (between the streets) */}
                {blocks.map((b, i) => (
                    <rect key={`bl${i}`} x={b.x} y={b.y} width={b.w} height={b.h} rx={0.5}
                        fill={blockFill} stroke={blockStroke} strokeWidth={0.15} />
                ))}

                {/* parks */}
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

                {/* river */}
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

                {/* streets */}
                {roads.map((r, i) => (
                    <polyline key={`rd${i}`} points={r.points} fill="none" stroke={roadColor}
                        strokeWidth={r.w || 1.2} strokeLinecap="round" />
                ))}
                {/* main arteries */}
                {arteries.map((r, i) => (
                    <polyline key={`ar${i}`} points={r.points} fill="none" stroke={arteryColor}
                        strokeWidth={r.w || 2.2} strokeLinecap="round" />
                ))}

                {/* faint engineering grid on top of the base */}
                {Array.from({ length: Math.floor(W / 10) + 1 }, (_, i) => (
                    <line key={`v${i}`} x1={i * 10} y1={0} x2={i * 10} y2={H} stroke={gridColor} strokeWidth={0.25} />
                ))}
                {Array.from({ length: Math.floor(H / 10) + 1 }, (_, i) => (
                    <line key={`h${i}`} x1={0} y1={i * 10} x2={W} y2={i * 10} stroke={gridColor} strokeWidth={0.25} />
                ))}

                {/* route */}
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

                {/* sites */}
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
                            <text
                                x={s.x}
                                y={s.y - 3.4}
                                textAnchor="middle"
                                fontSize={2.6}
                                fontWeight={700}
                                fill={labelColor}
                                style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
                            >
                                {pickLabel(s.label)}
                            </text>
                        </g>
                    );
                })}

                {/* moving marker (e.g. the assurance focus) */}
                {marker && (
                    <g className="ss-marker">
                        <circle cx={marker.x} cy={marker.y} r={3.4} fill="none" stroke="#3b82f6" strokeWidth={0.55} className="ss-pulse-dot" />
                        <circle cx={marker.x} cy={marker.y} r={1.15} fill="#3b82f6" filter={isDark ? 'url(#ss-site-glow)' : undefined} />
                    </g>
                )}
            </svg>

            {/* legend */}
            <div className="flex items-center gap-3 px-2 pb-1 flex-wrap">
                {Object.keys(statusOverride).length > 0 || sites.some((s) => s.status && s.status !== 'idle')
                    ? Object.entries(SITE_STATUS).map(([k, meta]) => (
                        <span key={k} className="flex items-center gap-1 text-[9px] font-bold text-zinc-400 dark:text-zinc-500">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.fill, boxShadow: isDark ? `0 0 6px ${meta.fill}` : 'none' }} />
                            {pickLabel(meta.label)}
                        </span>
                    ))
                    : null}
            </div>
        </div>
    );
};

export default MapPanel;
