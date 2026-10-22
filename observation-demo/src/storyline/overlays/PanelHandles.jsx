// PanelHandles.jsx — 面板收起后的边缘把手（展开副本）
// 展开态用设计稿原把手（left-panel/log-panel 的 boder 节点 + 箭头切图，
// 经 StorylineContext interactions 挂接点击收起）；收起态面板整组卸载，
// 由本覆盖层副本承担「展开」：左缘竖把手 / 底缘横把手，
// 样式复刻设计把手（rgba(2,12,69,1) 底 + 1px #393939 边 + 圆角朝外 + 线性箭头）。
// 左栏也收起时，日志把手 x 随日志面板拉伸映射（logStretchX）保持居中。
import React from 'react';
import { logStretchX } from '../roles';

const Arrow = ({ dir }) => {
  const rot = { right: 0, down: 90, left: 180, up: 270 }[dir] || 0;
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" style={{ transform: 'rotate(' + rot + 'deg)' }} aria-hidden="true">
      {/* V6.2（用户规格）：增亮提对比度 #C9C9C9（原 #393939 过暗） */}
      <path d="M3 1.5 L7.5 5 L3 8.5" fill="none" stroke="rgba(201,201,201,1)" strokeWidth="1.4"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

export default function PanelHandles({ pub }) {
  const { api, logHidden, ordersHidden } = pub;
  const lgLeft = ordersHidden ? logStretchX(pub, 1088.5) : 1088.5;
  return (
    <>
      {ordersHidden ? (
        <button className="st-panelhandle" style={{ left: 0, top: 540, width: 12, height: 48, borderRadius: '4px 0 0 4px' }}
          onClick={api.toggleOrders} title="展开工单列表" aria-label="展开工单列表">
          {/* V6.2（用户规格）：收起后变展开图标——箭头右指（面板向右展开，原左指废止） */}
          <Arrow dir="right" />
        </button>
      ) : null}
      {logHidden ? (
        <button className="st-panelhandle" style={{ left: lgLeft, top: 1068, width: 48, height: 12, borderRadius: '0 0 4px 4px' }}
          onClick={api.toggleLog} title="展开A2A-T协作日志" aria-label="展开A2A-T协作日志">
          <Arrow dir="up" />
        </button>
      ) : null}
    </>
  );
}

