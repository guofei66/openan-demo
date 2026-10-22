import React from 'react'
import useStageClock from './useStageClock.js'
import wrapLines from './textWrap.js'
import { DISPATCH_WEIGHTS } from '../../storyline/panel-timing.js'

/* DispatchPanel — 调度处置面板（V6.0 流式布局：正文横向流式——消息气泡 | 光束 | 手机 | 光束 | 回复）
   V3.30：动态分步（窗口：WAIMO mini2 激活 → Notification-T 面板窗口起点）：
   ①手机 → ②左侧消息气泡（含梯形光束） → ③右侧回复气泡（含梯形光束），
   各步随窗口进度渐入（ir-reveal/ir-on）。
   V5.43（用户规格）：文字距气泡边沿 1rem（上下左右）、气泡距面板外边框 1rem——
   消息气泡高度随文字折行自适应（16 + 行数×16 + 16），梯形光束高度随气泡联动；
   回复气泡 16/16 内边距（高 48）。 */

// 消息文案（V4：原文档 APP 定位结果——YWHJ 业务汇聚机房端口收光无光，光纤中断）
const MSG_TEXT = '投诉工单的定位结果：YWHJ - 业务汇聚机房 1 (990) 的 12-TPJ1EM8F-4 端口收光无光，发光正常，原因是光纤中断。请前往故障点修复。'

export default function DispatchPanel(props) {
  const stage = useStageClock(props, 3, DISPATCH_WEIGHTS)
  const on = (k) => (stage >= k ? ' ir-on' : '')
  // 消息气泡高度：padding 1rem(16)×2 + 行数×行高 1rem(16)（文字区宽 136 = 10.5rem−32）
  const msgH = 32 + wrapLines(MSG_TEXT, 136, 12) * 16
  return (
    <div className="glass-panel tdialog fp-col" style={{ width: 360, height: 208 }}>
      <div className="fp-head">
        <div className="p-title-bar" />
        <div className="p-title-text">调度处置</div>
      </div>

      {/* 正文横向流式：消息气泡 → 光束 → 手机 → 光束 → 回复（垂直居中，气泡随行自适应） */}
      <div className="fp-body fp-row" style={{ padding: '0.5rem 1rem 1rem', justifyContent: 'center', gap: 0 }}>
        {/* ② 消息气泡（V4：原文档 APP 定位结果；V5.43 高度自适应 + 1rem 内边距） */}
        <div className={'disp-msg ir-reveal' + on(2)} style={{ position: 'static' }}>
          {MSG_TEXT}
        </div>

        {/* ② 梯形光束：手机（小边）→ 消息气泡（大边）；高度随气泡（V5.43 联动） */}
        <svg className={'ir-reveal' + on(2)} width="15" height={msgH} viewBox={`0 0 15 ${msgH}`} style={{ flex: 'none', display: 'block' }} aria-hidden="true">
          <defs>
            <linearGradient id="disp-beam-l" x1="15" y1="48" x2="0" y2="48" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="rgb(201, 201, 201)" stopOpacity="0.5" />
              <stop offset="1" stopColor="rgb(201, 201, 201)" stopOpacity="0.08" />
            </linearGradient>
          </defs>
          <polygon points={`0,0 15,${msgH / 2 - 19} 15,${msgH / 2 + 19} 0,${msgH}`} fill="url(#disp-beam-l)" />
        </svg>

        {/* ① 手机预览（对话沉浸式，已去除烤入光带的左缘） */}
        <img className={'ir-reveal' + on(1)} src="/assets/phone-preview.png" alt="" draggable={false}
          style={{ position: 'static', width: '4.5625rem', height: '10.625rem', display: 'block', flex: 'none', userSelect: 'none' }} />

        {/* ③ 梯形光束：手机（小边）→ 回复气泡（大边，高 48） */}
        <svg className={'ir-reveal' + on(3)} width="16" height="48" viewBox="0 0 16 48" style={{ flex: 'none', display: 'block' }} aria-hidden="true">
          <defs>
            <linearGradient id="disp-beam-r" x1="0" y1="24" x2="16" y2="24" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="rgb(201, 201, 201)" stopOpacity="0.5" />
              <stop offset="1" stopColor="rgb(201, 201, 201)" stopOpacity="0.08" />
            </linearGradient>
          </defs>
          <polygon points="0,16 16,0 16,48 0,32" fill="url(#disp-beam-r)" />
        </svg>

        {/* ③ 回复气泡 */}
        <div className={'disp-reply ir-reveal' + on(3)} style={{ position: 'static' }}>收到</div>
      </div>
    </div>
  )
}
