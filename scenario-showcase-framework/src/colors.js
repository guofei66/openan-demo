// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Explicit Tailwind class sets (JIT-safe) for agent accent colors.
 * Dark variants follow the Execution Center badge pattern:
 *   bg-{c}-900/20 text-{c}-400 border-{c}-800  (zinc palette, no glass).
 * Active/speaking highlight mirrors the exec-center selected-card pattern:
 *   bg-blue-500/5 border-blue-500.
 */
export const AGENT_COLORS = {
    blue: {
        avatar: 'bg-gradient-to-br from-blue-500 to-indigo-600 shadow-blue-500/30',
        chip: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 border-blue-200 dark:border-blue-800',
        ring: 'ring-blue-500/50',
        dot: 'bg-blue-500',
        bubble: 'bg-blue-50 border-blue-200 dark:bg-blue-500/[0.16] dark:border-blue-500/35',
        lane: 'bg-blue-500/[0.05]',
        edge: 'border-blue-400/60',
        border: 'border-l-blue-500',
        text: 'text-blue-600 dark:text-blue-400',
    },
    indigo: {
        avatar: 'bg-gradient-to-br from-indigo-500 to-blue-600 shadow-indigo-500/30',
        chip: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800',
        ring: 'ring-indigo-500/50',
        dot: 'bg-indigo-500',
        bubble: 'bg-indigo-50 border-indigo-200 dark:bg-indigo-500/[0.16] dark:border-indigo-500/35',
        lane: 'bg-indigo-500/[0.05]',
        edge: 'border-indigo-400/60',
        border: 'border-l-indigo-500',
        text: 'text-indigo-600 dark:text-indigo-400',
    },
    emerald: {
        avatar: 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/30',
        chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
        ring: 'ring-emerald-500/50',
        dot: 'bg-emerald-500',
        bubble: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-500/[0.16] dark:border-emerald-500/35',
        lane: 'bg-emerald-500/[0.05]',
        edge: 'border-emerald-400/60',
        border: 'border-l-emerald-500',
        text: 'text-emerald-600 dark:text-emerald-400',
    },
    amber: {
        avatar: 'bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/30',
        chip: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-800',
        ring: 'ring-amber-500/50',
        dot: 'bg-amber-500',
        bubble: 'bg-amber-50 border-amber-200 dark:bg-amber-500/[0.16] dark:border-amber-500/35',
        lane: 'bg-amber-500/[0.05]',
        edge: 'border-amber-400/60',
        border: 'border-l-amber-500',
        text: 'text-amber-600 dark:text-amber-400',
    },
    violet: {
        avatar: 'bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-violet-500/30',
        chip: 'bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-400 border-violet-200 dark:border-violet-800',
        ring: 'ring-violet-500/50',
        dot: 'bg-violet-500',
        bubble: 'bg-violet-50 border-violet-200 dark:bg-violet-500/[0.16] dark:border-violet-500/35',
        lane: 'bg-violet-500/[0.05]',
        edge: 'border-violet-400/60',
        border: 'border-l-violet-500',
        text: 'text-violet-600 dark:text-violet-400',
    },
    cyan: {
        avatar: 'bg-gradient-to-br from-cyan-500 to-sky-600 shadow-cyan-500/30',
        chip: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-900/20 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800',
        ring: 'ring-cyan-500/50',
        dot: 'bg-cyan-500',
        bubble: 'bg-cyan-50 border-cyan-200 dark:bg-cyan-500/[0.16] dark:border-cyan-500/35',
        lane: 'bg-cyan-500/[0.05]',
        edge: 'border-cyan-400/60',
        border: 'border-l-cyan-500',
        text: 'text-cyan-600 dark:text-cyan-400',
    },
    rose: {
        avatar: 'bg-gradient-to-br from-rose-500 to-pink-600 shadow-rose-500/30',
        chip: 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400 border-rose-200 dark:border-rose-800',
        ring: 'ring-rose-500/50',
        dot: 'bg-rose-500',
        bubble: 'bg-rose-50 border-rose-200 dark:bg-rose-500/[0.16] dark:border-rose-500/35',
        lane: 'bg-rose-500/[0.05]',
        edge: 'border-rose-400/60',
        border: 'border-l-rose-500',
        text: 'text-rose-600 dark:text-rose-400',
    },
};

export const agentColor = (c) => AGENT_COLORS[c] || AGENT_COLORS.blue;

/** Panel recipe — aligned with the Execution Center:
 *  light = white card; dark = zinc-900/50 card with zinc-800 border. */
export const GLASS_PANEL = 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 dark:backdrop-blur-xl dark:ring-1 dark:ring-white/[0.04] shadow-lg dark:shadow-xl';

/** Exec-center selected/active pattern. */
export const ACTIVE_CARD = 'bg-blue-500/5 border-blue-500 shadow-[inset_4px_0_0_0_#3b82f6]';

export const SITE_STATUS = {
    good: { fill: '#10b981', label: '正常' },
    warn: { fill: '#f59e0b', label: '劣化' },
    bad: { fill: '#f43f5e', label: '严重劣化' },
    boost: { fill: '#06b6d4', label: '协同增强' },
    idle: { fill: '#71717a', label: '空闲' },
};

export const KIND_BADGES = {
    request: { zh: '请求', en: 'Request', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 border-blue-200 dark:border-blue-800' },
    response: { zh: '响应', en: 'Response', cls: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400 border-purple-200 dark:border-purple-800' },
    info: { zh: '通知', en: 'Info', cls: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700' },
    alert: { zh: '告警', en: 'Alert', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-800' },
    a2at: { zh: 'A2A-T', en: 'A2A-T', cls: 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border-violet-200 dark:border-violet-800' },
};
