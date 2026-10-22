// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/** Map panel — an abstract network map on an SVG grid: sites (cells / venues)
 *  with live statuses, an optional route polyline and a moving marker.
 *  Dark mode renders a neon "operations console" look: cyan grid, glowing site
 *  dots, marching-dash route. Config-driven; no external map dependency. */
import React from 'react';
import { SITE_STATUS } from '../../colors.js';

const W = 100;
const H = 62;

const MapPanel = ({ config, data, isDark }) => {
    const sites = config.sites || [];
    const route = config.route || [];
    const statusOverride = data?.siteStatus || {};
    const marker = data?.marker || null;
    const routeActive = data?.routeActive || false;

    const gridColor = isDark ? 'rgba(56,189,248,0.10)' : '#e4e4e7';
    const labelColor = isDark ? '#94a3b8' : '#52525b';
    const routeColor = isDark ? (routeActive ? '#22d3ee' : 'rgba(56,189,248,0.35)') : (routeActive ? '#06b6d4' : '#d4d4d8');
    const halo = isDark ? '#09090B' : '#ffffff';

    return (
        <div className="h-full w-full p-2 relative">
                        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
                <defs>
                    <filter id="ss-site-glow" x="-120%" y="-120%" width="340%" height="340%">
                        <feGaussianBlur stdDeviation="1.6" result="b" />
                        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                </defs>

                {/* grid */}
                {Array.from({ length: Math.floor(W / 10) + 1 }, (_, i) => (
                    <line key={`v${i}`} x1={i * 10} y1={0} x2={i * 10} y2={H} stroke={gridColor} strokeWidth={0.25} />
                ))}
                {Array.from({ length: Math.floor(H / 10) + 1 }, (_, i) => (
                    <line key={`h${i}`} x1={0} y1={i * 10} x2={W} y2={i * 10} stroke={gridColor} strokeWidth={0.25} />
                ))}

                {/* route */}
                {route.length > 1 && (
                    <polyline
                        points={route.map((p) => `${p.x},${p.y}`).join(' ')}
                        fill="none"
                        stroke={routeColor}
                        strokeWidth={0.8}
                        strokeDasharray="2 1.4"
                        strokeLinecap="round"
                        className={isDark ? 'ss-dash-flow' : undefined}
                    />
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
                                {s.label}
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
                            {meta.label}
                        </span>
                    ))
                    : null}
            </div>
        </div>
    );
};

export default MapPanel;
