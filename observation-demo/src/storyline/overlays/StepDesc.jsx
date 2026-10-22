// StepDesc.jsx — 执行中步骤描述：迷你步骤行（圆点+步骤标题）下方渐变消隐文字；
// 卡片高度由 buildPatches 以 bgId height 补丁真实增高（连续圆角边框、连线经 dGrow 贴新卡底），
// 替代早期 SVG 补齐卡底方案（会在原卡底留出多余下边沿）。
// V3.29：子步骤激活后描述延迟展示（先看 loading 旋转一小会）——新描述进入 pending 态
//（不渲染），600ms 墙钟后释放并播放入场动画；描述清除仍即时淡出；pending 期内被清除
//（超短迷你步骤/高倍速）则静默丢弃，不闪现。
import React, { useEffect, useState } from 'react';
import { CARDS, AGENTS, satCssStyle, CARD_DESC_DY, CARD_WIDE } from '../roles';

const DESC_DELAY = 600;
// V5.6（用户规格）：卡片高度固定——描述区按固定行数计，实际行数由 CSS line-clamp 截断
//（全文悬浮 title）；V5.55（用户规格）：描述区扩容——卡底板增高 10px + 内容上移 8px
//（roles CARD_LIFT/CARD_GROW），区域 34→51px、至多三行

export default function StepDesc({ world, pub }) {
  const [items, setItems] = useState([]);
  const sig = AGENTS.map((k) => k + ':' + (world.desc[k] || '')).join('|');

  useEffect(() => {
    setItems((prev) => {
      const next = [];
      let changed = false;
      for (const k of AGENTS) {
        const text = world.desc[k];
        const cur = prev.find((p) => p.k === k);
        if (text) {
          if (!cur || cur.text !== text || cur.out) { changed = true; next.push({ k, text, out: false, delay: true }); }
          else next.push(cur);
        } else if (cur && !cur.out) {
          changed = true;
          if (!cur.delay) next.push({ k, text: cur.text, out: true, delay: false });
        } else if (cur) next.push(cur);
      }
      return changed ? next : prev;
    });
    const release = setTimeout(() => setItems((prev) => prev.map((p) => (p.delay ? { ...p, delay: false } : p))), DESC_DELAY);
    const cleanup = setTimeout(() => setItems((prev) => prev.filter((p) => !p.out)), 400);
    return () => { clearTimeout(release); clearTimeout(cleanup); };
    // eslint-disable-line react-hooks/exhaustive-deps
  }, [sig]);

  if (!items.length) return null;
  return (
    <div className="st-layer st-desclayer">
      {items.filter((it) => !it.delay).map((it) => {
        const c = CARDS[it.k];
        // V5.55：top 随卡内容上移；区域高 51（三行）；
        // V5.56：三卡上移 29（描述区 218→189，贴新卡底 240）；
        // V5.57：WAIMO 卡高与专线一致（290）——描述区 +21 下移（218→239 贴新卡底）；
        // V5.64（用户规格）：描述区垂直居中于 [迷你标题行下沿, 卡底下沿]——
        //   区域顶 = (标题底+卡底)/2−25.5；偏移为加法（roles CARD_DESC_DY：
        //   WAIMO +5→223 / ZX -17.5→228.5〔V5.67 迷你行上移随算〕 / YD·YX -33→185），
        //   V5.55..V5.62 贴底规格废止；
        // V5.58（用户规格）：区域宽度自适应卡宽（三卡含加宽 32）、距左右卡片边沿 1rem
        //（left box.x+16、width 卡宽−32；原 left+13/旧宽−32 废止）
        const left = c.box.x + 16, top = c.descTop + (CARD_DESC_DY[it.k] || -8);
        const width = c.box.w + (it.k !== 'ZX' ? CARD_WIDE : 0) - 32;
        // V2.13：外层容器锚定卡集群（保比例、随卡刚体平移），内层保留入场动画（transform 不冲突）；
        // V5.62（用户规格）：描述区（子步骤下方的子步骤详情）文字**垂直居中**——容器固定
        // 区域高 51 + flex 列布局垂直居中（原文字顶端对齐：单行贴区顶、下方留空）
        const anchor = { x: c.box.x + c.box.w / 2, y: c.box.y + c.box.h / 2 };
        return (
          <div key={it.k} style={{ position: 'absolute', left, top, width, height: 51,
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            ...satCssStyle(pub, { x: left, y: top, w: width, h: 51 }, anchor) }}>
            <div className={'st-desc' + (it.out ? ' st-desc-out' : '')} title={it.text}>
              {it.text}
            </div>
          </div>
        );
      })}
    </div>
  );
}
