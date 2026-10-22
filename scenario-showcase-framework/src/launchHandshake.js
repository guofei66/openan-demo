// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/** Launch handshake — lets a cross-origin launcher (e.g. the Virtual Showroom
 *  card) detect that this page is ALREADY open in a named window and just
 *  focus it, instead of re-navigating (which would reset the replay state).
 *
 *  Protocol: the launcher posts {type:'openan-scenario-ping', lang?, url?} to
 *  the window; this page replies {type:'openan-scenario-pong'} back to the
 *  launcher and focuses itself. No listener / no pong → the launcher
 *  navigates the window. Details:
 *   - `lang` ('zh'|'en') live-switches the page language without a reload.
 *   - `url` (the full launch URL) is compared with the current location: if
 *     the launch OPTIONS changed (driver mode / agents / case / language),
 *     this page relaunches ITSELF at the new URL — same window, new options.
 *     An identical URL (same options re-clicked) keeps the replay state.
 *
 *  Imported (side-effect) by BOTH entries: the standalone shell (main.jsx)
 *  and the portal plugin bundle (index.jsx). */
export function installLaunchHandshake() {
    if (typeof window === 'undefined' || window.__OPENAN_SCENARIO_HANDSHAKE__) return;
    window.__OPENAN_SCENARIO_HANDSHAKE__ = true;
    window.addEventListener('message', (ev) => {
        const data = ev && ev.data;
        if (data && data.type === 'openan-scenario-ping' && ev.source) {
            try {
                ev.source.postMessage({ type: 'openan-scenario-pong', case: data.case || '' }, '*');
                const stripHash = (u) => String(u || '').split('#')[0];
                if (data.url && stripHash(data.url) !== stripHash(window.location.href)) {
                    window.location.href = data.url; // options changed → relaunch in place
                    return;
                }
                if (data.lang === 'zh' || data.lang === 'en') {
                    const setter = window.__OPENAN_SCENARIO_LANG_SETTER__;
                    if (typeof setter === 'function') setter(data.lang);
                }
                window.focus();
            } catch (e) { /* ignore */ }
        }
    });
}
