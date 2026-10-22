import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import TBubble from './TBubble.jsx'
import useStageClock from './useStageClock.js'
import wrapLines from './textWrap.js'

/* TaskTPanel — Task-T 详细交互流程
   V6.13（用户规格）：布局样式同步 react-panels 源——tt-panel 流式版式：
    tdlg-head 标题行（色条 + 渐变标题 + 次级标题白字）+ td-scroll 流式滚动区
    （负边距全宽 + 18.0625rem 视口高）+ 气泡流式内容（V6.14 底 padding 1rem——距最底部文字 1rem）
   + tt-radios 模板单选行 + tt-rail 左轨时间轴 + tt-cards 卡片列；
    文字内容与动画保留——V3.22 动态分步（①首行任务描述 → ②匹配Prompt模板区 →
    ③Task模板选中（V6.19 恢复分步动效：默认未选 → ③ 段 glass 渐显）→ ④自然语言→确定性任务 → ⑤任务类型 →
    ⑥任务目标 → ⑦任务上下文 → ⑧回复气泡）；滚动区随各阶段自动下移
   （流式布局按各卡片实测内容底缘计算滚动目标）；卡片高度按文字折行数自适应
   （高 = 8 + 20 + 4 + 行数×20 + 8），时间轴圆点与各卡片垂直居中
   （spacer = h1/2−4、虚线段 = (hPrev+hNext)/2）。 */

// V4：首行任务描述/任务类型/任务上下文随案例切换（工单1 中断 / 工单2 质差——原文档 Task-T 消息口径）
const CASE_TT = {
  c1: {
    first: '发起专线投诉诊断：广州-深圳GE1508KA/P 专线中断',
    type: '集客专线业务投诉诊断',
    target: '基于用户的投诉上下文信息，对网络侧故障进行根因诊断，返回故障根因、修复建议等诊断结果信息。',
    context: '电路编号：广州-深圳GE1508KA/P；产品编号：30122038024；A端接入端口：P36169-YWHJ-棠溪村微网格业务汇聚机房1（990）-1-1-TPN1EM10F-10-ETH；Z端接入端口：24696-华泰证券万国数据-L-T-3-1-1-TPK1EX4S-4-ETH.2501-2502；故障发生时间：2026-09-24 02:18:05；故障现象：专线中断；OSS侧事件流水号：CMCC-GZ-TSCLX-20260924-004403',
  },
  c2: {
    first: '发起专线投诉诊断：广州-汕头FE2100KA/P 专线质差',
    type: '集客专线业务投诉诊断',
    target: '基于用户的投诉上下文信息，对网络侧故障进行根因诊断，返回故障根因、修复建议等诊断结果信息。',
    context: '电路编号：广州-汕头FE2100KA/P；产品编号：30122038024；A端接入端口：P1310-中石油（黄埔大道中路-风光路）-VIP-JK-3A-1-1-TN81EG8E-1-ETH.409；Z端接入端口：21722-汕头潮阳关埠加油站-1-4-TND1EF8T-1-ETH.3532；故障发生时间：2026-09-28 10:20:08；故障现象：专线质差；OSS侧事件流水号：CMCC-GZ-TSCLX-20260928-008503',
  },
}

// 卡片值文字行宽（卡 278 − 左右 padding 32）——仅作时间轴高度兜底估值
// V6.14：卡底 padding 0（react-panels 口径）——h = 8 + 20 + 4 + 行数×20
const VALUE_W = 246
const estH = (text) => 32 + wrapLines(text, VALUE_W) * 20

export default function TaskTPanel(props) {
  const stage = useStageClock(props, 8)
  const tt = CASE_TT[props.caseId === 'c2' ? 'c2' : 'c1']
  // 时间轴几何：按渲染后卡片实测（offsetTop/offsetHeight 相对气泡盒——visibility 隐藏
  // 不影响布局测量；文字折行数与 wrapLines 估值可能差 1 行，以实测为准）：
  // spacer = 卡1中心−4、虚线段 = 相邻卡中心差−8（圆点 8px 占位）；
  // V6.18：rem 布局下 offset* 为已乘 k 的布局像素，而 railH 数字入 inline style 会被
  // remjsx ÷16 转 rem 再乘 16k（双乘 k）——测量值须 ÷k 还原设计 px（同 TBubble 高度修复）
  const [railH, setRailH] = useState(() => {
    const h1 = estH(tt.type), h2 = estH(tt.target), h3 = estH(tt.context)
    return { s: h1 / 2 - 4, d1: (h1 + h2) / 2, d2: (h2 + h3) / 2 }
  })
  const scrollRef = useRef(null)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const rail = el.querySelector('.tt-rail')
    const cards = el.querySelectorAll('.td-card')
    if (!rail || cards.length < 3) return
    const k = (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16
    const cs = [...cards].map((n) => (n.offsetTop + n.offsetHeight / 2 - rail.offsetTop) / k)
    setRailH({ s: cs[0] - 4, d1: cs[1] - cs[0] - 8, d2: cs[2] - cs[1] - 8 })
  }, [tt])
  // 滚动跟随（流式布局：按各卡片实测内容底缘——⑥任务目标卡底可见 / ⑦任务上下文卡底 / ⑧滚到底）
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const cards = el.querySelectorAll('.td-card')
    if (cards.length < 3) return
    const elTop = el.getBoundingClientRect().top
    const bot = (n) => n.getBoundingClientRect().bottom - elTop + el.scrollTop
    const view = el.clientHeight
    const targets = [
      0, 0, 0, 0, 0,
      Math.max(0, bot(cards[1]) - view),
      Math.max(0, bot(cards[2]) - view),
      el.scrollHeight - view,
    ]
    el.scrollTo({ top: targets[Math.min(stage, 8) - 1] ?? 0, behavior: 'smooth' })
  }, [stage])
  const on = (k) => (stage >= k ? ' ir-on' : '')
  return (
    <div className="glass-panel tdialog tt-panel" style={{ width: '22.375rem', height: '20.625rem' }}>
      <div className="tdlg-head">
        <span className="tdlg-bar" style={{ background: '#8ca3fa' }} />
        <span
          className="tdlg-title title-text--grad"
          style={{ backgroundImage: 'linear-gradient(90deg, #d0d8fd, #2070f3)' }}
        >
          Task-T
        </span>
        {/* V6.14（用户规格）：次级标题白字（原先继承暗灰看不清） */}
        <span className="tdlg-title" style={{ marginLeft: '0.6875rem', color: '#fff' }}>
          详细交互流程
        </span>
      </div>

      <div className="td-scroll" ref={scrollRef}>
        {/* V6.14（用户规格）：气泡底 padding 1rem——距最底部文字 1rem */}
        <TBubble width={325} tail="left" style={{ padding: '0.75rem 0.8125rem 1rem 1.375rem' }}>
          {/* ① 首行任务描述（V4 按案） */}
          <div className={'tt-intro ir-reveal' + on(1)}>{tt.first}</div>
          {/* ② 匹配Prompt模板区（③模板选中高亮） */}
          <div className={'td-hline ir-reveal' + on(2)} style={{ width: '18.125rem', marginTop: '0.625rem' }} />
          <div className={'tt-text ir-reveal' + on(2)} style={{ marginTop: '0.375rem' }}>
            1、基于意图，精准匹配Prompt模板。
          </div>
          <div className={'tt-text tt-text--dim ir-reveal' + on(2)} style={{ marginTop: '0.5rem' }}>
            Task模板
          </div>
          <div className={'tt-radios ir-reveal' + on(2)} style={{ marginTop: '0.25rem' }}>
            {/* V6.19（用户规格）：模板选中动效——默认全部未选（plain），③ 段转选中
                （glass：蓝框/白字过渡 + ::after 渐变底 0.3s 渐显，见 panels.css .tt-opt）；
                V5.39 删除「节能场景」；V5.41 余下两项拉长填满（单元间无空隙）；
                省略号单字符 …（U+2026） */}
            <span
              className={'tt-opt ' + (stage >= 3 ? 'radio-option--glass' : 'radio-option--plain')}
              style={{ color: stage >= 3 ? '#fff' : undefined }}
            >
              专线投诉场景
            </span>
            <span className="tt-opt radio-option--plain">故障处理场景</span>
            <span className="tt-opt tt-opt--more radio-option--plain">…</span>
          </div>
          {/* ④ 自然语言 → 确定性任务 */}
          <div className={'td-hline ir-reveal' + on(4)} style={{ width: '18.125rem', marginTop: '0.625rem' }} />
          <div className={'tt-text ir-reveal' + on(4)} style={{ marginTop: '0.375rem' }}>
            2、自然语言 → 确定性任务
          </div>

          {/* 时间轴：空心圆点 + 虚线（圆点与各卡片垂直居中，随对应卡片渐入；
              高度按渲染后卡片实测——spacer = 卡1中心−4、虚线 = 相邻卡中心差−8） */}
          <div className="tt-steps" style={{ marginTop: '0.5rem' }}>
            <span className="tt-rail">
              <span className="tt-rail__spacer" style={{ height: railH.s }} />
              <span className={'td-dot ir-reveal' + on(5)} />
              <span className={'td-dash ir-reveal' + on(6)} style={{ height: railH.d1 }} />
              <span className={'td-dot ir-reveal' + on(6)} />
              <span className={'td-dash ir-reveal' + on(7)} style={{ height: railH.d2 }} />
              <span className={'td-dot ir-reveal' + on(7)} />
            </span>
            {/* ⑤⑥⑦ 任务卡片：任务类型 / 任务目标 / 任务上下文（高度随文字折行自适应） */}
            <div className="tt-cards">
              <div className={'td-card ir-reveal' + on(5)}>
                <div className="td-card__label">任务类型</div>
                <div className="td-card__value">{tt.type}</div>
              </div>
              <div className={'td-card ir-reveal' + on(6)}>
                <div className="td-card__label">任务目标</div>
                <div className="td-card__value">{tt.target}</div>
              </div>
              <div className={'td-card ir-reveal' + on(7)}>
                <div className="td-card__label">任务上下文</div>
                <div className="td-card__value">{tt.context}</div>
              </div>
            </div>
          </div>
        </TBubble>

        {/* ⑧ 回复消息（右侧尾对齐） */}
        <TBubble
          width={163}
          tail="right"
          className={'ir-reveal' + on(8)}
          style={{ margin: '1rem 0 0 auto', padding: '0.75rem 0 1rem 1.125rem' }}
        >
          <div className="tt-text">任务明确，马上执行！</div>
        </TBubble>
      </div>
    </div>
  )
}
