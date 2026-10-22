// LogTable.jsx — 实时日志表（覆盖层渲染）：回放态逐条追加自动滚底；快照点亮态全量日志可滚动
// 点击行展开完整 A2A-T Prompt；滚动条样式对齐设计稿（6px 圆角深灰滑块）
// 数据来自 case-data.js（case1/case2 参考数据）；斑马纹对齐设计稿表格（偶数行 rgba(119,119,119,0.15)）
import React, { useEffect, useRef, useState } from 'react';
import { LOGS, logStretchX, viewFactors } from '../roles';

const BADGE = {
  'Task-T请求': { background: 'rgba(102,140,247,0.15)', color: 'rgba(140,163,250,1)' },
  'Task-T响应': { background: 'rgba(54,193,141,0.15)', color: 'rgba(54,193,141,1)' },
  'Negotiation-T请求': { background: 'rgba(209,159,0,0.15)', color: 'rgba(209,159,0,1)' },
  'Negotiation-T响应': { background: 'rgba(209,159,0,0.15)', color: 'rgba(209,159,0,1)' },
  // Notification-T 通知（抢通结果/工单报结）：配色对齐设计稿 Notification-T 连线胶囊（青）
  'Notification-T通知': { background: 'rgba(44,184,201,0.15)', color: 'rgba(85,204,217,1)' },
  // 节点内部步骤（自环）：银灰徽章，路由仅显示节点名称，名称后附内部子流程标签
  '内部': { background: 'rgba(201,201,201,0.15)', color: 'rgba(201,201,201,1)' },
  // 注册中心检索命中：配色对齐连线检索胶囊（紫）
  '检索': { background: 'rgba(168,159,249,0.15)', color: 'rgba(168,159,249,1)' },
};

export default function LogTable({ logs, anchor, pub }) {
  const ref = useRef(null);
  const prevLen = useRef(logs.length);
  const [open, setOpen] = useState(-1);

  // 挂载锚定：回放态贴底（最新可见），快照点亮态贴顶（与设计稿首屏一致）
  useEffect(() => {
    if (ref.current && anchor === 'bottom') ref.current.scrollTop = ref.current.scrollHeight;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 新增日志 → 滚到底
  useEffect(() => {
    if (ref.current && logs.length > prevLen.current) ref.current.scrollTop = ref.current.scrollHeight;
    prevLen.current = logs.length;
  }, [logs.length]);

  const b = LOGS.bodyBox;
  // V6.1：面板可拖拽调高（FlowLogPanel）——表体在面板根内（面板本地系）：
  // top 62 = 设计 944−882；高度 = logH − 头区 62 − 底距 16（默认 198 → 120 = bodyBox.h）；
  // left/width 随左栏收起拉伸（logStretchX，面板本地 = 画布 −305）
  const { sx, sy } = viewFactors(pub);
  const logH = pub.logH || 198;
  const left = logStretchX(pub, b.x) - logStretchX(pub, 305);
  const width = (logStretchX(pub, b.x + b.w + 14) - logStretchX(pub, b.x)) * sx;
  const top = 62;
  const height = (logH - 62 - 16) * sy;
  const counter = sx !== 1 || sy !== 1 ? 'scale(' + 1 / sx + ', ' + 1 / sy + ')' : undefined;
  return (
    <div ref={ref} className="st-logtable" style={{
      left, top, width, height,
      transform: counter, transformOrigin: '0 0',
      transition: 'left 0.25s ease, width 0.25s ease',
    }}>
      {logs.map((l, i) => {
        const internal = l.from === l.to; // 内部步骤：路由仅显示节点名称（无 → 接收方）
        return (
          <div key={i} className={'st-lrow' + (open === i ? ' st-lrow-open' : '')}
            onClick={() => setOpen(open === i ? -1 : i)}>
            <div className="st-lmain">
              <span className={'st-lchev' + (open === i ? ' st-lchev-open' : '')}>
                {/* V6.2（用户规格）：行首 › 改 SVG 箭头（10px 描边尖角，参考把手箭头样式）；
                    展开 .st-lchev-open 旋转 90°（向下）；flex 行内与徽章/文字垂直居中对齐 */}
                <svg width="0.625rem" height="0.625rem" viewBox="0 0 10 10" aria-hidden="true">
                  <path d="M3 1.5 L7.5 5 L3 8.5" fill="none" stroke="rgba(223,223,223,1)"
                    strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="st-lbadge" style={BADGE[l.badge] || BADGE['Task-T请求']}>{l.badge}</span>
              <span className="st-ltime">{l.clock}</span>
              <span className="st-lroute">
                {internal
                  ? <>{l.from}{l.step ? <em className="st-ltag">{l.step}</em> : null}</>
                  : <>{l.from}<i> → </i>{l.to}</>}
              </span>
              <span className="st-lsum">{l.summary}</span>
            </div>
            {open === i ? <div className="st-lprompt">{l.prompt}</div> : null}
          </div>
        );
      })}
    </div>
  );
}
