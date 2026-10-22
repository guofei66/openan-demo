// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/** Bottom-right — the conversation stream: agent-to-agent interaction messages
 *  with role badges, step tags and virtual-clock timestamps. Multimodal:
 *  messages may carry `attachments` (kpi cards, tables, sparklines, images,
 *  icon lists) and `kind:'a2at'` renders an A2A-T protocol envelope card
 *  (verb / session / clauses / decision). Auto-scrolls. Conference glass. */
import React, { useEffect, useRef } from 'react';
import {
    Bot, Users, Clock, RadioTower, Gauge, CheckCircle2,
    AlertTriangle, Zap, Wifi, BatteryCharging, Video, TrendingUp, FileText,
    Handshake, MoveRight, Repeat,
} from 'lucide-react';
import { agentColor, KIND_BADGES } from '../colors.js';

const AgentAvatar = ({ agent, size = 'w-8 h-8' }) => {
    const color = agentColor(agent?.color);
    return (
        <div className={`${size} rounded-lg ${color.avatar} flex items-center justify-center shadow-md shrink-0`}>
            <Bot size={16} className="text-white" />
        </div>
    );
};

const ATT_ICON = {
    users: Users, clock: Clock, tower: RadioTower, gauge: Gauge, check: CheckCircle2,
    alert: AlertTriangle, zap: Zap, wifi: Wifi, battery: BatteryCharging, video: Video,
    trend: TrendingUp, file: FileText,
};

/** Multimodal attachments — config-driven (case `script[].attachments`). */
const Attachments = ({ pick, items }) => (
    <div className="mt-1.5 space-y-1.5">
        {(items || []).map((att, i) => {
            if (att.type === 'kpi') {
                return (
                    <div key={i} className="flex gap-1.5 flex-wrap">
                        {(att.items || []).map((k, j) => {
                            const Icon = ATT_ICON[k.icon] || Gauge;
                            return (
                                <div key={j} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700">
                                    <Icon size={14} className="text-blue-500 dark:text-blue-400" />
                                    <span className="text-[12px] text-zinc-500 dark:text-zinc-400">{pick(k.label)}</span>
                                    <span className="text-[14px] font-semibold text-zinc-900 dark:text-white tabular-nums">{pick(k.value)}</span>
                                    {k.trend && (
                                        <span className={`text-[12px] font-semibold ${k.trend === 'up' ? 'text-rose-500' : k.trend === 'down' ? 'text-emerald-500' : 'text-zinc-400'}`}>
                                            {k.trend === 'up' ? '▲' : k.trend === 'down' ? '▼' : '–'}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                );
            }
            if (att.type === 'table') {
                return (
                    <div key={i} className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden max-w-[360px]">
                        {att.title && (
                            <div className="px-2 py-1 text-[12px] font-semibold bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-300">{pick(att.title)}</div>
                        )}
                        <table className="w-full text-[14px]">
                            <thead>
                                <tr className="bg-zinc-50 dark:bg-zinc-800/60">
                                    {(att.headers || []).map((h, j) => (
                                        <th key={j} className="px-2 py-1.5 text-left font-bold text-zinc-500 dark:text-zinc-400">{pick(h)}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {(att.rows || []).map((row, j) => (
                                    <tr key={j} className="border-t border-zinc-100 dark:border-zinc-800">
                                        {row.map((cell, k) => (
                                            <td key={k} className="px-2 py-1.5 text-zinc-700 dark:text-zinc-200">{pick(cell)}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            }
            if (att.type === 'spark') {
                const W = 84; const H = 26;
                return (
                    <div key={i} className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 px-2 py-1.5 flex gap-3 items-center flex-wrap max-w-[360px]">
                        {(att.series || []).map((s, j) => {
                            const pts = s.points || [];
                            if (pts.length < 2) return null;
                            const min = Math.min(...pts); const max = Math.max(...pts); const rng = (max - min) || 1;
                            const d = pts.map((p, k) => `${((k / (pts.length - 1)) * W).toFixed(1)},${(H - ((p - min) / rng) * (H - 4) - 2).toFixed(1)}`).join(' ');
                            return (
                                <div key={j} className="flex items-center gap-1.5">
                                    <svg width={W} height={H}>
                                        <polyline points={d} fill="none" stroke={s.color} strokeWidth="1.5" />
                                        <circle cx={W} cy={H - ((pts[pts.length - 1] - min) / rng) * (H - 4) - 2} r="2" fill={s.color} />
                                    </svg>
                                    <div className="leading-tight">
                                        <div className="text-[12px] text-zinc-500 dark:text-zinc-400">{pick(s.name)}</div>
                                        <div className="text-[14px] font-semibold tabular-nums" style={{ color: s.color }}>{pts[pts.length - 1]}%</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                );
            }
            if (att.type === 'image') {
                return (
                    <div key={i} className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden max-w-[280px]">
                        <img src={att.src} alt={pick(att.caption) || ''} className="w-full block" />
                        {att.caption && (
                            <div className="px-2 py-1 text-[12px] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/60">{pick(att.caption)}</div>
                        )}
                    </div>
                );
            }
            if (att.type === 'list') {
                return (
                    <div key={i} className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 px-2 py-1.5 space-y-1 max-w-[360px]">
                        {(att.items || []).map((it, j) => {
                            const Icon = ATT_ICON[it.icon] || CheckCircle2;
                            return (
                                <div key={j} className="flex items-center gap-2 text-[14px] text-zinc-700 dark:text-zinc-200">
                                    <Icon size={13} className="text-emerald-500 dark:text-emerald-400 shrink-0" />
                                    <span className="truncate">{pick(it.text)}</span>
                                </div>
                            );
                        })}
                    </div>
                );
            }
            return null;
        })}
    </div>
);

/** A2A-T protocol envelope card — negotiation messages over the A2A-T channel. */
const A2ATCard = ({ pick, m }) => {
    const d = m.a2at || {};
    const verb = d.verb || 'MESSAGE';
    const accepted = String(d.decision || '').toUpperCase() === 'ACCEPTED';
    const requested = /REQUEST/i.test(verb);
    return (
        <div className="mt-1 rounded-xl border border-violet-300 dark:border-violet-800/80 bg-violet-50/60 dark:bg-violet-500/[0.06] overflow-hidden">
            <div className="px-2.5 py-1.5 flex items-center gap-1.5 bg-violet-100/70 dark:bg-violet-500/10 border-b border-violet-200 dark:border-violet-800/60">
                <Handshake size={11} className="text-violet-600 dark:text-violet-300" />
                <span className="text-[12px] font-semibold tracking-[0.14em] text-violet-700 dark:text-violet-300">A2A-T</span>
                <span className="px-2 py-0.5 rounded text-[12px] font-semibold bg-violet-600/90 text-white">{verb}</span>
                {d.decision && (
                    <span className={`px-2 py-0.5 rounded text-[12px] font-semibold border ${accepted
                        ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                        : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'}`}>
                        {d.decision}
                    </span>
                )}
                {d.session && <span className="ml-auto text-[12px] font-mono text-violet-500 dark:text-violet-400/70">{d.session}</span>}
            </div>
            {(d.clauses || []).length > 0 && (
                <div className="px-2.5 py-1.5 space-y-1">
                    {d.clauses.map((c, i) => (
                        <div key={i} className="flex gap-2 text-[14px] leading-snug">
                            <span className="shrink-0 w-[86px] font-bold text-zinc-500 dark:text-zinc-400">{pick(c.k)}</span>
                            <span className="text-zinc-700 dark:text-zinc-200">{pick(c.v)}</span>
                        </div>
                    ))}
                </div>
            )}
            {!d.clauses && requested && (
                <div className="px-2.5 py-1.5 text-[12px] font-mono text-violet-500 dark:text-violet-400/80">awaiting counter-party evaluation…</div>
            )}
        </div>
    );
};

/** From/To participant chips — the A2A-T communication envelope.
 *  Neutral zinc: agent identity is carried by the avatar alone (one-color
 *  conversation area, per 2026-10-22 review feedback). */
const Participant = ({ agent, fallback, label, pick }) => (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[12px] font-bold border bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700">
        <span className="text-[10px] font-mono opacity-70">{label}</span>
        <span className="max-w-[110px] truncate">{agent ? pick(agent.name) : fallback}</span>
    </span>
);

const fmtClock = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

const ConversationStream = ({ tr, pick, agents, messages, tSec }) => {
    const scrollRef = useRef(null);
    const stickRef = useRef(true);

    useEffect(() => {
        const el = scrollRef.current;
        if (el && stickRef.current) el.scrollTop = el.scrollHeight;
    }, [messages]);

    const agentById = Object.fromEntries(agents.map((a) => [a.id, a]));

    return (
        <div className="h-full min-h-0 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 dark:ring-1 dark:ring-white/[0.04] flex flex-col overflow-hidden">
            <div className="shrink-0 px-4 pt-2.5 pb-2 flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800">
                <Bot size={15} className="text-zinc-400" />
                <span className="text-[15px] font-semibold text-zinc-700 dark:text-zinc-200">
                    {tr('ss.conversation', '智能体交互', 'Interactions')}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[12px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-blue-400 border border-zinc-200 dark:border-zinc-700 tabular-nums">
                    {messages.length}
                </span>
                <span className="ml-auto text-[12px] font-mono text-zinc-400 dark:text-zinc-500 tabular-nums">{fmtClock(tSec)}</span>
            </div>

            <div
                ref={scrollRef}
                onScroll={(e) => {
                    const el = e.currentTarget;
                    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
                }}
                className="flex-1 overflow-y-auto ss-scroll px-4 py-3 space-y-3"
            >
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-300 dark:text-zinc-500">
                        <Bot size={30} strokeWidth={1.5} />
                        <p className="text-xs mt-2 text-zinc-400 dark:text-zinc-500">
                            {tr('ss.waiting', '回放即将开始…', 'Replay starting…')}
                        </p>
                    </div>
                )}
                {messages.map((m, i) => {
                    const agent = agentById[m.from];
                    const toAgent = agentById[m.to];
                    const badge = KIND_BADGES[m.kind] || KIND_BADGES.info;
                    const isNewest = i === messages.length - 1;
                    const isA2AT = m.kind === 'a2at' && m.a2at;
                    const selfLoop = m.to && m.to === m.from;
                    return (
                        <div key={i} className={`ss-fade-up flex gap-2.5 ${isNewest ? 'opacity-100' : 'opacity-90'}`}>
                            <AgentAvatar agent={agent} />
                            <div className="min-w-0 flex-1">
                                {/* A2A-T protocol header: kind + message id + clock */}
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[12px] font-semibold tracking-[0.08em] bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                                        <Handshake size={11} />A2A-T
                                    </span>
                                    <span className={`px-2 py-0.5 rounded text-[12px] font-semibold border ${badge.cls}`}>{tr(`ss.kind_${m.kind}`, badge.zh, badge.en)}</span>
                                    {m.step && (
                                        <span className="px-2 py-0.5 rounded text-[12px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 font-mono">
                                            {m.step}
                                        </span>
                                    )}
                                    <span className="text-[12px] font-mono text-zinc-400 dark:text-zinc-600">msg-{String(i + 1).padStart(3, '0')}</span>
                                    <span className="ml-auto text-[12px] font-mono text-zinc-300 dark:text-zinc-500 tabular-nums">{fmtClock(m.at || 0)}</span>
                                </div>
                                {/* From X → To Y envelope */}
                                <div className="mt-1 flex items-center gap-1 flex-wrap">
                                    <Participant agent={agent} fallback={m.from} label="FROM" pick={pick} />
                                    <MoveRight size={14} className="text-zinc-400 dark:text-zinc-500 shrink-0" />
                                    <Participant agent={toAgent} fallback={m.to || m.from} label="TO" pick={pick} />
                                    {selfLoop && (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                                            <Repeat size={10} /> SelfLoop
                                        </span>
                                    )}
                                </div>
                                {/* one uniform bubble color for every agent — the
                                    colored avatar alone identifies the sender */}
                                <div className="mt-1 rounded-xl border px-3 py-2 bg-zinc-50 border-zinc-200 dark:bg-zinc-800/60 dark:border-zinc-700">
                                    <p className="text-[14px] leading-relaxed text-zinc-800 dark:text-zinc-100 whitespace-pre-line break-words">
                                        {pick(m.text)}
                                    </p>
                                    {isA2AT && <A2ATCard pick={pick} m={m} />}
                                    {m.attachments && <Attachments pick={pick} items={m.attachments} />}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ConversationStream;
