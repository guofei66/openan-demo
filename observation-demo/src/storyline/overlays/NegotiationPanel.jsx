// NegotiationPanel.jsx — Negotiation-T 详细交互面板（专线 ↔ 粤西 协商窗口呈现）
// 世界态 negotiation 驱动两阶段：request（粤西发出 Negotiation-T 请求）仅展示第一条消息；
// accept（专线返回补充信息，Task-T请求 重发）追加第二条消息（滚动下滑 + 红色框→cvlan 选项区
// 三角光束定射后自动选中，见 NegotiationDialog）；窗口结束延迟淡出卸载（动画收尾）。
// 定位：以 zx-yx-neg 连线盒（roles-data LINES）水平居中、下缘 +12px；面板收起重适配下
// 按 专线/粤西 卡中心中点锚定反向缩放（保比例、随两侧卡片刚体平移，见 roles.satCssStyle）。
// V4：仅工单1 有协商（粤西发起，A端接入端口 P36169 名称不唯一 → 补充 cvlan=1208）；
// 工单2 无协商——CASE_NEG 无 c2 条目，面板与世界态均不出现
import React, { useEffect, useState } from 'react';
import NegotiationDialog from '../../components/negotiation/NegotiationDialog';
import { CARDS, LINES, satCssStyle } from '../roles';

const NEG_LINE_KEY = 'zx-yx-neg';
const PANEL_W = 336; // 面板尺寸（NegotiationDialog.css）
const PANEL_H = 295;
const OUT_MS = 800; // 协商窗口结束后延迟卸载（淡出 + 光束/选中动画收尾）
// 工单1/工单2 协商补充的 cvlan 与 Propose 文案（与 case-data.js 协商消息同源）；
// V6.4（1020 文档修订）：工单2 新增协商——粤西 A端端口 P1310-中石油 不含子接口标识，
// 专线补 cvlan=409；cvlan 选项区末枚随案（c1 cvlan1208 / c2 cvlan409）
const CASE_NEG = {
  c1: { vlan: 'cvlan1208', propose: '接入端口名称不唯一，该端口下存在多个业务接入口，请提供具体的子接口ID或VLAN ID以确认唯一的业务。' },
  c2: { vlan: 'cvlan409', propose: '接入端口名称不唯一，该端口下存在多个业务接入口，请提供具体的子接口ID或VLAN ID以确认唯一的业务。',
    options: [
      { id: 'cvlan99', label: 'cvlan99' },
      { id: 'cvlan100', label: 'cvlan100' },
      { id: 'cvlan101', label: 'cvlan101' },
      { id: 'ellipsis', label: '…', disabled: true },
      { id: 'cvlan409', label: 'cvlan409' },
    ] },
};

export default function NegotiationPanel({ world, pub }) {
  const phase = world ? world.negotiation : null;
  // 挂载态：{ accepted, out } —— 世界态回落后保留 800ms 淡出（动画收尾），期间恢复则复用
  const [st, setSt] = useState(null);
  useEffect(() => {
    if (phase) {
      const accepted = phase === 'accept';
      setSt((prev) => (prev && !prev.out && prev.accepted === accepted ? prev : { accepted, out: false }));
      return undefined;
    }
    setSt((prev) => (prev && !prev.out ? { ...prev, out: true } : prev));
    const timer = setTimeout(() => setSt(null), OUT_MS);
    return () => clearTimeout(timer);
  }, [phase]);
  if (!st) return null;
  const neg = CASE_NEG[pub.caseId] || CASE_NEG.c1;
  const line = LINES[NEG_LINE_KEY].box;
  const left = Math.round(line.x + line.w / 2 - PANEL_W / 2);
  // V6.2（用户规格）：面板处于连线下方 0.5rem（原 V5.56 距连线 0.25rem/+4px 废止）
  const top = Math.round(line.y + line.h + 8);
  // 锚点：专线/粤西卡中心中点（面板随两侧卡片刚体平移、保持原比例）
  const ctr = (k) => ({ x: CARDS[k].box.x + CARDS[k].box.w / 2, y: CARDS[k].box.y + CARDS[k].box.h / 2 });
  const aZ = ctr('ZX'), aY = ctr('YX');
  const anchor = { x: (aZ.x + aY.x) / 2, y: (aZ.y + aY.y) / 2 };
  return (
    <div className="st-layer st-neglayer">
      <div
        className={st.out ? 'st-neg-item st-neg-out' : 'st-neg-item'}
        style={{ position: 'absolute', left, top, ...satCssStyle(pub, { x: left, y: top, w: PANEL_W, h: PANEL_H }, anchor) }}
      >
        <NegotiationDialog defaultSelected={neg.vlan} options={neg.options} proposeText={neg.propose} accepted={st.accepted} />
      </div>
    </div>
  );
}
