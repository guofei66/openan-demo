// roles.js — 语义角色注册表 + 世界状态 → 节点补丁（id → {hide/c/s/text/title}）
// id/box 来自 roles-data.js（codegen/export-storyline-data.js 生成）
import { CARDS, CHEVRONS, BUTTONS, DECOR, LINES, LOGS, ORDERS, ROOMS, ZOOM } from './roles-data';
import { CASES } from './cases';
import { root as FLOW_ROOT } from '../design/regions/flow-chart';
import { root as LOG_ROOT } from '../design/regions/log-panel';

export { CARDS, CHEVRONS, BUTTONS, DECOR, LINES, LOGS, ORDERS, ROOMS, ZOOM };

// V5.23 工单卡位置对调 → V5.25 对调回退 → V6.6（用户规格）再度对调：
// 第一张卡（槽位 c1，y170）展示 case2、第二张卡（槽位 c2，y328）展示 case1。
// 槽位映射随案对调，文案补丁/点击交互/角标/选中态仍统一走 ORDER_SLOT
//（V6.0 起设计工单卡子树隐藏、可见卡由 flow/OrderPanel 重建——渲染序 ['c2','c1']
// 见 OrderPanel；本映射保持设计侧补丁/角标口径一致）
export const ORDER_SLOT = { c1: 'c2', c2: 'c1' };
const ORDER_NO_IDS = { c1: '23:137124', c2: '23:137160' }; // 槽位 → 工单号文字 id
const CUST_IDS = { c1: '23:137144', c2: '23:137171' };     // 槽位 → 客户名文字 id
export const AGENTS = ['WAIMO', 'ZX', 'YD', 'YX'];

// 卡片描述溢出省略（工单卡描述行超出卡片宽度时截断，悬浮 title 展示全文）
const ELLIPSIS = { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

// 传输室房间标签（容器 9114）与监控室—传输室连线（矢量 2679）设计节点 id
// （roles-data.js 为 codegen 导出、未含此二节点，故在此登记；见 design/regions/flow-chart.js）
const CS_TAB_ID = '23:135680';
const CS_LINK_ID = '23:135685';

// 面板收起（V2.12）：左侧面板/日志面板区域根节点与设计把手（boder/箭头）id 手工登记
// （见 design/regions/left-panel.js、log-panel.js；把手交互见 StorylineContext makeInteractions）
const LP_ROOT_ID = '23:137094';      // 左侧面板区域根
const LG_ROOT_ID = '23:137185';      // 日志面板区域根
const LP_HANDLE_ID = '23:137098';    // 左面板把手 boder（设计节点，点击收起）
const LG_HANDLE_ID = '23:137189';    // 日志面板把手 boder（设计节点，点击收起）
const LP_ARROW_ID = 'I23:137099;2:325077';  // 左面板把手箭头切图（boder 兄弟节点）
const LG_ARROW_ID = 'I23:137190;2:325077';  // 日志面板把手箭头切图
const DOT_BG_ID = '23:135642';       // 点阵背景（固定节点之首，收起日志后下缘补齐）

// ---- 面板收起后的画布区域重适配（V2.12；V3.2 删成效指标后区域扩至 1615）----
// 流程图区域盒 1615×845（305,48）；左栏收起 → 可用宽 1920（x:0-1920，右缘固定）；
// 日志收起 → 可用高 1032（y:48-1080，上缘固定）。锚点取区域盒右上角（右缘/上缘不动，
// 与保留的顶部导航对齐），非等比拉伸铺满——与应用「铺满屏幕」同策略。
const FC_BOX = { w: 1615, h: 845 };
const FC_FULL = { x: 1920, y: 1032 };
const FC_Q = { x: 1615, y: 0 };      // 重适配锚点（区域盒右上角，区域本地坐标）

export function fitFactors(ctx) {
  return {
    fx: ctx.ordersHidden ? FC_FULL.x / FC_BOX.w : 1,
    fy: ctx.logHidden ? FC_FULL.y / FC_BOX.h : 1,
  };
}

// 视口系数（V2.17：整页等比缩放 k=min(sx,sy) 由 ScreenCanvas 施加并居中——内容随画布等比
// 缩放即「rem」语义，无需任何区域级反向抵消；恒返回 1，保留函数形态供下游公式/日志表退化）。
// vscale 原始横纵系数仍随 resize 存于 ctx（ScreenCanvas 读取计算 k 与留白偏移）
export function viewFactors(ctx) {
  return { sx: 1, sy: 1 };
}

// 复合适配系数：面板收起重适配（V2.17 起仅收起系数——视口为整页等比、在画布外层均匀作用，
// 集群反向 scale(1/f) 后内容物理尺寸 = k·z·设计尺寸，随屏幕/缩放等比改变）
export function totalFactors(ctx) {
  const { fx, fy } = fitFactors(ctx);
  return { fx, fy };
}

// 流程图区域变换：挂在 region div 上（clip 随变换同步扩展到新可用区）
export function regionFitStyle(ctx) {
  const { fx, fy } = fitFactors(ctx);
  if (fx === 1 && fy === 1) return undefined;
  return { transform: 'scale(' + fx + ', ' + fy + ')', transformOrigin: FC_Q.x + 'px ' + FC_Q.y + 'px' };
}

// 覆盖层双层变换（V2.21：用户缩放回归画布区域级）：外层 .st-zoomwrap = 区域重适配 F
//（与区域 div 同步 0.25s 过渡，仅服务于收起/展开回位）；内层 .st-zoomz = 用户缩放 Z
//（绕画布中心 ZOOM.center，瞬时）。两层等效 CTM = F∘Z = W（见 overlayFitParams）——
// 内层覆盖内容（连线/胶囊/圆点/描述）与 .fc-zoom 区域内容（卡片/步骤条）变换一致
export function overlayFitStyle(ctx) {
  const { fx, fy } = fitFactors(ctx);
  if (fx === 1 && fy === 1) return undefined;
  return { transform: 'scale(' + fx + ', ' + fy + ')', transformOrigin: '1920px 48px' };
}
export function overlayZoomStyle(ctx) {
  const z = ctx.zoom || 1;
  if (z === 1) return undefined;
  return { transform: 'scale(' + z + ')', transformOrigin: ZOOM.center[0] + 'px ' + ZOOM.center[1] + 'px' };
}

// 日志面板（设计片段包裹层/实时表/传感器）随左栏收起同步左向拉伸（右缘 1920 锚定）：
// V3.2 面板扩至 1615（305..1920，与流程区同宽），拉伸系数 LG_FX = 1920/1615；
// left 为元素画布左缘，transform-origin 取 1920-left（本元素自身坐标系内）
const LG_FX = 1920 / 1615;
export function logFitStyle(ctx, left) {
  const fx = ctx.ordersHidden ? LG_FX : 1;
  if (fx === 1) return undefined;
  return { transform: 'scale(' + fx + ', 1)', transformOrigin: (1920 - left) + 'px 0px' };
}

// 左栏收起时的画布 x 映射（日志收起副本把手定位用）
export function logStretchX(ctx, x) {
  const fx = ctx.ordersHidden ? LG_FX : 1;
  return 1920 + (x - 1920) * fx;
}

// ---- V2.13 收起重适配·保比例：节点/文字不拉伸（集群反向缩放），连线随区域拉伸（拉长铺满）----
// 设计树 group 节点渲染为 Fragment（不产生坐标系）：子节点坐标即最近 DOM 祖先坐标系，
// 据此建立节点 id → 画布绝对盒索引（流程图根子节点自 (305,48) 起算、日志面板根为透明 group）
function indexBoxes(node, frame, map) {
  if (node.kind === 'group') { (node.children || []).forEach((c) => indexBoxes(c, frame, map)); return; }
  const box = { x: frame.x + node.x, y: frame.y + node.y, w: node.w, h: node.h };
  map.set(node.id, box);
  (node.children || []).forEach((c) => indexBoxes(c, box, map));
}
const FLOW_BOXES = new Map();
(FLOW_ROOT.children || []).forEach((c) => indexBoxes(c, { x: FLOW_ROOT.x, y: FLOW_ROOT.y }, FLOW_BOXES));

const boxCenter = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const LC_ID = '23:136979';           // 流程中心（容器 9115，lc-* 连线端点集群）
const REG_ID = '23:136963';          // 注册中心（容器 27，reg-* 检索线端点集群）
const FC_TITLE_ID = '23:135686';     // 「投诉分析流」区域标题

// 集群 = 拉伸下保持原比例的刚体单元：root 以自身中心锚定（scale(1/fx,1/fy) origin 50%）；
// sat（角标/步骤条元素）以集群中心锚定随整体平移（不产生卡内相对漂移）。
// 连线 sprite/底板条/房间高亮/步骤条背景不注册（随区域拉伸＝连线拉长铺满）
const CLUSTERS = [
  ...['WAIMO', 'ZX', 'YD', 'YX'].map((k) => ({ root: CARDS[k].bgId, center: boxCenter(CARDS[k].box), sats: [CARDS[k].badgePillId] })),
  { root: CARDS.YX.glowId, center: boxCenter(CARDS.YX.box), sats: [] }, // 粤西发光容器（与粤西卡同盒）
  { root: LC_ID, center: boxCenter(FLOW_BOXES.get(LC_ID)), sats: [] },
  { root: REG_ID, center: boxCenter(FLOW_BOXES.get(REG_ID)), sats: [] },
  { root: FC_TITLE_ID, center: boxCenter(FLOW_BOXES.get(FC_TITLE_ID)), sats: [] },
  { root: '23:135676', center: boxCenter(FLOW_BOXES.get('23:135676')), sats: [] }, // 客服 tab
  { root: '23:135678', center: boxCenter(FLOW_BOXES.get('23:135678')), sats: [] }, // 监控室 tab
  { root: CS_TAB_ID, center: boxCenter(FLOW_BOXES.get(CS_TAB_ID)), sats: [] },     // 传输室 tab
  ...Object.values(LINES).map((L) => ({ root: L.pillId, center: boxCenter(L.pillBox), sats: [] })), // 连线协议胶囊（骑线标签）
];
// 步骤条单项（chip/图标/标题/时长）随单项中心刚体平移，单项间空隙随区域拉伸
const CHEVRON_SATS = CHEVRONS.flatMap((ch) => {
  const a = boxCenter(ch.box);
  return [ch.chipId, ch.iconId, ch.nameId, ch.durId].map((id) => ({ id, anchor: a }));
});
// 步骤条箭头造型（V2.18 修正）：尖端/切口深 10px；**左缘凹陷朝右**（上/下角最左 0px、
// 中点右移 10px——V2.16 初版方向做反为向左突出）；右缘尖端朝右凸出；
// 首枚左缘平、末枚右缘平（calc 相对百分比宽；深 10 使图标左缘 10.88 不被切口裁剪）
const CHEV_CLIP = {
  first: 'polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)',
  mid: 'polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%, 10px 50%)',
  last: 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 10px 50%)',
};
// ---- V5.55→V5.56（用户规格）：三卡（WAIMO/粤东/粤西）加宽 2rem（+32px）、高 15rem
//（240px，原 252/224×262）——卡内布局分段重排：顶部图标距卡顶 1rem（16，V5.55 规格）、
// 标题 52 / 技能标签行 104·130 / 迷你步骤行 152 / 描述区 189..240（三行贴底）；
// 水平：居中元素（图标/标题/第二行标签/迷你步骤行）随卡中心右移 16（子步骤行居中，
// 左右边距 ≥1rem、步骤少则大）；技能标签首行保持距左右边沿 1rem（左边距 16、自然宽）。
// V5.57（用户规格）：WAIMO 卡高改与专线一致（240→290，宽 252 保留）——回退 V5.55 布局
//（整体 -8，minis 170 距技能标签行底 158 恰 0.75rem）+ 描述区 +21 下移贴新卡底（239..290）；
// 技能标签行两端对齐——右标签随加宽贴新右缘（+32）、左标签保持左 1rem。
// ZX 卡不动（高 290、V5.55 布局整体 -8）。内容节点 = bg 子树经 group（Fragment）展开后的
// 首层 DOM 子节点；粤西发光容器（快照镜像卡）内容同规则重排（独立坐标系见 dyGlow）。
// 分段偏移按节点设计 y 落段（各卡 y 分布见 %TEMP%\opencode\clockfreeze\v556_cards.txt）：
//   YD·YX bg：icon24 / 标题56·副题82 / 能力行118 / 标签146 / minis170·188 → dy -8/-4/-6/-16/-18
//   YX glow（本地 y = 内容div16+内层y）：icon16/标题56/能力行110/标签138/minis170·188/
//     内嵌描述234 → dy 0/-4/-6/-8/-18/-29 ----
export const CARD_LIFT = 8;               // ZX 卡内容上移（V5.55 保持）
export const CARD_GROW = 10;              // ZX 卡底板增高（V5.55 保持：高 280→290）
export const CARD_WIDE = 32;              // 三卡加宽 2rem
export const CARD_H = 240;                // 三卡高 15rem
// V5.64（用户规格）：描述区垂直居中于 [子步骤（迷你标题行）下沿, 卡底下沿]——
//   区域顶 = (标题底 + 卡底)/2 − 25.5（区域高 51）：WAIMO (207+290)/2−25.5=223（+5）、
//   YD/YX (181+240)/2−25.5=185（-33）、ZX (218+290)/2−25.5=228.5（-17.5，V5.67 迷你行
//   上移后标题底 234→218 随算）；
//   V5.55..V5.62 的「贴卡底」（239/238/189）废止（实测 WAIMO 偏低 16、YD/YX 偏低 4、
//   ZX 恰居中——高卡贴底区恰落跨度中点，纯属巧合）
export const CARD_DESC_DY = { WAIMO: 5, ZX: -17.5, YD: -33, YX: -33 };                // 描述区位移（加法；见上 V5.64 居中公式）
export const CARD_MINI_DY = { WAIMO: CARD_LIFT, ZX: 24, YD: 34, YX: 34 };  // 迷你圆点行上移（V5.62：YD/YX 槽位 178→144；V5.67：ZX 槽位 206→182——距技能标签行底 170 恰 0.75rem，四卡统一）
export const CARD_MINI_DX = { WAIMO: 16, ZX: 0, YD: 16, YX: 16 };          // 迷你圆点行右移（居中）
// bg 内容分段偏移（k=卡名，y=节点设计 y，bg 本地）；V5.57：WAIMO 卡高改与专线一致（290）
// ——回退 V5.55 布局（整体 -8：minis 170 距技能标签行底 158 恰 0.75rem），描述区另由
// CARD_DESC_DY=+21 下移贴新卡底（239..290）；
// V5.58/V5.60：ZX 技能标签行（设计 y174 一行三枚）曾单独上移 -24（距编排中心卡底
// 0.5rem）；其余（圆点 206/连线 213/标题 224 等）保持 -8 与覆盖层圆点
//（CARD_MINI_DY=8）同拍——V5.58 曾按组 bounds y180 误设 [175,215)→-30，把圆点/连线
// 一并拉高致「子步骤图标间连线错位」（连线 183 vs 覆盖层圆点 198 差 15px）；
// V5.62（用户规格）：技能标签距子步骤图标 0.75rem（四卡统一）——
//   ZX 标签行 -24 废止、回归 -8（174→166，距圆点槽 206-8=198 恰 0.75rem；
//   原「距编排中心卡底 0.5rem」规格废止）；YD/YX 迷你行 -18→-34（连线 186→152/
//   标题 197→163，与覆盖层圆点 CARD_MINI_DY 18→34 同拍：槽 178→144，距标签行底
//   118+20-6=132 恰 0.75rem；原 -18 时槽在 160、距 28）——标题底 185 让出描述区顶 189
// V5.64（用户规格）：ZX 标签行恢复「距编排中心卡底 0.5rem」——编排中心卡底 =
//   118-8+32(V5.55 高 48→32) = 142，标签行顶 142+8=150（设计 y174 → -24）；
// V5.67（用户规格）：ZX 迷你行（子步骤）距技能标签行底 0.75rem——段扩为 y≥170 全取
//   -24：圆点 206→182/连线 213→189/标题 224→200（底 218），覆盖层圆点 CARD_MINI_DY.ZX
//   8→24 同拍（V5.64 曾仅标签行 [170,200) 取 -24、迷你行保持 -8〔标签底 170 距圆点槽
//   198 为 28〕废止）——至此四卡「技能标签→迷你行 0.75rem」统一
//   （WAIMO 158→170 / YD·YX 132→144 / ZX 170→182）
const dyOf = (k, y) => {
  if (k === 'ZX') return y >= 170 ? -24 : -CARD_LIFT;
  if (k === 'WAIMO') return -CARD_LIFT;
  return y < 50 ? -8 : y < 109 ? -4 : y < 140 ? -6 : y < 160 ? -16 : -34;
};
// 发光容器内容分段偏移（glow 本地 y；回放态隐藏、随基卡同步——V5.62 迷你行同步上移 16）
const dyGlow = (y) => (y < 50 ? 0 : y < 109 ? -4 : y < 135 ? -6 : y < 160 ? -24 : y < 218 ? -34 : -29);
// 水平偏移（V5.57/V5.58：技能标签行两端对齐——右标签随卡加宽贴新右缘（视觉距右 1rem：
// 内容系宽−16−w，即 +30）、左标签距左 1rem（left=16，显式补丁统一覆盖设计基准）；
// 其余居中元素 +16）
const dxOf = (k, it) => {
  if (k === 'ZX') return 0;
  const lo = k === 'WAIMO' ? 116 : 109;
  if (it.y >= lo && it.y < 140) return it.x > 50 ? CARD_WIDE - 2 : 0;
  return CARD_WIDE / 2;
};
const findNode = (id, node) => {
  if (node.id === id) return node;
  for (const c of node.children || []) { const r = findNode(id, c); if (r) return r; }
  return null;
};
const CARD_CONTENT = (() => {
  // group（Fragment）展开收集首层 DOM 子节点（y+base：bg 系 base=0；glow 系 base=内容div y）
  const layer = (n, acc, base, glow) => {
    for (const c of n.children || []) {
      if (c.kind === 'group') { layer(c, acc, base, glow); continue; }
      acc.push({ id: c.id, x: c.x, y: c.y + base, glow });
    }
  };
  const res = {};
  for (const k of ['WAIMO', 'ZX', 'YD', 'YX']) {
    const acc = [];
    const bg = findNode(CARDS[k].bgId, FLOW_ROOT);
    if (bg) layer(bg, acc, 0, false);
    if (k === 'YX') {
      // 发光容器（快照镜像）：容器 div → 内容 div（x16 y16，DOM 坐标系）→ 其 group 展开
      // 的首层子节点（y 换算 glow 本地 = 16 + 内层 y，分段见 dyGlow；容器自身宽高另补）
      const glow = findNode(CARDS.YX.glowId, FLOW_ROOT);
      const inner = glow && (glow.children || []).find((c) => c.kind === 'div');
      if (inner) layer(inner, acc, inner.y, true);
    }
    res[k] = acc;
  }
  return res;
})();
// 日志面板需保比例的设计节点（面板随左栏收起展宽）：文本（不含胶囊内嵌文本）、协议胶囊、
// 行首合并图标；底板条/斑马纹/滚动条/单元格分隔线随面板展宽，把手随面板平移
const LOG_KEEP = (() => {
  const ids = [];
  const walk = (n, kept) => {
    if (n.kind === 'group') { (n.children || []).forEach((c) => walk(c, kept)); return; }
    const keep = !kept && (n.kind === 'text' || (n.name || '').indexOf('3.彩色标签') >= 0 || (n.kind === 'sprite' && n.name === '合并'));
    if (keep) ids.push(n.id);
    (n.children || []).forEach((c) => walk(c, kept || keep));
  };
  (LOG_ROOT.children || []).forEach((c) => walk(c, false));
  return ids;
})();
//（V2.14 曾按 KEEP_RULE 收集其余区域原子单元做视口反向；V2.17 整页等比缩放后视口无需反向，
//  注册表移除——同时避免渐变文字节点（background-clip:text，如 业务类成效/协议类成效 标题）
//  被 transform 化产生渐变与字形错位的重影）
// 连线端点集群中心（FLOWS src/dst → 集群中心，端点重适配用）
const ENDPOINT_CENTERS = {
  LC: boxCenter(FLOW_BOXES.get(LC_ID)),
  REG: boxCenter(FLOW_BOXES.get(REG_ID)),
  WAIMO: boxCenter(CARDS.WAIMO.box),
  ZX: boxCenter(CARDS.ZX.box),
  YD: boxCenter(CARDS.YD.box),
  YX: boxCenter(CARDS.YX.box),
};

// ---- V5.58（用户规格）：拓扑图区域重排——区域 = 进度区域（23:135644）下边沿（世界 y230）
// .. 协作日志区域上边沿（fc-zoom 底，世界 y893），中心 561.5：
//   WAIMO/专线卡垂直居中（y 416.5，两卡同顶同底）；能开平台/粤东卡距上边沿 2.5rem（y 270）；
//   粤西卡距下边沿 2.5rem（底 853 → y 613）。roles-data 为 codegen 勿手改——CARDS.box/
//   descTop/mini 槽位/端点中心/集群中心运行时随移（dy 见 CARD_SHIFT），bg/badge/glow 节点
//   top 补丁见 uiPatches，连线端点/胶囊见 ConnectionLines，面板/平台卡见 SubStepPanels ----
export const CARD_SHIFT = {};
const CARD_Y_V58 = { WAIMO: 416.5, ZX: 416.5, YD: 270, YX: 613 };
for (const k of ['WAIMO', 'ZX', 'YD', 'YX']) {
  const dy = Math.round((CARD_Y_V58[k] - CARDS[k].box.y) * 2) / 2;
  CARD_SHIFT[k] = dy;
  CARDS[k].box = { ...CARDS[k].box, y: CARD_Y_V58[k] };
  if (CARDS[k].descTop != null) CARDS[k].descTop += dy;
  if (CARDS[k].mini) CARDS[k].mini.forEach((m) => { m.slotBox = { ...m.slotBox, y: m.slotBox.y + dy }; });
  ENDPOINT_CENTERS[k] = boxCenter(CARDS[k].box);
}
// 卡集群中心随移（CLUSTERS 前 4 条 = 四卡，收起/展开反向缩放锚点）
['WAIMO', 'ZX', 'YD', 'YX'].forEach((k, i) => {
  if (CLUSTERS[i]) CLUSTERS[i].center = boxCenter(CARDS[k].box);
});

// ---- V6.3（用户规格）：拓扑纵移——区域 = 步骤区域容器下边沿(230)..A2A-T 协作日志
// 上边沿(882)、中心 556：WAIMO/传输垂直居中（top 434/418，高 244/276）；粤东/粤西
// 上下对称（外隙 24：254..490 / 622..858，高 236）；流程中心垂直居中（513..599 中心
// 556）——LC 见 StorylineOverlays fl-lc 与 ENDPOINT_CENTERS.LC。连线端点贴卡视觉
// 边沿（V6.3 卡宽按内容计算：WAIMO 362 / 传输 c1 290·c2 410 / 粤东粤西 234，见
// flow/geometry.js cardW 与 ConnectionLines applyCaseGeometry）----
const CARD_Y_V62 = { WAIMO: 434, ZX: 418, YD: 254, YX: 622 };
const CARD_H_V62 = { WAIMO: 244, ZX: 276, YD: 236, YX: 236 };
for (const k of ['WAIMO', 'ZX', 'YD', 'YX']) {
  const dy = CARD_Y_V62[k] - CARDS[k].box.y;
  CARDS[k].box = { ...CARDS[k].box, y: CARD_Y_V62[k], h: CARD_H_V62[k] };
  if (CARDS[k].descTop != null) CARDS[k].descTop += dy;
  if (CARDS[k].mini) CARDS[k].mini.forEach((m) => { m.slotBox = { ...m.slotBox, y: m.slotBox.y + dy }; });
  ENDPOINT_CENTERS[k] = boxCenter(CARDS[k].box);
  const ci = ['WAIMO', 'ZX', 'YD', 'YX'].indexOf(k);
  if (CLUSTERS[ci]) CLUSTERS[ci].center = boxCenter(CARDS[k].box);
}
// 流程中心（LC）新位——V6.3：垂直居中（513..599，中心 556）——连线端点/集群锚随移
ENDPOINT_CENTERS.LC = { x: 441, y: 556 };
{
  const lcCl = CLUSTERS.find((c) => c.root === LC_ID);
  if (lcCl) lcCl.center = { x: 441, y: 556 };
}
// 粤西发光容器集群（CLUSTERS[4]）与粤西卡同盒随移
if (CLUSTERS[4]) CLUSTERS[4].center = boxCenter(CARDS.YX.box);

// 画布映射（V2.21）：W = F∘Z（区域收起重适配 F 绕 (1920,48) ∘ 用户缩放 Z 绕画布中心 (1112.5,470.5)）。
// 两个对角缩放的复合仍为对角缩放：zx=fx·z、zy=fy·z，不动点 o=(a−zx·cz)/(1−zx)，
// 其中 a = c_f + f·(c_z−c_f)（Z 作用后 F 的平移分量）；z=1 退化为 F（o=(1920,48)）、
// f=1 退化为 Z（o=画布中心）。供覆盖层内公式（端点重映射/卫星锚定/固定节点反向）使用——
// 覆盖层 DOM 实际渲染为外层 F + 内层 Z 双层嵌套（CTM 与 W 相同）
export function overlayFitParams(ctx) {
  const { fx, fy } = fitFactors(ctx);
  const z = ctx.zoom || 1;
  const zx = fx * z, zy = fy * z;
  const czx = ZOOM.center[0], czy = ZOOM.center[1];
  const ax = 1920 + fx * (czx - 1920);
  const ay = 48 + fy * (czy - 48);
  const ox = Math.abs(zx - 1) < 1e-6 ? 1920 : (ax - zx * czx) / (1 - zx);
  const oy = Math.abs(zy - 1) < 1e-6 ? 48 : (ay - zy * czy) / (1 - zy);
  return { zx, zy, ox, oy };
}
const wPt = (P, p) => ({ x: P.ox + P.zx * (p.x - P.ox), y: P.oy + P.zy * (p.y - P.oy) });
const wInv = (P, q) => ({ x: P.ox + (q.x - P.ox) / P.zx, y: P.oy + (q.y - P.oy) / P.zy });

// 集群 root 反向缩放：自身中心锚定；恒等补丁常驻（scale(1,1) 不影响像素，收起/展开/视口变化双向平滑）。
// 推导（V2.14 一般式，容器复合 C=G∘F∘Z 为对角线性 d）：final = C(c)+z·(r−c) ⇒ scale(z/d)=scale(1/f_total) @ 中心
const CTR_TRANSITION = 'transform 0.25s ease';
function rootCounterStyle(ctx) {
  const { fx, fy } = totalFactors(ctx);
  return { transform: 'scale(' + 1 / fx + ', ' + 1 / fy + ')', transformOrigin: '50% 50%', transition: CTR_TRANSITION };
}
// 卫星节点锚定集群中心（闭式解）：origin = 集群中心 − 节点左上（节点本地坐标），
// 节点随集群整体刚体平移（final = C(c_K)+z·(r−c_K)），卡内/单项内无相对漂移；f=1 轴原点无关
export function satCssStyle(ctx, box, anchor) {
  const { fx, fy } = totalFactors(ctx);
  return {
    transform: 'scale(' + 1 / fx + ', ' + 1 / fy + ')',
    transformOrigin: (anchor.x - box.x) + 'px ' + (anchor.y - box.y) + 'px',
    transition: CTR_TRANSITION,
  };
}
// 固定节点反向（点阵背景/缩放工具栏/回放按钮组）：抵消 W = F∘Z 保持设计尺寸与原位——
// 工单列表/成效/日志不随缩放改变的同时，画布内这三组固定元素亦不随动（V2.21 缩放回归画布级）。
// ⇒ scale(1/zx, 1/zy) @ origin o=(p−W(p))/(zx−1)（节点本地系；z=1 且 f=1 时与 V2.12 闭式解一致）
function fixedCounterStyle(ctx, P, box) {
  const zx = P.zx, zy = P.zy; // W 因子（fx·z / fy·z）
  const cx = P.ox + zx * (box.x - P.ox); // W(p)
  const cy = P.oy + zy * (box.y - P.oy);
  const ox = Math.abs(zx - 1) < 1e-6 ? box.w / 2 : (box.x - cx) / (zx - 1);
  const oy = Math.abs(zy - 1) < 1e-6 ? box.h / 2 : (box.y - cy) / (zy - 1);
  return { transform: 'scale(' + 1 / zx + ', ' + 1 / zy + ')', transformOrigin: ox + 'px ' + oy + 'px' };
}
// SVG <g> 集群锚定（CSS transform，替代原 translate(box)）：
// 图标落点 = W(anchor) + z·(box−anchor)（锚集群中心、随整体刚体缩放平移），
// t = W⁻¹(W(anchor) + z·(box−anchor))、scale = 1/f_total；展开态退化为 translate(box)
//（V2.21：缩放回归画布级，偏移项恢复 z 因子——V2.16 整页缩放时曾去除）
export function satSvgTransform(ctx, box, anchor) {
  const { fx, fy } = totalFactors(ctx);
  const { sx, sy } = viewFactors(ctx);
  const z = ctx.zoom || 1;
  const P = overlayFitParams(ctx);
  const f2 = (v) => Math.round(v * 100) / 100;       // 平移：0.01px
  const f5 = (v) => Math.round(v * 1e5) / 1e5;       // 缩放：保留精度（内容随尺寸放大误差）
  // C = W = F∘Z（画布系 → 物理系）；t = W⁻¹((W(anchor) + z·(box−anchor))/s)
  const cax = sx * (P.ox + P.zx * (anchor.x - P.ox)), cay = sy * (P.oy + P.zy * (anchor.y - P.oy));
  const t = wInv(P, {
    x: (cax + z * (box.x - anchor.x)) / sx,
    y: (cay + z * (box.y - anchor.y)) / sy,
  });
  return 'translate(' + f2(t.x) + 'px, ' + f2(t.y) + 'px) scale(' + f5(1 / fx) + ', ' + f5(1 / fy) + ')';
}
// 连线协议胶囊（SVG）保比例：以胶囊中心反向缩放（骑线标签随线中点，胶囊/文字不变形）
export function pillCounterTransform(ctx, box) {
  if (!ctx) return undefined;
  const { fx, fy } = totalFactors(ctx);
  if (fx === 1 && fy === 1) return undefined;
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  return 'translate(' + cx + 'px, ' + cy + 'px) scale(' + 1 / fx + ', ' + 1 / fy + ') translate(' + (-cx) + 'px, ' + (-cy) + 'px)';
}

// ---- 连线端点重映射：端点目标 = 集群刚体在画布系的映射 W(c_K) + z·(p−c_K)/s（z 为用户缩放、
// s 为视口系数；V2.21 缩放回归画布级——端点随卡刚体等比缩放，V2.16 整页缩放时曾无 z），
// 覆盖层内 CTM=W → q = W⁻¹(target)；中间点保持设计坐标（随 W 缩放＝连线整体等比）。
// f=1 时 W=Z 为纯缩放、端点 q=p 自然命中（无需重映射）→ 全系数恒等（无收起、16:9 视口）
// 原样返回（像素回归安全）----
const PATH_RE = /([MHVLQ])((?:[\s,-]*-?[\d.]+)*)/g;
const num2 = (v) => String(Math.round(v * 100) / 100);

export function remapPathEnds(ctx, d, firstKey, lastKey) {
  if (!ctx) return d;
  const TF = totalFactors(ctx);
  if (TF.fx === 1 && TF.fy === 1) return d;
  const P = overlayFitParams(ctx);
  const { sx, sy } = viewFactors(ctx);
  const z = ctx.zoom || 1;
  const shift = (key, p) => {
    if (!key) return p;
    const c = ENDPOINT_CENTERS[key];
    const wc = wPt(P, c);
    return wInv(P, {
      x: wc.x + z * (p.x - c.x) / sx,
      y: wc.y + z * (p.y - c.y) / sy,
    });
  };
  const segs = [];
  let cur = null, m;
  PATH_RE.lastIndex = 0;
  while ((m = PATH_RE.exec(d)) !== null) {
    const nums = (m[2].match(/-?[\d.]+/g) || []).map(Number);
    if (m[1] === 'M') { cur = { x: nums[0], y: nums[1] }; segs.push({ cmd: 'M', nums, from: null, to: cur }); continue; }
    let to = null;
    if (m[1] === 'H') to = { x: nums[0], y: cur.y };
    else if (m[1] === 'V') to = { x: cur.x, y: nums[0] };
    else if (m[1] === 'L') to = { x: nums[0], y: nums[1] };
    else to = { x: nums[2], y: nums[3] };
    segs.push({ cmd: m[1], nums, from: cur, to });
    cur = to;
  }
  if (segs.length) {
    const s0 = segs[0];
    const q0 = shift(firstKey, s0.to);
    s0.nums[0] = q0.x; s0.nums[1] = q0.y;
    const sl = segs[segs.length - 1];
    if (lastKey) {
      const ql = shift(lastKey, sl.to);
      // V5.42（用户规格：协作日志收起 fy≠1 时连线末段倾斜）：末段 H/V 保持轴向对齐——
      // 端点位移的正交分量交由前一拐角段吸收（前段 V 改目标 y / Q 角点整体纵向平移 /
      // H 改目标 x），末段仅取同轴分量（H 取 x、V 取 y）；前段为 M（单段水平线）时
      // 末端 y 随源端（水平优先，目标端边缘小量偏差）。fy=1（左栏收起/展开态）时
      // ql.y 与设计值一致，退化为原 L 升格几何（像素回归安全）
      const prev = segs.length >= 2 ? segs[segs.length - 2] : null;
      if (sl.cmd === 'H') {
        sl.nums[0] = ql.x;
        if (prev) {
          if (prev.cmd === 'V') prev.nums[0] = ql.y;
          else if (prev.cmd === 'Q') { prev.nums[1] = ql.y; prev.nums[3] = ql.y; }
          else if (prev.cmd === 'L') prev.nums[1] = ql.y;
        }
      } else if (sl.cmd === 'V') {
        sl.nums[0] = ql.y;
        if (prev) {
          if (prev.cmd === 'H') prev.nums[0] = ql.x;
          else if (prev.cmd === 'Q') { prev.nums[0] = ql.x; prev.nums[2] = ql.x; }
          else if (prev.cmd === 'L') prev.nums[0] = ql.x;
        }
      } else if (sl.cmd === 'Q') { sl.nums[2] = ql.x; sl.nums[3] = ql.y; }
      else { sl.nums[0] = ql.x; sl.nums[1] = ql.y; }
    }
  }
  return segs.map((s) => s.cmd + s.nums.map(num2).join(' ')).join('');
}

// 路径折线长度（Q 以弦长近似）：重映射后连线变长，彗星行程/时长随之修正
export function pathLength(d) {
  let cur = null, len = 0, m;
  PATH_RE.lastIndex = 0;
  while ((m = PATH_RE.exec(d)) !== null) {
    const nums = (m[2].match(/-?[\d.]+/g) || []).map(Number);
    if (m[1] === 'M') { cur = { x: nums[0], y: nums[1] }; continue; }
    let to = null;
    if (m[1] === 'H') to = { x: nums[0], y: cur.y };
    else if (m[1] === 'V') to = { x: cur.x, y: nums[0] };
    else if (m[1] === 'L') to = { x: nums[0], y: nums[1] };
    else to = { x: nums[2], y: nums[3] };
    len += Math.hypot(to.x - cur.x, to.y - cur.y);
    cur = to;
  }
  return len;
}

// V5.13（用户规格）：工单搜索匹配——工单号/投诉客户/会话意图（卡片描述行）子串匹配、
// 不区分大小写；空串/全空格 = 全部显示（LeftSearch 输入框 / buildUiPatches 卡片过滤共用）
export function orderMatches(k, q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return true;
  const c = CASES[k];
  return [c.orderNo, c.customer, c.desc].some((t) => String(t || '').toLowerCase().includes(s));
}

// V5.13（用户规格）：工单状态筛选——筛选下拉（全部状态/处理中/已完成，设计「筛选」区
// 位于工单列表标题右侧）；两案卡片状态均为「已完成」（设计烤入标签）；
// orderVisible = 搜索 ∧ 状态（卡片过滤/角标/空态提示共用口径）
export const ORDER_STATUS = { c1: '已完成', c2: '已完成' };
export const ORDER_STATUS_OPTIONS = ['全部状态', '处理中', '已完成'];
export function statusMatches(k, status) {
  return !status || status === '全部状态' || ORDER_STATUS[k] === status;
}
export function orderVisible(k, ctx) {
  return orderMatches(k, ctx.search) && statusMatches(k, ctx.status);
}

// 纯 UI 补丁（与故事线世界状态无关，任何模式生效；默认值时为空，保证快照像素回归）
export function buildUiPatches(ctx) {
  const P = new Map();
  // 工单卡：可选中文字 + 整卡点击切换案例（类/交互见 .st-ocard 与 StorylineContext interactions）+ 悬浮提示
  // （悬浮提示随协商补充后的工单信息同步——两案 orderDescUpdated，见 buildPatches）
  // V5.13（用户规格）：搜索框实时过滤 + 状态筛选（orderVisible = 搜索 ∧ 状态）——不匹配的
  // 工单卡整卡隐藏（角标同步隐藏，见 WorkOrderSel；空态提示见 OrderFilter）；设计搜索占位
  // 文字由 LeftSearch 覆盖层输入框原生 placeholder 取代（I23:137118;2:356130 隐藏）；
  // 「筛选」标签文字随所选状态更新（I23:137104;3:27462;2:29596，设计烤入「全部状态」）
  for (const k of ['c1', 'c2']) {
    const d = ctx.orderInfo && CASES[k].orderDescUpdated ? CASES[k].orderDescUpdated : CASES[k].desc;
    const hidden = !orderVisible(k, ctx);
    // V5.23：内容按 ORDER_SLOT 落位（case2 → 第一卡槽）
    P.set(ORDERS[ORDER_SLOT[k]].id, {
      c: 'st-ocard',
      title: CASES[k].orderNo + '｜' + CASES[k].customer + '｜' + d,
      ...(hidden ? { hide: true } : {}),
    });
  }
  P.set('I23:137118;2:356130', { hide: true });
  P.set('I23:137104;3:27462;2:295964', { text: ctx.status && ORDER_STATUS_OPTIONS.includes(ctx.status) ? ctx.status : '全部状态' });
  // 粤东/粤西卡技能标签：「生成抢通方案 + 抢通方案下发」合并为「业务抢通」（V2.10）——
  // 第二枚胶囊改文案并按 4 字收窄（80px，对齐「故障定位」胶囊），第三枚整组隐藏；
  // V2.28：胶囊图标随设计 V3.1 Skill 切图更新（设计源已换 ic_ict_closed_loop_skill.svg，
  // 原 V2.15 扳手 src 补丁移除；胶囊底色/圆角与切图统一在设计稿维护）；
  // V3.5：业务抢通图标去漂白（原 brightness(0) invert(1) 把双色切图糊成白圆饼、扳手不可见），
  // 切图为浅灰圆盘(223)+深色扳手(25) 双色，原生渲染即可辨——仅此图标去滤镜，其余技能图标维持白色；
  // V2.18：胶囊对在卡内居中——原 16/104 偏左（行宽 168 在 222 内宽居中应为 27/115，
  // 卡 224 − 2×1px 边框；发光母版为 icon 子节点不参与渲染、值随基卡同步）
  // 含粤西发光容器 op0 母版副本。胶囊节点未入 roles-data 导出，id 手工登记（见 design/regions/flow-chart.js）
  const SKILL_MERGE = [
    { pillId: '23:136691', iconId: '23:136692', textId: '23:136705', dropId: '23:136706', faultId: '23:136672', pillLeft: '115px', faultLeft: '27px' }, // 粤东卡
    { pillId: '23:136816', iconId: '23:136817', textId: '23:136830', dropId: '23:136831', faultId: '23:136797', pillLeft: '115px', faultLeft: '27px' }, // 粤西卡
    { pillId: '23:136096', iconId: '23:136097', textId: '23:136110', dropId: '23:136111', faultId: '23:136077', pillLeft: '100px', faultLeft: '12px' }, // 粤西发光容器母版
  ];
  // V5（用户规格 2026-10-12）：「业务抢通」技能胶囊**粤东/粤西两卡常驻**（两案一致）——
  // 技能胶囊为能力声明，与本案例是否执行抢通无关；「故障定位」胶囊两侧常驻、位置随 V2.18 居中
  for (const s of SKILL_MERGE) {
    P.set(s.textId, { text: '业务抢通', s: { width: '48px' } });
    P.set(s.pillId, { s: { width: '80px', left: s.pillLeft } });
    P.set(s.faultId, { s: { left: s.faultLeft } });
    P.set(s.dropId, { hide: true });
  }
  // V4：步骤5（问题处置）时长标签 per-case（设计烤入"3分钟"）——c1=调度处置 144 分钟 / c2=抢通执行 10 分钟
  P.set(CHEVRONS[4].durId, { text: ctx.caseId === 'c1' ? '144分钟' : '10分钟' });
  // V5.11（用户规格）：房间胶囊（客服/监控室/传输室）统一玻璃蓝样式——
  // border-radius 0.2rem(4px) / 180° 蓝渐变 + 中心辐射底（#5CACFF3D→透明、#91C7FF44→透明）/
  // 0.05rem(1px) #5CACFF 描边（容器 id 手工登记：23:135676 客服 / 23:135678 监控室 /
  // 23:135680 传输室，见 design/regions/flow-chart.js；组间连线同批改白色半透明线、光束滑块保留）
  // V5.52（用户规格）：胶囊样式定稿回归 V5.11 原版——border-radius 0.2rem +
  // linear-gradient(180deg,#5CACFF3D,#5CACFF00) + radial-gradient(circle at 50% 50%,#91C7FF44,#5CACFF00)
  // + border 0.05rem solid #5CACFF；V5.44..V5.51 的高光/边带/角弧/box-shadow 各版全部废止
  const ROOM_TAB_STYLE = {
    backgroundImage: 'linear-gradient(180deg, rgba(92,172,255,0.24) 0%, rgba(92,172,255,0) 100%), radial-gradient(circle at 50% 50%, rgba(145,199,255,0.267) 0%, rgba(92,172,255,0) 100%)',
    border: '1px solid rgba(92,172,255,1)',
    borderRadius: '4px',
  };
  for (const id of ['23:135676', '23:135678', '23:135680']) P.set(id, { s: ROOM_TAB_STYLE });
  // V5.12（用户规格）：流程中心/编排中心卡片——border-radius 0.4rem(8px)、#A89FF966 底、
  // 0.05rem(1px) #715AFB 描边（设计原 0.15 底加深为 0.4；id：23:136979 流程中心 / 23:136490 编排中心）
  const SVC_STYLE = {
    backgroundColor: 'rgba(168,159,249,0.4)',
    border: '1px solid rgba(113,90,251,1)',
    borderRadius: '8px',
  };
  for (const id of ['23:136490', '23:136979']) P.set(id, { s: SVC_STYLE });
  // V5.13（用户规格）：顶部导航三图标换设计切图 SVG 原生渲染（高保真图标切图-全量
  // 20261008/0.顶部导航图标）——原图标为位图 sprite 叠层（烤入底色）；隐藏子层、
  // 容器以切图填充：23:137665 协作观测（28×28）/ 23:137692 月亮 / 23:137698 刷新（20×20）
  //（标题装饰位图同批改为 CSS/SVG 重建，见 design/regions/title.js V5.13 注释）
  const NAV_ICONS = [
    { boxId: '23:137665', src: '/icons/ic_ict_highlight_inter_domain_links_textured.svg', hide: ['23:137666', '23:137667', '23:137668', '23:137669'] },
    { boxId: '23:137692', src: '/icons/ic_public_moon.svg', hide: ['23:137694', '23:137695', '23:137697'] },
    { boxId: '23:137698', src: '/icons/ic_public_refresh_clockwise.svg', hide: ['23:137700'] },
  ];
  for (const ic of NAV_ICONS) {
    for (const id of ic.hide) P.set(id, { hide: true });
    P.set(ic.boxId, { s: { backgroundImage: 'url(' + ic.src + ')', backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat' } });
  }
  // V5.52（用户规格）：顶部导航左区装饰（蒙版 23:137654，748×47 @ opacity 0.16）整块删除——
  // 原设计为斜向光带（30° 旋转矩形 + 斜切 sprite），导出子节点大多落于 47px 蒙版条外被
  // 裁剪不可见（仅存平向底渐变）；V5.46..V5.49 曾以 CSS 斜向光带重建/转向，均废止，直接隐藏
  P.set('23:137654', { hide: true });
  // V5.52（用户规格）：顶部导航「协作观测」标题加粗 font-weight:700（渐变文字 23:137670）
  P.set('23:137670', { s: { fontWeight: '700' } });
  // V4：外层步骤名（设计烤入）——投诉定界→定界定位、方案生成→问题处置（两案同名，文档口径）
  P.set(CHEVRONS[2].nameId, { text: '定界定位' });
  P.set(CHEVRONS[4].nameId, { text: '问题处置' });
  // V5.39（用户规格）：步骤标题加粗 font-weight:700（快照/回放全态；合并上文文案补丁）
  CHEVRONS.forEach((ch) => {
    const prev = P.get(ch.nameId) || {};
    P.set(ch.nameId, { ...prev, s: { ...(prev.s || {}), fontWeight: '700' } });
  });
  // V5.45（用户规格）：步骤条图标全白（icon 为切图 SVG，亮度归零+反色统一为白色剪影）；
  // V5.55：问题处置图标（23:135806，ic_ict_creating_design_state——蓝色文档+蓝圆底、
  // 内含黑色横线与加号）曾豁免保留原色（全白滤镜使黑色元素不可见）；
  // V5.68（用户规格）：豁免废止——问题处置图标与其余步骤图标统一白色剪影
  CHEVRONS.forEach((ch) => {
    P.set(ch.iconId, { s: { filter: 'brightness(0) invert(1)' } });
  });
  // V5.45（用户反馈"执行中标题仍发蓝"定位）：chip 背板在 DOM 序中后于标题/时长渲染并
  // 覆盖之（V2.16 版式，文字穿透背板）——执行中背板为半透明蓝 rgba(0,103,209,0.4) 叠
  // stPulse 亮度脉冲，白色文字被蓝罩染成浅蓝（computed color 恒白故计算色探测不可见，
  // 强刷无效的真因）；标题/时长 zIndex 提升到背板之上——文字恒纯白，背板样式不变
  CHEVRONS.forEach((ch) => {
    const nm = P.get(ch.nameId) || {};
    P.set(ch.nameId, { ...nm, s: { ...(nm.s || {}), zIndex: 2 } });
    const du = P.get(ch.durId) || {};
    P.set(ch.durId, { ...du, s: { ...(du.s || {}), zIndex: 2 } });
  });
  // V4：粤东/粤西卡迷你步骤标题（设计烤入）——槽1 问题定位→根因定位、槽2 方案生成→抢通执行
  //（槽3 抢通执行两案均不使用→隐藏；发光容器母版无导出标题 id，回放态不渲染、快照态沿用设计文字）
  for (const k of ['YD', 'YX']) {
    P.set(CARDS[k].mini[0].titleId, { text: '根因定位' });
    P.set(CARDS[k].mini[1].titleId, { text: '抢通执行' });
  }
  // V5：工单卡客户名（用户规格）——#FFFFFF / Microsoft YaHei / bold、字距 0、左对齐；
  // 较长客户名（10/16 字）溢出省略 + 悬浮全文（工单描述行同款 ELLIPSIS）；
  // V5.44（用户规格）：字号 1rem / 行高 1.5rem（原 0.8/1.2）——行高 24 与「已完成」
  // 标签行（y44 h24）同高水平对齐
  const NAME_FONT = {
    ...ELLIPSIS,
    color: '#FFFFFF',
    fontFamily: "'Microsoft YaHei'",
    fontWeight: 'bold',
    fontSize: '1rem',
    lineHeight: '1.5rem',
    letterSpacing: '0rem',
    textAlign: 'left',
    width: '136px',
  };
  // V5.23（用户规格）：工单卡位置对调——工单号/客户名文字随案例写入对调后的槽位
  //（原设计烤入 c1/c2 各自槽位的文案，对调后须显式改写 text）
  for (const k of ['c1', 'c2']) {
    const slot = ORDER_SLOT[k];
    P.set(ORDER_NO_IDS[slot], { text: CASES[k].orderNo });
    P.set(CUST_IDS[slot], { text: CASES[k].customer, title: CASES[k].customer, s: NAME_FONT });
  }
  // V5.44（用户规格）：case1 工单卡图标换 case2 同款——设计烤入 c1 为 ic_public_cloud、
  // c2 为 ic_ebg_hospital，医院客户（广州新市医院）应配医院图标（LayerView icon src 补丁）
  P.set('23:137127', { src: '/icons/ic_ebg_hospital.svg' });
  // 面板收起（V2.12）：设计把手与箭头可点提示（收起后由覆盖层副本把手承担展开）；
  // 日志面板包裹层 pointer-events:none，其把手/箭头需显式恢复 auto 才可点
  P.set(LP_HANDLE_ID, { title: '收起工单列表', s: { cursor: 'pointer' } });
  P.set(LP_ARROW_ID, { title: '收起工单列表', s: { cursor: 'pointer' } });
  P.set(LG_HANDLE_ID, { title: '收起A2A-T协作日志', s: { cursor: 'pointer', pointerEvents: 'auto' } });
  P.set(LG_ARROW_ID, { title: '收起A2A-T协作日志', s: { cursor: 'pointer', pointerEvents: 'auto' } });
  // 日志面板标题/计数为真实 DOM 文字（V3.10）：恢复鼠标事件使其可选中/可查（包裹层 pointer-events:none
  // 曾使其不可选中——观感似切图）；logLive 恒 true，LogSensor 覆盖层不挂载，无点击拦截冲突
  P.set(LOGS.titleTextId, { s: { pointerEvents: 'auto', cursor: 'text' } });
  P.set(LOGS.countTextId, { s: { pointerEvents: 'auto', cursor: 'text' } });
  // 点阵背景：V5.20（用户规格）整层去除——不再铺点（原 V2.24..V2.25：浅灰 16px 平铺；
  // V3.4 颜色 #C9C9C9、V3.6 透明度 0.25——均随去除废止）
  P.set(DOT_BG_ID, { hide: true });
  // 缩放工具条图标（V5.28 用户规格）：设计版＋/－子树隐藏——放大图标 path5 为 12.8×12.8
  // 白色实心圆（子序最后、盖住＋字形 sprite → 放大按钮呈白圆点）；ZoomToolbar 以 CSS 重建
  // 白色＋/－（background:#FFF、border:0.05rem(1px) solid #FFF）；适应图标与百分比文字保留设计渲染
  P.set('23:135660', { hide: true });
  P.set('23:135668', { hide: true });
  // 回放按钮组图标水平对齐（V2.16）：单步/倍速/停止按钮的 1px 边框使内部绝对定位的图标/
  // 文字整体下移 1px（回放按钮为实底无边框）→ 改 inset box-shadow 描边（视觉等效、不占布局）
  for (const id of ['23:137029', '23:137058', '23:137063']) {
    P.set(id, { s: { border: 'none', boxShadow: 'inset 0 0 0 1px rgba(119,119,119,1)' } });
  }
  //（V3.2 成效指标区域整区删除——原条底切图/顶缘装饰条隐藏补丁随之移除）
  // V3.7：注册中心节点由能开平台组件替代（SubStepPanels 常驻 PlatformNodeCard，144×142
  // 与原 80×86 节点同心 441,305；reg-* 检索线起点改锚平台卡右缘 514，见 paths.js/roles-data.js）
  P.set(REG_ID, { hide: true });
  if (ctx.ordersHidden) P.set(LP_ROOT_ID, { hide: true });
  if (ctx.logHidden) P.set(LG_ROOT_ID, { hide: true });
  const { fx, fy } = fitFactors(ctx);
  const VF = viewFactors(ctx);
  if (ctx.zoom !== 1 || fx !== 1 || fy !== 1 || VF.sx !== 1 || VF.sy !== 1) {
    if (ctx.zoom !== 1) P.set(ZOOM.labelId, { text: Math.round(ctx.zoom * 100) + '%' });
    // 固定节点反向变换（V2.17）：仅抵消区域收起重适配 F——保持设计尺寸与原位，视口/缩放
    // 在整页画布层均匀作用 → 固定节点随屏幕/缩放等比改变（scale(1/f) @ o=(p−F(p))/(f−1)）；
    // 与按钮描边等先置补丁按 key 合并（P.set 整条覆盖曾致非 16:9/收起态描边丢失→图标错位复现）；
    // 无过渡（与区域变换同步瞬时）
    const Pz = overlayFitParams(ctx);
    for (const f of ZOOM.fixedNodes) {
      const b = FLOW_BOXES.get(f.id);
      if (b) {
        const prev = P.get(f.id) || {};
        P.set(f.id, { ...prev, s: { ...prev.s, ...fixedCounterStyle(ctx, Pz, b) } });
      }
    }
    //（点阵背景下缘补齐补丁随 V5.20 点阵整层去除而移除）
  }
  // ---- V2.13 收起重适配·保比例：集群节点/文字保持原始长宽比（连线/底板随区域拉伸铺满）。
  // 恒等补丁常驻（展开态 scale(1,1) 不影响像素回归），transform 过渡与区域变换同步（0.25s）----
  const ctr = rootCounterStyle(ctx);
  const putFit = (id, s) => { const prev = P.get(id) || {}; P.set(id, { ...prev, s: { ...prev.s, ...s } }); };
  for (const cl of CLUSTERS) {
    putFit(cl.root, ctr);
    for (const sid of cl.sats) { const b = FLOW_BOXES.get(sid); if (b) putFit(sid, satCssStyle(ctx, b, cl.center)); }
  }
  for (const s of CHEVRON_SATS) { const b = FLOW_BOXES.get(s.id); if (b) putFit(s.id, satCssStyle(ctx, b, s.anchor)); }
  for (const id of LOG_KEEP) putFit(id, ctr);
  //（V2.14 视口铺满曾在此对非流程图区域原子单元反向视口系数；V2.17 整页等比后移除——
  //  内容随画布等比缩放即 rem 语义，且避免渐变文字节点被 transform 化产生重影）
  // 步骤条文字可选中 + 箭头造型（V2.16；V2.19 间距 0.25rem）：chip 背板后渲染且覆盖标题/时长
  //（文字本为 DOM 文本，穿透鼠标事件即可选中）；chip 在原 159.75 格内收窄居中
  //（V2.19 收窄 4px=间距 4px；**V5.50（用户规格）：间距再缩短约 1/3 → 收窄 2.67px
  //（左右各 1.33px）**——16/8px 时图标紧贴左切口似在条外，收窄后图标距切口余量稳在条内），
  // clip-path 剪出右侧凸出尖端/左侧朝右凹陷切口，
  // 首枚左缘平/末枚右缘平（传输室未登场时末枚动态右平见 buildPatches）；
  // chip 中心不变 → 反向缩放原点改锚自身中心（覆盖 CHEVRON_SATS 估值）；
  // V5.53（用户规格）：chip 可点击从该步骤回放——原 pointerEvents:'none'（V2.16 文字
  // 在背板下需穿透选中）废止：V5.45 起标题/时长 zIndex2 已浮于背板之上、命中恒先落文字，
  // 背板恢复鼠标事件不再遮挡选中；chip/文字/图标统一 pointer 光标（clip-path 同时约束
  // 命中区为箭头造型，切口外点击自然穿透）
  CHEVRONS.forEach((ch, i) => {
    const clip = i === 0 ? CHEV_CLIP.first : (i === CHEVRONS.length - 1 ? CHEV_CLIP.last : CHEV_CLIP.mid);
    putFit(ch.chipId, {
      left: (ch.box.x - 305 + 1.33) + 'px',
      width: (ch.box.w - 2.67) + 'px',
      clipPath: clip,
      transformOrigin: '50% 50%',
      cursor: 'pointer',
    });
    putFit(ch.nameId, { cursor: 'pointer' });
    putFit(ch.durId, { cursor: 'pointer' });
    putFit(ch.iconId, { cursor: 'pointer' });
  });
  // V5.55（用户规格）：主标题上移 0.5rem（top 69→61）+ 加宽 378→396——V5.43 加粗后
  // 文字实宽 384 超出背景盒（background-clip:text，尾部字形无背景不可见=「没显示全」），
  // 右向加宽后全文可见（左对齐起点不变，视觉位置不移）
  P.set('23:137645', { s: { top: '61px', width: '396px' } });
  // V5.55（用户规格）：编排中心卡（ZX 卡内 23:136490，与平台卡内注册中心子卡同款）——
  // 高度统一 2rem（48→32）、图标缩至 1.5rem（32→24，垂直居中 top 4）、文字 top 5；
  // 横向位置不变（注册中心子卡见 PlatformNodeCard）
  putFit('23:136490', { height: '32px' });
  putFit('23:136491', { top: '4px', width: '24px', height: '24px' });
  putFit('23:136500', { top: '5px' });
  // V5.55/V5.56/V5.57/V5.58（用户规格）：卡内容重排（分段偏移 dyOf/dyGlow/dxOf，见文件头注释）
  // + 底板尺寸——三卡 240 高/加宽 32（bg+glow）、WAIMO 高与专线一致（290）、ZX 保持 290/原宽；
  // V5.58：left 补丁一律下发（含 dx=0 的技能标签左标签）——部分设计 div 的渲染基准
  // 与设计树 x 存在偏移（实测 YD 左标签渲染 28 vs 设计 x16），显式补丁统一覆盖
  //（技能标签行左右对称：左标签距左 1rem、右标签贴新右缘）
  for (const k of ['WAIMO', 'ZX', 'YD', 'YX']) {
    for (const it of CARD_CONTENT[k]) {
      const dy = it.glow ? dyGlow(it.y) : dyOf(k, it.y);
      const dx = dxOf(k, it);
      putFit(it.id, { top: (it.y + dy) + 'px', left: (it.x + dx) + 'px' });
    }
    const h = k === 'ZX' ? CARDS.ZX.box.h + CARD_GROW : (k === 'WAIMO' ? CARDS.ZX.box.h + CARD_GROW : CARD_H);
    if (k === 'ZX') putFit(CARDS[k].bgId, { height: h + 'px' });
    else putFit(CARDS[k].bgId, { height: h + 'px', width: (CARDS[k].box.w + CARD_WIDE) + 'px' });
  }
  putFit(CARDS.YX.glowId, { height: CARD_H + 'px', width: (CARDS.YX.box.w + CARD_WIDE) + 'px' });
  // V5.61（用户规格）：粤东/粤西技能胶囊对**居中**（左右卡片边距一致）——卡 256（内容宽
  // 254）；V2.18 的 27/115 为 224 卡时代居中值，V5.56 加宽后被 CARD_CONTENT left（16/134）
  // 覆盖、而 V2.10 的 width 80 补丁仍在 → 实测 17/41 不对称；putFit 合并保留 CARD_CONTENT top；
  // V5.66（用户规格）：两胶囊间距 0.5rem→**2.5rem（40）**——组宽 168→200（80+40+80）、
  // 居中左右各 27：左胶囊 27、右胶囊 147（V5.61 的 43/131〔间距 8〕废止）
  putFit('23:136672', { left: '27px' });
  putFit('23:136691', { left: '147px' });
  putFit('23:136797', { left: '27px' });
  putFit('23:136816', { left: '147px' });
  // V5.64（用户规格）：ZX 技能标签行（三枚）两端分布——区域距左右卡片边沿各 1rem
  //（卡宽 324，区域 16..308），space-between：左 16 / 中 122（恰设计原位）/ 右 308-80=228；
  // 原设计基准 34/122/210（边距 34/33、间隙 8）废止；putFit 合并保留 CARD_CONTENT top
  putFit('23:136502', { left: '16px' });
  putFit('23:136535', { left: '122px' });
  putFit('23:136547', { left: '228px' });
  // V5.57（用户规格）：缩放工具栏底色 #000000 50%（设计卡 23:135645，原 #F3F3F319）；
  // V5.70（用户反馈"点击缩小后有 2 个按钮跟随缩小"定位）：原 P.set 整条覆盖上文
  // fixedNodes 反向变换（zoom≠1 时 23:135645 的 transform 被丢弃 → 工具栏卡连同适应
  // 图标/百分比文字随画布缩小；＋/－为覆盖层 CSS 重建不随动 → 恰"2 个按钮"）——
  // 改 putFit 合并保留（同 648 行描边合并先例）
  putFit(ZOOM.barId, { background: 'rgba(0,0,0,0.5)' });
  // V5.58：拓扑重排——卡 bg/徽标/粤西发光容器节点 top 随 CARD_SHIFT 平移
  //（bg 子树内容相对 bg 自动跟随；badgeText 相对 badgePill 不动）
  for (const k of ['WAIMO', 'ZX', 'YD', 'YX']) {
    const dy = CARD_SHIFT[k];
    if (!dy) continue;
    const n1 = findNode(CARDS[k].bgId, FLOW_ROOT);
    if (n1) putFit(CARDS[k].bgId, { top: (n1.y + dy) + 'px' });
    const n2 = findNode(CARDS[k].badgePillId, FLOW_ROOT);
    if (n2) putFit(CARDS[k].badgePillId, { top: (n2.y + dy) + 'px' });
    if (k === 'YX') {
      const n3 = findNode(CARDS.YX.glowId, FLOW_ROOT);
      if (n3) putFit(CARDS.YX.glowId, { top: (n3.y + dy) + 'px' });
    }
  }
  if (ctx.speed !== 0.5) P.set(BUTTONS.speed.labelTextId, { text: ctx.speed + 'x' });
  // ---- V6.0（流式布局改造）：设计子树整组隐藏——四卡内容/徽标、步骤条 chip、工单卡、
  //      日志标题/计数改由覆盖层流式组件渲染（flow/NodeCard.jsx、StepBar.jsx、
  //      OrderPanel.jsx、LogHeader.jsx）；外壳几何常量（CARDS/CHEVRONS/ORDERS/LOGS）
  //      仍为连线端点/集群锚定/房间条/面板避让的坐标锚。置于函数末尾：上文对同一 id 的
  //      P.set 整条覆盖（工单卡 st-ocard/日志标题 pointerEvents 等）不致丢失 hide ----
  for (const k of AGENTS) {
    P.set(CARDS[k].bgId, { hide: true });
    P.set(CARDS[k].badgePillId, { hide: true });
  }
  P.set(CARDS.YX.glowId, { hide: true });
  CHEVRONS.forEach((ch) => [ch.chipId, ch.iconId, ch.nameId, ch.durId].forEach((id) => P.set(id, { hide: true })));
  P.set(ORDERS.c1.id, { hide: true });
  P.set(ORDERS.c2.id, { hide: true });
  P.set(LOGS.titleTextId, { hide: true });
  P.set(LOGS.countTextId, { hide: true });
  // V6.1：日志面板帧整组隐藏（渐变底/顶线/把手/箭头）——面板由 flow/FlowLogPanel 流式重建
  //（可拖拽调高）；id 见 design/regions/log-panel.js（LG_FRAME 手工登记）
  for (const id of ['23:137186', '23:137187', '23:137189', 'I23:137190;2:325077']) P.set(id, { hide: true });
  // V6.2：工单列表收起把手（boder/箭头）隐藏——由 flow/OrderPanel 重建
  //（SVG 箭头样式，参考日志面板把手）
  P.set('23:137098', { hide: true });
  P.set('I23:137099;2:325077', { hide: true });
  // V6.2：流程中心（LC 23:136979）隐藏——设计节点不随拓扑平移（用户反馈"流程中心没有
  // 跟随平移"），改由 StorylineOverlays 画布层流式重建（随 pan/缩放）
  P.set('23:136979', { hide: true });
  // V6.2：房间条设计节点（客服/监控室 tab、客服—监控室与监控室—传输室连线、光点 g0/g1）
  // 隐藏——用户反馈"缩放时第一个客服和监控室不要跟随变化"：设计节点随区域 Z 缩放，
  // 改由悬浮层重建（随 F 自适应、不随 Z/pan，见 StorylineOverlays；V6.3 五胶囊重构，
  // 客服—监控室连线 23:135683 一并入悬浮层四段重建）
  for (const id of ['23:135676', '23:135678', '23:135683', '23:135685', '23:135682', '23:135684']) P.set(id, { hide: true });
  // V6.2（用户规格）：主标题（渐变文字 23:137645 + 底带 deco:title-band + 梯形装饰线
  // deco:title-trapezoid）随左栏收起居中——标题区独立于画布区域（不随 F 重适配），
  // 工单列表收起（区域扩至全宽）时标题单元自流程区中心 1112.5 平移至画布中心 960
  //（Δ−152.5），0.25s 过渡与区域重适配同步；展开复原
  const titleShift = ctx.ordersHidden ? -152.5 : 0;
  putFit('23:137645', { left: (923.5 + titleShift) + 'px', transition: 'left 0.25s ease' });
  putFit('deco:title-band', { left: (930.22 + titleShift) + 'px', transition: 'left 0.25s ease' });
  putFit('deco:title-trapezoid', { left: (654 + titleShift) + 'px', transition: 'left 0.25s ease' });
  return P;
}

export function buildPatches(world, ctx) {
  const P = new Map();
  const set = (id, patch) => { if (id) P.set(id, patch); };
  const hide = (id) => { if (id) P.set(id, { hide: true }); };

  // ---- 静态占位文案修正（快照/回放一致）：XX → 粤东/粤西 ----
  // 卡片标题（粤东/粤西 SPN 智能体，含粤西发光容器内同名副本）——文案改写 + V5.39 加粗
  // V5.39（用户规格）：卡片标题（WAIMO/专线/粤东/粤西）font-weight:700——WAIMO/专线
  // 标题节点无运行时文案补丁需求、未入 CARDS 导出，按设计节点 id 直补（烤入 500）：
  // 23:135918=WAIMO投诉处理智能体、23:136488=专线投诉处理智能体
  set('23:135918', { s: { fontWeight: '700' } });
  set('23:136488', { s: { fontWeight: '700' } });
  set(CARDS.YD.nameTextId, { text: '粤东SPN网络内生智能', s: { fontWeight: '700' } });
  set(CARDS.YX.nameTextId, { text: '粤西SPN网络内生智能', s: { fontWeight: '700' } });
  set(CARDS.YX.glowNameTextId, { text: '粤西SPN网络内生智能', s: { fontWeight: '700' } });
  // V5.43（用户规格）：主标题（传输专线投诉处理场景A2A-T多智能体协同，渐变文字 23:137645）加粗
  set('23:137645', { s: { fontWeight: '700' } });
  // V5.45（用户规格）：区域标题加粗——「投诉分析流」（流程区标题 23:135686）与
  // 「工单列表」（左栏标题 23:137102，渐变文字）
  set('23:135686', { s: { fontWeight: '700' } });
  set('23:137102', { s: { fontWeight: '700' } });
  // V5.57/V5.58（用户规格）：回放按钮文字随状态切换——设计烤入文字节点 23:137028
  //（原「回放」）按 ctx.mode 改写「暂停/回放」；V5.57 曾叠覆盖层文字与设计文字重合
  //（"2 个重合的"），覆盖层方案废止
  set('23:137028', { text: ctx.mode === 'playing' ? '暂停' : '回放' });
  // 左侧工单卡描述：真实文案 + 溢出省略 + 悬浮全文；V5.23：描述随 ORDER_SLOT 落位；
  // V5.60（用户规格）：①描述文字 0.875rem/1.375rem（原 0.7rem）；
  // ②c1 点击/回放后描述不再切换——原 orderInfo（Accept 补充 cvlan 后切换为
  // orderDescUpdated 长文案）机制废止，恒显示原投诉描述
  const DESC_FONT = { ...ELLIPSIS, fontSize: '0.875rem', lineHeight: '1.375rem' };
  set(ORDERS[ORDER_SLOT.c1].descTextId, { text: CASES.c1.desc, title: CASES.c1.desc, s: DESC_FONT });
  set(ORDERS[ORDER_SLOT.c2].descTextId, { text: CASES.c2.desc, title: CASES.c2.desc, s: DESC_FONT });
  // V5.60（用户规格）：工单卡时间行（时间｜用时）0.75rem/1.25rem（原 0.7rem）
  set('23:137152', { s: { fontSize: '0.75rem', lineHeight: '1.25rem' } });
  set('23:137179', { s: { fontSize: '0.75rem', lineHeight: '1.25rem' } });

  if (!world) {
    for (const k of AGENTS) {
      CARDS[k].mini.forEach((m) => {
        if (m.designState === 'active') return;
        m.slotHideIds.forEach((id) => P.set(id, { hide: true }));
      });
    }
    // 第二条日志：整行切图（斑马纹位图）改文字呈现 —— 位图隐藏、斑马纹以单元格底色补回
    hide(LOGS.zebraSpriteId);
    set(LOGS.zebraCellId, { s: { backgroundColor: 'rgba(119,119,119,0.15)' } });
    // 静态日志行占位文案修正（对应案例一第 2/4/8 条事件的展示文案，V4 工单1）
    set(LOGS.rowTexts.row1Summary, { text: '进行集客专线业务投诉场景网络侧故障诊断，达成诊断目标，电路编号：广州-深圳GE1508KA/P。故障现象：专线中断。' });
    set(LOGS.rowTexts.row2To, { text: '粤西SPN网络内生智能' });
    set(LOGS.rowTexts.row2Summary, { text: '对网络侧故障进行诊断，返回故障根因和修复建议等诊断结果信息。接入端口名称：P36169-YWHJ-棠溪村微网格业务汇聚机房1（990）-1-1-TPN1EM10F-10-ETH' });
    set(LOGS.rowTexts.row3From, { text: '粤西SPN网络内生智能' });
    // V2.13/V2.14：收起或非 16:9 视口（快照态）连线 sprite 位图无法随集群端点重适配 → 整组隐藏，
    // 由覆盖层 SVG 连线（StorylineOverlays 以伪 world 全量呈现）接管
    const TF0 = totalFactors(ctx);
    if (TF0.fx !== 1 || TF0.fy !== 1) {
      for (const L of Object.values(LINES)) hide(L.spriteId);
    }
    // 粤西卡内嵌描述（快照态可见）：占位文案 → 真实描述（V4：c1 粤西=故障侧·光纤中断）
    set(CARDS.YX.descTextId, { text: CASES.c1.d.yx0 });
    // 白色房间高亮底：默认打开不展示（回放态由下方分支按当前房间定位）
    hide(ROOMS.bgId);
    // 快照态点亮日志：仅日志区变实时（隐藏静态行/装饰滚动条），其余保持设计稿
    if (ctx.logLive) {
      LOGS.cellIds.forEach((id) => P.set(id, { hide: true }));
      P.set(LOGS.scrollbarId, { hide: true });
      set(LOGS.countTextId, { text: CASES[ctx.caseId].logs.length + '条' });
    }
    // V5.29（用户规格）：组间连线光点（滑块）改为"仅登场动效"——登场窗口外一律隐藏，
    // 快照态亦不呈现（原设计静态滑块随之隐藏；V5.12"回放中常动/其余静止于中点"废止）
    ROOMS.glides.forEach((g) => hide(g.id));
    // V5.34/V5.54/V5.57（用户规格）：传输室胶囊两案均由覆盖层重绘（设计节点隐藏，见
    // StorylineOverlays 两枚胶囊）；监控室—传输室连线（CS_LINK，区域本地 515.58 起、
    // 世界 820.58 起）右端贴各案传输室胶囊左缘——V5.57 按案分支：
    //   c1 胶囊 1072.5（根因定位上方）→ 宽 251.92（世界 820.58..1072.5）
    //   c2 胶囊 1293.79（问题处置上方）→ 宽 473.21（世界 820.58..1293.79）
    //（原两案统一 473.21 在 c1 穿过传输室胶囊——"虚线穿过"根因）
    hide(CS_TAB_ID);
    P.set(CS_LINK_ID, { s: { width: (ctx.caseId === 'c1' ? 251.92 : 473.21) + 'px' } });
    return P;
  }

  // ---- 传输室科室元素揭示（V5.54→V5.59）：csOn = 传输室胶囊对齐步骤已激活——
  // V5.59（用户规格）：科室元素随「对齐步骤」——c1 传输室胶囊对齐根因定位（步骤3）、
  // c2 对齐问题处置（步骤4），CS_LINK 连线与 g1 滑块随胶囊同拍（原两案统一步骤3 废止：
  // c2 胶囊对齐问题处置却在步骤3 出现——"未执行到的步骤不要出现，即使同科室"）；
  // 胶囊两枚/竖线/虚线布局见 StorylineOverlays（V5.56 按 caseId 分支） ----
  const csStep = ctx.caseId === 'c1' ? 3 : 4;
  const csOn = world.steps[csStep] !== 'todo';

  // 房间白色高亮底（V5.31 用户规格）：整块移除——不再随当前步骤所在房间平移展示
  // （原"跟随当前房间（客服/监控室/传输室）平移 + 0.5s 过渡"逻辑废止；快照态原有隐藏一致）
  hide(ROOMS.bgId);
  // 组间连线（客服—监控室—传输室）光点动效（V5.29 用户规格）：只在对应房间首次登场时
  // 动效、之后整点消失。窗口 = 滑块行程 1 周的业务时长（dur×4×speed 业务秒——1x 恰一周、
  // 倍速按比例展宽保实长）；窗口内回放中施加动画类（暂停/seek 静止呈现）、窗口外与
  // 登场前隐藏；监控室—传输室段登场前仍随传输室整组隐藏（原逻辑）。
  // V5.36：监控室 g0 随 WAIMO 卡 t=0；V5.54→V5.59：传输室 g1 随 csStep
  //（c1=144 步骤3 / c2=384 步骤4，与传输室胶囊对齐步骤同拍）——V5.57 连线按案缩短
  //（c1 251.92 / c2 473.21），g1 行程/时长/位置随线宽等速（74.9px/s：c1 ±85.96/2.3s、
  // c2 ±196.61/5.25s，见 StorylineOverlays glideCss）；
  // V5.63 修复：播放循环 ctx 曾缺 t（tb 恒 0）——播放中 g1 从不登场、g0 窗口结束不隐藏
  //（V5.63 起 StorylineContext 播放发布携带 t，seek/暂停路径本就正常）
  const tCS = CASES[ctx.caseId].boundaries[csStep - 1];
  const isC1 = ctx.caseId === 'c1';
  const g1Half = isC1 ? 85.96 : 196.61;   // (线宽−80)/2
  const g1Dur = isC1 ? 2.3 : 5.25;        // 2×half / 74.9px/s
  const g1Left = isC1 ? 601.54 : 712.19;  // 区域本地 = 线左端 515.58 + half
  const tb = ctx.t != null ? ctx.t : 0;
  const spd = ctx.speed || 1;
  // V5.63（用户规格）：完成态（默认）三条连线光点**常驻静态展示**——各线中点
  //（g0 设计位/g1 left 补丁位）、无动画类；回放中登场窗口逻辑不变（V5.29）
  ROOMS.glides.forEach((g, i) => {
    if (!csOn && i === 1) { hide(g.id); return; }
    if (world.caseDone) return;           // 完成态：静态常驻（不 hide、不施加动画类）
    const T = i === 0 ? 0 : tCS;
    const dur = i === 1 ? g1Dur : g.dur;
    const win = Math.ceil(dur * 4 * spd);
    if (tb < T || tb >= T + win) { hide(g.id); return; }
    if (ctx.mode === 'playing') set(g.id, { c: 'st-glide' + i });
  });
  // V5.34/V5.54/V5.57：传输室胶囊覆盖层重绘（两案隐藏设计节点）；连线按案缩至各案
  // 传输室胶囊左缘；滑块 g1 随线左端+行程重定位（合并式补丁——保留前述 hide/动画类）
  hide(CS_TAB_ID);
  const pg1 = P.get(ROOMS.glides[1].id) || {};
  P.set(ROOMS.glides[1].id, { ...pg1, s: { ...(pg1.s || {}), left: g1Left + 'px' } });
  P.set(CS_LINK_ID, { s: { width: (isC1 ? 251.92 : 473.21) + 'px' } });
  // V5.54：传输室连线随根因定位步骤揭示（csOn=步骤3 激活；原随专线卡登场废止）
  if (!csOn) { hide(CS_LINK_ID); }

  // ---- 智能体卡片 ----
  for (const k of AGENTS) {
    const card = CARDS[k];
    // 未登场节点隐藏（案例二粤西不登场：完成态同样不呈现）
    if (!world.visible[k]) {
      hide(card.bgId); hide(card.badgePillId); hide(card.badgeTextId);
      if (k === 'YX') hide(card.glowId);
      continue;
    }
    const st = world.caseDone && world.nodes[k] === 'idle' ? 'success' : world.nodes[k];
    if (st === 'idle') {
      set(card.bgId, { c: 'st-idle' });
      hide(card.badgePillId); hide(card.badgeTextId);
    } else if (st === 'running') {
      set(card.bgId, {
        c: 'st-running',
        s: {
          // V2.23：改用 border 简写覆盖（原 borderColor 长属性在 running→success 回落时被 React
          // 单独清空——CSSOM 中简写已展开为长属性、清 color 后回落 currentColor（黑边框），
          // 回放结束后边框变黑即此因；简写键值变化可整组重设，回落自然恢复设计蓝）
          border: '1px solid rgba(0,103,209,1)',
          boxShadow: '0px 0px 25.02px 0px rgba(71,101,184,1), 0px 0px 50.04px 0px rgba(71,101,184,0.5)',
        },
      });
      set(card.badgePillId, { s: { backgroundColor: 'rgba(89,144,253,1)' } });
      set(card.badgeTextId, { text: '进行中', s: { color: 'rgba(255,255,255,1)' } });
    } else {
      set(card.badgePillId, { s: { backgroundColor: 'rgba(13,148,88,1)' } });
      set(card.badgeTextId, { text: '已完成', s: { color: 'rgba(255,255,255,1)' } });
    }
    // 执行中步骤描述 → 卡片高度固定（V5.6 用户规格：不随描述动态增高/回落——
    // 描述至多两行、不超出卡底，见 StepDesc/storyline.css line-clamp；height 补丁仅保持设计值）
    const grown = world.desc[k] ? (card.descExt || 0) : 0;
    const bgPrev = P.get(card.bgId) || {};
    P.set(card.bgId, {
      ...bgPrev,
      s: {
        ...bgPrev.s,
        // V5.56/V5.57（用户规格）：三卡高 15rem（240）、WAIMO 高与专线一致（290=ZX 同式）；
        // ZX 保持 V5.55 增高（290）——与 uiPatches 同值（此处补丁覆盖后保持一致）
        height: (k === 'ZX' || k === 'WAIMO' ? CARDS.ZX.box.h + grown + CARD_GROW : CARD_H) + 'px',
        transition: 'height 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease',
      },
    });
    // 迷你步骤链：静态圆点全部隐藏（覆盖层统一渲染）；V3.24 未执行到的子步骤整体不出现——
    // todo 标题/连接线隐藏（补丁按次全量重算，状态离开 todo 即恢复渲染），执行到该步时才展示；
    // V4：完成态 caseDone 强制点亮按案例槽位使用集裁剪（usedMini 之外的槽位保持 todo → 不展示）；
    // V5 槽位紧凑：标题随槽位前移补位（使用集第 p 个槽位平移至第 p 个位置，与 MiniCircles
    // 紧凑落位一致），连接线按「位置 p ↔ p+1」呈现——未使用槽位不留空
    const states = world.mini[k];
    const um = (CASES[ctx.caseId] && CASES[ctx.caseId].usedMini) || null;
    const used = um && um[k] ? um[k] : card.mini.map((_, i) => i);
    // V5.5（用户规格）：迷你步骤行水平居中——可见子步骤数 n < 总槽位 N 时，标题/连接线
    // 随行整体右移 (N−n)×间距/2（各卡满行为设计居中版式，满行 shift=0；与 MiniCircles
    // 圆点同源）——每次出现下一个子步骤（n 增）重算一次，0.25s 过渡平滑回中
    const Nsl = card.mini.length;
    const mSpacing = Nsl > 1 ? card.mini[1].slotBox.x - card.mini[0].slotBox.x : 0;
    const nVis = used.filter((i) => world.caseDone || states[i] !== 'todo').length;
    const cShift = (Nsl - nVis) * mSpacing / 2;
    card.mini.forEach((m) => { m.slotHideIds.forEach(hide); });
    // 未使用槽位标题隐藏（回放中其状态恒为 todo；显式隐藏覆盖快照烤入版式）
    card.mini.forEach((m, i) => { if (!used.includes(i)) set(m.titleId, { hide: true }); });
    // 连接线 connId[p]（设计位置 p↔p+1）：使用集内相邻两槽（used[p]、used[p+1]）均执行到
    // 才显示，颜色随位置 p 槽位状态；位置超出使用集（其后无槽位）隐藏；V5.5 随行居中平移
    card.mini.forEach((m, p) => {
      if (!m.connId) return;
      const iA = used[p];
      const iB = used[p + 1];
      if (iA === undefined || iB === undefined) { hide(m.connId); return; }
      const sA = world.caseDone ? 'done' : states[iA];
      const sB = world.caseDone ? 'done' : states[iB];
      if (sA === 'todo' || sB === 'todo') hide(m.connId);
      else set(m.connId, { s: {
        backgroundColor: sA === 'done' ? 'rgba(54,193,141,1)' : 'rgba(243,243,243,0.15)',
        transform: 'translateX(' + cShift + 'px)',
        transition: 'transform 0.25s ease',
      } });
    });
    used.forEach((i, p) => {
      const m = card.mini[i];
      const s = world.caseDone ? 'done' : states[i];
      if (s === 'todo') { set(m.titleId, { hide: true }); return; }
      const ts = s === 'active'
            ? {
              // V3.16 内部子步骤执行中选中态（用户规格：radius 0.2rem / bg #002E6A /
              // border 0.05rem，1rem=20px → 4px/1px）；
              // V3.17 选中态文字定稿：#FFFFFF、HarmonyOS Sans SC Medium、0.5rem/0.9rem（10px/18px）、居中；
              // V3.18 边框对比度增强（#2E86DE → 亮蓝 #5CACFF）+ 加大内边距使胶囊明确包住文字；
              // V3.26 边框（胶囊框）再收敛：padding 6/2 → 4/1（胶囊 = 文字 + 2×4 + 2×1，高 22），
              // 负 margin 同步 -5/-2 保持文字原位不动、胶囊对称扩展
              color: '#FFFFFF',
              fontFamily: "'HarmonyOS Sans SC','HarmonyOS Sans','HarmonyOSHeiTi','Microsoft YaHei','PingFang SC',sans-serif",
              fontWeight: '500',
              fontSize: '10px',
              lineHeight: '18px',
              letterSpacing: '0px',
              textAlign: 'center',
              backgroundColor: '#002E6A',
              border: '1px solid #5CACFF',
              borderRadius: '4px',
              padding: '1px 4px',
              width: 'auto',
              height: 'auto',
              marginLeft: '-5px',
              marginTop: '-2px',
              backgroundImage: 'none',
              WebkitBackgroundClip: 'border-box',
              backgroundClip: 'border-box',
            }
            : { color: 'rgba(255,255,255,1)', backgroundImage: 'none', WebkitBackgroundClip: 'border-box', backgroundClip: 'border-box' };
      // V5 紧凑平移：使用集第 p 个槽位标题移至第 p 个位置（槽间距 52px）；
      // V5.5：+ 居中平移 cShift（可见数变化时整行回中，transition 平滑）
      const dx = card.mini[p].slotBox.x - m.slotBox.x + cShift;
      if (dx) ts.transform = 'translateX(' + dx + 'px)';
      ts.transition = 'transform 0.25s ease';
      // V5.47（用户规格）：执行中子步骤（loading）持续脉冲——与步骤条执行中同款呼吸
      //（调度处置/意图识别/Task-T 等详情面板在场期间激活胶囊同样动效，.st-mini-active）
      set(m.titleId, s === 'active' ? { c: 'st-mini-active', s: ts } : { s: ts });
    });
  }
  // 粤西：内嵌步骤描述与发光容器在回放态隐藏（描述由覆盖层统一渲染、发光由 st-running 提供）
  hide(CARDS.YX.descTextId);
  hide(CARDS.YX.glowId);

  // ---- 步骤条 ----
  let lastVisChev = -1;
  let firstHiddenChev = -1;
  CHEVRONS.forEach((ch, i) => {
    // V5.35（用户规格）：未执行到的步骤（todo）步骤条不出现——执行到该步骤时才揭示；
    // V5.54（用户规格）：两案统一（原 c2 "传输室步骤随专线卡 csOn 整组登场"废止——
    // 房间胶囊/连线已改随步骤揭示，整组隐藏会造成步骤条中段空缺）；与房间分区
    //（根因定位/问题处置=传输室，修复验证/投诉报结=监控室）无绑定，逐步骤独立揭示
    const hidden = world.steps[i] === 'todo';
    if (hidden) {
      if (firstHiddenChev < 0) firstHiddenChev = i;
      [ch.chipId, ch.iconId, ch.nameId, ch.durId].forEach(hide);
      return;
    }
    lastVisChev = i;
    const st = world.steps[i];
    if (st === 'active') {
      // V5.40（用户规格）：执行中步骤标题保持白色——V5.38 曾按反馈改主题蓝（rgba(92,172,255,1)），
      // 用户澄清白色为正确样式、勿改蓝，该补丁废止；active 仅蓝底+脉冲（标题白色为设计烤入）。
      // V5.43：nameId 显式补白色（防御式——用户报告仍见蓝色，实测当前构建 seek/播放均白，
      // 判为旧构建缓存；显式补丁保证任何环境下执行中标题恒白）
      set(ch.chipId, { c: 'st-chip-active', s: { backgroundColor: 'rgba(0,103,209,0.4)' } });
      set(ch.nameId, { s: { color: 'rgba(255,255,255,1)' } });
    } else if (st === 'todo') {
      [ch.chipId, ch.iconId, ch.nameId, ch.durId].forEach((id) => set(id, { c: 'st-dim' }));
    } else {
      // done：底色显式归一为中性——设计稿曾烤入高亮底（rgba(0,103,209,0.4)），
      // done 态原先不打补丁会残留高亮（停止/默认加载完成态、回放中已完成步骤同样生效）
      set(ch.chipId, { s: { backgroundColor: 'rgba(243,243,243,0.2)' } });
    }
  });
  // 隐藏段前一枚 chip 右缘改平（uiPatches 提供的是中段尖角造型；登场后覆盖消失
  // 自动还原。V5.34：按"首个隐藏步骤的前一枚"取——case1 隐藏段为中段空缺（定界右缘改平）、
  // case2 为末段截断，与原 lastVisChev 规则等价；V5.35：c1 首枚（受理）单独可见时用
  // 全平矩形（首枚左缘本无切口，CHEV_CLIP.last 的左切口不适用）；与 active/todo 态样式合并）
  const FLAT_RECT = 'polygon(0 0, 100% 0, 100% 100%, 0 100%)';
  const flatChevIdx = firstHiddenChev > 0 ? firstHiddenChev - 1 : lastVisChev;
  //（V5.54 两案统一按步骤状态隐藏后，firstHiddenChev 即首个未执行步骤）
  if (flatChevIdx >= 0 && flatChevIdx < CHEVRONS.length - 1) {
    const lc = CHEVRONS[flatChevIdx].chipId;
    const prev = P.get(lc) || {};
    P.set(lc, { ...prev, s: { ...prev.s, clipPath: flatChevIdx === 0 ? FLAT_RECT : CHEV_CLIP.last } });
  }

  // ---- 连线与协议胶囊（回放态全部隐藏，由 SVG 覆盖层矢量重绘）----
  // 设计稿连线 sprite 为整框不透明位图（烤入背景）：房间底平移后露矩形色块；
  // 检索连线在设计稿无像素（sprite 为纯背景块）；协议胶囊为矩形底色块（用户要求连线不带）。
  // 完成态（caseDone）所有连线由覆盖层全量呈现（ConnectionLines）。
  for (const L of Object.values(LINES)) {
    hide(L.spriteId);
    hide(L.pillId);
  }
  // 连线静态脉冲短条（矩形 5749 等）：回放态由流动小球替代
  DECOR.segIds.forEach(hide);

  // ---- 日志：静态 3 行与装饰滚动条隐藏（覆盖层渲染），计数文本实时 ----
  LOGS.cellIds.forEach(hide);
  hide(LOGS.scrollbarId);
  set(LOGS.countTextId, { text: world.logs.length + '条' });

  // ---- 左侧工单卡：选中态 / 回放中状态（V5.23：随 ORDER_SLOT 落位） ----
  const other = ctx.caseId === 'c1' ? 'c2' : 'c1';
  const sel = ORDERS[ORDER_SLOT[ctx.caseId]];
  const uns = ORDERS[ORDER_SLOT[other]];
  set(sel.id, { s: { border: '1px solid rgba(46,134,222,1)' } });
  set(uns.id, { s: { border: '1px solid rgba(119,119,119,1)' } });
  ORDERS.checkIds.forEach(hide); // 静态对勾隐藏，覆盖层浮动对勾替代
  if (!world.caseDone) {
    // 回放/单步进行中：选中工单卡状态显示「回放中」（案例本身已完成，非业务进行中）；
    // V5.32（用户规格）：改蓝色系（原橙色 rgba(246,158,57) 废止）——取房间胶囊同系 #5CACFF
    set(sel.pillId, { s: { backgroundColor: 'rgba(92,172,255,0.15)' } });
    set(sel.pillTextId, { text: '回放中', s: { color: 'rgba(92,172,255,1)' } });
  }

  return P;
}
