/**
 * Virtual Showroom (虚拟展厅 / Demo Showcase) — OpenAN Portal plugin entry.
 *
 * Renders a card gallery of OpenAN demo showcases. Cards are fully driven by
 * `cards.json` deployed next to the plugin bundle — add or edit cards there,
 * no rebuild needed. Card layout mirrors the openan.dev best-practices card:
 * cover image + category + title + description + link.
 *
 * i18n: menu label + in-page strings follow the portal language. Resources are
 * self-registered into the portal i18next instance (same pattern as the
 * registry-center plugin), and the manifest labelKey uses the namespaced form
 * ("virtual-showroom:nav.title") which the portal loader resolves via the
 * plugin name ("Demo Showcase" → zh "虚拟展厅" is also in the portal's own
 * translation table — double coverage).
 */
import { useCallback, useEffect, useState } from 'react';
import './index.css';

/* ------------------------------------------------------------------ *
 * i18n resources (registered into the portal i18next instance)
 * ------------------------------------------------------------------ */
const I18N_RES = {
    en: {
        translation: {
            'Demo Showcase': 'Demo Showcase',
            'virtual-showroom:nav.title': 'Virtual Showroom',
            'virtual-showroom.title': 'Virtual Showroom',
            'virtual-showroom.subtitle': 'OpenAN Demos · driven by cards.json',
            'virtual-showroom.open': 'Open Demo',
            'virtual-showroom.refresh': 'Refresh',
            'virtual-showroom.items': 'showcase items',
            'virtual-showroom.loading': 'Loading showroom cards…',
            'virtual-showroom.errorTitle': 'Failed to load card config (cards.json)',
            'virtual-showroom.retry': 'Retry',
            'virtual-showroom.empty': 'No cards yet: add cards in cards.json, then click Refresh.',
        },
        'virtual-showroom': { nav: { title: 'Virtual Showroom' } },
    },
    zh: {
        translation: {
            'Demo Showcase': '虚拟展厅',
            'virtual-showroom:nav.title': '虚拟展厅',
            'virtual-showroom.title': '虚拟展厅',
            'virtual-showroom.subtitle': 'OpenAN Demo 展厅 · 由 cards.json 配置驱动',
            'virtual-showroom.open': '打开 Demo',
            'virtual-showroom.refresh': '刷新',
            'virtual-showroom.items': '个展示项',
            'virtual-showroom.loading': '正在加载展厅卡片配置…',
            'virtual-showroom.errorTitle': '卡片配置加载失败（cards.json）',
            'virtual-showroom.retry': '重试',
            'virtual-showroom.empty': '暂无展示卡片：请在 cards.json 中配置卡片后点击刷新。',
        },
        'virtual-showroom': { nav: { title: '虚拟展厅' } },
    },
};

let i18nRegistered = false;

/** Register our resources into the portal i18next instance (idempotent). */
function ensureI18n() {
    if (i18nRegistered) return;
    try {
        const ctx = (typeof window !== 'undefined' && window.__OPENAN_PORTAL_CONTEXT__) || null;
        const i18n = ctx && ctx.i18n;
        if (i18n && typeof i18n.addResourceBundle === 'function') {
            for (const [lng, res] of Object.entries(I18N_RES)) {
                for (const [ns, data] of Object.entries(res)) {
                    i18n.addResourceBundle(lng, ns, data, true, true);
                }
            }
            i18nRegistered = true;
        }
    } catch (e) { /* portal context not ready — the menu label still resolves
                       via the portal's own "Demo Showcase" table entry */ }
}

function getI18n() {
    try {
        const ctx = (typeof window !== 'undefined' && window.__OPENAN_PORTAL_CONTEXT__) || null;
        return (ctx && ctx.i18n) || null;
    } catch (e) { return null; }
}

function detectLang() {
    try {
        const i18n = getI18n();
        if (i18n && typeof i18n.t === 'function') {
            // 1) Probe the exact key the portal itself renders: always matches the
            //    visible UI, even when i18n.language is undefined at boot (the
            //    portal's languageDetector finds nothing on first visit and falls
            //    back to fallbackLng 'en' — reading .language alone then misses and
            //    would make the plugin follow navigator.language instead).
            try {
                const v = i18n.t('nav.subtitle');
                if (v === '开放自治网络') return 'zh';
                if (v && v !== 'nav.subtitle') return 'en';
            } catch (e) { /* ignore */ }
            const l = i18n.resolvedLanguage || i18n.language || (Array.isArray(i18n.languages) && i18n.languages[0]);
            if (l) return String(l).toLowerCase().startsWith('zh') ? 'zh' : 'en';
        }
        // 2) the portal toggle persists the language here
        const stored = (typeof localStorage !== 'undefined') && (localStorage.getItem('lang') || localStorage.getItem('i18nextLng'));
        if (stored) return String(stored).toLowerCase().startsWith('zh') ? 'zh' : 'en';
    } catch (e) { /* ignore */ }
    try {
        const nav = typeof navigator !== 'undefined' && navigator.language;
        if (nav) return String(nav).toLowerCase().startsWith('zh') ? 'zh' : 'en';
    } catch (e) { /* ignore */ }
    return 'en';
}

/* ------------------------------------------------------------------ *
 * plugin base url
 * ------------------------------------------------------------------ */
function resolvePluginBase() {
    // 1) explicit host override wins
    try {
        const override = window.__OPENAN_SHOWROOM_BASE__;
        if (typeof override === 'string' && override.trim()) {
            return new URL('.', override.trim()).href;
        }
    } catch (e) { /* ignore */ }
    // 2) the loader injects index.js as a plain <script>; while the module body
    //    executes, document.currentScript is that script → its directory is our base.
    //    NOTE: never use import.meta.url here — Vite's UMD build inlines it as a
    //    data:text/jsx URL of the source file, which breaks relative URL resolution.
    try {
        if (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) {
            const u = new URL('.', document.currentScript.src);
            if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
        }
    } catch (e) { /* ignore */ }
    // 3) fixed deployment location (nginx serves the portal root)
    return '/plugins/virtual-showroom/';
}

const PLUGIN_BASE = resolvePluginBase();
ensureI18n(); // register as early as possible (loader ensures portal globals first)

function absoluteUrl(base, ref) {
    try {
        return new URL(ref, base).href;
    } catch (e) {
        return ref;
    }
}

/** Build the scenario-framework launch URL from the card's `launch` config:
 *  case + agent startup options (enabled agents, autostart, driver) + the
 *  portal's current language are carried as URL params, which the framework
 *  parses and injects (PSOP flow, agent team, replay filter, driver mode, UI
 *  language). `opts` overrides the configured defaults (from the launch
 *  options popover: {driver, agents}). */
function buildLaunchUrl(card, lang, opts) {
    const l = card.launch || {};
    const u = new URL(card.url);
    if (l.case) u.searchParams.set('case', l.case);
    const st = { ...((l.startup) || {}), ...(opts || {}) };
    let agents = null;
    if (Array.isArray(st.agents)) agents = st.agents;
    else if (st.agents && typeof st.agents === 'object') {
        agents = Object.keys(st.agents).filter((k) => st.agents[k] && st.agents[k].enabled !== false);
    }
    if (agents && agents.length) u.searchParams.set('agents', agents.join(','));
    if (st.autoStart === false) u.searchParams.set('autostart', '0');
    if (st.driver === 'mockAgent' || st.driver === 'script') u.searchParams.set('driver', st.driver);
    u.searchParams.set('src', 'showroom');
    if (lang === 'zh' || lang === 'en') u.searchParams.set('lang', lang);
    return u.href;
}

/** Launch the scenario framework in a NAMED window: the first click opens and
 *  loads the page; every later click just focuses the same window — the page
 *  (and its replay state) keeps living instead of being re-launched.
 *
 *  The target page is an INDEPENDENT deployment (e.g. the standalone
 *  scenario-showcase server), so it is usually cross-origin: we cannot read
 *  w.location. Instead we probe the page via postMessage — an already-launched
 *  scenario page answers 'openan-scenario-pong' (see the framework's
 *  launchHandshake.js). No pong within the probe window → first launch (or the
 *  tab was navigated away) → navigate it. If the page is alive but the launch
 *  OPTIONS changed (driver mode / agents / language), the framework relaunches
 *  itself at the new URL — the ping carries it. */
function launchScenario(card, lang, opts) {
    const l = card.launch || {};
    const url = buildLaunchUrl(card, lang, opts);
    const name = l.window || `openan-scenario-${l.case || card.id || 'case'}`;
    const langTag = (lang === 'zh' || lang === 'en') ? lang : null;
    let w = null;
    try { w = window.open('about:blank', name); } catch (e) { w = null; }
    if (!w || w.closed) { // popup blocked → fall back to a plain new tab
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
    }
    let alive = false;
    const onPong = (ev) => {
        if (ev && ev.data && ev.data.type === 'openan-scenario-pong') {
            alive = true;
            try { w.focus(); } catch (e) { /* ignore */ }
        }
    };
    window.addEventListener('message', onPong);
    try {
        w.postMessage({ type: 'openan-scenario-ping', case: l.case || '', lang: langTag, url }, '*');
    } catch (e) { /* ignore */ }
    setTimeout(() => {
        window.removeEventListener('message', onPong);
        if (!alive) {
            try { w.location.href = url; } catch (e) { window.open(url, '_blank', 'noopener,noreferrer'); }
        }
    }, 400);
}

function openCard(card, lang) {
    if (!card || !card.url) return;
    if (card.launch && card.launch.type === 'scenario-framework') {
        launchScenario(card, lang);
        return;
    }
    if (card.openIn === 'same-tab') {
        window.location.href = card.url;
        return;
    }
    window.open(card.url, '_blank', 'noopener,noreferrer');
}

/* ------------------------------------------------------------------ *
 * icons
 * ------------------------------------------------------------------ */
function IconRefresh() {
    return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
        </svg>
    );
}

function IconExternal() {
    return (
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 3h6v6" />
            <path d="M10 14 21 3" />
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        </svg>
    );
}

function IconCard() {
    return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="14" rx="2" />
            <path d="M3 10h18" />
            <path d="M7 15h4" />
        </svg>
    );
}

/* ------------------------------------------------------------------ *
 * plugin component
 * ------------------------------------------------------------------ */
export default function VirtualShowroomPlugin() {
    const [lang, setLang] = useState(detectLang());
    const [state, setState] = useState({ status: 'loading', cards: [], error: '' });
    // launch-options popover: which card's popover is open + the selections
    // (driver mode + per-agent startup checkboxes) made in it
    const [launchCard, setLaunchCard] = useState(null);
    const [launchSel, setLaunchSel] = useState({ driver: 'mockAgent', agents: {} });

    // follow portal language switches + (re)register i18n resources
    useEffect(() => {
        ensureI18n();
        setLang(detectLang());
        const i18n = getI18n();
        if (i18n && typeof i18n.on === 'function') {
            const handler = () => setLang(detectLang());
            i18n.on('languageChanged', handler);
            return () => {
                try { i18n.off('languageChanged', handler); } catch (e) { /* ignore */ }
            };
        }
    }, []);

    const tr = useCallback((key, zhText, enText) => {
        try {
            const i18n = getI18n();
            if (i18n && typeof i18n.t === 'function') {
                const v = i18n.t(key);
                if (v && v !== key) return v;
            }
        } catch (e) { /* ignore */ }
        return (lang || detectLang()) === 'zh' ? zhText : enText;
    }, [lang]);

    // pick a card field by current language with cross-language fallback
    const pickLang = useCallback((zhVal, enVal) => (
        (lang || detectLang()) === 'zh' ? (zhVal || enVal || '') : (enVal || zhVal || '')
    ), [lang]);

    /** scenario-framework cards open a launch-options popover (driver mode +
     *  agent startup) instead of launching immediately; other cards open
     *  directly as before. */
    const handleCardClick = useCallback((card) => {
        if (card.launch && card.launch.type === 'scenario-framework') {
            const st = card.launch.startup || {};
            const agentsSel = {};
            (card.launch.agents || []).forEach((a) => {
                agentsSel[a.id] = !Array.isArray(st.agents) || st.agents.indexOf(a.id) !== -1;
            });
            setLaunchSel({
                // Agent 执行 is the popover default (real agent launch);
                // Demo 回放 never launches the agent service.
                driver: st.driver === 'script' ? 'script' : 'mockAgent',
                agents: agentsSel,
            });
            setLaunchCard(card.id || card.url);
            return;
        }
        openCard(card, lang);
    }, [lang]);

    const closeLaunch = useCallback(() => setLaunchCard(null), []);

    const confirmLaunch = useCallback((card) => {
        // Agent 执行 launches the (selected) agents; Demo 回放 is a pure
        // local timeline replay and passes no agent options at all.
        const opts = { driver: launchSel.driver };
        if (launchSel.driver === 'mockAgent') {
            const selected = Object.keys(launchSel.agents).filter((k) => launchSel.agents[k]);
            if (selected.length) opts.agents = selected;
        }
        launchScenario(card, lang, opts);
        setLaunchCard(null);
    }, [lang, launchSel]);

    const load = useCallback(async () => {
        setState({ status: 'loading', cards: [], error: '' });
        try {
            const res = await fetch(`${PLUGIN_BASE}cards.json?t=${Date.now()}`, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const cards = (Array.isArray(data) ? data : data.cards || [])
                .filter((c) => c && c.enabled !== false && c.url)
                .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
            setState({ status: cards.length ? 'ready' : 'empty', cards, error: '' });
        } catch (e) {
            setState({ status: 'error', cards: [], error: String((e && e.message) || e) });
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    return (
        <div className="vs-root">
            <div className="vs-header">
                <div className="vs-header-left">
                    <span className="vs-badge"><IconCard /></span>
                    <div className="vs-heading">
                        <h1 className="vs-title">{tr('virtual-showroom.title', '虚拟展厅', 'Virtual Showroom')}</h1>
                        <p className="vs-subtitle">{tr('virtual-showroom.subtitle', 'OpenAN Demo 展厅 · 由 cards.json 配置驱动', 'OpenAN Demos · driven by cards.json')}</p>
                    </div>
                </div>
                <div className="vs-header-right">
                    {state.status === 'ready' && (
                        <span className="vs-count">{state.cards.length} {tr('virtual-showroom.items', '个展示项', 'showcase items')}</span>
                    )}
                    <button type="button" className="vs-btn" onClick={load} title={tr('virtual-showroom.refresh', '重新加载卡片配置', 'Reload card config')}>
                        <IconRefresh />
                        <span>{tr('virtual-showroom.refresh', '刷新', 'Refresh')}</span>
                    </button>
                </div>
            </div>

            {state.status === 'loading' && (
                <div className="vs-center">
                    <div className="vs-spinner" />
                    <p className="vs-muted">{tr('virtual-showroom.loading', '正在加载展厅卡片配置…', 'Loading showroom cards…')}</p>
                </div>
            )}

            {state.status === 'error' && (
                <div className="vs-center vs-center-error">
                    <p className="vs-error-title">{tr('virtual-showroom.errorTitle', '卡片配置加载失败（cards.json）', 'Failed to load card config (cards.json)')}</p>
                    <p className="vs-muted">{state.error}</p>
                    <button type="button" className="vs-btn vs-btn-primary" onClick={load}>
                        <IconRefresh />
                        <span>{tr('virtual-showroom.retry', '重试', 'Retry')}</span>
                    </button>
                </div>
            )}

            {state.status === 'empty' && (
                <div className="vs-center">
                    <p className="vs-muted">{tr('virtual-showroom.empty', '暂无展示卡片：请在 cards.json 中配置卡片后点击刷新。', 'No cards yet: add cards in cards.json, then click Refresh.')}</p>
                </div>
            )}

            {state.status === 'ready' && (
                <div className="vs-grid">
                    {state.cards.map((card) => {
                        const title = pickLang(card.title, card.titleEn);
                        const desc = pickLang(card.description, card.descriptionEn);
                        const cat = pickLang(card.category, card.categoryEn) || 'Demo';
                        return (
                            <article
                                key={card.id || card.url}
                                className="vs-card"
                                onClick={() => handleCardClick(card)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleCardClick(card); }}
                                tabIndex={0}
                                role="link"
                                title={title}
                            >
                                <div className="vs-cover">
                                    <img src={absoluteUrl(PLUGIN_BASE, card.image || 'images/placeholder.svg')} alt={title} loading="lazy" />
                                    <span className="vs-cover-veil" />
                                </div>
                                <div className="vs-body">
                                    <span className="vs-category">{cat}</span>
                                    <h2 className="vs-card-title">{title}</h2>
                                    {desc ? <p className="vs-desc">{desc}</p> : null}
                                    <div className="vs-footer">
                                        <span className="vs-open">
                                            <IconExternal />
                                            <span>{tr('virtual-showroom.open', '打开 Demo', 'Open Demo')}</span>
                                        </span>
                                        <span className="vs-host">{safeHost(card.url)}</span>
                                    </div>
                                </div>

                                {/* launch-options popover — pick Demo / mockAgent
                                    driver + agent startup options before launching */}
                                {(card.launch && card.launch.type === 'scenario-framework' && launchCard === (card.id || card.url)) && (
                                    <div
                                        className="vs-launch"
                                        role="dialog"
                                        aria-label={tr('virtual-showroom.launchTitle', '拉起选项', 'Launch options')}
                                        onClick={(e) => e.stopPropagation()}
                                        onKeyDown={(e) => e.stopPropagation()}
                                    >
                                        <div className="vs-launch-head">
                                            <span className="vs-launch-title">
                                                {tr('virtual-showroom.launchTitle', '拉起选项', 'Launch options')}
                                            </span>
                                            <button type="button" className="vs-launch-x" onClick={closeLaunch} aria-label="close">✕</button>
                                        </div>

                                        <div className="vs-launch-label">
                                            {tr('virtual-showroom.launchDriver', '驱动模式', 'Driver mode')}
                                        </div>
                                        <div className="vs-launch-modes">
                                            <button
                                                type="button"
                                                className={`vs-launch-mode${launchSel.driver === 'script' ? ' on' : ''}`}
                                                onClick={() => setLaunchSel((s) => ({ ...s, driver: 'script' }))}
                                            >
                                                {tr('virtual-showroom.modeDemo', 'Demo 回放', 'Demo Replay')}
                                            </button>
                                            <button
                                                type="button"
                                                className={`vs-launch-mode${launchSel.driver === 'mockAgent' ? ' on agent' : ''}`}
                                                onClick={() => setLaunchSel((s) => ({ ...s, driver: 'mockAgent' }))}
                                            >
                                                {tr('virtual-showroom.modeAgent', 'Agent 执行', 'Agent Run')}
                                            </button>
                                        </div>
                                        <p className="vs-launch-note">
                                            {launchSel.driver === 'mockAgent'
                                                ? tr('virtual-showroom.noteAgent', '真实拉起 Agent 服务，消息实时拉取', 'Launches the agent service; messages pulled live')
                                                : tr('virtual-showroom.noteDemo', '纯本地时间线回放，不拉起 Agent 服务', 'Pure local timeline replay; no agent service launched')}
                                        </p>

                                        {/* 智能体启动选项 only applies to Agent 执行 —
                                            Demo 回放 does not launch agents */}
                                        {launchSel.driver === 'mockAgent' && (card.launch.agents || []).length > 0 && (
                                            <>
                                                <div className="vs-launch-label">
                                                    {tr('virtual-showroom.launchAgents', '智能体启动选项', 'Agent startup options')}
                                                </div>
                                                <div className="vs-launch-agents">
                                                    {(card.launch.agents || []).map((a) => (
                                                        <label key={a.id} className="vs-launch-agent">
                                                            <input
                                                                type="checkbox"
                                                                checked={!!launchSel.agents[a.id]}
                                                                onChange={(e) => setLaunchSel((s) => ({
                                                                    ...s,
                                                                    agents: { ...s.agents, [a.id]: e.target.checked },
                                                                }))}
                                                            />
                                                            <span>{pickLang(a.zh, a.en) || a.id}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </>
                                        )}

                                        <div className="vs-launch-actions">
                                            <button type="button" className="vs-launch-cancel" onClick={closeLaunch}>
                                                {tr('virtual-showroom.cancel', '取消', 'Cancel')}
                                            </button>
                                            <button
                                                type="button"
                                                className="vs-launch-go"
                                                onClick={() => confirmLaunch(card)}
                                            >
                                                {tr('virtual-showroom.launch', '拉起', 'Launch')}
                                                <IconExternal />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </article>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function safeHost(url) {
    try {
        return new URL(url).host;
    } catch (e) {
        return '';
    }
}
