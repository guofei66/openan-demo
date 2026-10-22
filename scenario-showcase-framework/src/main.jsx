// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/** Standalone dev shell — `npm run dev` / `npm run build` renders the plugin
 *  without the Portal. Case data is imported directly (no static hosting);
 *  add new cases to both imports when developing standalone. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import ScenarioShowcaseApp from './ScenarioShowcaseApp.jsx';
import { installLaunchHandshake } from './launchHandshake.js';
import caseIndex from '../cases.json';
import liveAssurance from '../cases/live-assurance.json';
import './index.css';

installLaunchHandshake(); // cross-origin launch handshake (showroom card etc.)

window.__OPENAN_SCENARIO_SHOWCASE_BASE__ = './';
window.__OPENAN_SCENARIO_CASES__ = caseIndex;
window.__OPENAN_SCENARIO_CASES_DATA__ = { 'live-assurance': liveAssurance };
// Standalone renders the DARK conference theme by default. (The app polls
// getPortalTheme(); stub a minimal portal context for it.)
window.__OPENAN_PORTAL_CONTEXT__ = { theme: { isDark: true } };
// Mirror the Portal ThemeContext: `dark` must live on <html> — Tailwind class
// mode compiles dark:* to descendant selectors (.dark .dark\:…), so the app
// root div alone is NOT enough (its own dark:bg-* would never apply).
document.documentElement.classList.add('dark');
document.documentElement.style.colorScheme = 'dark';

const App = () => (
    <div className="h-full w-full">
        <ScenarioShowcaseApp />
    </div>
);

createRoot(document.getElementById('root')).render(<App />);
