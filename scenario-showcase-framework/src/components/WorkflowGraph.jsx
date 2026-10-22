// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/** Graphical view of the PSOP workflow: swimlane collaboration graph (original
 *  horizontal layout — one lane band per agent, nodes zigzag left→right, END
 *  cap). Nodes light up live with the replay (pending / active glow / done),
 *  edges animate into the active step. Fonts enlarged per review; the field
 *  scrolls horizontally on narrow panels so the layout stays unchanged. */
import React from 'react';
import { Check, Circle, Loader2, Flag } from 'lucide-react';
import { agentColor } from '../colors.js';

const NodeStatus = ({ status }) => {
    if (status === 'done') return <span className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center shrink-0"><Check size={10} className="text-white" strokeWidth={3.5} /></span>;
    if (status === 'active') return <span className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0"><Loader2 size={10} className="text-white animate-spin" /></span>;
    return <span className="w-4 h-4 rounded-full border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 flex items-center justify-center shrink-0"><Circle size={5} className="text-zinc-300 dark:text-zinc-600" fill="currentColor" /></span>;
};

const WorkflowGraph = ({ pick, steps, agents, stepStatus }) => {
    const laneCount = Math.max(agents.length, 1);
    const laneIndex = Object.fromEntries(agents.map((a, i) => [a.id, i]));
    const cols = steps.length + 1; // steps + END cap
    const xc = (i) => ((i + 0.5) / cols) * 100;
    const yc = (agentId) => (((laneIndex[agentId] ?? 0) + 0.5) / laneCount) * 100;
    const statusOf = (i) => (i < steps.length ? (stepStatus[steps[i].id] || 'pending') : 'pending');

    // edges: step_i -> step_{i+1}; last one -> END (placed in the final step's lane)
    const edges = steps.map((s, i) => {
        const from = { x: xc(i), y: yc(s.agent) };
        const toAgent = i + 1 < steps.length ? steps[i + 1].agent : s.agent;
        const to = { x: xc(i + 1), y: yc(toAgent) };
        const target = statusOf(i + 1);
        return { from, to, target };
    });

    return (
        <div className="h-full min-h-0 flex">
            {/* lane rail */}
            <div className="shrink-0 w-[84px] flex flex-col py-1">
                {agents.map((a) => {
                    const color = agentColor(a.color);
                    return (
                        <div key={a.id} className="flex-1 flex items-center px-1">
                            <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border ${color.chip}`}>
                                <span className={`w-2 h-2 rounded-full ${color.dot} shrink-0`} />
                                <span className="text-[12px] font-bold leading-tight">{pick(a.name)}</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* lane field (horizontal scroll keeps the layout intact on narrow panels) */}
            <div className="flex-1 min-w-0 overflow-x-auto ss-scroll">
                <div className="h-full min-w-[680px] relative">
                    {/* lane bands */}
                    {agents.map((a, i) => {
                        const color = agentColor(a.color);
                        return (
                            <div
                                key={a.id}
                                className={`absolute left-0 right-0 ${color.lane} ${i > 0 ? 'border-t border-zinc-200 dark:border-zinc-800/80' : ''}`}
                                style={{ top: `${(i / laneCount) * 100}%`, height: `${(1 / laneCount) * 100}%` }}
                            />
                        );
                    })}

                    {/* edges */}
                    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                        {edges.map((e, i) => {
                            const dx = (e.to.x - e.from.x) * 0.45;
                            const d = `M ${e.from.x} ${e.from.y} C ${e.from.x + dx} ${e.from.y}, ${e.to.x - dx} ${e.to.y}, ${e.to.x} ${e.to.y}`;
                            const cls = e.target === 'done'
                                ? 'stroke-emerald-500/70'
                                : e.target === 'active'
                                    ? 'stroke-blue-500 ss-dash-flow'
                                    : 'stroke-zinc-300 dark:stroke-zinc-700';
                            return (
                                <path
                                    key={i}
                                    d={d}
                                    fill="none"
                                    className={cls}
                                    strokeWidth={e.target === 'active' ? 2 : 1.25}
                                    strokeDasharray={e.target === 'pending' ? '3 2' : undefined}
                                    vectorEffect="non-scaling-stroke"
                                />
                            );
                        })}
                    </svg>

                    {/* step nodes */}
                    {steps.map((s, i) => {
                        const agent = agents.find((a) => a.id === s.agent);
                        const color = agentColor(agent?.color);
                        const status = statusOf(i);
                        const active = status === 'active';
                        return (
                            <div
                                key={s.id || i}
                                className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                                style={{ left: `${xc(i)}%`, top: `${yc(s.agent)}%` }}
                            >
                                <div
                                    title={`${s.id} · ${pick(s.name)}${s.skill ? ` · ${s.skill}` : ''}${s.task ? ` · ${s.task}` : ''}`}
                                    className={`w-[64px] rounded-lg border bg-white dark:bg-zinc-900/95 px-1 pt-1 pb-1 text-center shadow-md transition-all duration-300 ${color.edge} ${active ? 'ring-2 ring-blue-500/70 ss-glow-breathe dark:shadow-[0_0_18px_rgba(59,130,246,0.35)]' : ''} ${status === 'done' ? 'dark:bg-emerald-500/10' : ''}`}
                                >
                                    <div className="text-[10px] font-mono font-semibold text-zinc-400 dark:text-zinc-500 leading-none">{String(i + 1).padStart(2, '0')}</div>
                                    <div className={`text-[13px] font-bold leading-[1.1] mt-0.5 ${status === 'pending' ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-900 dark:text-white'}`}>
                                        {pick(s.short) || pick(s.name)}
                                    </div>
                                    <div className="flex justify-center mt-1"><NodeStatus status={status} /></div>
                                </div>
                            </div>
                        );
                    })}

                    {/* END cap */}
                    <div
                        className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                        style={{ left: `${xc(cols - 1)}%`, top: `${yc(steps[steps.length - 1]?.agent || agents[0]?.id)}%` }}
                    >
                        <div className="w-11 h-11 rounded-full border-2 border-dashed border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900/95 flex flex-col items-center justify-center">
                            <Flag size={11} className="text-zinc-400 dark:text-zinc-500" />
                            <span className="text-[10px] font-mono font-semibold text-zinc-400 dark:text-zinc-500 leading-none mt-0.5">END</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WorkflowGraph;
