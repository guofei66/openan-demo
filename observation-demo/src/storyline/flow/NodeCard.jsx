// NodeCard.jsx — V6.0 流式布局：四张智能体节点卡（覆盖层流式组件）
// V6.2（用户规格）版式：垂直链 = 上边沿 1rem→图标→0.75rem→标题→0.75rem→
// 技能标签（文字 0.75rem）→[ZX 编排中心子卡 5.75×1.75rem 居间]→1.5rem→
// 子步骤行（文字 0.875rem，间距=点宽 14+连线 48=62，连线距左右图标 0.5rem）→
// 子步骤详细描述（0.75rem，迷你行下方 flex-1 垂直居中，延迟 600ms 渐入/淡出）；
// 定高：WAIMO 15.25rem / 传输 17.25rem / 粤东粤西 14.75rem。
// V6.3（用户规格）：卡片宽度初始化按内部元素计算（内容最宽行 + 左右 1rem，见
// flow/geometry.js cardW——按案记忆化）、回放过程固定（不随子步骤登场变化；传输卡
// 两案不同宽，连线端点随卡视觉边沿重算，见 ConnectionLines applyCaseGeometry）；
// 卡片居中于旧盒宽容器（视觉中心恒为 CARDS.box 中心，连线端点/集群锚点不漂移）。
// 收起重适配：容器 satCssStyle 锚自身中心（等价原 CLUSTERS rootCounterStyle）。
import React, { useEffect, useState } from 'react';
import { CARDS, AGENTS, satCssStyle } from '../roles';
import { CASES, TIME_SCALE } from '../cases';
import { CARD_META, MINI_TITLES, CARD_H_V62, cardW } from './geometry';
import './flow.css';

// 卡静态内容（图标/标题/技能胶囊/编排中心/迷你标题）与定高常量移 flow/geometry.js
//（宽度单源：cardW 按内容计算，供连线端点/详情面板共用）

const CHECK_D = 'M3.2 6.2 L5.7 8 L10 3.2';
const SPIN_BG = { cx: 7, cy: 7, r: 8, fill: 'rgba(32,112,243,0.30)' };
const SPIN_ARC = 'M12.23 1.77A7.4 7.4 0 1 1 1.77 1.77';
const GREEN = 'rgba(54,193,141,1)';

// 迷你圆点（14×14 SVG；执行中开口弧旋转 + 辉光类 .st-mc-spin 见 storyline.css）
function MiniDot({ s, num }) {
  return (
    <svg className="fl-mini__dot" viewBox="0 0 14 14" aria-hidden="true">
      {s === 'active' ? (
        <g className="st-mc-spin">
          <circle cx={SPIN_BG.cx} cy={SPIN_BG.cy} r={SPIN_BG.r} fill={SPIN_BG.fill} />
          <path d={SPIN_ARC} fill="none" stroke="#5CACFF" strokeWidth="1.5" strokeLinecap="round" />
        </g>
      ) : (
        <>
          <circle cx="7" cy="7" r="6.5"
            fill={s === 'done' ? 'rgba(9,170,113,0.15)' : 'rgba(243,243,243,0.2)'}
            stroke={s === 'done' ? GREEN : 'rgba(119,119,119,1)'} strokeWidth="1" />
          {s === 'todo'
            ? <text x="7" y="10.2" textAnchor="middle" fill="rgba(147,147,147,1)" fontSize="10" fontWeight="400"
                fontFamily="'HarmonyOS Sans SC','HarmonyOS Sans','HarmonyHeiTi','Microsoft YaHei','PingFang SC',sans-serif">{num}</text>
            : <path d={CHECK_D} fill="none" stroke={GREEN} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />}
        </>
      )}
    </svg>
  );
}

// 描述区状态机（移植 StepDesc）：新描述延迟释放、清除淡出后卸载；
// V6.19（用户规格）：播放态延迟/淡出改业务秒基准（rate = speed/timeScale——任何倍速下
// 可见窗口≈事件窗口；原 600ms 墙钟在 1x 下折 2.4 业务秒，"3s 窗口"实际可见仅 0.6s——
// 用户反馈"展示时间太短"根因）；暂停/seek 兜底墙钟 600ms/400ms。
// 返回 fadeMs 供 .fl-desc 内联 transitionDuration 与卸载计时同步
const DESC_DELAY = 600;    // 墙钟 ms——暂停/seek 兜底
const DESC_DELAY_B = 500;  // 业务 ms——播放态新描述延迟
const DESC_FADE_B = 1000;  // 业务 ms——播放态淡出
function useDescReveal(text, rate) {
  const [st, setSt] = useState({ text: null, phase: 'hidden' });
  const delayMs = rate > 0 ? DESC_DELAY_B / rate : DESC_DELAY;
  const fadeMs = rate > 0 ? DESC_FADE_B / rate : 400;
  useEffect(() => {
    if (text) {
      let t1 = 0;
      setSt((v) => (v.text === text && (v.phase === 'show' || v.phase === 'delay') ? v : { text, phase: 'delay' }));
      t1 = setTimeout(() => setSt((v) => (v.text === text && v.phase === 'delay' ? { ...v, phase: 'show' } : v)), delayMs);
      return () => clearTimeout(t1);
    }
    let t2 = 0;
    setSt((v) => (v.phase === 'hidden' ? v : { ...v, phase: 'out' }));
    t2 = setTimeout(() => setSt((v) => ({ ...v, phase: 'hidden' })), fadeMs);
    return () => clearTimeout(t2);
  }, [text, delayMs, fadeMs]);
  return { ...st, fadeMs };
}

function NodeCard({ k, world, pub }) {
  const live = !!world;
  if (live && !world.visible[k]) return null; // 未登场节点不渲染（含完成态：案例二粤西）
  const meta = CARD_META[k];
  const card = CARDS[k];
  // 外层容器 = 旧设计盒（x/y/w 不变，高度取 V6.2 定高）——内卡 cardW 定宽居中
  //（flex:none 不收缩、可越容器两侧居中溢出），视觉中心恒为旧盒中心
  //（连线端点/面板锚定坐标锚不漂移；画布层卡片 z 序高于连线，连线自卡缘下穿出无断裂观感）
  const box = { x: card.box.x, y: card.box.y, w: card.box.w, h: CARD_H_V62[k] };
  const anchor = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  // 节点状态与徽标（口径同 buildPatches：caseDone 且 idle → success）
  const st = live ? (world.caseDone && world.nodes[k] === 'idle' ? 'success' : world.nodes[k]) : 'idle';
  const running = st === 'running';
  const badge = running ? { text: '进行中', bg: 'rgba(89,144,253,1)' }
    : st === 'success' ? { text: '已完成', bg: 'rgba(13,148,88,1)' } : null;
  // 迷你步骤（live：usedMini 使用集 + 世界态；快照：设计烤入态全量呈现）
  const um = live && CASES[pub.caseId] ? CASES[pub.caseId].usedMini : null;
  const used = um && um[k] ? um[k] : card.mini.map((_, i) => i);
  // 子步骤详细描述（live：世界态 desc——执行中子步骤的说明文字；快照：粤西内嵌描述真实文案）
  const descText = live ? world.desc[k] : null;
  const desc = useDescReveal(descText, live && pub.mode === 'playing' ? (pub.speed || 1) / TIME_SCALE : 0);
  // V6.19（用户规格）：loading 等描述消失后再结束——描述淡出期（out）内且无执行中
  // 子步骤时，最近一个 done 子步骤保持 loading（对勾在描述文字完全消失后才出现；
  // 仅 out 期保持——show 期的独立描述不回退既有对勾）
  let holdIdx = -1;
  if (live && !world.caseDone && desc.phase === 'out') {
    let active = false, last = -1;
    used.forEach((i) => {
      const ms = world.mini[k][i];
      if (ms === 'active') active = true;
      if (ms === 'done' && i > last) last = i;
    });
    if (!active && last >= 0) holdIdx = last;
  }
  const minis = [];
  used.forEach((i, p) => {
    const m = card.mini[i];
    if (!m) return;
    let s = live
      ? (world.caseDone ? 'done' : world.mini[k][i])
      : (m.designState === 'active' ? 'done' : m.designState || 'todo');
    if (i === holdIdx) s = 'active';
    if (live && s === 'todo') return; // V3.24：未执行到的子步骤不渲染
    if (p > 0) {
      const prevS = live ? (world.caseDone ? 'done' : world.mini[k][used[p - 1]]) : 'done';
      // 连线 SVG crispEdges：1px div 在 DPR 1.25/1.5 分裂为两行，矢量吸附恒单行；
      // viewBox 0 0 48 14 = 间距 62（点 14+连线 48）；V6.3（用户规格）：连线距左右
      // 图标 0.5rem——rect 内缩 x8 宽 32（两端各让 8px）
      minis.push(
        <svg key={k + '-c' + p} className="fl-mini-conn" viewBox="0 0 48 14" shapeRendering="crispEdges" aria-hidden="true"
          style={{ width: '3rem', height: '0.875rem' }}>
          <rect x="8" y="7" width="32" height="1"
            fill={prevS === 'done' ? 'rgba(54,193,141,1)' : 'rgba(243,243,243,0.15)'} />
        </svg>
      );
    }
    minis.push(
      <div key={k + '-' + i} className="fl-mini">
        <MiniDot s={s} num={i + 1} />
        <div className={'fl-mini__title' + (s === 'active' ? ' fl-mini__title--active' : '') + (s === 'active' ? ' st-mini-active' : '')}>
          {MINI_TITLES[k][i]}
        </div>
      </div>
    );
  });
  // 子步骤详细描述（live：世界态 desc——执行中子步骤的说明文字；快照：粤西内嵌描述真实文案）
  const descNode = desc.phase === 'show' || desc.phase === 'out' ? (
    <div
      className={'fl-desc' + (desc.phase === 'out' ? ' fl-desc-out' : '')}
      style={{ transitionDuration: desc.fadeMs + 'ms' }}
      title={desc.text}
    >
      {desc.text}
    </div>
  ) : null;
  return (
    <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h,
      display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div className={'fl-card' + (running ? ' fl-card--running' : '')}
        style={{ height: '100%', width: cardW(k, pub.caseId), ...satCssStyle(pub, box, anchor) }}>
        {badge ? <div className="fl-badge" style={{ background: badge.bg }}>{badge.text}</div> : null}
        <img className="fl-card__icon" src={meta.icon} alt="" draggable={false} />
        <div className="fl-card__title">{meta.title}</div>
        {meta.center ? (
          <div className="fl-cc"><img src={meta.center.icon} alt="" draggable={false} />{meta.center.text}</div>
        ) : null}
        <div className="fl-pills" style={meta.pillGap ? { gap: meta.pillGap } : undefined}>
          {meta.pills.map(([ic, tx]) => (
            <div key={tx} className="fl-pill"><img src={'/icons/' + ic + '.svg'} alt="" draggable={false} />{tx}</div>
          ))}
        </div>
        {minis.length ? <div className="fl-minis">{minis}</div> : null}
        <div className="fl-desczone">{descNode}</div>
      </div>
    </div>
  );
}

// 四卡总装（快照态 world=null 沿用设计烤入状态呈现）
export default function NodeCards({ world, pub }) {
  return (
    <>
      {AGENTS.map((k) => <NodeCard key={k} k={k} world={world} pub={pub} />)}
    </>
  );
}
