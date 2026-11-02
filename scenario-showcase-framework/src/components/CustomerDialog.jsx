// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/** 人机对话 tab — the human-machine dialog where the CUSTOMER interacts with
 *  the CRM agent:
 *    1. the customer types the assurance requirement into the chat input;
 *    2. CRM replies in the conversation (intent echo / parse updates);
 *    3. configuration-change authorizations are relayed to the customer HERE
 *       by CRM as chat cards with Approve / Reject buttons (the replay stays
 *       frozen until the decision).
 *  Everything else (team task progress, PSOP workflow, agent panels) lives in
 *  the 任务处理 tab. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, ArrowRight, ShieldAlert, ShieldCheck, Send, MessagesSquare, Quote, CheckCircle2, Lightbulb, Zap, AlertTriangle, Workflow, Play, UserRound } from 'lucide-react';

const fmtClock = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/** Preset customer intents (下拉框选项) — the customer picks one instead of
 *  typing; the selected text becomes the CRM agent's customer intent.
 *  Bilingual {zh,en}: the option label AND the submitted requirement text
 *  follow the UI language. */
const INTENT_OPTIONS = [
    {
        zh: '12月10日，XX地区进行马拉松比赛，对比赛进行赛事体验保障，保障赛事期间的用户上网体验',
        en: 'Dec 10 — a marathon is held in XX district; provide event experience assurance to safeguard user internet access during the race',
    },
    {
        zh: '12月31日，XX市体育中心举办大型跨年演唱会，对活动进行用户体验保障，保障现场直播与分享体验',
        en: 'Dec 31 — a large New Year countdown concert is held at XX Sports Center; provide event experience assurance for the live broadcast and sharing experience',
    },
    {
        zh: '1月15日，XX国际会展中心举办大型行业峰会，对展会进行体验保障，保障展商与观众的上网体验',
        en: 'Jan 15 — a large industry summit is held at XX International Convention & Exhibition Center; provide event experience assurance for exhibitors and attendees',
    },
];

/** CRM bubble (left, agent avatar) — may carry the customer-intent envelope. */
const CrmBubble = ({ m, pick, tr }) => (
    <div className="flex gap-2.5 ss-fade-up">
        <div className="w-8 h-8 rounded-lg bg-rose-500 flex items-center justify-center shadow-md shrink-0">
            <Bot size={16} className="text-white" />
        </div>
        <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
                <span className="text-[12px] font-bold text-zinc-500 dark:text-zinc-400">
                    {tr('ss.dialog_crm', 'CRM智能体', 'CRM Agent')}
                </span>
                <span className="text-[11px] font-mono text-zinc-300 dark:text-zinc-600 tabular-nums">{fmtClock(m.at || 0)}</span>
            </div>
            <div className="mt-1 inline-block max-w-[92%] rounded-xl border px-3 py-2 bg-zinc-50 border-zinc-200 dark:bg-zinc-800 dark:border-zinc-700">
                <p className="text-[14px] leading-relaxed text-zinc-800 dark:text-zinc-100 whitespace-pre-line break-words">{pick(m.text)}</p>
                {m.intent && (
                    <div className="mt-1.5 rounded-lg border border-rose-300 dark:border-rose-500/40 bg-rose-50/70 dark:bg-rose-500/[0.08] px-2.5 py-1.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-rose-600 dark:text-rose-300">
                            <Quote size={10} className="shrink-0" />
                            {tr('ss.intent', '客户意图', 'Customer Intent')}
                            {m.intent.reqId && <span className="font-mono font-semibold opacity-70">{m.intent.reqId}</span>}
                        </div>
                        <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-700 dark:text-zinc-200">{pick(m.intent.text)}</p>
                    </div>
                )}
            </div>
        </div>
    </div>
);

/** Customer bubble (right, rose) — the verbatim typed requirement. */
const CustomerBubble = ({ text, tr }) => (
    <div className="flex gap-2.5 justify-end ss-fade-up">
        <div className="min-w-0 flex-1 flex flex-col items-end">
            <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-mono text-zinc-300 dark:text-zinc-600">
                    {tr('ss.dialog_customer', 'admin', 'admin')}
                </span>
            </div>
            <div className="mt-1 inline-block max-w-[92%] rounded-xl border px-3 py-2 bg-rose-500 border-rose-500 shadow-sm">
                <p className="text-[14px] leading-relaxed text-white whitespace-pre-line break-words">{text}</p>
            </div>
        </div>
        <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center shadow-md shrink-0">
            <UserRound size={16} className="text-white" />
        </div>
    </div>
);

/** Authorization card relayed by CRM — pending: Approve/Reject buttons;
 *  decided: the outcome badge. Mirrors the AuthModal content in chat form. */
const AuthChatCard = ({ m, decision, pending, onDecide, pick, tr }) => {
    const d = m.auth || {};
    return (
        <div className="flex gap-2.5 ss-fade-up">
            <div className="w-8 h-8 rounded-lg bg-rose-500 flex items-center justify-center shadow-md shrink-0">
                <Bot size={16} className="text-white" />
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-bold text-zinc-500 dark:text-zinc-400">
                        {tr('ss.dialog_crm', 'CRM智能体', 'CRM Agent')}
                    </span>
                    <span className="text-[11px] font-mono text-zinc-300 dark:text-zinc-600 tabular-nums">{fmtClock(m.at || 0)}</span>
                </div>
                <div className={`mt-1 max-w-[94%] rounded-xl border px-3 py-2 ${
                    decision === 'approved'
                        ? 'border-emerald-500/50 bg-emerald-500/[0.06]'
                        : decision === 'rejected'
                            ? 'border-rose-500/50 bg-rose-500/[0.06]'
                            : 'border-amber-300 dark:border-amber-500/40 bg-amber-50/70 dark:bg-amber-500/[0.08]'
                }`}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {decision === 'approved' ? <ShieldCheck size={13} className="text-emerald-500" /> : <ShieldAlert size={13} className={pending ? 'text-amber-500' : 'text-rose-400'} />}
                        <span className="text-[13px] font-bold text-zinc-800 dark:text-zinc-100">
                            {pending
                                ? tr('ss.dialog_auth_req', '配置变更授权请求', 'Configuration change authorization')
                                : tr('ss.dialog_auth_done', '配置变更授权', 'Configuration change authorization')}
                        </span>
                        {d.source && (
                            <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                                {d.source}
                            </span>
                        )}
                        {d.via && (
                            <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                                {pick(d.via)}
                            </span>
                        )}
                    </div>
                    <p className="mt-1 text-[13px] font-semibold text-zinc-700 dark:text-zinc-200">{pick(d.title)}</p>
                    {d.why && (
                        <div className="mt-1.5 flex gap-1.5 items-start">
                            <Lightbulb size={12} className="text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                                <span className="font-bold text-zinc-500 dark:text-zinc-400">{tr('ss.auth_why', '业务描述：', 'Description: ')}</span>{pick(d.why)}
                            </p>
                        </div>
                    )}
                    {d.action && (
                        <div className="mt-1 flex gap-1.5 items-start">
                            <Zap size={12} className="text-sky-500 shrink-0 mt-0.5" />
                            <p className="text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                                <span className="font-bold text-zinc-500 dark:text-zinc-400">{tr('ss.auth_action', '授权动作：', 'Authorized action: ')}</span>{pick(d.action)}
                            </p>
                        </div>
                    )}
                    <div className="mt-1.5 space-y-1">
                        {(d.changes || []).map((c, k) => (
                            <div key={k} className="flex items-center gap-1.5 flex-wrap text-[12px]">
                                <span className="font-bold text-zinc-600 dark:text-zinc-300">{pick(c.label)}</span>
                                <span className="text-zinc-400 dark:text-zinc-500 line-through">{pick(c.from)}</span>
                                <ArrowRight size={11} className="text-emerald-500 shrink-0" />
                                <span className="font-bold text-emerald-600 dark:text-emerald-400">{pick(c.to)}</span>
                            </div>
                        ))}
                    </div>
                    {d.impact && (
                        <div className="mt-1.5 flex gap-1.5 items-start rounded-lg bg-amber-500/[0.07] border border-amber-500/25 px-2 py-1.5">
                            <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-[12px] leading-relaxed text-amber-700 dark:text-amber-300">
                                <span className="font-bold">{tr('ss.auth_impact', '可能的影响：', 'Possible impact: ')}</span>{pick(d.impact)}
                            </p>
                        </div>
                    )}
                    {pending ? (
                        <div className="mt-2 flex items-center gap-2">
                            <span className="text-[11px] text-zinc-500 dark:text-zinc-400 animate-pulse">
                                {tr('ss.dialog_auth_wait', '执行已暂停，等待您的授权决定…', 'Execution paused — awaiting your decision…')}
                            </span>
                            <div className="ml-auto flex items-center gap-2">
                                <button
                                    onClick={() => onDecide('rejected')}
                                    className="px-3 py-1 rounded-lg text-[12px] font-bold border border-rose-400 text-rose-500 hover:bg-rose-500/10 transition-colors"
                                >
                                    {tr('ss.auth_reject', '拒绝', 'Reject')}
                                </button>
                                <button
                                    onClick={() => onDecide('approved')}
                                    className="px-3 py-1 rounded-lg text-[12px] font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-all shadow-md shadow-emerald-500/30 ring-2 ring-emerald-400/50 hover:ring-emerald-400/80 inline-flex items-center gap-1"
                                >
                                    <ShieldCheck size={12} />
                                    {tr('ss.auth_approve', '同意授权', 'Approve')}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className={`mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold border ${
                            decision === 'approved'
                                ? 'border-emerald-500/50 bg-emerald-500/[0.08] text-emerald-500'
                                : 'border-rose-500/50 bg-rose-500/[0.08] text-rose-400'
                        }`}>
                            {decision === 'approved' ? <ShieldCheck size={11} /> : <ShieldAlert size={11} />}
                            {decision === 'approved'
                                ? tr('ss.auth.ok', '已授权执行', 'approved — executing')
                                : tr('ss.auth.no', '已拒绝：维持现网配置', 'rejected — keeping current configuration')}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

/** CRM closing summary card — rendered when the assurance flow completes;
 *  the CRM agent hands the customer a structured wrap-up of the whole run. */
const SummaryCard = ({ m, pick, tr }) => {
    const s = m.summary || {};
    return (
        <div className="flex gap-2.5 ss-fade-up">
            <div className="w-8 h-8 rounded-lg bg-rose-500 flex items-center justify-center shadow-md shrink-0">
                <Bot size={16} className="text-white" />
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-bold text-zinc-500 dark:text-zinc-400">
                        {tr('ss.dialog_crm', 'CRM智能体', 'CRM Agent')}
                    </span>
                    <span className="text-[11px] font-mono text-zinc-300 dark:text-zinc-600 tabular-nums">{fmtClock(m.at || 0)}</span>
                </div>
                <div className="mt-1 max-w-[94%] rounded-xl border border-emerald-500/40 bg-emerald-500/[0.05] px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                        <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                        <span className="text-[13px] font-bold text-zinc-800 dark:text-zinc-100">{pick(s.title)}</span>
                    </div>
                    <div className="mt-2 space-y-1.5">
                        {(s.rows || []).map((r, k) => (
                            <div key={k} className="flex gap-2 text-[12px] leading-relaxed">
                                <span className="shrink-0 w-[52px] text-right font-bold text-zinc-400 dark:text-zinc-500">{pick(r.label)}</span>
                                <span className="min-w-0 flex-1 text-zinc-700 dark:text-zinc-200">{pick(r.value)}</span>
                            </div>
                        ))}
                    </div>
                    {s.close && (
                        <div className="mt-2 pt-2 border-t border-emerald-500/20 text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
                            {pick(s.close)}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

/** Workflow-orchestration confirmation card — the CRM agent presents the
 *  orchestrated execution plan (steps × agents) and the customer must
 *  confirm before the workflow starts; confirming resumes execution and
 *  jumps to the 智能体群组 tab. */
const OrchestrationCard = ({ m, orchState, onConfirm, pick, tr }) => {
    const o = m.orchestration || {};
    const pending = orchState === 'pending';
    const confirmed = orchState === 'confirmed';
    return (
        <div className="flex gap-2.5 ss-fade-up">
            <div className="w-8 h-8 rounded-lg bg-rose-500 flex items-center justify-center shadow-md shrink-0">
                <Bot size={16} className="text-white" />
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-bold text-zinc-500 dark:text-zinc-400">
                        {tr('ss.dialog_crm', 'CRM智能体', 'CRM Agent')}
                    </span>
                    <span className="text-[11px] font-mono text-zinc-300 dark:text-zinc-600 tabular-nums">{fmtClock(m.at || 0)}</span>
                </div>
                <div className={`mt-1 max-w-[94%] rounded-xl border px-3 py-2.5 ${confirmed ? 'border-emerald-500/40 bg-emerald-500/[0.05]' : 'border-sky-500/40 bg-sky-500/[0.05]'}`}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <Workflow size={14} className={`${confirmed ? 'text-emerald-500' : 'text-sky-500'} shrink-0`} />
                        <span className="text-[13px] font-bold text-zinc-800 dark:text-zinc-100">{pick(o.title)}</span>
                        {confirmed && (
                            <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold border border-emerald-500/50 bg-emerald-500/[0.08] text-emerald-500">
                                <CheckCircle2 size={11} />
                                {tr('ss.orch_confirmed', '编排已确认 · 执行已启动', 'Confirmed · executing')}
                            </span>
                        )}
                    </div>
                    {o.agents && (
                        <p className="mt-1 text-[11px] font-semibold text-sky-600 dark:text-sky-300">{pick(o.agents)}</p>
                    )}
                    <div className="mt-2 space-y-1">
                        {(o.steps || []).map((s, k) => (
                            <div key={k} className="flex items-center gap-2 text-[12px] leading-relaxed">
                                <span className="shrink-0 w-4 h-4 rounded bg-sky-500/15 text-sky-600 dark:text-sky-300 text-[10px] font-bold flex items-center justify-center">{k + 1}</span>
                                <span className="min-w-0 flex-1 text-zinc-700 dark:text-zinc-200">{pick(s.name)}</span>
                                <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">{pick(s.agent)}</span>
                            </div>
                        ))}
                    </div>
                    {pending ? (
                        <div className="mt-2 flex items-center gap-2">
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                                {tr('ss.orch_wait', '执行已暂停，等待您确认编排…', 'Execution paused — confirm the orchestration…')}
                            </div>
                            <button
                                onClick={onConfirm}
                                className="ml-auto px-3 py-1 rounded-lg text-[12px] font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-all shadow-md shadow-emerald-500/30 ring-2 ring-emerald-400/50 hover:ring-emerald-400/80 inline-flex items-center gap-1 shrink-0"
                            >
                                <Play size={12} />
                                {tr('ss.orch_confirm', '确认执行', 'Confirm & start')}
                            </button>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
};

const CustomerDialog = ({ tr, pick, messages, awaitingCustomer, customerText, onSubmitCustomer, authDecisions = {}, authIdx = -1, onDecideAuth, orchState = 'none', onConfirmOrchestration, tSec }) => {
    const scrollRef = useRef(null);
    const stickRef = useRef(true);
    const [sel, setSel] = useState(INTENT_OPTIONS[0].zh);
    useEffect(() => {
        const el = scrollRef.current;
        if (el && stickRef.current) el.scrollTop = el.scrollHeight;
    }, [messages, authIdx]);
    const onScroll = (e) => {
        const el = e.currentTarget;
        stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    };

    // dialog items: everything the CRM agent says (to the customer or to the
    // team — parsing, assembly, handover, orchestration, summary are all the
    // CRM's narration in the dialog) + auth relays, in message order
    const items = useMemo(() => messages
        .map((m, i) => ({ m, i }))
        .filter(({ m }) => m.from === 'crm' || (m.auth && m.auth.required)), [messages]);

    const send = () => {
        if (!sel || !awaitingCustomer) return;
        // submit the requirement in the UI language (the option object is
        // bilingual; the selected value is its stable zh key)
        const obj = INTENT_OPTIONS.find((x) => x.zh === sel);
        onSubmitCustomer(obj ? pick(obj) : sel);
    };
    const statusChip = awaitingCustomer
        ? tr('ss.dialog_st_wait', '等待需求输入', 'awaiting request')
        : authIdx >= 0
            ? tr('ss.dialog_st_auth', '待授权确认', 'authorization pending')
            : tr('ss.dialog_st_run', '需求已对齐 · 团队处理中', 'aligned · team working');

    return (
        <div className="h-full min-h-0 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 dark:ring-1 dark:ring-white/[0.04] flex flex-col overflow-hidden">
            <div className="shrink-0 px-4 pt-2.5 pb-2 flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800">
                <MessagesSquare size={15} className="text-zinc-400" />
                <span className="text-[15px] font-semibold text-zinc-700 dark:text-zinc-200">
                    {tr('ss.dialog_title', '人机对话', 'Human-Machine Dialog')}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-semibold bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                    <Bot size={11} />
                    {tr('ss.dialog_crm', 'CRM智能体', 'CRM Agent')}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[12px] font-semibold border tabular-nums ${
                    authIdx >= 0
                        ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-200 dark:border-amber-500/30'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'
                }`}>
                    {statusChip}
                </span>
                <span className="ml-auto text-[12px] font-mono text-zinc-400 dark:text-zinc-500 tabular-nums">{fmtClock(tSec)}</span>
            </div>

            <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto ss-scroll px-4 py-3 space-y-3">
                <CrmBubble
                    m={{ at: 0, text: {
                        zh: '您好，我是 CRM 智能体。请从下方选择保障需求意图，我将解析意图并为您组建保障团队。',
                        en: 'Hello, this is the CRM Agent. Please pick your assurance intent below — I will parse it and assemble an assurance team for you.',
                    } }}
                    pick={pick}
                    tr={tr}
                />
                {customerText && <CustomerBubble text={customerText} tr={tr} />}
                {items.map(({ m, i }) => (
                    m.orchestration
                        ? <OrchestrationCard key={i} m={m} orchState={orchState} onConfirm={onConfirmOrchestration} pick={pick} tr={tr} />
                        : m.summary
                            ? <SummaryCard key={i} m={m} pick={pick} tr={tr} />
                            : m.auth && m.auth.required
                                ? <AuthChatCard key={i} m={m} decision={authDecisions[i]} pending={authIdx === i} onDecide={(d) => onDecideAuth(i, d)} pick={pick} tr={tr} />
                                : <CrmBubble key={i} m={m} pick={pick} tr={tr} />
                ))}
            </div>

            <div className="shrink-0 border-t border-zinc-100 dark:border-zinc-800 px-3 py-2 flex items-center gap-2">
                <select
                    value={sel}
                    onChange={(e) => setSel(e.target.value)}
                    disabled={!awaitingCustomer}
                    className="flex-1 min-w-0 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-2.5 py-2 text-[13px] text-zinc-800 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-rose-400/60 disabled:opacity-60"
                >
                    {!awaitingCustomer && <option value="">{tr('ss.dialog_aligned', '需求已对齐 — 切换「智能体群组」页签查看团队执行进度', 'Requirement aligned — see the Agent Group tab')}</option>}
                    {INTENT_OPTIONS.map((o) => (
                        <option key={o.zh} value={o.zh}>{pick(o)}</option>
                    ))}
                </select>
                <button
                    onClick={send}
                    disabled={!awaitingCustomer || !sel}
                    className="shrink-0 inline-flex items-center gap-1 px-3.5 py-2 rounded-lg text-[13px] font-bold text-white bg-rose-500 hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                    <Send size={13} />
                    {tr('ss.dialog_send', '发送', 'Send')}
                </button>
            </div>
        </div>
    );
};

export default CustomerDialog;
