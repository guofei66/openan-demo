// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/** Bottom-left lower half — custom display area: tabbed panels driven by the
 *  case config (`panels[]`). Panel types are pluggable via PANEL_TYPES. */
import React, { useEffect, useState } from 'react';
import { Layers, Map as MapIcon, LineChart, Puzzle } from 'lucide-react';
import MapPanel from './MapPanel.jsx';
import ChartPanel from './ChartPanel.jsx';

export const PANEL_TYPES = {
    map: { icon: MapIcon, component: MapPanel },
    chart: { icon: LineChart, component: ChartPanel },
};

const FallbackPanel = ({ type }) => (
    <div className="h-full flex flex-col items-center justify-center text-zinc-300 dark:text-zinc-600">
        <Puzzle size={28} strokeWidth={1.5} />
        <p className="text-xs mt-2 font-mono">panel type “{type}” — no renderer registered</p>
    </div>
);

const CustomPanelsArea = ({ tr, pick, panels, data, isDark }) => {
    const [tab, setTab] = useState(0);
    useEffect(() => { setTab(0); }, [panels]);

    if (!panels.length) return null;
    const active = panels[Math.min(tab, panels.length - 1)];
    const ActiveComp = (PANEL_TYPES[active.type] || {}).component || FallbackPanel;
    const activeData = (data || {})[active.id] || {};

    return (
        <div className="h-[40%] shrink-0 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 dark:ring-1 dark:ring-white/[0.04] flex flex-col overflow-hidden">
            <div className="shrink-0 px-2 pt-2 pb-0 flex items-center gap-1 border-b border-zinc-100 dark:border-zinc-800 overflow-x-auto ss-scroll">
                <Layers size={14} className="text-zinc-400 ml-2 mr-1 shrink-0" />
                {panels.map((p, i) => {
                    const Icon = (PANEL_TYPES[p.type] || {}).icon || Puzzle;
                    return (
                        <button
                            key={p.id}
                            onClick={() => setTab(i)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-[13px] font-semibold transition-all whitespace-nowrap
                                ${i === (tab < panels.length ? tab : 0)
                                ? 'bg-zinc-100 dark:bg-zinc-800/60 text-zinc-900 dark:text-cyan-300 border-t border-x border-zinc-200 dark:border-zinc-700'
                                : 'text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300'}`}
                        >
                            <Icon size={14} />
                            {pick(p.title)}
                        </button>
                    );
                })}
            </div>
            <div className="flex-1 min-h-0">
                <ActiveComp config={active.config || {}} data={activeData} isDark={isDark} />
            </div>
        </div>
    );
};

export default CustomPanelsArea;
