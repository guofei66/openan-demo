// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/** Chart panel — an SVG line chart fed by script events (`push` actions).
 *  Config: series definitions + y-range; data: { points: { seriesId: [v...] } }. */
import React from 'react';

const W = 100;
const H = 54;
const PAD_L = 8;
const PAD_B = 6;
const PAD_T = 4;
const WINDOW = 24;

const ChartPanel = ({ config, data, isDark }) => {
    const series = config.series || [];
    const yMin = typeof config.yMin === 'number' ? config.yMin : 0;
    const yMax = typeof config.yMax === 'number' ? config.yMax : 100;
    const unit = config.unit || '';
    const points = data?.points || {};

    const gridColor = isDark ? 'rgba(56,189,248,0.08)' : '#e4e4e7';
    const axisColor = isDark ? '#3f3f46' : '#d4d4d8';
    const labelColor = isDark ? '#71717a' : '#a1a1aa';

    const plotW = W - PAD_L - 2;
    const plotH = H - PAD_T - PAD_B;
    const xOf = (i, n) => PAD_L + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
    const yOf = (v) => PAD_T + (1 - (Math.max(yMin, Math.min(yMax, v)) - yMin) / (yMax - yMin || 1)) * plotH;

    return (
        <div className="h-full w-full p-2 flex flex-col min-h-0">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full flex-1 min-h-0" preserveAspectRatio="none">
                <defs>
                    <filter id="ss-line-glow" x="-30%" y="-30%" width="160%" height="160%">
                        <feGaussianBlur stdDeviation="0.7" result="b" />
                        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                    {series.map((s) => (
                        <linearGradient key={s.id} id={`ss-fill-${s.id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={s.color} stopOpacity={isDark ? 0.28 : 0.16} />
                            <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                        </linearGradient>
                    ))}
                </defs>
                {/* y grid */}
                {[0, 0.25, 0.5, 0.75, 1].map((f) => {
                    const y = PAD_T + f * plotH;
                    const v = Math.round(yMax - f * (yMax - yMin));
                    return (
                        <g key={f}>
                            <line x1={PAD_L} y1={y} x2={W - 2} y2={y} stroke={gridColor} strokeWidth={0.25} />
                            <text x={PAD_L - 1} y={y + 1} textAnchor="end" fontSize={2.4} fill={labelColor} style={{ fontFamily: 'monospace' }}>
                                {v}
                            </text>
                        </g>
                    );
                })}
                <line x1={PAD_L} y1={H - PAD_B} x2={W - 2} y2={H - PAD_B} stroke={axisColor} strokeWidth={0.4} />

                {/* series */}
                {series.map((s) => {
                    const arr = points[s.id] || [];
                    if (arr.length === 0) return null;
                    const windowed = arr.slice(-WINDOW);
                    const n = Math.max(windowed.length, 2);
                    const pts = windowed.map((v, i) => `${xOf(i, n)},${yOf(v)}`).join(' ');
                    const last = windowed[windowed.length - 1];
                    return (
                        <g key={s.id}>
                            {s.fill && windowed.length > 1 && (
                                <polygon
                                    points={`${PAD_L},${yOf(yMin)} ${pts} ${xOf(windowed.length - 1, n)},${yOf(yMin)}`}
                                    fill={`url(#ss-fill-${s.id})`}
                                />
                            )}
                            <polyline
                                points={pts}
                                fill="none"
                                stroke={s.color}
                                strokeWidth={isDark ? 0.85 : 0.7}
                                strokeLinejoin="round"
                                strokeLinecap="round"
                                filter={isDark ? 'url(#ss-line-glow)' : undefined}
                            />
                            <circle cx={xOf(windowed.length - 1, n)} cy={yOf(last)} r={isDark ? 1.1 : 0.9} fill={s.color} filter={isDark ? 'url(#ss-line-glow)' : undefined} />
                            <text
                                x={xOf(windowed.length - 1, n) + 1.6}
                                y={yOf(last) + 0.9}
                                fontSize={2.4}
                                fontWeight={700}
                                fill={s.color}
                                style={{ fontFamily: 'monospace' }}
                            >
                                {Math.round(last)}
                            </text>
                        </g>
                    );
                })}
            </svg>

            {/* legend — each item stays on one line (whitespace-nowrap); the
                row itself wraps when the panel is narrow, so every series
                label + live value is always fully visible */}
            <div className="shrink-0 flex items-center gap-x-4 gap-y-1 px-2 pb-1.5 pt-1 flex-wrap">
                {series.map((s) => {
                    const arr = points[s.id] || [];
                    const last = arr.length ? arr[arr.length - 1] : null;
                    return (
                        <span key={s.id} className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color, boxShadow: isDark ? `0 0 6px ${s.color}` : 'none' }} />
                            <span>{typeof s.name === 'string' ? s.name : (s.name?.zh || s.name?.en || s.id)}</span>
                            {last != null && <span className="font-mono tabular-nums text-zinc-600 dark:text-zinc-300">{Math.round(last)}</span>}
                        </span>
                    );
                })}
            </div>
        </div>
    );
};

export default ChartPanel;
