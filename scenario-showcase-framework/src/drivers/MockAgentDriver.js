// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/** MockAgentDriver — interaction driven by the mockAgent service.
 *
 *  Instead of a local scripted timeline, every message / step / panel update
 *  is PULLED from the mockAgent HTTP service (which "returns the message
 *  content"). Protocol:
 *      POST {endpoint}/start  {case}              -> {ok, session, total}
 *      POST {endpoint}/next   {session}           -> {ok, event, remaining} | event.type === 'done'
 *      POST {endpoint}/reset  {session}           -> {ok}
 *  Each returned event uses the SAME schema as script-timeline events, so the
 *  UI components stay identical across drivers. Events are paced by
 *  `event.waitMs` (or case.mockAgent.turnDelayMs) to keep the replay feel.
 *
 *  Agent 答复模式（case.mockAgent.mode：'workflow' | 'llm' | 'dataset'，由展厅
 *  卡片拉起选项 / ?mode= 注入）：剧本仍是脊柱——步骤、面板与请求类消息原样
 *  回放，但 kind === 'response' 的应答文本改为实时调用 Playground 打桩实例
 *  （A2A message:send，metadata.replyMode = 所选模式）生成。调用失败或角色
 *  未配置映射时回退剧本文本并计数，演示永不断流。空 / 'bank' = 剧本回放
 *  （原行为）。case.mockAgent.agentCalls 提供实例端点与角色映射：
 *      { endpoint, roles: { <agentId>: { instance, template } } }
 *
 *  sink: { onEvent(ev), onProgress({tSec, endAt}), onDone(), onError(msg),
 *          onNotice?(stats) } — onNotice 携带模式执行统计 {mode, ok, fallback}。
 */

// 协议族 → A2A-T 扩展 URI（与 Playground 前端 templates.js 保持一致）
const EXTENSION_URIS = {
    'Task-T': 'https://projects.tmforum.org/a2aproject/telecommunication/extensions/Task-T/v1',
    'Notification-T': 'https://projects.tmforum.org/a2aproject/telecommunication/extensions/Notification-T/v1',
    'Authorization-T': 'https://projects.tmforum.org/a2aproject/telecommunication/extensions/Authorization-T/v1',
    'Negotiation-T': 'https://projects.tmforum.org/a2aproject/telecommunication/extensions/Negotiation-T/v1',
};

const AGENT_CALL_TIMEOUT_MS = 90000; // 冷实例首跑工作流（加载 SDK + PSOP 派发）可能较慢，超时则回退剧本文案
const GENERATED_TEXT_CAP = 1500;

function uuid() {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
    } catch (e) { /* ignore */ }
    return `msg-${Date.now()}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export const createMockAgentDriver = (caseData, sink) => {
    const cfg = caseData?.mockAgent || {};
    const endpoint = (cfg.endpoint || '').replace(/\/+$/, '');
    const caseKey = cfg.caseKey || caseData?.id;
    const turnDelayMs = typeof cfg.turnDelayMs === 'number' ? cfg.turnDelayMs : 1500;

    // —— Agent 答复模式：空 = 剧本回放；workflow/llm/dataset = 应答实时生成 ——
    const replyMode = String(cfg.mode || '').trim().toLowerCase();
    const modeActive = (replyMode === 'workflow' || replyMode === 'llm' || replyMode === 'dataset');
    const calls = modeActive ? (cfg.agentCalls || {}) : null;
    const callEndpoint = ((calls && calls.endpoint) || '/openan-playground/api/v1/mock-instances').replace(/\/+$/, '');
    const roleMap = (calls && calls.roles) || {};
    const reportNotice = () => {
        if (modeActive && typeof sink.onNotice === 'function') {
            sink.onNotice({ mode: replyMode, ok: agentOk, fallback: agentFallback, degraded: agentDegraded });
        }
    };

    let stopped = false;
    let timer = null;
    let session = null;
    let tSec = 0;
    let lastPrompt = '';      // 最近一条非应答消息的中文文本 → 作为 agent 请求 prompt
    let agentOk = 0;          // 成功生成的应答数
    let agentFallback = 0;    // 回退剧本的应答数（调用失败 / 超时 / 角色未映射）
    let agentDegraded = 0;    // 服务端模式降级数（如 LLM 未配 key → 数据集匹配）
    let asked = 0;            // 发起过调用的应答数（用于 onDone 时的统计上报）

    const post = async (path, body) => {
        const res = await fetch(`${endpoint}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            cache: 'no-store',
        });
        if (!res.ok) throw new Error(`mockAgent HTTP ${res.status}`);
        return res.json();
    };

    const sleep = (ms) => new Promise((resolve) => { timer = setTimeout(resolve, ms); });

    /** 调用打桩实例（A2A message:send）按所选模式生成应答文本；失败返回 null。
     *  成功返回 { text, modeInfo }——modeInfo 来自 artifact metadata 的
     *  openan.replyMode（{mode, used, fallback}），用于展示服务端降级。 */
    const askAgent = async (role) => {
        const roleCfg = roleMap[role];
        if (!roleCfg || !roleCfg.instance || !roleCfg.template) return null;
        const family = String(roleCfg.template).split('/')[0];
        const extUri = EXTENSION_URIS[family];
        const prompt = lastPrompt || '执行保障任务';
        const metadata = { templateUri: roleCfg.template, replyMode };
        if (extUri) metadata[extUri] = prompt;
        const controller = new AbortController();
        const abortTimer = setTimeout(() => { try { controller.abort(); } catch (e) { /* ignore */ } }, AGENT_CALL_TIMEOUT_MS);
        try {
            const res = await fetch(`${callEndpoint}/${roleCfg.instance}/a2a/message:send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'A2A-Version': '1.0' },
                body: JSON.stringify({
                    message: {
                        messageId: uuid(),
                        role: 'ROLE_USER',
                        parts: [{ text: prompt }],
                        metadata,
                    },
                }),
                cache: 'no-store',
                signal: controller.signal,
            });
            if (!res.ok) return null;
            const out = await res.json();
            const task = out && out.task;
            if (!task || task.status?.state !== 'TASK_STATE_COMPLETED') return null;
            const artifact = (task.artifacts || [])[0];
            const part = artifact && (artifact.parts || [])[0];
            if (!part) return null;
            let modeInfo = null;
            try {
                const raw = artifact.metadata && artifact.metadata['openan.replyMode'];
                if (raw) modeInfo = JSON.parse(raw);
            } catch (e) { modeInfo = null; }
            let text = null;
            if (typeof part.text === 'string' && part.text.trim()) {
                text = part.text.trim();
            } else if (part.data && typeof part.data === 'object') {
                // JSON 型桩变体：序列化展示（数据集匹配路径通常返回 prompt 文本型）
                text = JSON.stringify(part.data, null, 1);
            }
            if (!text) return null;
            if (text.length > GENERATED_TEXT_CAP) text = `${text.slice(0, GENERATED_TEXT_CAP)}…`;
            return { text, modeInfo };
        } catch (e) {
            return null;
        } finally {
            clearTimeout(abortTimer);
        }
    };

    const pump = async () => {
        while (!stopped) {
            let out;
            try {
                out = await post('/next', { session });
            } catch (e) {
                if (!stopped) sink.onError(String((e && e.message) || e));
                return;
            }
            const ev = out && out.event;
            if (!ev || ev.type === 'done') {
                sink.onProgress({ tSec, endAt: tSec });
                reportNotice();
                if (!stopped) sink.onDone();
                return;
            }
            const wait = typeof ev.waitMs === 'number' ? ev.waitMs : turnDelayMs;
            tSec += wait / 1000;

            let emit = ev;
            if (ev.type === 'message') {
                // 维护最近上下文（请求 / 告警 / 状态消息的中文文本作为 prompt）
                if (ev.kind !== 'response' && ev.text && typeof ev.text === 'object' && ev.text.zh) {
                    lastPrompt = String(ev.text.zh);
                }
                // 应答消息：模式激活且角色有实例映射 → 实时生成替换文本
                if (ev.kind === 'response' && roleMap[ev.from]) {
                    asked += 1;
                    const out = await askAgent(ev.from);
                    if (out !== null) {
                        agentOk += 1;
                        // 服务端降级：请求了 workflow/llm 但实例不可用 → 回退数据集匹配
                        const degraded = !!(out.modeInfo && out.modeInfo.used && out.modeInfo.used !== replyMode);
                        if (degraded) agentDegraded += 1;
                        emit = {
                            ...ev,
                            text: { zh: out.text, en: out.text },
                            generated: true,
                            replyMode,
                            modeInfo: out.modeInfo,
                            degraded,
                        };
                    } else {
                        agentFallback += 1;
                        emit = { ...ev, replyMode, fallback: true };
                    }
                    reportNotice();
                }
            }

            // stamp the virtual-clock time so trace views / clocks work like
            // the script driver (whose events carry `at` in the timeline)
            if (!stopped) sink.onEvent({ ...emit, at: (typeof emit.at === 'number') ? emit.at : Math.round(tSec * 10) / 10 });
            sink.onProgress({ tSec, endAt: 0 });
            await sleep(wait);
        }
    };

    const start = async () => {
        if (!endpoint) {
            sink.onError('mockAgent endpoint not configured (case.mockAgent.endpoint)');
            return;
        }
        try {
            const out = await post('/start', { case: caseKey });
            if (!out || !out.ok || !out.session) throw new Error((out && out.error) || 'start failed');
            session = out.session;
            // surface the session id so the Agent-log panel can poll ONLY
            // this run's lines (GET /mockagent/logs?session=…) — otherwise
            // every new round would drag the previous rounds' logs back in.
            if (!stopped && typeof sink.onSession === 'function') sink.onSession(out.session);
        } catch (e) {
            sink.onError(String((e && e.message) || e));
            return;
        }
        reportNotice();
        pump();
    };

    const stop = () => {
        stopped = true;
        if (timer != null) { clearTimeout(timer); timer = null; }
    };

    return { kind: 'mockAgent', start, stop };
};
