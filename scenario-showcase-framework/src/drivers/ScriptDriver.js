// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/** ScriptDriver — pure-demo replay (no mockAgent involved).
 *
 *  Drives the UI from the case's scripted timeline (`script[]` events at
 *  virtual seconds), exactly like the original inline playback logic. Events
 *  are emitted in normalized shape: {type:'message'|'step'|'panel', ...}.
 *
 *  sink: { onEvent(ev), onProgress({tSec, endAt}), onDone(), onError(msg) }
 */
export const createScriptDriver = (caseData, sink) => {
    const TICK_MS = 200;   // real-time tick
    const TICK_SEC = 0.2;  // virtual seconds per tick at 1x

    const script = [...(caseData?.script || [])].sort((a, b) => (a.at || 0) - (b.at || 0));
    const endAt = script.reduce((m, e) => Math.max(m, e.at || 0), 0);

    let applied = 0;
    let tSec = 0;
    let timer = null;
    let finished = false;

    const tick = () => {
        tSec += TICK_SEC;
        let i = applied;
        while (i < script.length && (script[i].at || 0) <= tSec) {
            sink.onEvent(script[i]);
            i += 1;
        }
        applied = i;
        sink.onProgress({ tSec, endAt });
        if (!finished && applied >= script.length && tSec > endAt + 1.2) {
            finished = true;
            stop();
            sink.onDone();
        }
    };

    const start = () => {
        if (timer == null && !finished) timer = setInterval(tick, TICK_MS);
    };
    const stop = () => {
        if (timer != null) { clearInterval(timer); timer = null; }
    };

    return { kind: 'script', start, stop, endAt };
};
