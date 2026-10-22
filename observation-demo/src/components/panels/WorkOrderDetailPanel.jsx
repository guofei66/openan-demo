import React from 'react'

/* WorkOrderDetailPanel — 工单展开详情 · 下拉面板
   V6.31：自 react-panels 源复制（V4.0 · 容器 1111309）——16×20.125rem 下拉面板：
   热线受理文本 + 投诉描述 + 信息行；仅底圆角（挂接于工单卡下沿），底色
   rgba(0,103,209,0.15)；
   V6.32（用户规格）：接入工单卡「展开」——数据受控（head/desc/rows 由 OrderPanel
   按所展开工单传入：描述/归属地市/归属区县 与投诉识别面板 CASE_INPUT 同源） */

export default function WorkOrderDetailPanel({ head, desc, rows = [] }) {
  return (
    /* V6.34：高度随内容（集团名称换行后 c2 内容超高固定 20.125rem）；V6.35（用户规格）：
       高度完全自适应——padding 1rem 即下边沿距最末文字 1rem，不留固定高/最小高余量 */
    <div className="wo-panel" style={{ width: '16rem' }}>
      <div className="wo-text">{head}</div>
      <div className="wo-text wo-desc">{desc}</div>
      <div className="wo-rows">
        {rows.map((r) => (
          <div className="wo-row" key={r.label}>
            <span className="wo-label">{r.label}</span>
            <span className="wo-value">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
