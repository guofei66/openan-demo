import React from 'react'

/* PlatformNodeCard — 能开平台节点卡（V6.0 流式布局：图标/名称/注册中心子卡纵向流式居中；
   子卡左右边距 0.75rem 与原版式一致） */
export default function PlatformNodeCard() {
  return (
    <div className="platform-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <img src="/assets/ic-roma.svg" alt="" style={{ position: 'static', display: 'block', width: 32, height: 32, marginTop: 12 }} />
      <span className="platform-card__name" style={{ position: 'static', marginTop: 8 }}>能开平台</span>
      {/* V6.2（用户规格）：注册中心子卡样式与传输卡编排中心一致——5.75×1.75rem /
          图标 1.25rem / 文字 0.75rem / 同底同边 */}
      <div className="platform-card__sub" style={{ position: 'static', display: 'flex', alignItems: 'center', gap: '0.375rem', width: '5.75rem', height: '1.75rem', padding: '0 0.5rem', boxSizing: 'border-box', marginTop: '0.625rem' }}>
        <img src="/assets/ic-checkin.svg" alt="" style={{ position: 'static', display: 'block', width: '1.25rem', height: '1.25rem', marginLeft: '0.25rem' }} />
        <span className="platform-card__subname" style={{ position: 'static', fontSize: '0.75rem', lineHeight: '1.25rem' }}>注册中心</span>
      </div>
    </div>
  )
}
