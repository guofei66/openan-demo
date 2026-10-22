import React, { useLayoutEffect, useRef, useState } from 'react'

/* TBubble — XX-T 详细交互流程消息气泡（源自 react-panels，V3.13 复制入本工程）
    气泡轮廓：顶边保持水平，尾巴是纵向边上的横向三角形凸起（聊天气泡样式）
    —— 与 NegotiationDialog 同型
    left：左侧边顶部尾巴（斜边在左侧，顶边向左延长）
    right：右侧边顶部尾巴（斜边在右侧，顶边向右延长） */

/* 气泡尾巴 6×12（V5.49 用户规格：横向 0.375rem=6、纵向 0.75rem=12；V5.46 曾 8×12、
    V5.43 12×12，原设计 9×14）——
    left：左上角凸起（身体左缘 x=6，斜边 (6,12)→(0,0)）；
    right：右上角凸起（身体右缘 x=W-7，尖端 (W-1,0)，斜边至 (W-7,12)） */
export function bubblePaths(width, height, tail) {
  if (tail === 'left') {
    return {
      fill: `M0 0 H${width - 4} Q${width} 0 ${width} 4 V${height - 4} Q${width} ${height} ${width - 4} ${height} H10 Q6 ${height} 6 ${height - 4} V12 Z`,
      stroke: `M0.5 0.5 H${width - 4.5} Q${width - 0.5} 0.5 ${width - 0.5} 4.5 V${height - 4.5} Q${width - 0.5} ${height - 0.5} ${width - 4.5} ${height - 0.5} H10 Q6.5 ${height - 0.5} 6.5 ${height - 4.5} V12 Z`,
      from: [0.02, 0.64],
      to: [0.98, 0.36],
    }
  }
  return {
    fill: `M4 0 H${width - 1} L${width - 7} 12 V${height - 4} Q${width - 7} ${height} ${width - 11} ${height} H4 Q0 ${height} 0 ${height - 4} V4 Q0 0 4 0 Z`,
    stroke: `M4 0.5 H${width - 1.5} L${width - 6.5} 11.5 V${height - 4.5} Q${width - 6.5} ${height - 0.5} ${width - 10.5} ${height - 0.5} H4 Q0.5 ${height - 0.5} 0.5 ${height - 4.5} V4 Q0.5 0.5 4 0.5 Z`,
    from: [0.98, 0.64],
    to: [0.02, 0.36],
  }
}

/* V5.38（用户反馈"气泡底色没有覆盖到全部气泡区域"）：clip-path: path() 坐标为固定 px，
   rem 缩放视口（k≠1）下与 rem 尺寸气泡盒错位（2560 宽实测 k=4/3 时底色仅覆盖左 3/4、
   k<1 时尾巴缺口外溢）——改 objectBoundingBox 归一化 clipPath（0..1 坐标随盒自动缩放，
   与描边 SVG 的 viewBox 缩放同效）；clip 定义入描边 SVG 的 defs（svg 根 width/height
   属性已随 remSvgAttrs 缩放，V5.32）；V5.46 尾巴 8×12 同步 */
export function bubbleClip(width, height, tail) {
  const f = (v) => +v.toFixed(5)
  if (tail === 'left') {
    return 'M0 0 H' + f((width - 4) / width) + ' Q1 0 1 ' + f(4 / height) +
      ' V' + f((height - 4) / height) + ' Q1 1 ' + f((width - 4) / width) + ' 1' +
      ' H' + f(10 / width) + ' Q' + f(6 / width) + ' 1 ' + f(6 / width) + ' ' + f((height - 4) / height) +
      ' V' + f(12 / height) + ' Z'
  }
  return 'M' + f(4 / width) + ' 0 H' + f((width - 1) / width) +
    ' L' + f((width - 7) / width) + ' ' + f(12 / height) +
    ' V' + f((height - 4) / height) + ' Q' + f((width - 7) / width) + ' 1 ' + f((width - 11) / width) + ' 1' +
    ' H' + f(4 / width) + ' Q0 1 0 ' + f((height - 4) / height) +
    ' V' + f(4 / height) + ' Q0 0 ' + f(4 / width) + ' 0 Z'
}

/* V6.13（用户规格）：布局样式同步 react-panels 源——气泡改流式内容、自动高度；
    V6.18 修复"描边比底色大/小"：rem 布局（根字号 16k，V5.30）下 offsetHeight 返回
    已乘 k 的布局像素，直接编码为 svg 高度属性（remjsx ÷16 成 rem）后浏览器再乘 16k
    ——高度被双乘 k（k>1 描边超出气泡底一圈、k<1 短一截；k=1 恒等不可见）；
    测量值须 ÷k 还原为设计 px（宽度为固定 prop 无此问题）；
    宽度沿用设计 px（视口缩放由外层变换承担）；底色 clip 保留 objectBoundingBox
    归一化（V5.38 修复；k≠1 实测无 viewBox 变换泄漏）；className 透传（分步渐入） */
// 根字号换算：布局像素 ÷ k = 设计 px（k = rootFont/16，ScreenCanvas 按视口设置）
const rootK = () => (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16
export default function TBubble({ width, tail = 'left', style, className, children }) {
  const ref = useRef(null)
  const [height, setHeight] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setHeight(Math.round((el.offsetHeight / rootK()) * 100) / 100)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const { stroke, from, to } = bubblePaths(width, height, tail)
  const gid = `tdg-${tail}-${width}x${height}`
  const cid = `tdc-${tail}-${width}x${height}`
  return (
    <div ref={ref} className={'td-bubble' + (className ? ' ' + className : '')} style={{ width, ...style }}>
      {height > 0 ? (
        <>
          <div className="td-bubble__bg" style={{ clipPath: `url(#${cid})` }} />
          <svg
            className="td-bubble__outline"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={gid} x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]}>
                <stop offset="0" stopColor="#14FFAB" stopOpacity="0.52" />
                <stop offset="1" stopColor="#979797" stopOpacity="0" />
              </linearGradient>
              <clipPath id={cid} clipPathUnits="objectBoundingBox">
                <path d={bubbleClip(width, height, tail)} />
              </clipPath>
            </defs>
            <path d={stroke} fill="none" stroke={`url(#${gid})`} strokeWidth="1" />
          </svg>
        </>
      ) : null}
      {children}
    </div>
  )
}
