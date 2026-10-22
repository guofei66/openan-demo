import React from 'react'
import TBubble from './TBubble.jsx'
import useStageClock from './useStageClock.js'
import { AUTH_WEIGHTS } from '../../storyline/panel-timing.js'

/* AuthorizationTPanel — Authorization-T 动网操作预授权检查
   V6.13（用户规格）：布局样式同步 react-panels 源——at-panel 流式版式：
   tdlg-head 标题行 + 气泡（margin 0.5rem 顶、padding 1/0/1.3125/0rem）+
   at-row 流程行（inline-block + marginLeft 偏移排布：方案生成胶囊 → 主干箭头 →
   查询预授权策略（决策图标+文字）→ 分支箭头排（是/否）→ 执行动网操作/人工授权 横排）；
   文字内容与动画保留——V5.11 面板名称「Authorization-T 动网操作预授权检查」、
   不展示「授权策略下发」；V5.9 流程图分步：①抢通方案生成 → ②向下箭头 + 查询预授权
   策略 → ③剩余元素同时出现（分支箭头、是/否、两胶囊）；主干与「是」分支箭头带
   流动虚线动画（panels.css .auth-flow，渐入挂 at-row 整行——块级 transform 生效） */
export default function AuthorizationTPanel(props) {
  const stage = useStageClock(props, 3, AUTH_WEIGHTS)
  const on = (k) => (stage >= k ? ' ir-on' : '')
  return (
    <div className="glass-panel tdialog at-panel" style={{ width: '21rem', height: '18.875rem' }}>
      <div className="tdlg-head">
        <span className="tdlg-bar" style={{ background: '#62b42e' }} />
        <span
          className="tdlg-title title-text--grad"
          style={{ backgroundImage: 'linear-gradient(90deg, #dff4cc, #62b42e)' }}
        >
          Authorization-T
        </span>
        <span className="tdlg-title" style={{ marginLeft: '0.6875rem', color: '#fff' }}>
          动网操作预授权检查
        </span>
      </div>

      <TBubble width={304} tail="right" style={{ margin: '0.5rem 0 0 0', padding: '1rem 0 1.3125rem 0' }}>
        {/* ① 抢通方案生成 */}
        <div className={'at-row ir-reveal' + on(1)}>
          <span className="auth-pill" style={{ marginLeft: '6.5625rem' }}>抢通方案生成</span>
        </div>
        {/* ② 主干向下箭头（流动虚线） */}
        <div className={'at-row ir-reveal' + on(2)}>
          <svg className="at-svg auth-flow" style={{ marginLeft: '9.15625rem' }} width="0.3125rem" height="2.0625rem" viewBox="0 0 5 33">
            <path d="M2.5,0 V27" stroke="#2070f3" strokeWidth="1" fill="none" />
            <polygon points="0,26.5 5,26.5 2.5,32.5" fill="#2070f3" />
          </svg>
        </div>
        {/* ② 查询预授权策略（决策图标 + 文字） */}
        <div className={'at-row ir-reveal' + on(2)} style={{ marginTop: '-0.0625rem' }}>
          <img
            className="at-svg"
            src="/assets/ic-decision.svg"
            alt=""
            style={{ marginLeft: '8.4375rem', width: '1.75rem', height: '1.75rem' }}
          />
          <span className="at-text" style={{ marginLeft: '0.25rem', marginTop: '0.25rem' }}>
            查询预授权策略
          </span>
        </div>
        {/* ③ 分支箭头（左弯 = 是 → 执行动网操作；右弯 = 否 → 人工授权；流动虚线） */}
        <div className={'at-row ir-reveal' + on(3)} style={{ marginTop: '-0.0625rem' }}>
          <span className="at-mini at-mini--yes" style={{ marginLeft: '7.0625rem', marginTop: '0.5rem' }}>是</span>
          <svg className="at-svg auth-flow" style={{ marginLeft: '-2.375rem' }} width="4.1875rem" height="2.125rem" viewBox="0 0 67 34">
            <path d="M64.5,1 V17 H2.5 V27" stroke="#2070f3" strokeWidth="1" fill="none" />
            <polygon points="0,26.5 5,26.5 2.5,32.5" fill="#2070f3" />
          </svg>
          <svg className="at-svg auth-flow" style={{ marginLeft: '-0.3125rem' }} width="4.1875rem" height="2.125rem" viewBox="0 0 67 34">
            <path d="M2.5,1 V17 H64.5 V27" stroke="#2070f3" strokeWidth="1" fill="none" />
            <polygon points="62,26.5 67,26.5 64.5,32.5" fill="#2070f3" />
          </svg>
          <span className="at-mini at-mini--no" style={{ marginLeft: '-2.4375rem', marginTop: '0.5rem' }}>否</span>
        </div>
        {/* ③ 分支结果横排：执行动网操作（是）｜人工授权（否） */}
        <div className={'at-row ir-reveal' + on(3)} style={{ marginTop: '-0.0625rem' }}>
          <span className="auth-pill" style={{ marginLeft: '2.6875rem' }}>执行动网操作</span>
          <span className="auth-pill auth-pill--gray" style={{ marginLeft: '2.25rem' }}>人工授权</span>
        </div>
      </TBubble>
    </div>
  )
}
