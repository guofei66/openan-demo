import React from 'react'
import useStageClock from './useStageClock.js'
import { ORCH_WEIGHTS } from '../../storyline/panel-timing.js'

/* DynamicOrchestrationPanel — 动态编排详情面板
   （V6.0 流式布局：正文横向流式三栏——左侧元素 | 编排引擎 | 右侧元素，图示各栏纵向流式）
   V3.26 动态分步（窗口：mini1 激活 → mini2 激活，见 panel-timing orchestrationWindowOf）：
   ①左侧元素（意图卡 + AgentCard 卡）→ ②编排引擎图标（发光箭头 + AI 图标）→
   ③右侧元素（智能体协作工作流）；各段整组渐入（visibility 隐藏期不参与命中/选中）；
   V5.56（用户规格）：图示距标题和左右下边沿均 1rem */
export default function DynamicOrchestrationPanel(props) {
  const stage = useStageClock(props, 3, ORCH_WEIGHTS)
  const on = (k) => (stage >= k ? ' ir-on' : '')
  return (
    <div className="glass-panel fp-col" style={{ width: 574, height: 201 }}>
      <div className="fp-head">
        <div className="p-title-bar" />
        <div className="p-title-text">动态编排</div>
        {/* V5.53（用户规格）：副标题「动态生成编排流程」删除 */}
      </div>

      {/* 正文横向流式三栏（垂直居中）；工作流连线为 2D 图形，保持卡内绝对定位 */}
      <div className="fp-body fp-row" style={{ padding: '0.25rem 1rem 1rem', justifyContent: 'space-between', alignItems: 'center' }}>
        {/* ① 左侧：意图 + AgentCard（纵向流式堆叠）；
            V6.26（用户规格）：加号上边沿贴意图卡下边沿、AgentCard 贴加号下边沿——
            两向 gap 归零（margin 各 -0.75rem 抵消 flex 0.75rem 间距，三者紧贴堆叠）；
            V6.27（用户规格）：左组整体上移与右侧卡上边沿对齐——意图卡 marginTop 归零，
            左列总高 136.01 ≈ 右列 136，行内居中后两者顶部齐平 */}
        <div className={'fp-col--c ir-reveal' + on(1)} style={{ gap: '0.75rem' }}>
          <div style={{ position: 'relative', width: 256, height: 44 }}>
            <div className="p-card" style={{ left: 5, top: 0, width: 256, height: 44 }} />
            <img className="p-abs" src="/assets/intent-title-bg.svg" alt="" style={{ left: 0, top: 5, width: 62, height: 43.04 }} />
            <div className="p-tag-text" style={{ left: 17, top: 13 }}>意图</div>
            <div className="p-body-text" style={{ left: 65, top: 12 }}>跨地市的SPN投诉任务诊断</div>
          </div>
          <img className="p-abs" src="/assets/plus.svg" alt="" style={{ position: 'static', display: 'block', width: 12, height: 12.01, marginLeft: 108, marginTop: '-0.75rem' }} />
          <div style={{ position: 'relative', width: 256, height: 80, marginTop: '-0.75rem' }}>
            <div className="p-card" style={{ left: 5, top: 0, width: 256, height: 80 }} />
            <img className="p-abs" src="/assets/agentcard-title-bg.svg" alt="" style={{ left: 0, top: 5, width: 98, height: 43.04 }} />
            <div className="p-tag-text" style={{ left: 17, top: 13 }}>AgentCard</div>
            <div className="radio-group" style={{ left: 101, top: 6, width: 143, height: 68 }}>
              <div className="radio-option radio-option--glass" style={{ left: 8, top: 4, width: 127, height: 28, justifyContent: 'center' }}>
                粤东SPN网络内生智能
              </div>
              <div className="radio-option radio-option--glass" style={{ left: 8, top: 36, width: 127, height: 28, justifyContent: 'center' }}>
                粤西SPN网络内生智能
              </div>
            </div>
          </div>
        </div>

        {/* ② 编排引擎图标（纵向流式居中）；
            V6.21（用户规格）：「编排引擎」文字居中于发光箭头图标内（原在箭头下方） */}
        <div className={'fp-col--c ir-reveal' + on(2)} style={{ alignItems: 'center', gap: 0 }}>
          <img className="p-abs" src="/assets/ai-inference.svg" alt="" style={{ position: 'static', display: 'block', width: 32, height: 32 }} />
          <div style={{ position: 'relative', width: 63.71, height: 32.3, marginTop: -6 }}>
            <img className="p-abs glow-arrow-img" src="/assets/glow-arrow.svg" alt="" style={{ position: 'static', display: 'block', width: 63.71, height: 32.3 }} />
            <div
              className="p-engine-name"
              style={{ left: 0, top: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              编排引擎
            </div>
          </div>
        </div>

        {/* ③ 右侧：智能体协作工作流（连线 2D 图形，卡内保持绝对定位） */}
        <div className={'ir-reveal' + on(3)} style={{ position: 'relative', width: 218, height: 136 }}>
          <div className="p-card" style={{ left: 0, top: 0, width: 218, height: 136 }} />
          <img className="p-abs" src="/assets/workflow-title-bg.svg" alt="" style={{ left: -5, top: 5, width: 135, height: 43.04 }} />
          <div className="p-tag-text" style={{ left: 12, top: 13 }}>智能体协作工作流</div>

          <svg className="p-abs" style={{ left: 0, top: 0 }} width="218" height="136" viewBox="0 0 218 136" fill="none">
            <path d="M35.5 73 L35.5 64 Q35.5 58 41.5 58 L83 58" stroke="#09AA71" strokeWidth="1" strokeLinecap="round" />
            <path d="M78 53.5 L83 58 L78 62.5" stroke="#09AA71" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M130 58 L172.5 58 Q178.5 58 178.5 64 L178.5 73" stroke="#09AA71" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M174 68.5 L178.5 73 L183 68.5" stroke="#09AA71" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M35.5 97 L35.5 106 Q35.5 112 41.5 112 L83 112" stroke="#09AA71" strokeWidth="1" strokeLinecap="round" />
            <path d="M78 107.5 L83 112 L78 116.5" stroke="#09AA71" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M130 112 L172.5 112 Q178.5 112 178.5 106 L178.5 97" stroke="#09AA71" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M174 101.5 L178.5 97 L183 101.5" stroke="#09AA71" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>

          <div className="p-node-btn" style={{ left: 83, top: 46 }}>节点2</div>
          <div className="p-node-btn" style={{ left: 12, top: 73 }}>节点1</div>
          <div className="p-node-btn" style={{ left: 155, top: 73 }}>节点1</div>
          <div className="p-node-btn" style={{ left: 83, top: 100 }}>节点3</div>

          <div className="p-mini-label" style={{ left: 49, top: 46, color: '#09AA71' }}>诊断</div>
          <div className="p-mini-label" style={{ left: 158, top: 46, color: '#5CA2E9' }}>结果汇总</div>
          <div className="p-mini-label" style={{ left: 50, top: 100, color: '#09AA71' }}>诊断</div>
        </div>
      </div>
    </div>
  )
}
