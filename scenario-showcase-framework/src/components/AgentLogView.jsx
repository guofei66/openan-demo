// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/** Trace view 3 — Agent 日志: terminal-style log stream, shown ONLY from the
 *  real mockAgent service (polled via GET /mockagent/logs — the same lines
 *  that land in mockagent.log on the server). Pure-demo (script) mode
 *  launches no agent service, so the panel stays empty by design.
 *  Lines are organized under per-agent tabs (全部 + one colored tab per
 *  agent): a line belongs to its primary agent — the message sender or the
 *  step owner, i.e. the chip that leads the line. Session lifecycle lines
 *  (SESSION START / DONE / errors) appear in every tab as run context;
 *  unattributed lines (panel pushes) appear only under 全部. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Terminal, Radio, Inbox } from 'lucide-react';
import { agentColor } from '../colors.js';

/** Terminal chip classes per agent color key (same palette as AGENT_COLORS). */
const TAG_CLS = {
    blue: 'bg-blue-500/10 text-blue-300 border-blue-500/40',
    indigo: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/40',
    emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40',
    amber: 'bg-amber-500/10 text-amber-300 border-amber-500/40',
    violet: 'bg-violet-500/10 text-violet-300 border-violet-500/40',
    cyan: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/40',
    rose: 'bg-rose-500/10 text-rose-300 border-rose-500/40',
};

const lineCls = (line) => {
    if (/SESSION START/.test(line)) return 'text-emerald-400 font-bold';
    if (/DONE/.test(line)) return 'text-emerald-300 font-bold';
    if (/FAIL|UNKNOWN|BAD-JSON/.test(line)) return 'text-rose-400 font-bold';
    if (/kind=a2at/.test(line)) return 'text-violet-300';
    if (/^.*\] RECV /.test(line)) return 'text-sky-300';
    if (/^.*\] (?:SENT|REPLY) /.test(line)) return 'text-zinc-200';
    if (/^.*\] NEXT .*message/.test(line)) return 'text-sky-300';
    if (/^.*\] NEXT .*panel/.test(line)) return 'text-cyan-300';
    if (/^.*\] NEXT .*step/.test(line)) return 'text-zinc-400';
    if (/listening on/.test(line)) return 'text-zinc-500';
    return 'text-zinc-400';
};

/** Compact colored dot — attribution by color only (identity lives in the
 *  tabs; hover shows the raw id). Names are NOT repeated inside log lines. */
const AgentDot = ({ agent }) => (
    <span
        title={agent ? agent.id : ''}
        className={`inline-block w-2 h-2 rounded-full shrink-0 ${agent ? agentColor(agent.color).dot : 'bg-zinc-600'}`}
    />
);

/** Primary agent of a log line: message sender / step owner; null = none.
 *  New agent-perspective lines: SENT/REPLY → the sender; RECV → the receiver. */
const lineAgentId = (ln, stepsById) => {
    const m = ln.match(/^(\[[^\]]+\])\s+(.*)$/s);
    if (!m) return null;
    const rest = m[2];
    let mm = rest.match(/^(?:SENT|REPLY) session=\S+ case=\S+ \[\d+\/\d+\] from=(\S+)/);
    if (mm) return mm[1];
    mm = rest.match(/^RECV session=\S+ case=\S+ \[\d+\/\d+\] to=(\S+)/);
    if (mm) return mm[1];
    const tokens = rest.split(' ');
    const mi = tokens.indexOf('message');
    if (mi !== -1 && tokens[mi + 2] === '->' && tokens[mi + 3]) return tokens[mi + 1];
    const si = tokens.indexOf('step');
    if (si !== -1 && tokens[si + 2] === '->') return stepsById[tokens[si + 1]] || null;
    return null;
};

/** Session lifecycle lines are run context — shown in every agent tab. */
const isGlobalLine = (ln) => /SESSION START|DONE|listening on|FAIL|UNKNOWN|BAD-JSON/.test(ln);

/** Localized message text from a log line's msg_zh/msg_en fields. */
const pickText = (zh, en, pick) => {
    const v = pick({ zh: zh || '', en: en || '' });
    return v || '';
};

/** Parse one raw log line into mixed text/dot segments. New agent-perspective
 *  lines carry the message content:
 *    SENT/REPLY session=… from=A to=B kind=k msg_zh="…" msg_en="…"
 *    RECV     session=… to=B from=A kind=k msg_zh="…" msg_en="…"
 *  Rendered (全部 tab, dots = agents, text localized):
 *    ● [15:08:01] 发送 → ● kind=request 「…」
 *    ● [15:08:01] 收到 ← ● kind=request 「…」
 *  In a per-agent tab the lead dot is dropped (the tab is the agent). */
const renderLine = (ln, agentsById, stepsById, pick, tr, showLead) => {
    const m = ln.match(/^(\[[^\]]+\])\s+(.*)$/s);
    if (!m) return [<span key="t">{ln}</span>];
    const [, ts, rest] = m;

    let mm = rest.match(/^(SENT|REPLY) session=\S+ case=\S+ \[\d+\/\d+\] from=(\S+) to=(\S+) kind=(\S+) msg_zh="([^"]*)" msg_en="([^"]*)"/);
    if (mm) {
        const [, verb, from, to, kind, zh, en] = mm;
        const text = pickText(zh, en, pick);
        return [
            showLead ? <AgentDot key="lead" agent={agentsById[from]} /> : null,
            <span key="ts" className="text-zinc-600">{showLead ? ' ' : ''}{ts} </span>,
            <span key="v" className="font-bold">{verb === 'REPLY' ? tr('ss.log_reply', '回复', 'reply') : tr('ss.log_send', '发送', 'send')} </span>,
            <span key="arr" className="text-zinc-500">→ </span>,
            <AgentDot key="to" agent={agentsById[to]} />,
            <span key="k" className="text-zinc-600"> {kind}</span>,
            text ? <span key="msg" className="text-zinc-300">「{text}」</span> : null,
        ];
    }
    mm = rest.match(/^RECV session=\S+ case=\S+ \[\d+\/\d+\] to=(\S+) from=(\S+) kind=(\S+) msg_zh="([^"]*)" msg_en="([^"]*)"/);
    if (mm) {
        const [, to, from, kind, zh, en] = mm;
        const text = pickText(zh, en, pick);
        return [
            showLead ? <AgentDot key="lead" agent={agentsById[to]} /> : null,
            <span key="ts" className="text-zinc-600">{showLead ? ' ' : ''}{ts} </span>,
            <span key="v" className="font-bold">{tr('ss.log_recv', '收到', 'recv')} </span>,
            <span key="arr" className="text-zinc-500">← </span>,
            <AgentDot key="from" agent={agentsById[from]} />,
            <span key="k" className="text-zinc-600"> {kind}</span>,
            text ? <span key="msg" className="text-zinc-300">「{text}」</span> : null,
        ];
    }

    const tokens = rest.split(' ');
    const mi = tokens.indexOf('message');
    const si = tokens.indexOf('step');

    if (mi !== -1 && tokens[mi + 2] === '->' && tokens[mi + 3]) {
        const from = tokens[mi + 1];
        const to = tokens[mi + 3];
        const tail = tokens.slice(mi + 4).join(' ');
        return [
            showLead ? <AgentDot key="lead" agent={agentsById[from]} /> : null,
            <span key="ts" className="text-zinc-600">{showLead ? ' ' : ''}{ts} </span>,
            <span key="kw"> message </span>,
            <span key="arr" className="text-zinc-500">→ </span>,
            <AgentDot key="to" agent={agentsById[to]} />,
            tail ? <span key="tail"> {tail}</span> : null,
        ];
    }
    if (si !== -1 && tokens[si + 2] === '->') {
        const stepId = tokens[si + 1];
        const owner = stepsById[stepId];
        const tail = tokens.slice(si + 2).join(' ');
        return [
            (showLead && owner) ? <AgentDot key="lead" agent={agentsById[owner]} /> : null,
            <span key="ts" className="text-zinc-600">{showLead ? ' ' : ''}{ts} </span>,
            <span key="kw"> step </span>,
            <span key="id" className="font-bold text-zinc-200">{stepId}</span>,
            <span key="tail"> {tail}</span>,
        ];
    }
    // panel / session / done / raw lines keep the timestamp first
    return [
        <span key="ts" className="text-zinc-600">{ts} </span>,
        <span key="rest">{rest}</span>,
    ];
};

const AgentLogView = ({ tr, pick, agents, steps, lines, driver, running }) => {
    const boxRef = useRef(null);
    const [tab, setTab] = useState('all'); // 'all' | agent id

    const agentsById = useMemo(() => {
        const m = {};
        (agents || []).forEach((a) => { m[a.id] = a; });
        return m;
    }, [agents]);
    const stepsById = useMemo(() => {
        const m = {};
        (steps || []).forEach((s) => { m[s.id] = s.agent; });
        return m;
    }, [steps]);

    const isAgent = driver === 'mockAgent';
    // active tab must exist in the current case's agent list
    const activeTab = (tab !== 'all' && agentsById[tab]) ? tab : 'all';

    const filtered = useMemo(() => {
        if (activeTab === 'all') return lines;
        return lines.filter((ln) => lineAgentId(ln, stepsById) === activeTab || isGlobalLine(ln));
    }, [lines, activeTab, stepsById]);

    useEffect(() => {
        const el = boxRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [filtered.length]);

    return (
        <div className="h-full min-h-0 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-950 dark:ring-1 dark:ring-white/[0.04] flex flex-col overflow-hidden">
            {/* header */}
            <div className="shrink-0 px-4 pt-2.5 pb-2 flex items-center gap-2 border-b border-zinc-800">
                <Terminal size={15} className="text-emerald-400" />
                <span className="text-[15px] font-semibold text-emerald-300">
                    {tr('ss.trace_log', 'Agent 日志', 'Agent Logs')}
                </span>
                {isAgent && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-emerald-500/10 text-emerald-300 border-emerald-500/40">
                        <Radio size={10} />{tr('ss.log_src_svc', '服务日志', 'SERVICE')}
                    </span>
                )}
                <span className="ml-auto text-[12px] font-mono text-zinc-500">{filtered.length} {tr('ss.log_lines', '行', 'lines')}</span>
            </div>

            {/* per-agent tabs */}
            <div className="shrink-0 px-3 py-1.5 flex items-center gap-1 flex-wrap border-b border-zinc-800/70">
                <button
                    type="button"
                    onClick={() => setTab('all')}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-semibold border transition-colors ${
                        activeTab === 'all'
                            ? 'bg-zinc-800 text-zinc-100 border-zinc-600'
                            : 'text-zinc-500 border-zinc-800 hover:text-zinc-300 hover:border-zinc-700'}`}
                >
                    <Inbox size={11} />
                    {tr('ss.log_all', '全部', 'All')}
                </button>
                {(agents || []).map((a) => {
                    const cls = TAG_CLS[a.color] || TAG_CLS.blue;
                    const on = activeTab === a.id;
                    return (
                        <button
                            key={a.id}
                            type="button"
                            title={a.id}
                            onClick={() => setTab(a.id)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-bold border transition-colors ${
                                on ? cls : 'text-zinc-500 border-zinc-800 hover:text-zinc-300 hover:border-zinc-700'}`}
                        >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${agentColor(a.color).dot}`} />
                            {pick(a.name)}
                        </button>
                    );
                })}
            </div>

            {/* terminal body */}
            <div ref={boxRef} className="flex-1 min-h-0 overflow-y-auto ss-scroll px-4 py-3 bg-zinc-950">
                {!filtered.length && (
                    <p className="text-[13px] text-zinc-600 py-6 text-center font-mono">
                        {!lines.length
                            ? (isAgent
                                ? tr('ss.log_empty', '等待 Agent 运行…', 'waiting for agent run…')
                                : tr('ss.log_demo_empty', '纯 Demo 回放 · 未拉起 Agent 服务，无日志', 'pure demo replay · no agent service, no logs'))
                            : tr('ss.log_no_lines', '该智能体暂无日志行', 'no log lines for this agent')}
                    </p>
                )}
                {filtered.map((ln, i) => (
                    <div key={i} className={`text-[12px] leading-relaxed font-mono whitespace-pre-wrap break-words ${lineCls(ln)}`}>
                        {renderLine(ln, agentsById, stepsById, pick, tr, activeTab === 'all')}
                    </div>
                ))}
            </div>

            {/* footer */}
            <div className="shrink-0 px-4 py-1.5 border-t border-zinc-800">
                <p className="text-[11px] text-zinc-600 font-mono truncate">
                    {isAgent
                        ? 'GET /mockagent/logs · live 1s poll'
                        : tr('ss.log_demo_hint', '切换 Agent 执行模式可拉取真实服务日志', 'switch to Agent mode to fetch real service logs')}
                </p>
            </div>
        </div>
    );
};

export default AgentLogView;
