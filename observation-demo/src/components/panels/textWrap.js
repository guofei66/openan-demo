// textWrap.js — 文本折行计算（V5：气泡/卡片高度包裹文字）
// V5.32（用户反馈"Task-T 消息超出气泡"根治）：改 canvas measureText 按真实字体度量——
// 原估宽（CJK 12px/西文 6.5px）与实际渲染字体存在偏差（雅黑西文字宽 > 6.5px，latin 密集
// 文本实际折行数可超估算 → 气泡/卡片高度不足、文字溢出）；measureText 使用与渲染一致的
// 字体栈（--font-yh）在字号参数下逐字符取实际字宽，机型/字体回退无关。
// 拉丁词不拆行，贪心逐词填充换行（与浏览器默认换行行为一致）。
// 注意：width/fontSize 均为设计 px（与渲染 rem 等比，折行判定与 k 无关）。
const FONT_STACK = '"Microsoft YaHei", "HarmonyOS Sans SC", "PingFang SC", sans-serif'
let mctx = null

export default function wrapLines(text, width, fontSize = 12) {
  if (typeof document === 'undefined' || !width) return 1
  if (!mctx) mctx = document.createElement('canvas').getContext('2d')
  mctx.font = fontSize + 'px ' + FONT_STACK
  const tokens = []
  for (const ch of text) {
    const lat = /[A-Za-z0-9]/.test(ch)
    const w = mctx.measureText(ch).width
    const last = tokens[tokens.length - 1]
    if (lat && last && last.lat) last.w += w
    else tokens.push({ w, lat })
  }
  let lines = 1
  let x = 0
  for (const tk of tokens) {
    if (x > 0 && x + tk.w > width) {
      lines++
      x = tk.w
    } else {
      x += tk.w
    }
  }
  return lines
}
