// IntentRecognitionPanel.jsx — 投诉识别：意图识别（ReAct 推理环）
// V3.21 动态分步呈现：面板随 WAIMO mini0 激活窗口挂载，内容按窗口进度渐入——
// 已出现的步骤常驻累计，窗口末态 = 设计全量版式；中央 LLM 图标与面板标题常驻，
// 外圈白色箭头持续绕行。
// V5.2（用户规格，回退此前逻辑）：信息**顺时针依次出现**、常驻累计——
// ①输入（标题+箭头+三行投诉文本整体出现，左侧输入不做分开显示）
// → ②思考（上）→ ③行动（右）→ ④观察（下，绕光轮顺时针）
// → ⑤输出；各段 12 业务秒（1x 回放 3 观众秒），全部展示完成后才进入定界定位。
// V6.0（流式布局）：面板骨架改 fp-col（标题行流式）；正文 = 横向流式两栏
//（输入列 | 环形构图 | 输出列，列内容纵向流式、垂直居中）——中央 LLM 光轮与
// 三枚环节胶囊为 2D 环形构图（V5.2 顺时针版式），保持绝对定位于正文中心。
import React from 'react'
import useStageClock from './useStageClock.js'
import { INTENT_WEIGHTS } from '../../storyline/panel-timing.js'

// V4：输入/输出文案随案例切换（工单1 不可用 / 工单2 质差）
// V6.4（用户规格）：投诉现象文案更新 + 新增 客户所在地 行；产品类型/接入方式行删除；
// 工单1 输出改「集客传输专线投诉中断场景」
// V6.32：导出 CASE_INPUT——工单展开详情面板（OrderPanel）的工单描述/归属地市/
// 归属区县 与本面板投诉现象/客户所在地 同源一致
export const CASE_INPUT = {
  c1: [
    '投诉现象：客户表示广州至深圳的专线没法使用，对端数据包收不到，要求尽快核查处理。',
    '客户所在地：广州市白云区新市街道',
  ],
  c2: [
    '投诉现象：客户表示专线使用感知差，网络间歇性卡顿、丢包，业务时断时续，影响业务使用。',
    '客户所在地：广州市越秀区一路',
  ],
}
const CASE_OUTPUT = { c1: '集客传输专线投诉中断场景', c2: '传输专线质差投诉场景' }

export default function IntentRecognitionPanel(props) {
  const step = useStageClock(props, 5, INTENT_WEIGHTS)
  const on = (k) => (step >= k ? ' ir-on' : '')
  const items = CASE_INPUT[props.caseId === 'c2' ? 'c2' : 'c1']
  return (
    <div className="glass-panel fp-col" style={{ width: 498, height: 232 }}>
      <div className="fp-head">
        <div className="p-title-bar" />
        <div className="p-title-text">投诉识别：意图识别</div>
      </div>

      <div className="fp-body">
        {/* 中央 LLM 图标常驻 + 外圈白色箭头独立图层（顺时针绕行，见 panels.css .orb-arrows）；
            环形构图绝对定位——坐标 = 设计原值（y − fp-head 高 41；环心 272.4 偏面板中线右 23，
            不可用 50% 居中）；.orb-arrows 旋转动画接管 transform，left 用 calc/绝对值居中 */}
        <img
          className="p-abs"
          src="/assets/orb.svg"
          alt=""
          style={{ left: 186.69, top: -1.75, width: 171.48, height: 171.48 }}
        />
        <img
          className="p-abs orb-arrows"
          src="/assets/orb-arrows.svg"
          alt=""
          style={{ left: 186.69, top: -1.75, width: 171.48, height: 171.48 }}
        />
        <div className="orb-label" style={{ left: 232, top: 82 }}>LLM ReAct</div>

        {/* ② 思考（上）→ ③ 行动（右）→ ④ 观察（下）：绕光轮顺时针依次渐入
            （V5.32 用户规格：Reasoning/Action/Observation 改中文、标签旁说明文字删除；
             V5.69 用户规格：推理→思考、动作→行动、LLM React→LLM ReAct；
             环上时钟位 = 环顶 +24.75 / +60.75 / +132.75；
             V6.1 用户规格：三胶囊渐入提速 2 倍——ir-reveal--fast） */}
        <div className={'p-pill ir-reveal ir-reveal--fast' + on(2)} style={{ left: 168, top: 23, width: 73 }}>思考</div>
        <div className={'p-pill ir-reveal ir-reveal--fast' + on(3)} style={{ left: 322, top: 59, width: 73 }}>行动</div>
        <div className={'p-pill ir-reveal ir-reveal--fast' + on(4)} style={{ left: 190, top: 131, width: 80 }}>观察</div>

        {/* 正文横向流式：输入列（左，垂直居中）；输出改绝对定位（V6.1 用户规格：
            距观察胶囊 2rem——左缘 = 胶囊右缘 270 + 32 = 302，纵向对齐胶囊行） */}
        <div className="fp-row" style={{ position: 'absolute', inset: 0, padding: '0 1rem' }}>
          {/* ① 输入：标题+箭头+三行投诉文本整体渐入（左侧输入不分开显示） */}
          <div className={'fp-col--c ir-reveal' + on(1)} style={{ width: 185, height: '100%' }}>
            <div className="p-io-title" style={{ position: 'static' }}>输入：用户投诉文本</div>
            <svg width="185" height="16" viewBox="0 0 185 16" fill="none" style={{ display: 'block', marginTop: 2 }}>
              <path d="M0 8 H176" stroke="#715AFB" strokeWidth="2" strokeLinecap="round" />
              <path d="M170 3 L176 8 L170 13" stroke="#715AFB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <ul className="p-io-list" style={{ position: 'static', marginTop: 4, width: 172 }}>
              {items.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </div>
        {/* ⑤ 输出（末段）：观察胶囊右侧（V6.1 用户规格：2rem 基础上再右移 1rem——
            左缘 = 胶囊右缘 270 + 48 = 318），纵向对齐胶囊行
            （title 顶 ≈ 胶囊行上沿；箭头自胶囊右缘起左探） */}
        <div className={'fp-col--c ir-reveal' + on(5)} style={{ position: 'absolute', left: 318, top: 119, alignItems: 'flex-start' }}>
          <div className="p-io-title" style={{ position: 'static' }}>输出：投诉现象和投诉意图</div>
          <svg width="199" height="16" viewBox="0 0 199 16" fill="none" style={{ display: 'block', marginTop: 2, marginLeft: -31 }}>
            <path d="M0 8 H190" stroke="#09AA71" strokeWidth="2" strokeLinecap="round" />
            <path d="M184 3 L190 8 L184 13" stroke="#09AA71" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="p-io-sub" style={{ position: 'static', marginTop: 4 }}>{CASE_OUTPUT[props.caseId === 'c2' ? 'c2' : 'c1']}</div>
        </div>
      </div>
    </div>
  )
}
