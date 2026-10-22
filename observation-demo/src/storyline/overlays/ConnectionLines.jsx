// ConnectionLines.jsx — 连线 SVG 覆盖层（回放态替代设计稿 sprite 裁切图）
// V6.3（用户规格）：拓扑几何单源驱动（flow/geometry.js + applyCaseGeometry）——
// 区域 = 步骤区域容器下边沿(230)..A2A-T 日志面板上边沿(882)、中心 556：
// WAIMO/传输/流程中心垂直居中、粤东/粤西上下对称（外隙 24）；连线端点全部贴卡
// 视觉边沿（卡宽按内容计算——传输卡两案不同：c1 290 / c2 410，waimo-zx 两线与
// neg 两线的传输侧端点随案变化）；传输→粤东/粤西 任务线终点 = 卡左侧边沿中点
//（y = 卡中心）。paths.js/roles-data.js 为 codegen 勿手改——FLOWS d 变体
//（d/dOn/dDim；V6 定高卡无增高，dGrow≡d、dDimGrow≡dDim）与 LINES pillBox/box
// 于 applyCaseGeometry 运行时全量重写（幂等；按 caseId 记忆化——工单卡点击切案时
// 随 StorylineOverlays 重算；ConnectionFlow（彗星/胶囊/消息）共用同一 FLOWS/LINES
// 实例同步生效）。对称组（关于 556）：lc 两线 534/578、waimo-zx 两线 534/578、
// neg 两线 541/571。
import React from 'react';
import { FLOWS } from '../paths';
import { LINES } from '../roles-data';
import { remapPathEnds } from '../roles';
import { cardRect } from '../flow/geometry';

const MARKER = 'st-chev';

// V5.57（用户规格）：检索连线颜色 #2CB8C9（原 #715AFB；箭头 marker 随色）、
// 描边宽 0.07rem（1.12，其余连线 1.5 不变）
for (const k of ['reg-waimo-search', 'reg-zx-search']) {
  if (FLOWS[k]) FLOWS[k].color = '#2CB8C9';
}
const SEARCH_KEYS = { 'reg-waimo-search': true, 'reg-zx-search': true };

// ---- V6.3 拓扑几何（见文件头）----
const REGION_CY = 556;   // (230 + 882) / 2——步骤区域容器下边沿..日志面板上边沿
const LC_RIGHT = 481;    // 流程中心盒右缘（401..481）
const REG_RIGHT = 513;   // 能开平台卡右缘（369..513）
const SEARCH_Y = 340.5;  // 检索线水平段（平台卡带内）

let _geoCase = null;
export function applyCaseGeometry(caseId) {
  if (_geoCase === caseId) return;
  _geoCase = caseId;
  const R = { WAIMO: cardRect('WAIMO', caseId), ZX: cardRect('ZX', caseId), YD: cardRect('YD', caseId), YX: cardRect('YX', caseId) };
  const f1 = (v) => Math.round(v * 10) / 10;
  const el = (r) => f1(r.x), er = (r) => f1(r.x + r.w), ec = (r) => f1(r.x + r.w / 2);
  const et = (r) => f1(r.y), eb = (r) => f1(r.y + r.h), cy = (r) => f1(r.y + r.h / 2);
  const { WAIMO: W, ZX: Z, YD, YX } = R;
  const y1 = REGION_CY - 22, y2 = REGION_CY + 22;   // lc / waimo-zx 对称组 534/578
  const n1 = REGION_CY - 15, n2 = REGION_CY + 15;   // neg 对称组 541/571
  const D = {
    'lc-waimo-fetch': { d: 'M481 ' + y1 + 'H' + el(W) },
    'lc-waimo-report': { d: 'M' + el(W) + ' ' + y2 + 'H481' },
    'reg-waimo-search': { d: 'M' + REG_RIGHT + ' ' + SEARCH_Y + 'H' + (ec(W) - 8.5) + 'Q' + ec(W) + ' ' + SEARCH_Y + ' ' + ec(W) + ' 349V' + et(W) },
    'reg-zx-search': { d: 'M' + REG_RIGHT + ' ' + SEARCH_Y + 'H' + (ec(Z) - 8.5) + 'Q' + ec(Z) + ' ' + SEARCH_Y + ' ' + ec(Z) + ' 349V' + et(Z) },
    'waimo-zx-task': { d: 'M' + er(W) + ' ' + y1 + 'H' + el(Z) },
    'waimo-zx-notif': { d: 'M' + el(Z) + ' ' + y2 + 'H' + er(W) },
    'zx-yd-task': {
      d: 'M' + ec(Z) + ' ' + et(Z) + 'V' + (cy(YD) + 6.5) + 'Q' + ec(Z) + ' ' + cy(YD) + ' ' + (ec(Z) + 9.5) + ' ' + cy(YD) + 'H' + el(YD),
      dOn: 'M' + ec(Z) + ' ' + (cy(YD) + 6.5) + 'Q' + ec(Z) + ' ' + cy(YD) + ' ' + (ec(Z) + 9.5) + ' ' + cy(YD) + 'H' + el(YD),
      dDim: 'M' + ec(Z) + ' ' + et(Z) + 'V' + (cy(YD) + 6.5),
    },
    'zx-yx-task': {
      d: 'M' + ec(Z) + ' ' + eb(Z) + 'V' + (cy(YX) - 6.5) + 'Q' + ec(Z) + ' ' + cy(YX) + ' ' + (ec(Z) + 9.5) + ' ' + cy(YX) + 'H' + el(YX),
      dOn: 'M' + ec(Z) + ' ' + (cy(YX) - 6.5) + 'Q' + ec(Z) + ' ' + cy(YX) + ' ' + (ec(Z) + 9.5) + ' ' + cy(YX) + 'H' + el(YX),
      dDim: 'M' + ec(Z) + ' ' + eb(Z) + 'V' + (cy(YX) - 6.5),
    },
    'zx-yd-neg': { d: 'M' + ec(YD) + ' ' + eb(YD) + 'V' + (n1 - 7.5) + 'Q' + ec(YD) + ' ' + n1 + ' ' + (ec(YD) - 9.5) + ' ' + n1 + 'H' + er(Z) },
    'zx-yx-neg': { d: 'M' + ec(YX) + ' ' + et(YX) + 'V' + (n2 + 7.5) + 'Q' + ec(YX) + ' ' + n2 + ' ' + (ec(YX) - 9.5) + ' ' + n2 + 'H' + er(Z) },
  };
  for (const [k, v] of Object.entries(D)) {
    const f = FLOWS[k];
    if (!f) continue;
    f.d = v.d;
    if (v.dOn) f.dOn = v.dOn;
    if (v.dDim) f.dDim = v.dDim;
    if (f.dGrow) f.dGrow = v.d;                 // V6 定高卡：无增高变体
    if (f.dDimGrow) f.dDimGrow = v.dDim || v.d;
  }
  // 协议胶囊：横向线标签居水平段中心、胶囊底 = 线 y − 4（贴线 0.25rem）；
  // 检索竖线标签在左侧（右缘距线 4）、y 居竖段中部
  const pw = (k) => (LINES[k] ? LINES[k].pillBox.w : 40);
  const P = {
    'lc-waimo-fetch': { x: f1((LC_RIGHT + el(W)) / 2 - pw('lc-waimo-fetch') / 2), y: y1 - 28 },
    'lc-waimo-report': { x: f1((LC_RIGHT + el(W)) / 2 - pw('lc-waimo-report') / 2), y: y2 - 28 },
    'waimo-zx-task': { x: f1((er(W) + el(Z)) / 2 - pw('waimo-zx-task') / 2), y: y1 - 28 },
    'waimo-zx-notif': { x: f1((er(W) + el(Z)) / 2 - pw('waimo-zx-notif') / 2), y: y2 - 28 },
    'zx-yd-task': { x: f1((ec(Z) + 9.5 + el(YD)) / 2 - pw('zx-yd-task') / 2), y: cy(YD) - 28 },
    'zx-yx-task': { x: f1((ec(Z) + 9.5 + el(YX)) / 2 - pw('zx-yx-task') / 2), y: cy(YX) - 28 },
    'zx-yd-neg': { x: f1((ec(YD) - 9.5 + er(Z)) / 2 - pw('zx-yd-neg') / 2), y: n1 - 28 },
    'zx-yx-neg': { x: f1((ec(YX) - 9.5 + er(Z)) / 2 - pw('zx-yx-neg') / 2), y: n2 - 28 },
    'reg-waimo-search': { x: f1(ec(W) - 44), y: f1((349 + et(W)) / 2 - 12) },
    'reg-zx-search': { x: f1(ec(Z) - 44), y: f1((349 + et(Z)) / 2 - 12) },
  };
  for (const [k, p] of Object.entries(P)) {
    if (LINES[k]) LINES[k] = { ...LINES[k], pillBox: { ...LINES[k].pillBox, ...p } };
  }
  // 线盒随移——waimo-zx-notif（Notification-T 面板 belowLine 定位）线 y578；
  // zx-yx-neg（协商面板定位）盒底 = 粤西贴点（卡顶 622）、水平段 传输右缘..肘弯
  if (LINES['waimo-zx-notif']) LINES['waimo-zx-notif'] = { ...LINES['waimo-zx-notif'], box: { ...LINES['waimo-zx-notif'].box, y: f1(y2 - 3.5) } };
  if (LINES['zx-yx-neg']) LINES['zx-yx-neg'] = { ...LINES['zx-yx-neg'], box: { x: er(Z), y: f1(et(YX) - 22.47), w: f1(ec(YX) - 9.5 - er(Z)), h: 22.47 } };
}

// 快照+收起态伪 world：设计连线 sprite 已隐藏（位图无法随集群端点重适配），
// 以「全部登场、全部连线可见」由 SVG 连线接管呈现
export function snapshotLinesWorld() {
  return {
    caseDone: false,
    visible: { WAIMO: true, ZX: true, YD: true, YX: true },
    seenLines: Object.fromEntries(Object.keys(FLOWS).map((k) => [k, true])),
    desc: {},
  };
}

// 选中当前应使用的连线 path（考虑目标卡增高；fit 提供时首/末端点随集群刚体重适配）
export function flowPick(world, key, fit) {
  const f = FLOWS[key];
  const grow = f.growKey && world && world.desc && world.desc[f.growKey];
  const d = grow ? f.dGrow : f.d;
  return fit ? remapPathEnds(fit, d, f.src, f.dst) : d;
}

// 反转绝对坐标 SVG 路径（M/H/V/L/Q）：响应方向消息沿同一几何逆向传递
export function reversePath(d) {
  const segs = [];
  let cur = null;
  const re = /([MHVLQ])((?:[\s,-]*-?[\d.]+)*)/g;
  let m;
  while ((m = re.exec(d)) !== null) {
    const n = (m[2].match(/-?[\d.]+/g) || []).map(Number);
    if (m[1] === 'M') { cur = { x: n[0], y: n[1] }; continue; }
    let to = null;
    let ctrl = null;
    if (m[1] === 'H') to = { x: n[0], y: cur.y };
    else if (m[1] === 'V') to = { x: cur.x, y: n[0] };
    else if (m[1] === 'L') to = { x: n[0], y: n[1] };
    else { ctrl = { x: n[0], y: n[1] }; to = { x: n[2], y: n[3] }; }
    segs.push({ from: cur, to, ctrl });
    cur = to;
  }
  if (!segs.length) return d;
  const f = (p) => p.x + ' ' + p.y;
  let out = 'M' + f(segs[segs.length - 1].to);
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    out += s.ctrl ? 'Q' + f(s.ctrl) + ' ' + f(s.from) : 'L' + f(s.from);
  }
  return out;
}

// 响应方向（rev）连线 path：取正向 path（含增高变体）后反转，激光自 dst 流向 src
export function flowPickRev(world, key, fit) {
  return reversePath(flowPick(world, key, fit));
}

export default function ConnectionLines({ world, pub }) {
  const fin = world.caseDone;
  // 完成态：仅呈现登场节点间的连线（案例二粤西不登场 → 专线—粤西两条线不呈现）
  const agentOn = (k) => (k !== 'YD' && k !== 'YX') || world.visible[k];
  const seen = Object.keys(FLOWS).filter((k) => {
    const f = FLOWS[k];
    if (!agentOn(f.src) || !agentOn(f.dst)) return false;
    return fin || world.seenLines[k];
  });
  if (!seen.length) return null;
  const colors = [...new Set(seen.map((k) => FLOWS[k].color))];
  return (
    <svg className="st-clines" viewBox="0 0 1920 1080" style={{ width: '120rem', height: '67.5rem' }} aria-hidden="true">
      <defs>
        {colors.map((c) => (
          <marker key={c} id={MARKER + c.replace('#', '')} viewBox="0 0 9 9"
            markerWidth="7" markerHeight="7" refX="7.6" refY="4.5" orient="auto-start-reverse">
            <path d="M1.5 1L7.5 4.5L1.5 8" fill="none" stroke={c} strokeWidth="1.3"
              strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        ))}
      </defs>
      {seen.map((key) => {
        const f = FLOWS[key];
        const m = 'url(#' + MARKER + f.color.replace('#', '') + ')';
        const grow = f.growKey && world.desc && world.desc[f.growKey];
        // V2.13：端点随集群刚体重适配（首端贴源卡、末端贴目标卡），中间点随区域拉伸（连线拉长）；
        // dDim 暗段仅首端贴源卡、dOn 亮段仅末端贴目标卡（拆段路径的接缝点保持在拉伸网格上）
        const d = flowPick(world, key, pub);
        const dim = f.dDim ? remapPathEnds(pub, grow && f.dDimGrow ? f.dDimGrow : f.dDim, f.src, null) : null;
        const on = f.dOn ? remapPathEnds(pub, f.dOn, null, f.dst) : d;
        return (
          <g key={key} data-key={key}>
            {dim ? <path d={dim} fill="none" stroke={f.color} strokeWidth={1.5} strokeOpacity={0.8} /> : null}
            <path d={on} fill="none" stroke={f.color} strokeWidth={SEARCH_KEYS[key] ? 1.12 : 1.5} strokeLinecap="round"
              markerStart={f.arrow === 'start' ? m : undefined}
              markerEnd={f.arrow === 'end' ? m : undefined} />
          </g>
        );
      })}
    </svg>
  );
}
