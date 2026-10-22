// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/** Driver factory — picks the interaction driver from the case config.
 *
 *  case.driver:
 *    - 'script'    (default) pure-demo replay from case.script[]; no mockAgent
 *                  involved. This is the original showcase behavior, kept as-is.
 *    - 'mockAgent' every message/step/panel update is fetched from the
 *                  mockAgent service (case.mockAgent.endpoint).
 *
 *  Both drivers emit the same normalized event stream, so all UI components
 *  (agent team, PSOP flow, conversation stream, panels) are driver-agnostic.
 */
import { createScriptDriver } from './ScriptDriver.js';
import { createMockAgentDriver } from './MockAgentDriver.js';

export const createDriver = (caseData, sink) => (
    caseData?.driver === 'mockAgent'
        ? createMockAgentDriver(caseData, sink)
        : createScriptDriver(caseData, sink)
);
