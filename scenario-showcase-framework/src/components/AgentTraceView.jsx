// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/** Trace view 2 — Agent 执行流 (agent execution flow): one timeline lane per
 *  agent on the virtual clock. Step spans (active → done) render as bars,
 *  authored messages as dots on the agent's lane, A2A-T negotiations as
 *  violet diamonds, and a live cursor tracks the current replay time. */
import React from 'react';
import { Bot, Activity, Handshake } from 'lucide-react';
import { agentColor } from '../colors.js';

const fmtClock = (sec) => `${String(Math.floor((sec || 0) / 60)).padStart(2, '0')}:${String(Math.floor((sec || 0) % 60)).padStart(2, '0')}`;

const AgentTraceView = ({ tr, pick, agents, steps, messages, stepTimes, tSec }) => {
    const maxT = Math.max(
        tSec || 0,
        ...messages.map((m) => m.at || 0),
        ...Object.values(stepTimes || {}).flatMap((t) => [t.active || 0, t.done || 0]),
        30,
    );
    const endT = Math.ceil(maxT / 15) * 15; // axis ends on a 15s multiple
    const ticks = [];
    for (let t = 0; t <= endT; t += 15) ticks.push(t);
    const pct = (t) => `${Math.min(100, (t / endT) * 100)}%`;

    return (
        <div className="h-full min-h-0 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 dark:ring-1 dark:ring-white/[0.04] flex flex-col overflow-hidden">
            {/* header + legend */}
            <div className="shrink-0 px-4 pt-2.5 pb-2 flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 flex-wrap">
                <Activity size={15} className="text-zinc-400" />
                <span className="text-[15px] font-semibold text-zinc-700 dark:text-zinc-200">
                    {tr('ss.trace_exec', 'Agent 执行流', 'Agent Execution Flow')}
                </span>
                <div className="ml-auto flex items-center gap-3 text-[11px] font-semibold text-zinc-400 dark:text-zinc-500">
                    <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" />{tr('ss.legend_msg', '消息', 'Message')}</span>
                    <span className="inline-flex items-center gap-1"><span className="w-3.5 h-1.5 rounded-full bg-emerald-500/80" />{tr('ss.legend_step', '步骤执行', 'Step span')}</span>
                    <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rotate-45 bg-violet-500" />{tr('ss.legend_a2at', 'A2A-T 协商', 'A2A-T')}</span>
                    <span className="inline-flex items-center gap-1 font-mono tabular-nums">T {fmtClock(tSec)}</span>
                </div>
            </div>

            {/* lanes */}
            <div className="flex-1 min-h-0 overflow-auto ss-scroll p-4">
                <div className="relative min-w-[760px]">
                    {/* live time cursor across all lanes (rail 128px + ml 4px) */}
                    <span
                        className="absolute top-5 bottom-0 w-[2px] bg-blue-500/70 pointer-events-none z-10"
                        style={{ left: `calc(132px + (100% - 132px) * ${Math.min(1, (tSec || 0) / endT)})` }}
                    >
                        <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-blue-500 ss-pulse-dot" />
                    </span>

                    {/* time axis */}
                    <div className="flex items-stretch mb-1">
                        <div className="w-[128px] shrink-0" />
                        <div className="relative flex-1 h-4">
                            {ticks.map((t) => (
                                <span key={t} className="absolute top-0 text-[11px] font-mono text-zinc-400 dark:text-zinc-600 tabular-nums -translate-x-1/2" style={{ left: pct(t) }}>
                                    {fmtClock(t)}
                                </span>
                            ))}
                        </div>
                    </div>

                    {(agents || []).map((agent) => {
                        const color = agentColor(agent.color);
                        const myMsgs = messages.filter((m) => m.from === agent.id);
                        const mySteps = (steps || []).filter((s) => s.agent === agent.id);
                        return (
                            <div key={agent.id} className="flex items-stretch">
                                {/* agent rail */}
                                <div className={`w-[128px] shrink-0 flex items-center gap-2 px-2 py-2.5 rounded-lg ${color.lane} border border-transparent dark:border-white/[0.04] mb-1.5`}>
                                    <span className={`w-7 h-7 rounded-lg ${color.avatar} flex items-center justify-center shrink-0`}>
                                        <Bot size={15} />
                                    </span>
                                    <span className="text-[13px] font-bold text-zinc-800 dark:text-zinc-200 truncate">{pick(agent.name)}</span>
                                </div>

                                {/* lane body */}
                                <div className="relative flex-1 mb-1.5 ml-1">
                                    {/* gridlines */}
                                    {ticks.map((t) => (
                                        <span key={t} className="absolute inset-y-0 w-px bg-zinc-100 dark:bg-zinc-800/70" style={{ left: pct(t) }} />
                                    ))}

                                    {/* step spans */}
                                    {mySteps.map((s) => {
                                        const times = stepTimes?.[s.id] || {};
                                        const start = typeof times.active === 'number' ? times.active : (typeof times.done === 'number' ? times.done : null);
                                        if (start == null) return null;
                                        const isDone = typeof times.done === 'number';
                                        const end = isDone ? times.done : Math.max(tSec || 0, start + 0.5);
                                        const width = Math.max(1.2, ((end - start) / endT) * 100);
                                        return (
                                            <div
                                                key={s.id}
                                                title={`${s.id} · ${pick(s.name)} · ${fmtClock(start)} → ${fmtClock(end)}`}
                                                className={`absolute top-1/2 -translate-y-1/2 h-3.5 rounded-full ${isDone ? 'bg-emerald-500/80' : 'bg-gradient-to-r from-blue-500 to-indigo-500 ss-shimmer'} flex items-center px-1.5 overflow-hidden`}
                                                style={{ left: pct(start), width: `${width}%` }}
                                            >
                                                <span className="text-[10px] font-semibold text-white whitespace-nowrap truncate leading-none">{pick(s.name)}</span>
                                            </div>
                                        );
                                    })}

                                    {/* message dots */}
                                    {myMsgs.map((m, i) => {
                                        const isA2AT = m.kind === 'a2at' && m.a2at;
                                        return (
                                            <span
                                                key={i}
                                                title={`${fmtClock(m.at)} · ${m.from} → ${m.to} · ${pick(m.text)}`}
                                                className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 ${isA2AT
                                                    ? 'w-2.5 h-2.5 rotate-45 bg-violet-500 ring-2 ring-violet-300/50'
                                                    : `w-2.5 h-2.5 rounded-full ${color.dot} ring-2 ring-white/70 dark:ring-zinc-900`}`}
                                                style={{ left: pct(m.at || 0) }}
                                            >
                                                {isA2AT && <Handshake size={0} />}
                                            </span>
                                        );
                                    })}

                                    {/* lane baseline */}
                                    <div className="absolute inset-x-0 top-1/2 h-px bg-zinc-200/70 dark:bg-zinc-800" />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* footer */}
            <div className="shrink-0 px-4 py-2 border-t border-zinc-100 dark:border-zinc-800">
                <p className="text-[12px] text-zinc-400 dark:text-zinc-500">
                    {tr('ss.trace_exec_hint', '每个智能体一条时间线：条形为 PSOP 步骤执行区间（蓝=进行中，绿=已完成），圆点为发出的消息，菱形为 A2A-T 协商。', 'One timeline per agent: bars are PSOP step spans (blue = running, green = done), dots are authored messages, diamonds are A2A-T negotiations.')}
                </p>
            </div>
        </div>
    );
};

export default AgentTraceView;
