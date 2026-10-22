// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Portal plugin entry — Scenario Showcase (场景演示).
 *
 * Exports the demo page as a pure content component. The Portal shell provides
 * navigation / auth / theme / i18n via window.__OPENAN_PORTAL_CONTEXT__; this
 * component renders the scenario case demo UI itself.
 *
 * Loaded by the OpenAN Portal as a UMD bundle (local bundle mode, /plugins/).
 */
import React from 'react';
import ScenarioShowcaseApp from './ScenarioShowcaseApp.jsx';
import { installLaunchHandshake } from './launchHandshake.js';
import './index.css';

installLaunchHandshake(); // cross-origin launch handshake (showroom card etc.)

const ScenarioShowcasePlugin = () => <ScenarioShowcaseApp />;

export default ScenarioShowcasePlugin;
