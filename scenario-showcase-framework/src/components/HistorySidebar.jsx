// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/** Left sidebar — scenario history across ALL cases: the live run pinned on
 *  top, past runs of every scenario below (sorted by time). Each entry is
 *  labeled with its scenario and driver mode (Demo 回放 / Agent 执行) and
 *  clicking it switches to that scenario. COLLAPSED to a slim rail by default
 *  (max stage space); expandable via the rail chevron (?hist=0 starts it
 *  expanded). Conference glass theme. */
import React from 'react';
import { Bot, History, CircleCheck, CircleAlert, Clock3, Radio, ChevronLeft, ChevronRight } from 'lucide-react';

const RESULT_BADGE = {
    success: { icon: CircleCheck, cls: 'text-emerald-600 dark:text-emerald-300', zh: '成功', en: 'Success' },
    partial: { icon: CircleAlert, cls: 'text-amber-600 dark:text-amber-300', zh: '部分恢复', en: 'Partial' },
};

const ModeBadge = ({ mode, tr }) => (
    <span className={`inline-flex items-center gap-1 px-1.5 py-px rounded text-[11px] font-semibold border shrink-0 ${
        mode === 'agent'
            ? 'bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800'
            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'}`}>
        {mode === 'agent' ? <Bot size={10} /> : null}
        {mode === 'agent' ? tr('ss.mode_agent', 'Agent 执行', 'Agent Run') : tr('ss.mode_demo', 'Demo 回放', 'Demo Replay')}
    </span>
);

const HistorySidebar = ({ tr, pick, caseData, driver, live, historyAll, activeCaseId, onOpenCase, collapsed, onToggle }) => {
    if (collapsed) {
        return (
            <div className="flex flex-col items-center gap-2 pt-3 pb-3 h-full min-h-0">
                <button
                    onClick={onToggle}
                    title={tr('ss.history_expand', '展开历史记录', 'Expand history')}
                    className="p-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 transition-colors"
                >
                    <ChevronRight size={16} />
                </button>
                <div className="flex-1 min-h-0 flex flex-col items-center gap-2 pt-2">
                    <History size={16} className="text-zinc-400 dark:text-zinc-500 shrink-0" />
                    <span
                        className="text-[11px] font-semibold tracking-[0.25em] text-zinc-400 dark:text-zinc-500"
                        style={{ writingMode: 'vertical-rl' }}
                    >
                        {tr('ss.history', '场景历史', 'HISTORY')}
                    </span>
                </div>
                <span className="text-[12px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                    {(historyAll || []).length}
                </span>
            </div>
        );
    }
    return (
        <div className="flex flex-col min-h-0 h-full">
            <div className="shrink-0 px-4 pt-3 pb-2.5 flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800">
                <History size={15} className="text-zinc-400" />
                <span className="text-[15px] font-semibold text-zinc-700 dark:text-zinc-200">
                    {tr('ss.history', '场景历史', 'History')}
                </span>
                <button
                    onClick={onToggle}
                    title={tr('ss.history_collapse', '收起历史记录', 'Collapse history')}
                    className="ml-auto p-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 transition-colors"
                >
                    <ChevronLeft size={16} />
                </button>
            </div>

        <div className="flex-1 overflow-y-auto ss-scroll p-3 space-y-2">
            {/* live run */}
            <div className="relative p-3 rounded-xl border border-blue-300 dark:border-cyan-400/30 bg-blue-50/70 dark:bg-cyan-400/[0.07]">
                <div className="flex items-center gap-2 mb-1.5">
                    <Radio size={14} className={`text-blue-600 dark:text-blue-400 ${live?.running ? 'ss-pulse-dot' : ''}`} />
                    <span className="text-[14px] font-bold text-zinc-900 dark:text-white truncate">
                        {tr('ss.current_run', '当前演示回放', 'Current replay')}
                    </span>
                    <span className={`ml-auto inline-flex items-center gap-1 px-1.5 py-px rounded text-[11px] font-semibold border ${driver === 'mockAgent' ? 'bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'}`}>
                        {driver === 'mockAgent' ? <Bot size={10} /> : null}
                        {driver === 'mockAgent' ? tr('ss.mode_agent', 'Agent 执行', 'Agent Run') : tr('ss.mode_demo', 'Demo 回放', 'Demo Replay')}
                    </span>
                    <span className={`text-[12px] font-semibold px-2 py-0.5 rounded-full ${live?.completed ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30' : 'bg-blue-500 text-white'}`}>
                        {live?.completed
                            ? tr('ss.done', '完成', 'DONE')
                            : tr('ss.running', '进行中', 'LIVE')}
                    </span>
                </div>
                <div className="flex items-center gap-2 text-[12px] font-mono text-zinc-500 dark:text-zinc-400">
                    <span className="tabular-nums">{live?.clockLabel || '00:00'}</span>
                    <div className="flex-1 h-1 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-300"
                            style={{ width: `${live?.progressPct || 0}%` }}
                        />
                    </div>
                    <span className="tabular-nums">{live?.progressPct || 0}%</span>
                </div>
            </div>

            {/* past runs of ALL scenarios — click to switch scenario */}
            {(historyAll || []).map((h) => {
                const badge = RESULT_BADGE[h.result] || RESULT_BADGE.success;
                const BadgeIcon = badge.icon;
                const mode = h.mode || 'demo';
                const active = h.caseId === activeCaseId;
                return (
                    <div
                        key={`${h.caseId}/${h.id}`}
                        onClick={() => onOpenCase && onOpenCase(h.caseId)}
                        title={pick(h.caseTitle)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer ${
                            active
                                ? 'border-blue-300 dark:border-cyan-400/30 bg-blue-50/60 dark:bg-cyan-400/[0.05]'
                                : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/95 hover:border-zinc-300 dark:hover:border-white/15 hover:shadow-md'}`}
                    >
                        <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[14px] font-bold text-zinc-800 dark:text-zinc-200 truncate">{pick(h.title)}</span>
                            <span className={`ml-auto shrink-0 ${badge.cls}`}><BadgeIcon size={15} /></span>
                        </div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                            <span className={`inline-flex items-center min-w-0 px-1.5 py-px rounded text-[11px] font-bold border ${
                                active ? 'bg-blue-100 dark:bg-cyan-400/10 text-blue-700 dark:text-cyan-300 border-blue-200 dark:border-cyan-400/30'
                                    : 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'}`}>
                                <span className="truncate max-w-[128px]">{pick(h.caseTitle)}</span>
                            </span>
                            <ModeBadge mode={mode} tr={tr} />
                        </div>
                        <div className="flex items-center gap-2 text-[12px] text-zinc-400 dark:text-zinc-500 font-mono">
                            <Clock3 size={12} />
                            <span>{h.time}</span>
                            <span className="ml-auto">{h.duration}</span>
                        </div>
                    </div>
                );
            })}
        </div>

        <div className="shrink-0 px-4 py-2.5 border-t border-zinc-100 dark:border-zinc-800">
            <p className="text-[12px] leading-relaxed text-zinc-400 dark:text-zinc-500">
                {tr('ss.history_hint', '历史记录由场景 Case 配置（cases/*.json）提供；点击条目可切换到对应场景。', 'History entries come from the case configs (cases/*.json); click an entry to switch to its scenario.')}
            </p>
        </div>
    </div>
    );
};

export default HistorySidebar;
