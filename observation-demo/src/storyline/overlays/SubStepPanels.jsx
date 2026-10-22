// SubStepPanels.jsx — 能开平台节点卡（替代注册中心设计节点）+ 子步骤执行期详情面板
// V3.7：组件源自 A2A-T移动样板间展屏设计-V3.1/react-panels（复制入 src/components/panels/）；
// 平台卡 144×142 中心与原注册中心节点中心重合（441,305），reg-* 检索线起点随之改锚卡右缘 514；
// 详情面板触发（回放态）：WAIMO mini0=投诉识别→意图识别 / mini2=调度处置→调度处置、
// ZX mini1=动态编排→动态编排、检索线激活→检索智能体（置于平台卡右侧）；
// V3.13：Task-T 面板与 Notification-T 面板（原均在连线盒水平居中、下缘 +12px）；
// V3.22：Task-T 窗口延展为 任务下发→编排完成 并左移避让 ZX 卡迷你芯片（见 taskTWindow）、
// 检索/Task-T/意图面板动态分步（面板内部时钟 useStageClock / 选中渐显）；
// 面板外层 satCssStyle 锚对应卡集群中心（收起/展开随卡刚体平移），内层 st-panel-in 入场动画
import React from 'react';
import { CARDS, LINES, satCssStyle } from '../roles';
import { CASES, TIME_SCALE } from '../cases';
import { cardRect } from '../flow/geometry';
import { taskTWindowOf, searchWindowOf, orchestrationWindowOf, notifWindowOf, dispatchWindowOf, intentWindowOf, authorizationWindowOf } from '../panel-timing';
import IntentRecognitionPanel from '../../components/panels/IntentRecognitionPanel.jsx';
import SearchAgentPanel from '../../components/panels/SearchAgentPanel.jsx';
import DispatchPanel from '../../components/panels/DispatchPanel.jsx';
import DynamicOrchestrationPanel from '../../components/panels/DynamicOrchestrationPanel.jsx';
import TaskTPanel from '../../components/panels/TaskTPanel.jsx';
import NotificationTPanel from '../../components/panels/NotificationTPanel.jsx';
import AuthorizationTPanelV4 from '../../components/panels/AuthorizationTPanelV4.jsx';
import '../../components/panels/panels.css';

const center = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

// 能开平台（快照/回放常驻）；V5.57（用户规格）：平台卡下边沿距注册中心子卡 0.75rem
//（子卡底 114 + 12 → 高 142→126）
const PLATFORM = { x: 369, y: 270, w: 144, h: 126 };

// WAIMO—专线 两卡中心中点（Task-T / Notification-T 面板锚点，随两侧卡片刚体平移）
const WZ_MID = (() => {
  const a = center(CARDS.WAIMO.box), b = center(CARDS.ZX.box);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
})();

// 连线下方面板盒：连线盒水平居中、下缘 +12px
const belowLine = (key, w, h) => {
  const b = LINES[key].box;
  return { x: Math.round(b.x + b.w / 2 - w / 2), y: Math.round(b.y + b.h + 12), w, h };
};
// V6.3：卡下面板盒——卡视觉左缘对齐、卡底 +0.5rem（卡宽按案由 flow/geometry 计算）
const belowCard = (k, w, h, dy) => (pub) => {
  const r = cardRect(k, pub.caseId);
  return { x: Math.round(r.x), y: Math.round(r.y + r.h + (dy != null ? dy : 8)), w, h };
};

// 子步骤详情面板（回放态，执行到对应子步骤/连线激活期时呈现）
// V3.15：检索面板拆分两处——WAIMO 检索（reg-waimo-search）在平台卡右侧、选中「专线投诉处理智能体」；
// 专线检索（reg-zx-search）在专线卡正下方、选中「粤东/粤西」（V4：两案例均双登场均选中两个）
// V4：意图识别/Task-T/调度处置/Notification-T 面板注入 caseId——文案随案例切换（工单1/工单2）
const PANEL_DEFS = [
  {
    // V3.21：意图识别面板分步动态（输入→思考→行动→观察→输出）；
    // V6.2（用户规格）：子步骤详情面板位于子步骤（卡）下方 0.5rem、左侧与卡视觉左缘对齐
    //（V6.3 随卡几何重算：WAIMO 底 678 → top 686；左 = 卡视觉左缘 648）
    key: 'intent', Comp: IntentRecognitionPanel,
    props: (pub) => ({ ...intentWindowOf(CASES[pub.caseId]), t: pub.t, mode: pub.mode, speed: pub.speed, timeScale: TIME_SCALE, caseId: pub.caseId }),
    when: (w, pub) => { const { t0, t1 } = intentWindowOf(CASES[pub.caseId]); return pub.t >= t0 && pub.t < t1; },
    box: belowCard('WAIMO', 498, 232), anchor: () => center(CARDS.WAIMO.box),
  },
  {
    // V3.30：调度处置面板三段分步；V6.2：位于 WAIMO 卡下方 0.5rem、左对齐卡视觉左缘
    key: 'dispatch', Comp: DispatchPanel,
    props: (pub) => ({ ...dispatchWindowOf(CASES[pub.caseId]), t: pub.t, mode: pub.mode, speed: pub.speed, timeScale: TIME_SCALE, caseId: pub.caseId }),
    when: (w, pub) => { const { t0, t1 } = dispatchWindowOf(CASES[pub.caseId]); return pub.t >= t0 && pub.t < t1; },
    box: belowCard('WAIMO', 192, 352), anchor: () => center(CARDS.WAIMO.box),
  },
  {
    // V3.27：动态编排面板三段分步；V6.2：位于 ZX 卡下方 0.5rem、左对齐卡视觉左缘
    //（V6.3 随卡几何按案重算：ZX 底 694 → top 702；左 = 卡视觉左缘 c1 1153 / c2 1093）
    key: 'orchestration', Comp: DynamicOrchestrationPanel,
    props: (pub) => ({ ...orchestrationWindowOf(CASES[pub.caseId]), t: pub.t, mode: pub.mode, speed: pub.speed, timeScale: TIME_SCALE }),
    when: (w, pub) => { const { t0, t1 } = orchestrationWindowOf(CASES[pub.caseId]); return pub.t >= t0 && pub.t < t1; },
    box: belowCard('ZX', 574, 201), anchor: () => center(CARDS.ZX.box),
  },
  {
    // V3.22：检索面板动态选中（相位驱动，窗口=连线激活期+4 业务秒）——前半未选，
    // 后半目标项高亮渐显；seek 挂载按相位直接落位
    // V6.0 修复（用户反馈"检索面板与智能体重合"）：y 270→220——V5.58 拓扑重排后
    //（平台/面板下移 270 + WAIMO 卡上移 416.5）面板底缘 464 越过卡顶 416.5，
    // 右下角（719..757）盖住 WAIMO 左上角徽标（V5.70 交付版同病）；上移后底缘 414
    // 让出卡顶、顶缘 220 让出步骤条底 214，仍在平台卡右侧、覆盖检索线中段（原版式语义）
    key: 'search-waimo', Comp: SearchAgentPanel,
    props: (pub) => ({ ...searchWindowOf(CASES[pub.caseId], 'reg-waimo-search'), t: pub.t, mode: pub.mode, speed: pub.speed, timeScale: TIME_SCALE, selected: ['zx'] }),
    when: (w, pub) => { const { t0, t1 } = searchWindowOf(CASES[pub.caseId], 'reg-waimo-search'); return pub.t >= t0 && pub.t < t1; },
    box: { x: 521, y: 220, w: 236, h: 194 }, anchor: () => center(PLATFORM),
  },
  {
    // V3.19：专线检索面板置于检索结果文字（命中：粤东、粤西SPN…，胶囊右侧 1042..1235 × 280..296）
    // 下方（顶 306）；右缘收敛至 1132 避让专线卡左上角徽章/标题（卡左缘 1136）
    key: 'search-zx', Comp: SearchAgentPanel,
    props: (pub) => ({ ...searchWindowOf(CASES[pub.caseId], 'reg-zx-search'), t: pub.t, mode: pub.mode, speed: pub.speed, timeScale: TIME_SCALE, selected: ['yd', 'yx'] }),
    when: (w, pub) => { const { t0, t1 } = searchWindowOf(CASES[pub.caseId], 'reg-zx-search'); return pub.t >= t0 && pub.t < t1; },
    box: { x: 896, y: 306, w: 236, h: 194 },
    anchor: () => ({ x: (center(PLATFORM).x + center(CARDS.ZX.box).x) / 2, y: (center(PLATFORM).y + center(CARDS.ZX.box).y) / 2 }),
  },
  {
    // V3.24：Task-T 面板窗口 = 任务下发 → 专线首个内部子步骤开始（面板消失后子步骤才执行，
    // 见 taskTWindowOf），8 段分步动态 + 滚动跟随；位置自连线居中左移至右缘距 ZX 卡
    // 左缘 17px（V6.3 随卡几何按案重算：c1 778 / c2 718——c2 卡加宽面板随左移），
    // 不与专线卡迷你步骤/描述区域重叠；
    // V5.56（用户规格）：面板距连线 0.25rem（waimo-zx-task 线 534 → top 554）、
    // 面板高 20.5rem（328）
    key: 'task-t', Comp: TaskTPanel,
    props: (pub) => ({ ...taskTWindowOf(CASES[pub.caseId]), t: pub.t, mode: pub.mode, speed: pub.speed, timeScale: TIME_SCALE, caseId: pub.caseId }),
    when: (w, pub) => { const { t0, t1 } = taskTWindowOf(CASES[pub.caseId]); return pub.t >= t0 && pub.t < t1; },
    // V6.13（用户规格）：Task-T 面板布局样式同步 react-panels——面板 22.375×20.625rem（358×330）
    box: (pub) => { const r = cardRect('ZX', pub.caseId); return { x: Math.round(r.x) - 375, y: 554, w: 358, h: 330 }; },
    anchor: () => WZ_MID,
  },
  {
    // V3.27：Notification-T 面板三段分步（抢通前 → 箭头 → 抢通后）；窗口 = waimo-zx-notif
    // 连线激活 → WAIMO mini3（投诉闭环）激活——分步完成后投诉闭环才开始
    // V4：仅工单2 挂载（粤西抢通·隧道调优前后对比；工单1 无 Notification-T 消息）
    // V6.4（1020 文档修订）：Authorization-T 改在连线展示（标签 Authorization-T，见
    // cases.js 工单2 408..432 两段流事件）——原「动网操作预授权检查」面板废止移除
    key: 'notif-t', Comp: NotificationTPanel,
    props: (pub) => ({ ...notifWindowOf(CASES[pub.caseId]), t: pub.t, mode: pub.mode, speed: pub.speed, timeScale: TIME_SCALE, caseId: pub.caseId }),
    when: (w, pub) => { const { t0, t1 } = notifWindowOf(CASES[pub.caseId]); return pub.t >= t0 && pub.t < t1; },
    box: belowLine('waimo-zx-notif', 352, 236), anchor: () => WZ_MID,
  },
  {
    // V6.35（用户规格）：Authorization-T 详细交互流程面板（at4 · 仅工单2 问题处置）——
    // 传输向粤西发送 Authorization-T 授权请求时出现（窗口=请求流 424..448），粤西回复
    // 传输后消失；两条消息分别呈现（请求气泡随面板出现、响应气泡在响应段开始 436 渐显，
    // 见 AuthorizationTPanelV4 / AUTHZ_WEIGHTS）；连线标签/彗星保留。
    // V6.36（用户规格）：位置改 传输—粤西 连线标签左侧、传输卡（子步骤）下方——
    // 右缘对齐 zx-yx-task Authorization-T 标签左沿（−0.5rem；标签宽按 ConnectionFlow
    // textW 同口径估算），顶 = 传输卡底 + 0.5rem；锚 传输/粤西 卡中心中点随刚体平移
    key: 'authz-t', Comp: AuthorizationTPanelV4,
    props: (pub) => ({ ...authorizationWindowOf(CASES[pub.caseId]), t: pub.t, mode: pub.mode, speed: pub.speed, timeScale: TIME_SCALE }),
    when: (w, pub) => { const { t0, t1 } = authorizationWindowOf(CASES[pub.caseId]); return pub.t >= t0 && pub.t < t1; },
    box: (pub) => {
      const z = cardRect('ZX', pub.caseId);
      const pb = LINES['zx-yx-task'].pillBox;
      // 标签渲染宽（ConnectionFlow textW 同口径：ASCII 6.3/字 + 13 padding）
      const tw = Math.round([...'Authorization-T'].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e7f ? 12 : 6.3), 0)) + 13;
      return { x: Math.round(pb.x + pb.w / 2 - tw / 2 - 8 - 472), y: Math.round(z.y + z.h + 8), w: 472, h: 248 };
    },
    anchor: () => {
      const a = center(CARDS.ZX.box), b = center(CARDS.YX.box);
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    },
  },
];

export default function SubStepPanels({ world, pub }) {
  const active = world ? PANEL_DEFS.filter((p) => p.when(world, pub)) : [];
  return (
    <>
      {/* V6.1：能开平台卡移至画布层（StorylineOverlays canvasclip 内）——平台卡为常驻拓扑
          元素，日志面板拖高时应被覆盖；本层（zoomwrap#2）仅承载瞬时详情面板
          （保持 V5.53 面板盖过日志表的层序） */}
      {/* 子步骤详情面板（全页最高层级，不被遮挡）；props 可为对象或 (pub)=>对象 */}
      {active.map((p) => {
        const pr = typeof p.props === 'function' ? p.props(pub) : p.props
        // V6.3：box 支持函数（卡下面板随卡几何/案例宽度重算）
        const box = typeof p.box === 'function' ? p.box(pub) : p.box
        return (
          <div key={p.key} style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h,
            zIndex: 40, ...satCssStyle(pub, box, p.anchor()) }}>
            <div className="st-panel-in" style={{ width: '100%', height: '100%' }}>
              <p.Comp {...pr} />
            </div>
          </div>
        )
      })}
    </>
  );
}
