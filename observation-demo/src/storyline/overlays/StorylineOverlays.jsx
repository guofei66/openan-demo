// StorylineOverlays.jsx — 覆盖层总装
// 快照态（默认加载）：仅渲染透明交互层（回放工具栏/工单卡/缩放按钮/日志传感器），画面与设计稿逐像素一致
// （例外为用户要求的有意偏差：房间白色高亮底默认隐藏、第二条日志改文字、占位文案粤东/粤西化）
// 回放态：流程覆盖层（连线/圆点/描述）随画布缩放变换；日志表接管静态行
import React, { useContext, useRef } from 'react';
import { StoryContext } from '../StorylineContext';
import { CASES } from '../cases';
import { LOGS, CHEVRONS, overlayFitStyle, overlayZoomStyle, totalFactors } from '../roles';
import ConnectionFlow from './ConnectionFlow';
import ConnectionLines, { applyCaseGeometry, snapshotLinesWorld } from './ConnectionLines';
import NegotiationPanel from './NegotiationPanel';
import SubStepPanels from './SubStepPanels';
import Toolbar from './Toolbar';
import LeftSearch from './LeftSearch';
import OrderFilter from './OrderFilter';
import ZoomToolbar from './ZoomToolbar';
import PanelHandles from './PanelHandles';
// V6.0（流式布局）：节点卡/步骤条/工单卡/日志头 流式组件（设计子树已隐藏，见 roles FLOW_HIDE）
import NodeCards from '../flow/NodeCard';
import StepBar from '../flow/StepBar';
import OrderPanel from '../flow/OrderPanel';
import FlowLogPanel from '../flow/FlowLogPanel';
// V6.1：能开平台卡（注册中心子卡内嵌）——常驻拓扑元素，入画布层（日志拖高时被覆盖）
import PlatformNodeCard from '../../components/panels/PlatformNodeCard.jsx';
import { satCssStyle } from '../roles';
import { measureText, FONT } from '../flow/geometry';

// 能开平台（快照/回放常驻）；V5.57（用户规格）：平台卡下边沿距注册中心子卡 0.75rem（高 126）
const PLATFORM = { x: 369, y: 270, w: 144, h: 126 };
// 流程中心（V6.3：垂直居中 513..599 中心 556；设计节点隐藏后画布层流式重建）
const LC_BOX = { x: 401, y: 513, w: 80, h: 86 };

// ---- V6.3（用户规格）：房间条五胶囊——固定步骤分组（两案一致）：
// 客服（投诉受理）/ 监控室（投诉识别+定界定位）/ 传输室（根因定位）/
// 监控室·传输室（问题处置+修复验证）/ 监控室（投诉报结）。胶囊居步骤组中心；
// 连线（相邻胶囊外沿虚线）/ 分隔纵线（步骤组界 = chip 边沿）/ 登场光点（每段一次、
// 完成态静态中点）规则与 V5.x 一致；科室元素随对齐步骤揭示（V5.59 口径）：
// 传输室随步骤3、监控室·传输室随步骤4、末枚监控室随步骤6（前两组常驻） ----
const chipC = (i) => CHEVRONS[i].box.x + CHEVRONS[i].box.w / 2;
const chipR = (i) => CHEVRONS[i].box.x + CHEVRONS[i].box.w;
const ROOM_GROUPS = [
  { name: '客服', first: 0, last: 0, gate: 0 },
  { name: '监控室', first: 1, last: 2, gate: 0 },
  { name: '传输室', first: 3, last: 3, gate: 3 },
  { name: '监控室/传输室', first: 4, last: 5, gate: 4 },
  { name: '监控室', first: 6, last: 6, gate: 6 },
];
const ROOM_PILLS = ROOM_GROUPS.map((g) => {
  const w = measureText(g.name, '400 16px ' + FONT) + 32;
  const c = (chipC(g.first) + chipC(g.last)) / 2;
  return { name: g.name, w, left: c - w / 2, gate: g.gate };
});
const ROOM_SEGS = [];
for (let i = 0; i < ROOM_PILLS.length - 1; i++) {
  ROOM_SEGS.push({ left: ROOM_PILLS[i].left + ROOM_PILLS[i].w, right: ROOM_PILLS[i + 1].left, gate: ROOM_PILLS[i + 1].gate });
}
// V6.39（用户规格）：两端封口——左端纵线对齐投诉受理 chip 左沿、右端纵线对齐投诉报结
// chip 右沿（揭示随首/末组：左随客服常驻、右随步骤6）；两端横向虚线自纵线连至
// 首/末胶囊外沿（独立数组——不并入 ROOM_SEGS，避免派生 ROOM_GLIDES 误生光点）
const FIRST_STEP = ROOM_GROUPS[0].first, LAST_STEP = ROOM_GROUPS[ROOM_GROUPS.length - 1].last;
const LAST_PILL = ROOM_PILLS[ROOM_PILLS.length - 1];
const ROOM_END_SEGS = [
  { left: CHEVRONS[FIRST_STEP].box.x, right: ROOM_PILLS[0].left, gate: ROOM_GROUPS[0].gate },
  { left: LAST_PILL.left + LAST_PILL.w, right: chipR(LAST_STEP), gate: ROOM_GROUPS[ROOM_GROUPS.length - 1].gate },
];
const ROOM_SEPS = ROOM_GROUPS.slice(1).map((g) => ({ left: chipR(g.first - 1), gate: g.gate }));
ROOM_SEPS.unshift({ left: CHEVRONS[FIRST_STEP].box.x, gate: ROOM_GROUPS[0].gate });
ROOM_SEPS.push({ left: chipR(LAST_STEP), gate: ROOM_GROUPS[ROOM_GROUPS.length - 1].gate });
// 各段登场光点：行程 = (线宽−80)/2；g0（客服—监控室）随 WAIMO t=0（V5.12 收窄
// ±89.97、2.92s）、g1（监控室—传输室）随步骤3（等速 74.9px/s）、g2（传输室—
// 监控室·传输室）随步骤4、g3（监控室·传输室—监控室）随步骤6（38.7px/s）——
// 窗口 = 行程 1 周业务时长（dur×4×speed）；完成态静态中点（V5.63）
const GLIDE0 = { lim: 89.97, dur: 2.92 };
const ROOM_GLIDES = ROOM_SEGS.map((s, i) => {
  const lim = i === 0 ? GLIDE0.lim : (s.right - s.left - 80) / 2;
  const dur = i === 0 ? GLIDE0.dur : (s.right - s.left - 80) / (i === 1 ? 74.9 : 38.7);
  return { left: s.left + lim, lim, dur, gate: i === 0 ? 0 : s.gate };
});
const glideCss = () => ROOM_GLIDES.map((g, i) =>
  '.st-glide' + i + '{animation:stGlide' + i + ' ' + g.dur + 's linear 1 forwards}' +
  '@keyframes stGlide' + i + '{' +
    '0%{transform:translateX(' + (-g.lim / 16) + 'rem);opacity:0}' +
    '15%{opacity:.8}' +
    '85%{opacity:.8}' +
    '100%{transform:translateX(' + (g.lim / 16) + 'rem);opacity:0}' +
  '}'
).join('');

function LogSensor({ onActivate, fit }) {
  const b = LOGS.panelBox;
  // 顶部让出 14px 把手带（设计把手可点收起，V2.12），其余区域滚轮/点击点亮日志
  //（V6.1 日志面板流式重建后本传感器已不挂载，保留定义备查）
  return (
    <div
      className="st-logsensor"
      style={{ left: b.x, top: b.y + 14, width: b.w, height: b.h - 14, ...fit }}
      onWheel={onActivate}
      onPointerDown={onActivate}
      title="A2A-T协作日志"
    />
  );
}

export default function StorylineOverlays() {
  const pub = useContext(StoryContext);
  if (!pub) return null;
  // V6.3：按案重写连线/胶囊几何（卡宽按内容计算——传输卡两案不同宽；幂等记忆化，
  // 工单卡点击切案时随本组件重算——FLOWS/LINES 为本树共用单例）
  applyCaseGeometry(pub.caseId);
  const live = !!pub.world;
  const zoomStyle = overlayFitStyle(pub);
  // V2.21：内层 .st-zoomz = 用户缩放 Z（绕画布中心、瞬时）——与 .fc-zoom 区域内容同步，
  // 外层 .st-zoomwrap 仍为区域重适配 F（收起/展开 0.25s 过渡），等效 CTM = F∘Z；
  // V6.0：裁剪框内 zoomz 经 CSS 反向偏移 (−305,−48) 回画布系（见 storyline.css），两层同款样式
  const zoomZ = overlayZoomStyle(pub);
  // V2.13/V2.14：快照+收起/非 16:9 视口——设计连线 sprite 已隐藏（位图无法随集群端点重适配），改由 SVG 全量呈现
  const TF = totalFactors(pub);
  const lineWorld = live ? pub.world : ((TF.fx !== 1 || TF.fy !== 1) ? snapshotLinesWorld() : null);
  // V5.59 口径：房间条科室元素随「对齐步骤」揭示——未执行到的步骤不出现对应胶囊/连线/光点
  const stepOn = (i) => !live || pub.world.steps[i] !== 'todo';
  // V6.30：分割线左沿吸附设备像素栅格——四线左沿为小数设计坐标（.29/.86/.14/.72），
  // 0.15rem 宽经子像素抗锯齿渲染为 2 或 3 列（用户反馈"中间两条更粗"——像素实测
  // 1920×1080 下 #1/#3 三列、#2/#4 两列，非两线重合；不同视口 k/DPR 落点组合不同）；
  // 左沿统一 round 到设备整数像素后四线渲染轮廓一致（等宽→右侧部分列占比相同）
  const sepG = ((parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16)
    * (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  const snapSep = (x) => Math.round(x * sepG) / sepG;
  // V6.3：各段登场光点状态（窗口 = 行程 1 周业务时长；完成态静态中点；快照态不呈现）
  const glideState = (i) => {
    const g = ROOM_GLIDES[i];
    if (!live) return null;
    if (pub.world.caseDone) return { left: g.left };
    if (!stepOn(g.gate)) return null;
    const win = Math.ceil(g.dur * 4 * (pub.speed || 1));
    const t0 = g.gate > 0 ? CASES[pub.caseId].boundaries[g.gate - 1] : 0;
    return pub.t >= t0 && pub.t < t0 + win ? { left: g.left, anim: pub.mode === 'playing' } : null;
  };
  // V6.2（用户规格）：拓扑图区域鼠标平移——画布/面板两层共用的平移变换（屏幕语义，
  // 画布坐标系 px；.st-pan 无过渡（拖拽即时），zoomwrap 的 F 过渡不受影响）
  const pan = pub.pan || { x: 0, y: 0 };
  const panT = { transform: 'translate(' + (pan.x || 0) + 'px, ' + (pan.y || 0) + 'px)' };
  // 拖拽平移：按下目标为卡片/步骤条/平台卡（各自可选中/可点击）时不启动；位移按视口
  // rem 缩放（k）换算回画布坐标系；适应画布（zoomFit）复位平移
  const panDrag = useRef(null);
  const onPanDown = (e) => {
    if (e.target && e.target.closest && e.target.closest('.fl-card, .fl-chip, .platform-card')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = document.querySelector('.screen-canvas').getBoundingClientRect();
    panDrag.current = { x0: e.clientX, y0: e.clientY, px: pan.x, py: pan.y, k: rect.width / 1920 };
  };
  const onPanMove = (e) => {
    const d = panDrag.current;
    if (!d) return;
    pub.api.setPan(d.px + (e.clientX - d.x0) / d.k, d.py + (e.clientY - d.y0) / d.k);
  };
  const onPanUp = () => { panDrag.current = null; };
  return (
    <>
      <style>{glideCss()}</style>
      <div className="st-pan" style={panT}>
        <div className="st-zoomwrap" style={zoomStyle}>
          {/* V6.0（用户规格"放大后超出画布的区域不要展示"）：画布内容（房间条/连线/卡片/
              激光）入 .st-canvasclip 裁剪框（流程区盒 305,48,1615×845，同设计区域 div
              的 overflow 裁剪语义）；V6.2：裁剪框兼任平移拖拽面（空Canvas 抓取，
              卡片/步骤条/平台卡目标除外）；步骤条已移出（悬浮层，不随 F/Z/pan） */}
          <div className="st-canvasclip"
            onPointerDown={onPanDown} onPointerMove={onPanMove} onPointerUp={onPanUp} onPointerCancel={onPanUp}>
            <div className="st-zoomz" style={zoomZ}>
              {lineWorld ? <ConnectionLines world={lineWorld} pub={pub} /> : null}
              {/* V6.0（流式布局）：四卡（外壳盒/坐标锚不变）；V6.1：能开平台卡同层
                  （画布内容，日志面板拖高时被覆盖）；V6.2：流程中心同款入层
                  （设计节点不随平移——用户反馈"流程中心没有跟随平移"，改流式重建随 pan） */}
              <NodeCards world={pub.world} pub={pub} />
              <div style={{ position: 'absolute', left: PLATFORM.x, top: PLATFORM.y, width: PLATFORM.w, height: PLATFORM.h,
                zIndex: 40, ...satCssStyle(pub, PLATFORM, { x: PLATFORM.x + PLATFORM.w / 2, y: PLATFORM.y + PLATFORM.h / 2 }) }}>
                <PlatformNodeCard />
              </div>
              <div className="fl-lc" style={{ position: 'absolute', left: LC_BOX.x, top: LC_BOX.y, width: LC_BOX.w, height: LC_BOX.h,
                zIndex: 40, ...satCssStyle(pub, LC_BOX, { x: 441, y: 556 }) }}>
                <img src="/icons/ic_ict_locate_to_topology.svg" alt="" draggable={false} />
                <div className="fl-lc__name">流程中心</div>
              </div>
              {live ? <ConnectionFlow world={pub.world} pub={pub} /> : null}
            </div>
          </div>
        </div>
      </div>
      {/* V6.2（用户规格）：悬浮层——房间条 + 步骤条：不随 Z（缩放）/pan（平移）变换，
          但随 F（收起重适配）自适应——内嵌 zoomwrap（仅 F，0.25s 过渡）：面板收起时
          步骤条随区域展开铺满（chip satCssStyle 反向保尺寸、间距随 F 拉开，V5.x 口径）；
          z40 于画布层后、日志层前（日志拖高时被覆盖） */}
      <div className="st-pan" style={{ zIndex: 40 }}>
        <div className="st-zoomwrap" style={zoomStyle}>
          {/* V6.3（用户规格）：房间条五胶囊（固定分组，两案一致）+ 四段连线 +
              组界竖线 + 各段登场光点——设计节点已隐藏（roles FLOW_HIDE 含
              客服—监控室连线 23:135683），全部随悬浮层重建（不随 Z/pan、随 F）；
              胶囊/连线/竖线/光点随对齐步骤揭示（gate 0 = 常驻） */}
          {ROOM_PILLS.map((p, i) => stepOn(p.gate) ? (
            <div key={'rp' + i} className="st-roompill" style={{ left: p.left, width: p.w }}>{p.name}</div>
          ) : null)}
          {ROOM_SEGS.map((s, i) => stepOn(s.gate) ? (
            <div key={'rl' + i} className="st-roomline" style={{ left: s.left, width: s.right - s.left }} />
          ) : null)}
          {/* V6.39（用户规格）：两端封口横向虚线（纵线 ↔ 首/末胶囊外沿） */}
          {ROOM_END_SEGS.map((s, i) => stepOn(s.gate) ? (
            <div key={'rel' + i} className="st-roomline" style={{ left: s.left, width: s.right - s.left }} />
          ) : null)}
          {ROOM_SEPS.map((s, i) => stepOn(s.gate) ? (
            <div key={'rs' + i} className="st-roomsep" style={{ left: snapSep(s.left) }} />
          ) : null)}
          {ROOM_GLIDES.map((g, i) => {
            const st = glideState(i);
            if (!st) return null;
            return <div key={'rg' + i} className={'st-glidebar' + (st.anim ? ' st-glide' + i : '')} style={{ left: st.left }} />;
          })}
          <StepBar world={pub.world} pub={pub} />
        </div>
      </div>
      {/* V6.1：日志面板层（z40，画布层之后）——可拖拽调高、拖拽时遮盖拓扑（拓扑不缩放） */}
      <FlowLogPanel pub={pub} />
      {/* V6.1/V6.2：详情面板层（F/Z/pan 与画布层同步——面板锚定卡片随动）；
          zIndex 40 必须显式（.st-pan 的 transform 使其成为 z-auto 层叠上下文，
          缺失时被日志面板 z40 压住——用户反馈"面板被默认位置的日志区域遮挡"；
          DOM 于日志层后 → 弹出面板全页高于日志，V5.53 语义恢复） */}
      <div className="st-pan" style={{ ...panT, zIndex: 40 }}>
        <div className="st-zoomwrap" style={zoomStyle}>
          <div className="st-zoomz" style={zoomZ}>
            {live ? <NegotiationPanel world={pub.world} pub={pub} /> : null}
            <SubStepPanels world={pub.world} pub={pub} />
          </div>
        </div>
      </div>
      <Toolbar pub={pub} />
      <ZoomToolbar pub={pub} />
      {/* V6.0/V6.1：工单区域流式组件（收起态随 pub 隐藏）；日志头/表体并入 FlowLogPanel */}
      <OrderPanel pub={pub} />
      {pub.ordersHidden ? null : <LeftSearch pub={pub} />}
      {pub.ordersHidden ? null : <OrderFilter pub={pub} />}
      <PanelHandles pub={pub} />
    </>
  );
}
