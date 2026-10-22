import { useEffect, useRef, useState } from 'react'
import './NegotiationDialog.css'
import cpePanelUrl from './assets/cpe-panel.svg'
import { bubblePaths, bubbleClip } from '../panels/TBubble.jsx'
import wrapLines from '../panels/textWrap.js'

const OPTIONS = [
  { id: 'cvlan99', label: 'cvlan99' },
  { id: 'cvlan100', label: 'cvlan100' },
  { id: 'cvlan101', label: 'cvlan101' },
  // V5.53（用户规格）：省略号参考 Task-T 模板——单字符 …（U+2026，点距自然分散），
  // 单元定宽 34px、字号 12px（.nd-chip--ellipsis）
  { id: 'ellipsis', label: '…', disabled: true },
  { id: 'cvlan1208', label: 'cvlan1208' },
]

/* 气泡轮廓：顶边保持水平，尾巴是纵向边上的横向三角形凸起（聊天气泡样式）；
   V5：轮廓路径改由 bubblePaths 按宽高动态生成（与 Task-T 面板 TBubble 同源），
   气泡高度随文字实际折行数自适应——始终包裹住文字，不小于文字高度 */

/* 三角光束定点（气泡内坐标）：顶点 = CPE 端口面板红色框底边中点，另两定点 =
   cvlan 选项区左右边沿（.nd-radio-group 1rem·17rem 的中线端点）；随 V5 动态布局联动 */
const BEAM_BASE_X = { leftX: 16, rightX: 288 }

/* 光束时序（与 NegotiationDialog.css ndBeam 对齐，V2.25 放慢）：入场 0.7s → 光束 0.75s 起 1.6s
   （0.48s 生长点亮 / 0.64s 保持 / 0.48s 淡出）→ 淡出起始（≈1.87s）时自动选中默认 cvlan */
const BEAM_SELECT_AT = 1900

function RadioIcon({ color = '#777777' }) {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
      <circle cx="5.5" cy="5.5" r="4.4" fill="none" stroke={color} strokeWidth="1.3" />
    </svg>
  )
}
// V5.43（用户规格）：cvlan 选项前的空心圆点移除——RadioIcon 保留定义但不再渲染（每个
// cvlan 仅展示文字胶囊，选中态由 nd-chip--selected 底色/描边承载）

function Bubble({ width, height, tail, gradientId, className, children }) {
  // V5.38：底色 clip 改 objectBoundingBox 归一化（随 rem 盒缩放，见 TBubble bubbleClip）
  const { stroke, from, to } = bubblePaths(width, height, tail)
  const clipId = `ndc-${tail}-${width}x${height}`
  return (
    <div className={`nd-bubble ${className}`} style={{ width, height }}>
      <div className="nd-bubble__bg" style={{ clipPath: `url(#${clipId})` }} />
      <svg
        className="nd-bubble__outline"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id={gradientId}
            x1={from[0]}
            y1={from[1]}
            x2={to[0]}
            y2={to[1]}
          >
            <stop offset="0" stopColor="#14FFAB" stopOpacity="0.52" />
            <stop offset="1" stopColor="#979797" stopOpacity="0" />
          </linearGradient>
          <clipPath id={clipId} clipPathUnits="objectBoundingBox">
            <path d={bubbleClip(width, height, tail)} />
          </clipPath>
        </defs>
        <path d={stroke} fill="none" stroke={`url(#${gradientId})`} strokeWidth="1" />
      </svg>
      {children}
    </div>
  )
}

export default function NegotiationDialog({ defaultSelected = 'cvlan1208', options = OPTIONS, proposeText = '接入端口名称不唯一，该端口下存在多个业务接入口，请提供具体的子接口ID或VLAN ID以确认唯一的业务。', accepted = false }) {
  const [selected, setSelected] = useState(null)
  const listRef = useRef(null)
  const vlan = (selected || defaultSelected).replace('cvlan', '')

  // V5.43（用户规格）：文字距气泡边沿 1rem（16 设计px）上下左右——文字区宽 = 气泡宽−32；
  // Propose：顶 16 + 行数×20 + 底 16；Accept：文字底至 CPE 面板间距 23（原设计节奏保留）
  const proposeLines = wrapLines('Propose：' + proposeText, 219)
  const proposeH = 16 + proposeLines * 20 + 16
  // Accept：V5.4（用户反馈：图片遮盖文字，下移图片）——文字与 CPE 面板图片间距恢复
  // 原设计节奏（2 行时 img 67 / radio 139 / 高 180）：顶 16 + 行数×20 + 间距 23；
  // 配合 .nd-bubble__text margin:0（原 <p> 默认边距使文字下移 12px，已清除）
  const acceptText = 'Accept：通过资管查询Skill获取到vlan信息，补充cvlan：' + vlan + '。'
  const acceptLines = wrapLines(acceptText, 272)
  const imgTop = 16 + acceptLines * 20 + 23
  const radioTop = imgTop + 48 + 24
  const acceptH = radioTop + 32 + 16
  const beamApex = { x: 268, y: imgTop + 23.5 }
  const beamBaseY = radioTop + 16

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [])

  // 专线返回补充信息（accepted）：第二条消息入场，滚动条平滑下滑；
  // 红色框 → cvlan 选项区三角光束落定淡出时，自动选中默认 cvlan（用户已手动选择则不覆盖）
  useEffect(() => {
    if (!accepted) {
      setSelected(null)
      return undefined
    }
    const el = listRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    const timer = setTimeout(() => setSelected((s) => s || defaultSelected), BEAM_SELECT_AT)
    return () => clearTimeout(timer)
  }, [accepted, defaultSelected])

  return (
    <div className="negotiation-dialog" role="dialog" aria-label="Negotiation-T 详细交互流程">
      <div className="nd-accent-bar" />
      <div className="nd-title">
        <span className="nd-title__name">Negotiation-T</span>
        <span className="nd-title__desc">详细交互流程</span>
      </div>

      {/* 消息列表：垂直方向真实滚动 */}
      <div className="nd-messages" ref={listRef}>
        {/* 消息 1：Propose（右侧，右侧边顶部三角形尾巴）——协商请求期间仅此一条 */}
        <Bubble
          width={251}
          height={proposeH}
          tail="right"
          gradientId="nd-grad-propose"
          className="nd-bubble--propose"
        >
          <p className="nd-bubble__text nd-bubble__text--propose">
            Propose：{proposeText}
          </p>
        </Bubble>

        {/* 消息 2：Accept（左侧，左侧边顶部三角形尾巴）——专线返回补充信息时呈现；
            V5.43：气泡宽 304（面板 336 − 两侧 1rem），文字距边沿 1rem */}
        {accepted ? (
          <Bubble
            width={304}
            height={acceptH}
            tail="left"
            gradientId="nd-grad-accept"
            className="nd-bubble--accept"
          >
            <p className="nd-bubble__text nd-bubble__text--accept">
              {acceptText}
            </p>

            <div className="nd-grid-glow" style={{ top: imgTop + 25 }} />

            {/* CPE 端口面板（设计稿导出的矢量图，266×48，尺寸由 CSS rem 类定义） */}
            <img
              className="nd-port-grid-svg"
              src={cpePanelUrl}
              style={{ top: imgTop }}
              alt="CPE 端口面板"
              draggable={false}
            />

            <div className="nd-radio-group" role="radiogroup" aria-label="cvlan 选项" style={{ top: radioTop }}>
              {options.map((opt) => {
                const isSelected = opt.id === selected
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    disabled={opt.disabled}
                    className={`nd-chip${opt.id === 'ellipsis' ? ' nd-chip--ellipsis' : ''}${isSelected ? ' nd-chip--selected' : ''}`}
                    onClick={() => !opt.disabled && setSelected(opt.id)}
                  >
                    <span className="nd-chip__label">{opt.label}</span>
                  </button>
                )
              })}
            </div>

            {/* 三角光束：红色框（顶点）→ cvlan 选项区左右边沿，落定后选中默认 cvlan */}
            <svg
              className="nd-beam"
              width={304}
              height={acceptH}
              viewBox={`0 0 304 ${acceptH}`}
              aria-hidden="true"
              style={{ transformOrigin: `${beamApex.x}px ${beamApex.y}px` }}
            >
              <defs>
                <linearGradient
                  id="nd-beam-grad"
                  x1={beamApex.x}
                  y1={beamApex.y}
                  x2={beamApex.x}
                  y2={beamBaseY}
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0" stopColor="rgb(92,172,255)" stopOpacity="0.5" />
                  <stop offset="1" stopColor="rgb(92,172,255)" stopOpacity="0.08" />
                </linearGradient>
              </defs>
              <polygon
                points={`${beamApex.x},${beamApex.y} ${BEAM_BASE_X.leftX},${beamBaseY} ${BEAM_BASE_X.rightX},${beamBaseY}`}
                fill="url(#nd-beam-grad)"
              />
            </svg>
          </Bubble>
        ) : null}
      </div>
    </div>
  )
}
