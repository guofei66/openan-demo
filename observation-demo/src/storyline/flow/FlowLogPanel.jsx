// FlowLogPanel.jsx — V6.1 流式布局：A2A-T 协作日志面板（可拖拽调高）
// 设计帧（渐变底/顶线/把手/标题/计数/静态行）整组隐藏（roles FLOW_HIDE），本组件重建：
// 背景 = 设计同款渐变 + backdrop blur；顶线 1px #393939；顶缘拖拽条（row-resize）+
// 收起把手（48×12 居中，设计 x1088.5）；头部（渐变标题 23:137193 同款 + 实时计数）；
// 表体 LogTable（面板本地系定位，高度随 logH）。
// 拖拽（用户规格）：高度 ∈ [默认 198, 1032（顶缘 y48——遮盖整个拓扑）]；拖拽仅改面板
// 高度——拓扑不缩放不重排（区别于收起态的区域重适配 F），面板覆盖其上（z 层：
// 画布裁剪层 < 本面板 < 详情面板层，见 StorylineOverlays）。
// 把手三态：非默认高度点击 → 回默认；默认高度点击 → 收起；收起态由 PanelHandles
// 底缘把手展开 → 回默认位置（StorylineContext.toggleLog）。
import React, { useRef } from 'react';
import { logStretchX } from '../roles';
import { CASES } from '../cases';
import { LOG_H_DEFAULT } from '../StorylineContext';
import LogTable from '../overlays/LogTable';
import './flow.css';

const Arrow = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" style={{ transform: 'rotate(90deg)' }} aria-hidden="true">
    {/* V6.2（用户规格）：增亮提对比度 #C9C9C9 */}
    <path d="M3 1.5 L7.5 5 L3 8.5" fill="none" stroke="rgba(201,201,201,1)" strokeWidth="1.4"
      strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function FlowLogPanel({ pub }) {
  if (pub.logHidden) return null;
  const logH = pub.logH || LOG_H_DEFAULT;
  const top = 1080 - logH;
  const left = logStretchX(pub, 305);
  const width = logStretchX(pub, 1920) - left;
  const n = pub.world ? pub.world.logs.length : CASES[pub.caseId].logs.length;
  const logs = pub.world ? pub.world.logs : CASES[pub.caseId].logs;

  // 拖拽/点击判别：位移 >3px 视为拖拽（调高），未移动的释放视为点击（把手收起逻辑）
  const g = useRef({ drag: false, moved: false, y0: 0, k: 1, top: 0 });
  const onDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = document.querySelector('.screen-canvas').getBoundingClientRect();
    Object.assign(g.current, { drag: true, moved: false, y0: e.clientY, k: rect.width / 1920, top: rect.top });
  };
  const onMove = (e) => {
    const s = g.current;
    if (!s.drag) return;
    if (Math.abs(e.clientY - s.y0) > 3) s.moved = true;
    if (!s.moved) return;
    // 画布 y（rem 缩放换算）→ 面板高度 = 1080 − y（api.setLogH 钳制范围）
    pub.api.setLogH(1080 - (e.clientY - s.top) / s.k);
  };
  const onUp = () => { g.current.drag = false; };

  return (
    <div className="fl-logpanel" style={{ left, top, width, height: logH }}>
      {/* 顶缘拖拽条（全宽，覆盖把手唇区+顶线上下，cursor row-resize） */}
      <div className="fl-logdrag" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
        onPointerCancel={onUp} title="拖拽调整日志面板高度" />
      {/* 收起把手（居中 48×12，设计版式：位于顶线上方——panel 顶缘 12px 唇区内，
          上圆角、下缘开口与面板相接；拖拽与点击按位移判别） */}
      <button className="fl-logtab" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
        onPointerCancel={onUp} onClick={() => { if (!g.current.moved) pub.api.toggleLog(); }}
        title={logH !== LOG_H_DEFAULT ? '回到默认位置' : '收起A2A-T协作日志'} aria-label="收起A2A-T协作日志">
        <Arrow />
      </button>
      {/* 面板主体：自顶线下（+12）至底——渐变底 + backdrop blur + 1px 顶线（#393939）；
          顶线在把手下方横贯全宽（设计 23:137186/187 版式：唇区 882..894、线与底自 894 起） */}
      <div className="fl-logbg" />
      {/* 头部：渐变标题（设计 23:137193 同款规格）+ 实时计数（右对齐） */}
      <div className="fl-loghead" style={{ position: 'absolute', left: 16, right: 16, top: 28 }}>
        <div className="fl-loghead__title">A2A-T协作日志</div>
        <div className="fl-loghead__count">{n}条</div>
      </div>
      {/* 表体：面板本地系（top 62 = 944−882；高度随 logH） */}
      <LogTable logs={logs} anchor={pub.world ? 'bottom' : 'top'} pub={pub} />
    </div>
  );
}
