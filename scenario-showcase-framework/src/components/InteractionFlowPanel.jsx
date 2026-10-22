// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/** Bottom-left upper half — the collaboration flow, shown graphically as a
 *  PSOP swimlane collaboration graph (default) or as a vertical stepper list.
 *  Live statuses, agent chips, PSOP step types (SelfLoop/AllSuccess), skills
 *  and task ids. Conference glass theme. */
import React, { useState } from 'react';
import { Check, Circle, Loader2, ListChecks, Repeat, Workflow, Network, Rows3 } from 'lucide-react';
import { agentColor } from '../colors.js';
import WorkflowGraph from './WorkflowGraph.jsx';

const STEP_ICONS = ({ status }) => {
    if (status === 'done') return <span className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shadow-md shadow-emerald-500/20"><Check size={13} className="text-white" strokeWidth={3} /></span>;
    if (status === 'active') return <span className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md ss-glow-breathe"><Loader2 size={13} className="text-white animate-spin" /></span>;
    return <span className="w-6 h-6 rounded-full border-2 border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900/50 flex items-center justify-center"><Circle size={6} className="text-zinc-300 dark:text-zinc-500" fill="currentColor" /></span>;
};

const InteractionFlowPanel = ({ tr, pick, steps, agents, stepStatus, progressPct }) => {
    const agentById = Object.fromEntries(agents.map((a) => [a.id, a]));
    const [view, setView] = useState('graph');
    const ToggleBtn = ({ id, icon: Icon, label }) => (
        <button
            onClick={() => setView(id)}
            title={label}
            className={`p-1 rounded-md border transition-all ${view === id
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                : 'text-zinc-400 dark:text-zinc-500 border-transparent hover:text-zinc-600 dark:hover:text-zinc-300'}`}
        >
            <Icon size={14} />
        </button>
    );
    return (
        <div className="flex-1 min-h-0 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 dark:ring-1 dark:ring-white/[0.04] flex flex-col overflow-hidden">
            <div className="shrink-0 px-4 pt-2.5 pb-2 flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800">
                <ListChecks size={15} className="text-zinc-400" />
                <span className="text-[15px] font-semibold text-zinc-700 dark:text-zinc-200">
                    {tr('ss.flow', '协作流程', 'Collaboration Flow')}
                </span>
                {/* PSOP workflow provenance badge */}
                <span className="hidden lg:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[12px] font-mono font-bold bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    <Workflow size={12} />
                    PSOP · psop_live_event_assurance_en
                </span>
                <div className="ml-auto flex items-center gap-1">
                    <ToggleBtn id="graph" icon={Network} label={tr('ss.flow.graph', '图形视图', 'Graph view')} />
                    <ToggleBtn id="list" icon={Rows3} label={tr('ss.flow.list', '列表视图', 'List view')} />
                    <span className="ml-1 text-[12px] font-mono text-zinc-400 dark:text-blue-400 tabular-nums">{progressPct}%</span>
                </div>
            </div>

            {view === 'graph' ? (
                <div className="flex-1 min-h-0 px-2 py-2">
                    <WorkflowGraph pick={pick} steps={steps} agents={agents} stepStatus={stepStatus} />
                </div>
            ) : (
            <div className="flex-1 overflow-y-auto ss-scroll px-4 py-3">
                <div className="relative">
                    {/* connector line */}
                    <div className="absolute left-[11px] top-3 bottom-3 w-px bg-zinc-200 ss-flow-line" />
                    <div className="space-y-1.5">
                        {steps.map((s, i) => {
                            const status = stepStatus[s.id] || 'pending';
                            const agent = agentById[s.agent];
                            const color = agentColor(agent?.color);
                            const active = status === 'active';
                            return (
                                <div
                                    key={s.id || i}
                                    className={`relative flex items-center gap-3 pl-0 pr-2 py-1.5 rounded-xl transition-all duration-300
                                        ${active ? 'bg-blue-50/80 dark:bg-blue-500/5' : ''}`}
                                >
                                    <div className="relative z-10 shrink-0"><STEP_ICONS status={status} /></div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                            <span className={`text-[14px] font-bold truncate ${status === 'pending' ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-900 dark:text-white'}`}>
                                                {s.id ? `${s.id} · ` : ''}{pick(s.name)}
                                            </span>
                                            {/* PSOP step type: SelfLoop | AllSuccess */}
                                            {s.type === 'selfloop' ? (
                                                <span className="shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[12px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                                                    <Repeat size={10} /> SelfLoop
                                                </span>
                                            ) : (
                                                <span className="shrink-0 px-1.5 py-0.5 rounded text-[12px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                                                    AllSuccess
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            {agent && (
                                                <span className={`inline-block px-2 py-0.5 rounded text-[12px] font-bold border ${color.chip}`}>
                                                    {pick(agent.name)}
                                                </span>
                                            )}
                                            {/* PSOP skill */}
                                            {s.skill && (
                                                <span className="hidden xl:inline-block px-2 py-0.5 rounded text-[12px] font-mono bg-zinc-100 dark:bg-zinc-800/80 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 truncate">
                                                    {s.skill}
                                                </span>
                                            )}
                                            {/* PSOP task id */}
                                            {s.task && (
                                                <span className="ml-auto hidden md:inline text-[12px] font-mono text-zinc-400 dark:text-zinc-600">{s.task}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
            )}
        </div>
    );
};

export default InteractionFlowPanel;
