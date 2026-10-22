// ConnectionFlow.jsx — 连线激光脉冲 + 协议胶囊（回放态，仅激活连线）
// 激光为贴线滑动的渐变短条（六层不同尾长/透明度叠加以近似连续渐变，以
// stroke-dashoffset 沿整条连线 path 滑动（SMIL））——严格贴线、过肘弯、端点处
// 自然进出（超界部分不绘制）；
// 协议胶囊 = 激活期间按设计稿位置/文案/配色呈现（SVG 绘制，替代隐藏的设计节点）：
//   - rev（响应方向）：沿反向 path 滑动，胶囊呈响应变体（Task-T响应 绿 / Negotiation-T响应 琥珀）
//   - label（事件覆盖）：如 Accept 后专线以完整参数重发任务 → 专线—粤东 task 线显示「Task-T请求」；
//     粤东抢通结果沿 task 线反向以「Notification-T」传递（LABEL_COLORS 统一青色）
//   - result（检索结果）：检索胶囊后追加命中结果标注
import React from 'react';
import { FLOWS } from '../paths';
import { LINES } from '../roles-data';
import { pathLength, pillCounterTransform } from '../roles';
import { flowPick, flowPickRev } from './ConnectionLines';
import { CASES } from '../cases';
import { taskTWindowOf, notifWindowOf } from '../panel-timing';

const FONT = "'HarmonyOS Sans SC','HarmonyOS Sans','HarmonyHeiTi','Microsoft YaHei','PingFang SC',sans-serif";
// V5.61→V5.62（用户规格）：光束总长减半（150→70）、粗细颠倒——**终点（目标卡）
// 方向粗/亮、起点方向细/暗**（V5.61 亮端在起点侧），流速减半（≈75px/s，对齐科室
// 滑块速度；原 ≈150px/s）。六层改为「尾隙 + 等长前端」排布：各层 dash **前端对齐**
//（亮端=前端=终点方向），cfg=[尾隙G, 透明度, 线宽]，dash 长=70−G——最长层（G=0）
// 最暗（0.09 尾底）、最短层最亮，前端六层叠加 ≈0.84、尾部 0.09（滑块
// linear-gradient(-90deg,1→0) 亮前暗后的同款轮廓）；
// V5.65（用户反馈修复）：原以 dasharray 前置 '0' 空段（'0 G D 10000'）实现「先隙
// 后划」——零长度 dash 在 strokeLinecap:round 下渲染为 Ø=线宽的实心圆点，六层
// 0 段同相（pattern 位 0 → 路径位 −offset，恰为最长层尾端）全程叠加 ≈0.81 不透明
// 度的**明显尾光点**；改相位法：dasharray 'D 10000' + 各层 dashoffset 动画
// 70−G→−len−G（层几何 [G−k,70−k] 与原完全等价、前端对齐不变，零长度段消失→尾点消失）
const COMET_L = 70;
const COMET = [[0, 0.09, 3], [12, 0.13, 3], [23, 0.18, 3], [35, 0.25, 3], [47, 0.35, 3], [58, 0.5, 3]];
const COMET_STROKE = 'rgba(196,196,196,1)';
// V5.62：流速 ≈75px/s（行程 = len+70）；V5.61 及以前 ≈150px/s（len/140+0.9 制）
const cometDur = (len) => Math.min(8, Math.max(2.2, (len + COMET_L) / 75)).toFixed(2) + 's';
// V5.57（用户规格）：检索线胶囊（标签）样式——底 #2CB8C926、圆角 0.2rem(3.2)，
// 文字 #55CCD9、HarmonyOS Sans SC regular 0.6rem(9.6px)/1rem
const SEARCH_PILL = { bg: '#2CB8C926', fg: '#55CCD9' };
// V5.57（用户规格）：WAIMO 检索标签放到连线（竖线段 x828.5）左侧、距线 0.25rem
//（胶囊 40 宽 → x 784.5，原线右侧 x833）
const WAIMO_PILL_X = 784.5;

// 响应方向（rev）协议胶囊：配色对齐日志徽章（Task-T响应绿 / Negotiation-T响应琥珀）
const RESP_LABEL = {
  'Task-T': { text: 'Task-T响应', bg: 'rgba(54,193,141,0.15)', fg: 'rgba(54,193,141,1)' },
  'Negotiation-T': { text: 'Negotiation-T响应', bg: 'rgba(209,159,0,0.15)', fg: 'rgba(209,159,0,1)' },
};
// 事件覆盖标签配色：响应/通知类消息走回程线（neg 线）正向传递时的胶囊配色
// （V2.11：Task-T响应 不与 Task-T 请求共用 task 线——沿协商回程线正向，绿色对齐日志徽章；
//  Notification-T 统一青色，对齐设计稿 waimo-zx-notif 线 Notification-T 胶囊）
const LABEL_COLORS = {
  'Notification-T': { bg: 'rgba(44,184,201,0.15)', fg: 'rgba(85,204,217,1)' },
  // V4：工单2 粤西抢通的两段 Notification（方案上报/执行成功）——同青色系（zx-yx-neg 线多标签变体）
  'Notification-T·上报': { bg: 'rgba(44,184,201,0.15)', fg: 'rgba(85,204,217,1)' },
  'Notification-T·成功': { bg: 'rgba(44,184,201,0.15)', fg: 'rgba(85,204,217,1)' },
  'Task-T响应': { bg: 'rgba(54,193,141,0.15)', fg: 'rgba(54,193,141,1)' },
  // V6.4（1020 文档修订）：Authorization-T 动网操作授权（工单2 问题处置——请求/响应
  // 经 zx-yx-neg 线，紫罗兰色系对齐注册中心/检索配色）
  'Authorization-T': { bg: 'rgba(168,159,249,0.15)', fg: 'rgba(168,159,249,1)' },
};
// 胶囊宽度估算（CJK 12px / 西文 6.3px + 两侧留白，与设计稿 Task-T=52、Negotiation-T=93 对齐）
const textW = (t) => Math.round([...t].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e7f ? 12 : 6.3), 0)) + 13;
// 连线下方 A2A-T 消息（V2.16 调大至 12px）：宽度按连线长度截断，展示不全以 …… 结尾。
// V5.4（用户反馈：消息越出连线两端、覆盖节点卡片）：原字符估宽偏窄（西文实际 ~7px、
// 省略号为全角 12px）→ 改用 canvas measureText 按实际字体度量（缓存），截断上限再留
// 8px 安全边，确保文字不超过连线长度
const MSG_FONT = "12px 'HarmonyOS Sans SC','HarmonyOS Sans','HarmonyHeiTi','Microsoft YaHei','PingFang SC',sans-serif";
let msgCtx = null;
const msgWCache = new Map();
function msgW(t) {
  if (typeof document === 'undefined') return [...t].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e7f ? 12 : 6.2), 0);
  if (!msgCtx) msgCtx = document.createElement('canvas').getContext('2d');
  if (!msgWCache.has(t)) { msgCtx.font = MSG_FONT; msgWCache.set(t, msgCtx.measureText(t).width); }
  return msgWCache.get(t);
}
function fitMsg(t, maxW) {
  if (msgW(t) <= maxW) return t;
  let out = '';
  for (const ch of t) {
    if (msgW(out + ch + '……') > maxW) break;
    out += ch;
  }
  return out + '……';
}
// 连线水平跨度（V2.20）：path 全段 x 极值（M/L 取 x、H 取 x、Q 取控制点与终点 x、V 无 x）。
// 消息宽度上限改以此为准——原 sprite 盒宽 L.box.w 含箭头/辉光留白（各端 ~4-5px），肘弯线另含
// riser 纵向段投影，均宽于可见连线，致消息越出连线两端；dGrow 变体仅改 riser 起点 y，x 跨度不变
function pathXExtent(d) {
  let minX = Infinity, maxX = -Infinity;
  const re = /([MHVLQ])((?:[\s,-]*-?[\d.]+)*)/g;
  let m;
  while ((m = re.exec(d)) !== null) {
    const n = (m[2].match(/-?[\d.]+/g) || []).map(Number);
    const xs = m[1] === 'Q' ? [n[0], n[2]] : m[1] === 'V' ? [] : [n[0]];
    for (const x of xs) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
  return maxX > minX ? { minX, maxX } : null;
}

export default function ConnectionFlow({ world, pub }) {
  const active = Object.keys(FLOWS).filter((k) => world.flows[k]);
  // V3.31：驻留——Task-T / Notification-T / Negotiation-T 详情面板在场时，对应连线
  // 协议胶囊不随激光关闭消失，与面板同寿命（面板窗口内连线关闭后仍展示设计标签，
  // 面板退场/下一连线激活时自然交接）；V5.19（用户规格）：激光动效同样随面板驻留
  // 延续——面板未消失前连线保持激活观感（消息文字不延续——传输已结束，内容由面板承载）
  const held = [];
  let notifHold = false;
  if (pub) {
    const c = CASES[pub.caseId];
    const hold = (key, win) => {
      if (!world.flows[key] && pub.t >= win.t0 && pub.t < win.t1) held.push(key);
    };
    hold('waimo-zx-task', taskTWindowOf(c));
    const notifWin = notifWindowOf(c);
    hold('waimo-zx-notif', notifWin);
    // V5.17：waimo-zx-notif 连线文字抑制仅在 Notification-T 面板在场窗口内（V4 原为案例级
    // 常驻抑制——工单2 根因总结后的 Task-T响应 汇总回传 372..384 无面板承载，被误伤隐藏）
    notifHold = notifWin.t1 > 0 && pub.t >= notifWin.t0 && pub.t < notifWin.t1;
  }
  if (world.negotiation && !world.flows['zx-yx-neg']) held.push('zx-yx-neg');
  if (!active.length && !held.length) return null;
  return (
    <svg className="st-flow" viewBox="0 0 1920 1080" style={{ width: '120rem', height: '67.5rem' }} aria-hidden="true">
      {active.map((key) => {
        const f = FLOWS[key];
        if (!f) return null;
        const L = LINES[key];
        const fo = world.flows[key];
        const rev = !!fo.rev;
        const d = rev ? flowPickRev(world, key, pub) : flowPick(world, key, pub);
        // V2.13：重映射后连线变长 → 彗星行程/时长按实际路径长度修正（展开态沿用导出 len）
        const len = pub ? pathLength(d) : f.len;
        const dur = cometDur(len);
        const base = L && L.label ? L.label : null;
        const resp = rev && base ? RESP_LABEL[base.text] : null;
        // 胶囊文案：事件覆盖（label）> 响应变体（rev）> 设计标签；非设计文案 → 宽度按字宽估算，以原胶囊中心居中
        const text = fo.label || (resp ? resp.text : (base ? base.text : null));
        const colors = (fo.label && LABEL_COLORS[fo.label]) || resp || base;
        const w = text && base && text !== base.text ? textW(text) : (L ? L.pillBox.w : 0);
        const cx = L ? L.pillBox.x + L.pillBox.w / 2 : 0;
        const x = cx - w / 2;
        // V2.20：消息截断上限 = 连线水平跨度；消息以胶囊中心居中，个别胶囊中心略偏离线中点时
        // 取窄侧余量×2，保证两侧均不越出连线端点（收起/重适配只会把连线拉长，静态跨度为保守上限）
        const ext = pathXExtent(f.d);
        const msgMax = ext
          ? Math.max(0, Math.min(ext.maxX - ext.minX, 2 * Math.min(cx - ext.minX, ext.maxX - cx)))
          : (L ? L.box.w : 0);
        // V2.13：胶囊保比例——以胶囊中心反向缩放抵消区域拉伸（骑线标签随线中点，文字不变形）
        const ctr = L ? pillCounterTransform(pub, L.pillBox) : undefined;
        // V3.28：有详情面板承载消息的连线不再重复展示连线文字——waimo-zx-task（Task-T 面板）、
        // waimo-zx-notif（Notification-T 面板）常驻抑制；协商面板在场时 zx-yx-neg 与
        // zx-yx-task（Accept 后 Task-T请求 重发）线均**仅展示协议胶囊、不展示消息内容**
        //（V5.10 用户规格；V4：工单1 协商挂粤西 zx-yx-neg 线；waimo-zx-notif 仅在有
        // Notification-T 面板的案例、且面板在场窗口内抑制——工单1 该线为 Task-T响应 汇总、
        // 无面板承载，保留连线文字；V5.17：工单2 面板窗口前的 Task-T响应 372..384 同样保留）
        // V5.14（用户规格）：检索智能体弹框在场——检索连线（reg-waimo-search / reg-zx-search）
        // **仅展示协议胶囊**，命中结果/消息文字均不展示（信息由检索面板承载）
        const searchLine = key === 'reg-waimo-search' || key === 'reg-zx-search';
        const msgHidden = key === 'waimo-zx-task'
          || (key === 'waimo-zx-notif' && notifHold)
          || (world.negotiation && (key === 'zx-yx-neg' || key === 'zx-yx-task'))
          || searchLine;
        // V5.57：检索线胶囊——WAIMO 检索标签移连线左侧（cx 覆盖）、青色系配色/字号
        const pillCx = searchLine && key === 'reg-waimo-search'
          ? WAIMO_PILL_X + L.pillBox.w / 2 : cx;
        const pillX = pillCx - w / 2;
        const pillBg = searchLine ? SEARCH_PILL.bg : colors.bg;
        const pillFg = searchLine ? SEARCH_PILL.fg : colors.fg;
        const pillFont = searchLine ? 9.6 : 12;
        return (
          <g key={key} data-key={key} data-dir={rev ? 'rev' : 'fwd'}>
            {COMET.map((cfg, i) => (
              <path key={i} d={d} fill="none" stroke={COMET_STROKE}
                strokeWidth={cfg[2]} strokeOpacity={cfg[1]} strokeLinecap="round"
                strokeDasharray={(COMET_L - cfg[0]) + ' 10000'}
                strokeDashoffset={COMET_L - cfg[0]}>
                <animate attributeName="stroke-dashoffset" from={COMET_L - cfg[0]} to={-len - cfg[0]}
                  dur={dur} repeatCount="indefinite" />
              </path>
            ))}
            {colors && text ? (
              <g style={{ transform: ctr, transition: 'transform 0.25s ease' }}>
                <g className="st-pill" data-key={key}>
                  <rect x={pillX} y={L.pillBox.y} width={w} height={L.pillBox.h}
                    rx={searchLine ? 3.2 : 4} fill={pillBg} />
                  <text x={pillCx} y={L.pillBox.y + 16.5} textAnchor="middle"
                    fontSize={pillFont} fontWeight="400" fontFamily={FONT} fill={pillFg}>{text}</text>
                </g>
                {fo.result && base && !searchLine ? (
                  <text className="st-flow-result" x={x + w + 8} y={L.pillBox.y + 16.5}
                    fontSize="12" fontWeight="400" fontFamily={FONT} fill={base.fg}>{fo.result}</text>
                ) : null}
                {fo.msg && !msgHidden ? (
                  // A2A-T 消息：连线下方展示（胶囊/连线之下）——V6.5（用户规格）：文字距连线
                  // 0.5rem（胶囊底≈线顶−4 → 文字顶 = 线 + 8：基线 = 胶囊底 + 12 + 12px 文本
                  // bbox 顶偏移≈13）、文字 0.75rem（12px），宽度不超过连线跨度（按实际字体
                  // 度量截断，V5.4 再留 8px 安全边——不越出连线两端、不覆盖节点卡片）、
                  // 超出以 …… 截断
                  <text className="st-flow-msg" data-key={key} x={cx} y={L.pillBox.y + L.pillBox.h + 12 + 13}
                    textAnchor="middle" fontSize="12" fontWeight="400" fontFamily={FONT}
                    fill="rgba(201,201,201,1)">{fitMsg(fo.msg, Math.max(0, msgMax - 8))}</text>
                ) : null}
              </g>
            ) : null}
          </g>
        );
      })}
      {held.map((key) => {
        // 驻留连线（V5.19 用户规格：消息详情面板在场时连线动效维持——激光彗星随面板
        // 驻留延续至面板退场，不随消息传输结束停止）：胶囊设计标签原位呈现（宽度/中心
        // 与激活期一致，衔接无跳变）；不带结果/消息；两案 flow 事件均未用 rev → 正向 path
        const L = LINES[key];
        const base = L && L.label ? L.label : null;
        if (!base) return null;
        const f = FLOWS[key];
        const d = f ? flowPick(world, key, pub) : null;
        const len = pub && d ? pathLength(d) : (f ? f.len : 0);
        const dur = cometDur(len);
        const ctr = pillCounterTransform(pub, L.pillBox);
        const cx = L.pillBox.x + L.pillBox.w / 2;
        return (
          <g key={'held-' + key} style={{ transform: ctr, transition: 'transform 0.25s ease' }}>
            {d ? COMET.map((cfg, i) => (
              <path key={i} d={d} fill="none" stroke={COMET_STROKE}
                strokeWidth={cfg[2]} strokeOpacity={cfg[1]} strokeLinecap="round"
                strokeDasharray={(COMET_L - cfg[0]) + ' 10000'}
                strokeDashoffset={COMET_L - cfg[0]}>
                <animate attributeName="stroke-dashoffset" from={COMET_L - cfg[0]} to={-len - cfg[0]}
                  dur={dur} repeatCount="indefinite" />
              </path>
            )) : null}
            <g className="st-pill" data-key={key} data-held="1">
              <rect x={L.pillBox.x} y={L.pillBox.y} width={L.pillBox.w} height={L.pillBox.h}
                rx="4" fill={base.bg} />
              <text x={cx} y={L.pillBox.y + 16.5} textAnchor="middle"
                fontSize="12" fontWeight="400" fontFamily={FONT} fill={base.fg}>{base.text}</text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
