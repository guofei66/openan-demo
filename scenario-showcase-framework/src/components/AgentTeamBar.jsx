// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/** Agent team bar — the middle-top strip: how many agents are in the team,
 *  each with role, skills and a live "speaking" glow. Conference glass theme. */
import React from 'react';
import { Bot, Users } from 'lucide-react';
import { agentColor } from '../colors.js';

const ROLE_LABELS = { host: { zh: '工作流宿主', en: 'Workflow Host' }, domain: { zh: '专业域', en: 'Domain' }, support: { zh: '支撑', en: 'Support' } };

const AgentTeamBar = ({ tr, pick, agents, speakingAgent, doneCount, totalSteps }) => (
    <section className="shrink-0 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 dark:ring-1 dark:ring-white/[0.04] px-4 py-3">
        <div className="flex items-center gap-2 mb-2.5">
            <Users size={15} className="text-zinc-400" />
            <span className="text-[15px] font-semibold text-zinc-700 dark:text-zinc-200">
                {tr('ss.team', '智能体团队', 'Agent Team')}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[12px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                {agents.length} {tr('ss.agents', '个智能体', 'Agents')}
            </span>
            <span className="ml-auto text-[12px] font-mono text-zinc-400 dark:text-zinc-500 tabular-nums">
                {tr('ss.steps_done', '已完成步骤', 'Steps done')} <span className="text-zinc-700 dark:text-blue-400 font-bold">{doneCount}</span>/{totalSteps}
            </span>
        </div>
        <div className="flex items-stretch gap-2.5 overflow-x-auto ss-scroll pb-0.5">
            {agents.map((a) => {
                const color = agentColor(a.color);
                const speaking = speakingAgent === a.id;
                return (
                    <div
                        key={a.id}
                        className={`relative flex items-center gap-2.5 min-w-[236px] flex-1 px-3 py-2.5 rounded-xl border transition-all duration-300
                            ${speaking
                            ? `bg-blue-50 dark:bg-blue-500/5 border-blue-300 dark:border-blue-500 ${color.ring}`
                            : 'bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800'}`}
                    >
                        <div className={`w-10 h-10 rounded-lg ${color.avatar} flex items-center justify-center shrink-0`}>
                            <Bot size={20} className="text-white" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                                <span className="text-[14px] font-bold text-zinc-900 dark:text-white truncate">{pick(a.name)}</span>
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${speaking ? color.dot : 'bg-zinc-300 dark:bg-zinc-700'}`} />
                                {speaking && (
                                    <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-semibold bg-blue-500 text-white shrink-0">
                                        {tr('ss.speaking', '交互中', 'LIVE')}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-1 mt-0.5">
                                <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${color.chip}`}>
                                    {pick(ROLE_LABELS[a.role] || a.role || '')}
                                </span>
                                {(a.skills || []).slice(0, 2).map((s) => (
                                    <span key={s} className="px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-100 dark:bg-zinc-900/50 text-zinc-500 dark:text-zinc-400 truncate max-w-[86px]">
                                        {s}
                                    </span>
                                ))}
                                {(a.skills || []).length > 2 && (
                                    <span className="text-[11px] text-zinc-400 dark:text-zinc-500">+{a.skills.length - 2}</span>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    </section>
);

export default AgentTeamBar;
