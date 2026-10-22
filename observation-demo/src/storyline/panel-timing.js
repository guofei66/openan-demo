// panel-timing.js — 面板分步节奏（V3.23；V5 每段 ≥12 业务秒 = 1x 回放 3 观众秒）
// 三处共用单一来源：IntentRecognitionPanel（步权重）、SubStepPanels（挂载窗口/props）、
// cases.js（单步节拍 c.beats 并入面板阶段边界——否则窗口内无事件节拍时单步按钮
// 一步跨过整个窗口，如意图识别，用户只能看到第一步）。
// 纯函数（入参为案例对象 c），不依赖其他模块

// V5.2（回退此前逻辑，用户规格）：意图识别面板 5 段等分（各 12 业务秒）、常驻累计——
// ①输入（三行投诉文本整体）→ ②思考 → ③行动 → ④观察（绕光轮顺时针依次出现）
// → ⑤输出；窗口 = mini0 全窗（60 业务秒，全部展示完成后才进入定界定位）
// V6.36（用户规格）：思考/行动/观察弹出间隔再短一半（各 12→6 业务秒，1x≈1.5 观众秒），
// 输入段维持 12 业务秒，释放时长顺延——输出提前至 42 且完整版式停留至 mini0 完成
export const INTENT_WEIGHTS = [0.2, 0.1, 0.1, 0.1, 0.5];

// V5.2：定界定位无详情面板——内容改在 WAIMO 卡底描述区 4 句依次出现
//（cases.js mini1/desc 事件驱动，见 §0.6）；BOUNDARY_WEIGHTS/boundaryWindowOf 随面板移除

// Task-T 面板 8 段（均分，各 12 业务秒，窗口 96）
export const TASKT_STEPS = 8;

// V5：动态编排面板 3 段等分（左侧元素 → 编排引擎 → 右侧元素，各 12 业务秒）
export const ORCH_WEIGHTS = [1 / 3, 1 / 3, 1 / 3];

// V5.8（用户规格）：Authorization-T 面板（工单2）3 段等分——①抢通方案生成 →
// ②查询预授权策略 → ③剩余元素同时出现（是/否/分支箭头连线/执行动网操作/人工授权）；
// 窗口 = Task-T响应 汇总回传结束 → YX mini1（抢通执行）激活（V5.17，见 authorizationWindowOf）
//（旧版 at-panel 组件保留未挂载；现行 at4 面板分步见 AUTHZ_WEIGHTS）
export const AUTH_WEIGHTS = [1 / 3, 1 / 3, 1 / 3];

// V6.35（用户规格）：Authorization-T 详细交互流程面板（at4 · 工单2）2 段等分——
// ①请求气泡（传输→粤西 动网操作要素）→ ②响应气泡（粤西→传输 授权成功）；
// 窗口 24 业务秒（请求/响应流各 12）→ 中点 436 恰为响应流起点，两气泡分别呈现
export const AUTHZ_WEIGHTS = [0.5, 0.5];

// V5：Notification-T 面板 3 段等分（抢通前 → 箭头 → 抢通后，各 12 业务秒；
// 窗口终点=下一子步骤（WAIMO 投诉闭环），分步全部完成后面板才退场）
export const NOTIF_WEIGHTS = [1 / 3, 1 / 3, 1 / 3];

// V3.30：调度处置面板 3 段（手机 → 左侧消息气泡 → 右侧回复气泡）；
// 末段（回复气泡）停留至窗口结束（窗口 52 业务秒 → 15.6/15.6/20.8，均 ≥12）
export const DISPATCH_WEIGHTS = [0.3, 0.3, 0.4];

export const miniWindowOf = (c, k, i) => {
  let t0 = 0, t1 = 0;
  for (const e of c.events) {
    if (e.type === 'mini' && e.k === k && e.i === i) {
      if (e.st === 'active') t0 = e.t;
      else if (e.st === 'done' && e.t >= t0) { t1 = e.t; break; }
    }
  }
  return { t0, t1: t1 || t0 };
};

const flowWindowOf = (c, line) => {
  let t0 = 0, t1 = 0;
  for (const e of c.events) {
    if (e.type === 'flow' && e.line === line) {
      if (e.on && !t0) t0 = e.t;
      else if (!e.on && t0) { t1 = e.t; break; }
    }
  }
  return { t0, t1: t1 || t0 + 1 };
};

export const taskTWindowOf = (c) => {
  let t0 = 0;
  for (const e of c.events) if (e.type === 'flow' && e.line === 'waimo-zx-task' && e.on) { t0 = e.t; break; }
  let t1 = t0 + 16;
  // V3.24：窗口终点 = 专线首个内部子步骤开始（数据关联）——面板消失后子步骤才执行；
  // 下限 16 业务秒保证 8 段分步节奏可读（V5 两案均 132..228，8 段 × 12 业务秒）
  for (const e of c.events) if (e.type === 'mini' && e.k === 'ZX' && e.i === 0 && e.st === 'active') { t1 = Math.max(e.t, t0 + 16); break; }
  return { t0, t1 };
};

// V3.22：检索面板窗口；V3.28 去掉尾段（连线关闭即消失）；V3.31 恢复 +6 业务秒尾——
// 检索面板两段分步偏快（选中高亮一闪而过），尾段驻留至下一面板登场前：
//   - waimo 检索尾段不得越过 Task-T 面板起点（两面板不同时出现）；
//   - zx 检索 c1 尾段自由（后续至协商层 213 前无面板）；c2 尾段恰逢动态编排面板
//     （编排起点=检索连线关闭时刻）——尾段截断，维持原窗口
export const searchWindowOf = (c, line) => {
  const w = flowWindowOf(c, line);
  let t1 = w.t1 + 6;
  if (line === 'reg-waimo-search') t1 = Math.min(t1, taskTWindowOf(c).t0);
  else if (line === 'reg-zx-search') {
    // c2 编排面板起点=检索连线关闭时刻（相等也须截断，否则尾段跨入编排面板窗口）
    const orch0 = orchestrationWindowOf(c).t0;
    if (orch0 >= w.t1) t1 = Math.min(t1, orch0);
  }
  return { t0: w.t0, t1: Math.max(t1, w.t1) };
};

// V3.26：动态编排面板窗口；V3.27 改为 mini1（动态编排）激活 → mini2（任务诊断）激活——
// 面板分步在下一子步骤开始前完成（面板消失即下一子步骤开始，同 Task-T 模式）
export const orchestrationWindowOf = (c) => {
  const w1 = miniWindowOf(c, 'ZX', 1);
  const w2 = miniWindowOf(c, 'ZX', 2);
  return { t0: w1.t0, t1: Math.max(w1.t1, w2.t0 || 0) };
};

// V3.27：Notification-T 面板窗口——waimo-zx-notif 连线 Notification-T 段激活 → WAIMO mini3（投诉闭环）激活
//（下一子步骤开始前分步完成；下限 8 业务秒保底节奏）
// V4：仅当案例在 waimo-zx-notif 线上存在 Notification-T 标签流时启用——工单1 该线仅承载
// Task-T响应（诊断汇总回传），无 Notification-T 消息 → 窗口置零即面板不挂载；
// 工单2 挂载于 专线→WAIMO 的 Notification-T 段（面板位置/分步逻辑不变）
export const notifWindowOf = (c) => {
  const on = c.events.find((e) => e.type === 'flow' && e.line === 'waimo-zx-notif' && e.on && e.label === 'Notification-T');
  if (!on) return { t0: 0, t1: 0 };
  const t0 = on.t;
  const w = miniWindowOf(c, 'WAIMO', 3);
  return { t0, t1: Math.max(w.t0 || t0 + 8, t0 + 8) };
};

// V5.17（用户规格）：Authorization-T 面板窗口（仅工单2）——专线根因总结完成并 Task-T响应
// 汇总回传 WAIMO（首段 waimo-zx-notif 流）结束后呈现 → YX mini1（抢通执行）激活即退场：
// 面板消失后才开始抢通执行；V5.18（用户规格）：抢通执行完成后粤西SPN 再发送
// Notification-T·抢通方案上报（445..457）；工单1 无抢通执行（无 YX mini1）→ 窗口置零即面板不挂载
// V6.35（用户规格·at4 详细交互流程面板）：窗口改为授权消息流直驱——传输→粤西 请求
// （zx-yx-task · Authorization-T 标签流 on，c2 424）出现即挂载；粤西→传输 响应
// （zx-yx-neg · Authorization-T 标签流，436..448）结束后即退场（工单1 无授权流 → 不挂载）
export const authorizationWindowOf = (c) => {
  const req = c.events.find((e) => e.type === 'flow' && e.line === 'zx-yx-task' && e.on && e.label === 'Authorization-T');
  if (!req) return { t0: 0, t1: 0 };
  const resp = c.events.find((e) => e.type === 'flow' && e.line === 'zx-yx-neg' && e.on && e.label === 'Authorization-T' && e.t >= req.t);
  if (!resp) return { t0: req.t, t1: req.t };
  const off = c.events.find((e) => e.type === 'flow' && e.line === 'zx-yx-neg' && !e.on && e.t > resp.t);
  return { t0: req.t, t1: off ? off.t : resp.t };
};

// V3.30：调度处置面板窗口——WAIMO mini2（调度处置）激活起；
// V4：①案例二 WAIMO 无调度处置子步骤（槽位空缺留白）——窗口置零即面板不挂载；
// ②案例一无 Notification-T 面板、亦无 ZX 修复验证子步骤（修复验证并入投诉闭环）
export const dispatchWindowOf = (c) => {
  const w = miniWindowOf(c, 'WAIMO', 2);
  if (!w.t0 && !w.t1) return { t0: 0, t1: 0 };
  const nw = notifWindowOf(c);
  if (nw.t1 > 0) return { t0: w.t0, t1: Math.max(w.t0, nw.t0) };
  // V5.54（用户规格）：mini2（调度处置）窗口扩至面板消失（421..473，原 done 433+40 延展
  // 废止）——loading 动效持续到面板退场（窗口 = mini2 全窗，两端同拍）
  return { t0: w.t0, t1: w.t1 };
};

// V3.31→V5.2：意图识别面板窗口 = mini0（投诉识别）全窗——5 段渐入且每段 ≥12 业务秒，
// 全部完成后随 mini0 完成退场（下一步定界定位才开始）
export const intentWindowOf = (c) => miniWindowOf(c, 'WAIMO', 0);

// 面板阶段边界时刻（业务秒，不含窗口起点——起点本身即事件节拍）：
// 各窗口按步权重取累计边界；+0.01 容差确保单步落点越过边界（浮点比较安全）；
// 检索面板 2 段（50% 选中边界）
export function panelStageBeats(c) {
  const beats = [];
  const push = (win, weights) => {
    let acc = 0;
    for (let i = 0; i < weights.length - 1; i++) {
      acc += weights[i];
      const b = win.t0 + (win.t1 - win.t0) * acc + 0.01;
      if (b > win.t0 + 0.01 && b < win.t1) beats.push(b);
    }
  };
  push(intentWindowOf(c), INTENT_WEIGHTS);
  push(taskTWindowOf(c), Array(TASKT_STEPS).fill(1 / TASKT_STEPS));
  push(searchWindowOf(c, 'reg-waimo-search'), [0.5, 0.5]);
  push(searchWindowOf(c, 'reg-zx-search'), [0.5, 0.5]);
  push(orchestrationWindowOf(c), ORCH_WEIGHTS);
  push(authorizationWindowOf(c), AUTHZ_WEIGHTS);
  push(notifWindowOf(c), NOTIF_WEIGHTS);
  push(dispatchWindowOf(c), DISPATCH_WEIGHTS);
  return beats;
}
