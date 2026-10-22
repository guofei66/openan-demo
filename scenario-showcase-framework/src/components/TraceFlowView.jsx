// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/** Trace view 1 — 对话流 (A2A-T message flow): every interaction message as a
 *  flow node on a virtual-clock timeline: FROM → TO envelope chips, kind and
 *  step badges, one-line text preview. A2A-T negotiation messages render with
 *  a violet protocol tag. Nodes are grouped with step separators so the flow
 *  structure of the PSOP is visible at a glance. */
import React from 'react';
import { Handshake, MoveRight, MessagesSquare, Repeat } from 'lucide-react';
import { agentColor, KIND_BADGES } from '../colors.js';

const fmtClock = (sec) => `${String(Math.floor((sec || 0) / 60)).padStart(2, '0')}:${String(Math.floor((sec || 0) % 60)).padStart(2, '0')}`;

const Participant = ({ agent, pick, fallback }) => {
    const color = agentColor(agent?.color);
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[12px] font-bold border ${color.chip}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
            <span className="max-w-[110px] truncate">{agent ? pick(agent.name) : fallback}</span>
        </span>
    );
};

const TraceFlowView = ({ tr, pick, agents, steps, messages }) => {
    const agentOf = (id) => (agents || []).find((a) => a.id === id);
    const stepOf = (id) => {
        const idx = (steps || []).findIndex((s) => s.id === id);
        return idx >= 0 ? { step: steps[idx], no: idx + 1 } : null;
    };

    return (
        <div className="h-full min-h-0 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 dark:ring-1 dark:ring-white/[0.04] flex flex-col overflow-hidden">
            {/* header */}
            <div className="shrink-0 px-4 pt-2.5 pb-2 flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800">
                <MessagesSquare size={15} className="text-zinc-400" />
                <span className="text-[15px] font-semibold text-zinc-700 dark:text-zinc-200">
                    {tr('ss.trace_flow', '对话流 · A2A-T 消息', 'Message Flow · A2A-T')}
                </span>
                <span className="ml-auto text-[12px] font-mono text-zinc-400 dark:text-zinc-500">
                    {messages.length} {tr('ss.trace_msgs', '条消息', 'messages')}
                </span>
            </div>

            {/* flow body */}
            <div className="flex-1 min-h-0 overflow-y-auto ss-scroll px-4 py-3">
                {!messages.length && (
                    <p className="text-[13px] text-zinc-400 dark:text-zinc-500 py-6 text-center">
                        {tr('ss.trace_empty', '等待消息流入…', 'waiting for messages…')}
                    </p>
                )}
                {messages.map((m, i) => {
                    const from = agentOf(m.from);
                    const to = agentOf(m.to);
                    const color = agentColor(from?.color);
                    const kb = KIND_BADGES[m.kind] || KIND_BADGES.info;
                    const isA2AT = m.kind === 'a2at' && m.a2at;
                    const selfLoop = m.from === m.to;
                    const prevStep = i > 0 ? messages[i - 1].step : null;
                    const stepInfo = stepOf(m.step);
                    return (
                        <React.Fragment key={i}>
                            {/* step separator */}
                            {m.step && m.step !== prevStep && stepInfo && (
                                <div className="flex items-center gap-3 my-3 first:mt-0">
                                    <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
                                    <span className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-500">
                                        {tr('ss.step', '步骤', 'Step')} {String(stepInfo.no).padStart(2, '0')} · {pick(stepInfo.step.name)}
                                    </span>
                                    <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
                                </div>
                            )}

                            {/* flow node */}
                            <div className="relative flex items-stretch gap-3 group">
                                {/* time rail */}
                                <div className="shrink-0 w-[44px] pt-2.5 text-right">
                                    <span className="text-[12px] font-mono text-zinc-400 dark:text-zinc-600 tabular-nums">{fmtClock(m.at)}</span>
                                </div>
                                {/* rail dot + connector */}
                                <div className="relative w-3 shrink-0">
                                    <span className={`absolute left-1/2 -translate-x-1/2 top-3 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-zinc-900 ${isA2AT ? 'bg-violet-500' : color.dot}`} />
                                    {i < messages.length - 1 && <span className="absolute left-1/2 -translate-x-1/2 top-[22px] bottom-0 w-px bg-zinc-200 dark:bg-zinc-800" />}
                                </div>

                                {/* node card */}
                                <div className={`flex-1 min-w-0 mb-2.5 rounded-xl border px-3 py-2 transition-colors ${isA2AT
                                    ? 'border-violet-300 dark:border-violet-500/40 bg-violet-50/70 dark:bg-violet-500/[0.08]'
                                    : `${color.bubble}`}`}>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <Participant agent={from} pick={pick} fallback={m.from} />
                                        {selfLoop
                                            ? <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 px-1"><Repeat size={11} /> SelfLoop</span>
                                            : <MoveRight size={14} className="text-zinc-400 dark:text-zinc-500 shrink-0" />}
                                        <Participant agent={to} pick={pick} fallback={m.to} />
                                        <span className={`ml-1 inline-flex items-center gap-1 px-1.5 py-px rounded text-[11px] font-semibold border ${kb.cls}`}>
                                            {isA2AT ? <Handshake size={10} /> : null}
                                            {tr('', kb.zh, kb.en)}
                                        </span>
                                        {isA2AT && (
                                            <span className="inline-flex items-center gap-1 px-1.5 py-px rounded text-[11px] font-semibold border bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-700 font-mono">
                                                {m.a2at.type || 'A2A-T'}
                                            </span>
                                        )}
                                        <span className="ml-auto text-[11px] font-mono text-zinc-400 dark:text-zinc-600">msg-{String(i + 1).padStart(3, '0')}</span>
                                    </div>
                                    <p className="mt-1 text-[14px] leading-snug text-zinc-700 dark:text-zinc-300 truncate">
                                        {pick(m.text)}
                                    </p>
                                    {(m.attachments || []).length > 0 && (
                                        <p className="mt-0.5 text-[11px] font-bold text-zinc-400 dark:text-zinc-500">
                                            +{m.attachments.length} {tr('ss.trace_atts', '个多模态附件', 'multimodal attachments')}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
};

export default TraceFlowView;
