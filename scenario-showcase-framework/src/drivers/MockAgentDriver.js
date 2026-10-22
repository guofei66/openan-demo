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
 *  sink: { onEvent(ev), onProgress({tSec, endAt}), onDone(), onError(msg) }
 */
export const createMockAgentDriver = (caseData, sink) => {
    const cfg = caseData?.mockAgent || {};
    const endpoint = (cfg.endpoint || '').replace(/\/+$/, '');
    const caseKey = cfg.caseKey || caseData?.id;
    const turnDelayMs = typeof cfg.turnDelayMs === 'number' ? cfg.turnDelayMs : 1500;

    let stopped = false;
    let timer = null;
    let session = null;
    let tSec = 0;

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
                if (!stopped) sink.onDone();
                return;
            }
            const wait = typeof ev.waitMs === 'number' ? ev.waitMs : turnDelayMs;
            tSec += wait / 1000;
            // stamp the virtual-clock time so trace views / clocks work like
            // the script driver (whose events carry `at` in the timeline)
            if (!stopped) sink.onEvent({ ...ev, at: (typeof ev.at === 'number') ? ev.at : Math.round(tSec * 10) / 10 });
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
        pump();
    };

    const stop = () => {
        stopped = true;
        if (timer != null) { clearTimeout(timer); timer = null; }
    };

    return { kind: 'mockAgent', start, stop };
};
