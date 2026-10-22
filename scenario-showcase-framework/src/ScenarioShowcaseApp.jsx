// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Scenario Showcase — 场景 Case 通用演示界面 (generic scenario case demo page).
 *
 * Layout (per design spec):
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ header: brand · title · telemetry · case selector          │
 *   ├──────────┬─────────────────────────────────────────────────┤
 *   │ history  │  agent team bar (how many agents, who is active)│
 *   │ (left)   ├──────────────────────────┬──────────────────────┤
 *   │ past     │  interaction flow        │  conversation stream │
 *   │ runs     │  + custom panels (map…)  │  (agent messages)    │
 *   └──────────┴──────────────────────────┴──────────────────────┘
 *
 * Fully config-driven: cases.json + cases/<id>.json are deployed next to the
 * bundle — add a scenario case without rebuilding (same pattern as the
 * virtual-showroom cards.json). A scripted timeline drives the step statuses,
 * the conversation stream and the custom panels; playback auto-starts and
 * runs at 1×. Theme is pinned to the dark conference look.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, MessagesSquare, Route } from 'lucide-react';
import { absoluteUrl, detectLang, ensureI18n, pickLang, resolvePluginBase } from './env.js';
import { I18N_RES } from './i18n.js';
import { createDriver } from './drivers/index.js';
import HistorySidebar from './components/HistorySidebar.jsx';
import TraceFlowView from './components/TraceFlowView.jsx';
import AgentTraceView from './components/AgentTraceView.jsx';
import AgentLogView from './components/AgentLogView.jsx';
import AgentTeamBar from './components/AgentTeamBar.jsx';
import InteractionFlowPanel from './components/InteractionFlowPanel.jsx';
import ConversationStream from './components/ConversationStream.jsx';
import CustomPanelsArea from './components/panels/index.jsx';

const PLUGIN_BASE = resolvePluginBase();
ensureI18n(I18N_RES);

const initialStepStatus = (steps) => {
    const map = {};
    (steps || []).forEach((s) => { map[s.id] = 'pending'; });
    return map;
};

const initialPanelData = (panels) => {
    const map = {};
    (panels || []).forEach((p) => { map[p.id] = { ...(p.initial || {}) }; });
    return map;
};

/** Apply a batch of panel events to the panel data map. */
function applyPanelEvents(prev, events) {
    let next = prev;
    for (const ev of events) {
        const cur = next[ev.panel] || {};
        let merged = cur;
        if (ev.action === 'set') {
            merged = { ...(ev.data || {}) };
        } else if (ev.action === 'push') {
            const series = ev.data?.series;
            const value = ev.data?.value;
            const points = { ...(cur.points || {}) };
            if (series) {
                points[series] = [...(points[series] || []), value];
            }
            merged = { ...cur, points };
        } else { // merge (default)
            merged = { ...cur, ...(ev.data || {}) };
        }
        next = { ...next, [ev.panel]: merged };
    }
    return next;
}

const ScenarioShowcaseApp = () => {
    const [lang, setLang] = useState(detectLang());
    // Fixed DARK conference theme — never follows the portal toggle, so the
    // page always renders the dark look (per review).
    const isDark = true;
    const [cases, setCases] = useState([]);          // case index from cases.json
    const [historyAll, setHistoryAll] = useState([]); // merged history of ALL cases
    const [caseId, setCaseId] = useState(null);
    const [caseData, setCaseData] = useState(null);
    const [loadError, setLoadError] = useState('');

    // playback state
    const [isPlaying, setIsPlaying] = useState(false);
    const [tSec, setTSec] = useState(0);
    const [messages, setMessages] = useState([]);
    const [stepStatus, setStepStatus] = useState({});
    const [stepTimes, setStepTimes] = useState({}); // step id -> {active, done} virtual-clock seconds
    const [panelData, setPanelData] = useState({});
    const [endAtSec, setEndAtSec] = useState(0);
    const [driverDone, setDriverDone] = useState(false);
    const [driverError, setDriverError] = useState('');
    const driverRef = useRef(null);

    // DSH-style big tabs: 对话 (everything existing) | 轨迹 (composite trace
    // view: agent execution timeline + A2A-T message flow + Agent logs).
    //   ?tab=trace deep-links straight to the trajectory tab.
    const [mainTab, setMainTab] = useState(() => {
        try {
            return new URLSearchParams(window.location.search).get('tab') === 'trace' ? 'trace' : 'chat';
        } catch (e) {
            return 'chat';
        }
    });

    // Agent-log panel: ONLY the real mockAgent service log (polled via
    // GET /mockagent/logs?session=<current run> while an agent run is live).
    // Filtering by the CURRENT session keeps each round's log self-contained —
    // a new execution never drags previous rounds' lines back in (the server
    // ring is global across sessions). Pure-demo (script) mode launches no
    // agent service → the log panel stays empty by design.
    const [svcLogs, setSvcLogs] = useState([]);
    const [svcSession, setSvcSession] = useState('');

    const tr = useCallback((key, zhText, enText) => ((lang === 'zh') ? zhText : enText), [lang]);
    const pick = useCallback((value) => pickLang(lang, value), [lang]);

    // startup injection from the launcher (e.g. the Virtual Showroom card):
    //   ?agents=id1,id2  — which agents are started (filters team / PSOP steps /
    //                      replay messages); omitted = all agents
    //   ?driver=mockAgent|script — override the case's default driver (every
    //                      case supports BOTH: pure demo timeline + mockAgent
    //                      service); omitted = case default
    //   ?autostart=0     — do not auto-start the interaction driver
    //   ?src=showroom    — provenance chip in the header
    //   ?hist=0          — start with the history sidebar EXPANDED (default: collapsed)
    const startup = useMemo(() => {
        try {
            const p = new URLSearchParams(window.location.search);
            const dv = p.get('driver');
            return {
                agents: (p.get('agents') || '').split(',').map((s) => s.trim()).filter(Boolean),
                driver: (dv === 'mockAgent' || dv === 'script') ? dv : '',
                autostart: p.get('autostart') !== '0',
                src: p.get('src') || '',
            };
        } catch (e) {
            return { agents: [], driver: '', autostart: true, src: '' };
        }
    }, []);

    // effective driver mode: '' = follow the case default. Every case supports
    // BOTH drivers (pure demo timeline + real mockAgent service); the header
    // toggle / ?driver= switches between them and restarts the run.
    const [driverMode, setDriverMode] = useState(startup.driver || '');

    // history sidebar — COLLAPSED by default (max stage space); ?hist=0
    // opens it (deep links / showroom launch options)
    const [histCollapsed, setHistCollapsed] = useState(() => {
        try {
            return new URLSearchParams(window.location.search).get('hist') !== '0';
        } catch (e) {
            return true;
        }
    });

    // follow the portal language toggle
    useEffect(() => {
        try {
            const ctx = (typeof window !== 'undefined' && window.__OPENAN_PORTAL_CONTEXT__) || null;
            const i18n = ctx && ctx.i18n;
            if (i18n && typeof i18n.on === 'function') {
                const handler = () => setLang(detectLang());
                i18n.on('languageChanged', handler);
                return () => { try { i18n.off('languageChanged', handler); } catch (e) { /* ignore */ } };
            }
        } catch (e) { /* ignore */ }
        return undefined;
    }, []);

    // let the launch handshake live-switch the language of this persistent
    // window (the launcher passes the portal's current language on every click)
    useEffect(() => {
        window.__OPENAN_SCENARIO_LANG_SETTER__ = (l) => setLang(l === 'zh' ? 'zh' : 'en');
        return () => { try { delete window.__OPENAN_SCENARIO_LANG_SETTER__; } catch (e) { /* ignore */ } };
    }, []);

    const resetPlayback = useCallback((data) => {
        setTSec(0);
        setMessages([]);
        setStepStatus(initialStepStatus(data?.steps));
        setStepTimes({});
        setPanelData(initialPanelData(data?.panels));
        setEndAtSec(0);
        setDriverDone(false);
        setDriverError('');
        setSvcLogs([]);
        setSvcSession(''); // new round: wait for the fresh session id before polling logs
    }, []);

    /** Normalized driver-event application (shared by both drivers). Messages
     *  get an `at` fallback (virtual-clock seconds) and step transitions are
     *  time-stamped into stepTimes — both feed the trace views. */
    const tSecRef = useRef(0);
    const applyEvent = useCallback((ev) => {
        if (!ev || !ev.type) return;
        if (ev.type === 'message') {
            setMessages((prev) => [...prev, (typeof ev.at === 'number') ? ev : { ...ev, at: tSecRef.current }]);
        } else if (ev.type === 'step') {
            const st = ev.status || 'done';
            setStepStatus((prev) => ({ ...prev, [ev.id]: st }));
            setStepTimes((prev) => ({ ...prev, [ev.id]: { ...(prev[ev.id] || {}), [st]: tSecRef.current } }));
        } else if (ev.type === 'panel') {
            setPanelData((prev) => applyPanelEvents(prev, [ev]));
        }
    }, []);

    // load case index, then the case selected via ?case= (deep link) or the first
    useEffect(() => {
        let dead = false;
        (async () => {
            try {
                // standalone dev injects the index directly (no static hosting)
                const localIndex = (typeof window !== 'undefined' && window.__OPENAN_SCENARIO_CASES__) || null;
                let list;
                if (localIndex) {
                    list = (localIndex.cases || []).filter((c) => c && c.enabled !== false);
                } else {
                    const res = await fetch(`${absoluteUrl(PLUGIN_BASE, 'cases.json')}?t=${Date.now()}`, { cache: 'no-store' });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const idx = await res.json();
                    list = (idx.cases || []).filter((c) => c && c.enabled !== false);
                }
                if (dead) return;
                setCases(list);
                let wanted = null;
                try {
                    wanted = new URLSearchParams(window.location.search).get('case');
                } catch (e) { /* ignore */ }
                const chosen = list.find((c) => c.id === wanted) || list[0];
                if (chosen) setCaseId(chosen.id);
                // aggregate history across ALL cases — the sidebar shows every
                // scenario's replay entries (click one to switch scenario)
                const localData = (typeof window !== 'undefined' && window.__OPENAN_SCENARIO_CASES_DATA__) || null;
                const loads = await Promise.all(list.map(async (c) => {
                    try {
                        let data = localData && localData[c.id];
                        if (!data) {
                            const res = await fetch(`${absoluteUrl(PLUGIN_BASE, `cases/${c.id}.json`)}?t=${Date.now()}`, { cache: 'no-store' });
                            if (!res.ok) throw new Error(`HTTP ${res.status}`);
                            data = await res.json();
                        }
                        return {
                            caseId: c.id,
                            caseTitle: data.title || c.title || { zh: c.id, en: c.id },
                            driver: data.driver || 'script',
                            history: data.history || [],
                        };
                    } catch (e) {
                        return null; // one broken case must not break the sidebar
                    }
                }));
                if (dead) return;
                const merged = loads.filter(Boolean).flatMap((c) => (c.history || []).map((h) => ({
                    ...h,
                    mode: h.mode || (c.driver === 'mockAgent' ? 'agent' : 'demo'),
                    caseId: c.caseId,
                    caseTitle: c.caseTitle,
                })));
                merged.sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')));
                setHistoryAll(merged);
            } catch (e) {
                if (!dead) setLoadError(String((e && e.message) || e));
            }
        })();
        return () => { dead = true; };
    }, []);

    // load the selected case definition
    useEffect(() => {
        if (!caseId) return undefined;
        let dead = false;
        (async () => {
            try {
                setCaseData(null);
                setLoadError('');
                const localData = (typeof window !== 'undefined' && window.__OPENAN_SCENARIO_CASES_DATA__) || null;
                let data;
                if (localData && localData[caseId]) {
                    data = localData[caseId];
                } else {
                    const url = `${absoluteUrl(PLUGIN_BASE, `cases/${caseId}.json`)}?t=${Date.now()}`;
                    const res = await fetch(url, { cache: 'no-store' });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    data = await res.json();
                }
                if (dead) return;
                // startup injection: apply the launcher's agent startup options —
                // only started agents join the team, the PSOP keeps their steps,
                // and replay messages of non-started agents are filtered out
                if (startup.agents.length) {
                    const started = new Set(startup.agents);
                    data = {
                        ...data,
                        agents: (data.agents || []).filter((a) => started.has(a.id)),
                        steps: (data.steps || []).filter((s) => started.has(s.agent)),
                        script: (data.script || []).filter((ev) => (
                            ev.type !== 'message' || started.has(ev.from)
                        )),
                    };
                }
                setCaseData(data);
                resetPlayback(data);
                setDriverMode(startup.driver || ''); // new case → its default driver (or ?driver=)
                setIsPlaying(true);
            } catch (e) {
                if (!dead) setLoadError(String((e && e.message) || e));
            }
        })();
        return () => { dead = true; };
    }, [caseId, resetPlayback, startup]);

    // interaction driver — every case supports BOTH: 'script' (pure demo
    // replay from case.script[], launches no agent service) and 'mockAgent'
    // (real execution: events pulled from the mockAgent service). Page entry
    // defaults to Agent 执行; explicit overrides: URL ?driver= / header
    // toggle / showroom launch options. Switching recreates the driver.
    const effDriver = driverMode || 'mockAgent';
    useEffect(() => {
        if (!caseData) return undefined;
        const driver = createDriver({ ...caseData, driver: effDriver }, {
            onEvent: applyEvent,
            onProgress: ({ tSec: t, endAt }) => {
                tSecRef.current = t;
                setTSec(t);
                if (endAt > 0) setEndAtSec(endAt);
            },
            onSession: (sid) => setSvcSession(sid || ''),
            onDone: () => { setDriverDone(true); setIsPlaying(false); },
            onError: (msg) => setDriverError(String(msg || 'driver error')),
        });
        driverRef.current = driver;
        if (startup.autostart) driver.start();
        return () => {
            driverRef.current = null;
            driver.stop();
        };
    }, [caseData, applyEvent, startup, effDriver]);

    // Agent-log panel: poll the mockAgent service log for the CURRENT session
    // only (1s cadence while playing) + one final pull when it completes.
    // No session id yet (start still in flight) → no polling at all, so a
    // fresh round never flashes the previous rounds' lines.
    useEffect(() => {
        if (effDriver !== 'mockAgent' || !svcSession || !caseData?.mockAgent?.endpoint || mainTab !== 'trace') return undefined;
        const endpoint = String(caseData.mockAgent.endpoint).replace(/\/+$/, '');
        let dead = false;
        const pull = async () => {
            try {
                const res = await fetch(`${endpoint}/logs?limit=200&session=${encodeURIComponent(svcSession)}&_=${Date.now()}`, { cache: 'no-store' });
                const out = await res.json();
                if (!dead && out && out.ok) setSvcLogs(out.lines || []);
            } catch (e) { /* service down — the driver error banner covers it */ }
        };
        if (isPlaying) {
            pull();
            const iv = setInterval(pull, 1000);
            return () => { dead = true; clearInterval(iv); };
        }
        if (driverDone) pull(); // final state
        return () => { dead = true; };
    }, [effDriver, caseData, mainTab, isPlaying, driverDone, svcSession]);

    const handleCaseChange = useCallback((id) => {
        setCaseId(id);
        try {
            const u = new URL(window.location.href);
            u.searchParams.set('case', id);
            window.history.replaceState(null, '', u.toString());
        } catch (e) { /* ignore */ }
    }, []);

    // the agent currently speaking = author of the newest message
    const speakingAgent = messages.length ? messages[messages.length - 1].from : null;

    const doneCount = useMemo(
        () => Object.values(stepStatus).filter((s) => s === 'done').length,
        [stepStatus],
    );
    const totalSteps = (caseData?.steps || []).length;
    const progressPct = totalSteps ? Math.round((doneCount / totalSteps) * 100) : 0;
    const clockLabel = `${String(Math.floor(tSec / 60)).padStart(2, '0')}:${String(Math.floor(tSec % 60)).padStart(2, '0')}`;
    const isMockAgent = effDriver === 'mockAgent';
    const completed = driverDone || (!isMockAgent && endAtSec > 0 && tSec > endAtSec + 1.2);

    if (loadError) {
        return (
            <div className={`${isDark ? 'dark' : ''} h-full w-full flex items-center justify-center bg-zinc-100 dark:bg-zinc-950`}>
                <div className="text-center">
                    <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{tr('ss.load_failed', '场景配置加载失败', 'Failed to load case config')}</p>
                    <p className="text-xs text-zinc-500 mt-2 font-mono">{loadError}</p>
                    <p className="text-xs text-zinc-400 mt-1 font-mono">{PLUGIN_BASE}</p>
                </div>
            </div>
        );
    }

    return (
        <div
            className={`${isDark ? 'dark' : ''} ss-root relative h-full w-full flex flex-col overflow-hidden bg-zinc-100 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100`}
            style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}
        >
            {/* ── Tech backdrop (dark only): faint blueprint grid + aurora glows ── */}
                                                            
            {/* ── Header — ONE line only: 场景演示 · <case title>. Driver
                selection stays available via the showroom launch options and
                the ?driver= URL param; the history sidebar labels each run's
                mode. Nothing else lives in the header. ── */}
            <header className="relative z-10 shrink-0 h-[48px] px-5 flex items-center border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/95">
                <h1 className="text-[16px] font-bold tracking-tight text-zinc-900 dark:text-white truncate">
                    {tr('ss.title', '场景演示', 'Scenario Showcase')}
                    {caseData && (
                        <span className="text-zinc-400 dark:text-zinc-500 font-semibold">
                            {' · '}
                            {pick(caseData.title)}
                        </span>
                    )}
                </h1>
            </header>

            {/* driver error banner (mockAgent unreachable etc.) */}
            {driverError && (
                <div className="relative z-10 shrink-0 px-6 py-1.5 flex items-center gap-2 bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200 dark:border-amber-500/30 text-[12px] font-bold text-amber-700 dark:text-amber-300">
                    <AlertTriangle size={13} className="shrink-0" />
                    {tr('ss.driver_err', 'mockAgent 连接失败：', 'mockAgent connection failed: ')}
                    <span className="font-mono truncate opacity-80">{driverError}</span>
                </div>
            )}

            {/* progress rail */}
            <div className="relative z-10 shrink-0 h-[2px] bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${isMockAgent ? progressPct : (totalSteps ? (Math.min(tSec, endAtSec) / (endAtSec || 1)) * 100 : 0)}%` }}
                />
            </div>

            {/* ── Body ───────────────────────────────────────────────── */}
            <div className="relative z-10 flex-1 min-h-0 flex">
                {/* Left: scenario history (collapsible via the sidebar chevron) */}
                <aside className={`${histCollapsed ? 'w-10' : 'w-60'} shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 dark:backdrop-blur-md flex flex-col min-h-0 transition-[width] duration-200`}>
                    <HistorySidebar
                        tr={tr}
                        pick={pick}
                        caseData={caseData}
                        driver={effDriver}
                        live={{ progressPct, clockLabel, completed, running: isPlaying }}
                        historyAll={historyAll}
                        activeCaseId={caseId}
                        onOpenCase={handleCaseChange}
                        collapsed={histCollapsed}
                        onToggle={() => setHistCollapsed((v) => !v)}
                    />
                </aside>

                {/* Main column */}
                <main className="flex-1 min-w-0 flex flex-col gap-3 p-3 min-h-0">
                    {/* DSH-style big tabs: 对话 (all existing content) | 轨迹 (traces) */}
                    <div className="shrink-0 flex items-center gap-2 flex-wrap">
                        <div className="inline-flex items-center gap-1 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100/60 dark:bg-zinc-900/60">
                            <button
                                onClick={() => setMainTab('chat')}
                                className={`inline-flex items-center gap-1.5 px-3.5 py-1 rounded-md text-[13px] font-semibold transition-colors ${
                                    mainTab === 'chat'
                                        ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm'
                                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
                            >
                                <MessagesSquare size={14} />
                                {tr('ss.tab_chat', '对话', 'Conversation')}
                            </button>
                            <button
                                onClick={() => setMainTab('trace')}
                                className={`inline-flex items-center gap-1.5 px-3.5 py-1 rounded-md text-[13px] font-semibold transition-colors ${
                                    mainTab === 'trace'
                                        ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm'
                                        : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
                            >
                                <Route size={14} />
                                {tr('ss.tab_trace', '轨迹', 'Trajectory')}
                            </button>
                        </div>
                    </div>

                    {mainTab === 'chat' ? (
                        <>
                            {/* Top: agent team */}
                            <AgentTeamBar
                                tr={tr}
                                pick={pick}
                                agents={caseData?.agents || []}
                                speakingAgent={speakingAgent}
                                doneCount={doneCount}
                                totalSteps={totalSteps}
                            />

                            {/* Bottom: interaction area (left flow+panels | right conversation) */}
                            <div className="flex-1 min-h-0 flex gap-3">
                                <section className="w-[46%] min-w-0 flex flex-col gap-3">
                                    <InteractionFlowPanel
                                        tr={tr}
                                        pick={pick}
                                        steps={caseData?.steps || []}
                                        agents={caseData?.agents || []}
                                        stepStatus={stepStatus}
                                        progressPct={progressPct}
                                    />
                                    <CustomPanelsArea
                                        tr={tr}
                                        pick={pick}
                                        panels={caseData?.panels || []}
                                        data={panelData}
                                        isDark={isDark}
                                    />
                                </section>
                                <section className="flex-1 min-w-0 min-h-0">
                                    <ConversationStream
                                        tr={tr}
                                        pick={pick}
                                        agents={caseData?.agents || []}
                                        messages={messages}
                                        tSec={tSec}
                                    />
                                </section>
                            </div>
                        </>
                    ) : (
                        /* Trajectory tab — one composite view, no sub-tabs:
                           Agent 执行流 (timeline) on top, 对话流 (A2A-T
                           message flow) and Agent 日志 side by side below. */
                        <div className="flex-1 min-h-0 flex flex-col gap-3">
                            <div className="h-[38%] min-h-[210px] shrink-0">
                                <AgentTraceView
                                    tr={tr}
                                    pick={pick}
                                    agents={caseData?.agents || []}
                                    steps={caseData?.steps || []}
                                    messages={messages}
                                    stepTimes={stepTimes}
                                    tSec={tSec}
                                />
                            </div>
                            <div className="flex-1 min-h-0 flex gap-3">
                                <div className="w-1/2 min-w-0 min-h-0">
                                    <TraceFlowView
                                        tr={tr}
                                        pick={pick}
                                        agents={caseData?.agents || []}
                                        steps={caseData?.steps || []}
                                        messages={messages}
                                    />
                                </div>
                                <div className="w-1/2 min-w-0 min-h-0">
                                    <AgentLogView
                                        tr={tr}
                                        pick={pick}
                                        agents={caseData?.agents || []}
                                        steps={caseData?.steps || []}
                                        lines={svcLogs}
                                        driver={effDriver}
                                        running={isPlaying}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default ScenarioShowcaseApp;
