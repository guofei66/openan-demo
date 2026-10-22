// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/** Shared environment helpers: plugin base URL, language detection, translation.
 *  Mirrors the virtual-showroom plugin conventions (portal context + fallbacks),
 *  so the standalone build and the portal plugin bundle behave identically inside the Portal. */

export function resolvePluginBase() {
    // 1) explicit host override wins (standalone dev sets './')
    try {
        const override = (typeof window !== 'undefined') && window.__OPENAN_SCENARIO_SHOWCASE_BASE__;
        if (typeof override === 'string' && override.trim()) {
            return new URL('.', override.trim()).href;
        }
    } catch (e) { /* ignore */ }
    // 2) the loader injects index.js as a plain <script>; while the module body
    //    executes, document.currentScript is that script → its directory is our base.
    //    NOTE: never use import.meta.url here — Vite's UMD build inlines it as a
    //    data: URL which breaks relative URL resolution.
    try {
        if (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) {
            const u = new URL('.', document.currentScript.src);
            if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
        }
    } catch (e) { /* ignore */ }
    // 3) fixed deployment location (nginx serves the portal root)
    return '/plugins/scenario-showcase/';
}

export function absoluteUrl(base, ref) {
    try {
        return new URL(ref, base).href;
    } catch (e) {
        return ref;
    }
}

export function getPortalI18n() {
    try {
        const ctx = (typeof window !== 'undefined' && window.__OPENAN_PORTAL_CONTEXT__) || null;
        return (ctx && ctx.i18n) || null;
    } catch (e) {
        return null;
    }
}

export function getPortalTheme() {
    try {
        const ctx = (typeof window !== 'undefined' && window.__OPENAN_PORTAL_CONTEXT__) || null;
        if (ctx && ctx.theme && typeof ctx.theme.isDark === 'boolean') return ctx.theme;
    } catch (e) { /* ignore */ }
    return null;
}

/** Resolve current language: launcher ?lang= → portal i18n → localStorage → navigator → 'en'.
 *  The URL param comes from the launcher (e.g. the showroom card passes the
 *  portal's current language), so a cross-origin standalone page can follow
 *  the portal even though its localStorage is a different origin's. */
export function detectLang() {
    // 0) explicit launcher intent via ?lang=
    try {
        const p = (typeof window !== 'undefined') && new URLSearchParams(window.location.search).get('lang');
        if (p) return String(p).toLowerCase().startsWith('zh') ? 'zh' : 'en';
    } catch (e) { /* ignore */ }
    try {
        const i18n = getPortalI18n();
        if (i18n) {
            const l = i18n.resolvedLanguage || i18n.language || (Array.isArray(i18n.languages) && i18n.languages[0]);
            if (l) return String(l).toLowerCase().startsWith('zh') ? 'zh' : 'en';
        }
        const stored = (typeof localStorage !== 'undefined') && (localStorage.getItem('lang') || localStorage.getItem('i18nextLng'));
        if (stored) return String(stored).toLowerCase().startsWith('zh') ? 'zh' : 'en';
    } catch (e) { /* ignore */ }
    try {
        const nav = typeof navigator !== 'undefined' && navigator.language;
        if (nav) return String(nav).toLowerCase().startsWith('zh') ? 'zh' : 'en';
    } catch (e) { /* ignore */ }
    return 'en';
}

/** Register the plugin i18n bundle into the portal i18next instance (idempotent). */
export function ensureI18n(resources) {
    try {
        const i18n = getPortalI18n();
        if (i18n && typeof i18n.addResourceBundle === 'function') {
            for (const [lng, data] of Object.entries(resources)) {
                i18n.addResourceBundle(lng, 'translation', data, true, true);
            }
            return true;
        }
    } catch (e) { /* ignore */ }
    return false;
}

/** Pick a localized field from case data: value may be {zh, en} or a plain string. */
export function pickLang(lang, value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
        return (lang === 'zh' ? (value.zh || value.en || '') : (value.en || value.zh || ''));
    }
    return String(value);
}
