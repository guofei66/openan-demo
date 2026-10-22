// StepBar.jsx — V6.0 流式布局：步骤条（七枚箭头 chip 横向 flex）
// 设计 chip 四节点（背板/图标/标题/时长）整组隐藏（roles.js FLOW_HIDE），本组件重建：
// chip 宽恒 221.29（.fl-chip 13.830625rem）、行首 x338 y174——房间条竖线/胶囊/组间连线
// 的坐标锚不变；揭示/状态/右缘改平规则（V5.35/V5.54）与 chip 点击回放（V5.53）口径不变。
// V6.2（用户规格）：悬浮层——不随 Z（缩放）/pan（平移），但随 F（收起重适配）自适应
//（内嵌 zoomwrap 于 StorylineOverlays；chip satCssStyle 反向保尺寸、间距随 F 拉开——
// V5.x CHEVRON_SATS 口径恢复）。
import React from 'react';
import { CHEVRONS, satCssStyle } from '../roles';
import { CASES } from '../cases';
import './flow.css';

// 图标（设计烤入七枚，V5.45/V5.68 全白剪影——CSS filter 见 .fl-chip img）
const ICONS = [
  'ic_public_headphones_mic', 'ic_public_scans_person', 'ic_ict_a_double_solid_line', 'ic_ict_precise_search',
  'ic_ict_creating_design_state', 'ic_ict_repair', 'ic_ict_trip',
];
// 箭头造型（V2.18：左缘凹陷朝右/右缘尖端朝右；首枚左平、末枚右平；V5.34 右缘改平规则）
const CHEV_CLIP = {
  first: 'polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)',
  mid: 'polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%, 10px 50%)',
  last: 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 10px 50%)',
};
const FLAT_RECT = 'polygon(0 0, 100% 0, 100% 100%, 0 100%)';

export default function StepBar({ world, pub }) {
  const live = !!world;
  const steps = live ? world.steps : CASES[pub.caseId].steps.map(() => 'done');
  const names = CASES[pub.caseId].steps;
  const bmin = CASES[pub.caseId].bmin;
  // 隐藏段（todo 不渲染）与右缘改平：首个隐藏步骤的前一枚改平（c1 中段空缺 / c2 末段截断）
  let firstHidden = -1;
  let lastVis = -1;
  steps.forEach((s, i) => {
    if (live && s === 'todo') { if (firstHidden < 0) firstHidden = i; return; }
    lastVis = i;
  });
  const flatIdx = firstHidden > 0 ? firstHidden - 1 : lastVis;
  const chips = [];
  CHEVRONS.forEach((ch, i) => {
    const s = live ? steps[i] : 'done';
    if (live && s === 'todo') return; // V5.35：未执行到的步骤不出现
    let clip;
    if (i === flatIdx && flatIdx < CHEVRONS.length - 1) clip = flatIdx === 0 ? FLAT_RECT : CHEV_CLIP.last;
    else clip = i === 0 ? CHEV_CLIP.first : (i === CHEVRONS.length - 1 ? CHEV_CLIP.last : CHEV_CLIP.mid);
    const c = { x: ch.box.x + ch.box.w / 2, y: ch.box.y + ch.box.h / 2 };
    chips.push(
      <div key={i}
        className={'fl-chip' + (s === 'active' ? ' fl-chip--active' : '') + (s === 'todo' ? ' fl-chip--todo' : '')}
        style={{ clipPath: clip, ...satCssStyle(pub, ch.box, c) }}
        onClick={() => pub.api.replayStep(i)}
        title={names[i]}>
        <img src={'/icons/' + ICONS[i] + '.svg'} alt="" draggable={false} />
        <span className="fl-chip__name">{names[i]}</span>
        <span className="fl-chip__dur">{bmin[i]}分钟</span>
      </div>
    );
  });
  if (!chips.length) return null;
  return (
    <div className="fl-steps" style={{ left: CHEVRONS[0].box.x, top: CHEVRONS[0].box.y }}>
      {chips}
    </div>
  );
}
