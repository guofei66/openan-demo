import { useLayoutEffect } from 'react';
import { useStory } from '../storyline/StorylineContext';

// 整页等比缩放（V5.30 rem 方案，用户规格；V2.17"rem 语义"落地）：
// k = min(vw/1920, vh/1080) → 根字号 html{font-size:16k}（1rem ≡ 16k px），
// 画布 .screen-canvas 120rem×67.5rem（呈现 1920k×1080k），画布内所有 px 值经
// remjsx 包装器（vite alias react/jsx-runtime）与 CSS rem 换算随根字号整体**重排版**——
// 任意视口/DPR 清晰（真·重排版缩放；V5.27 zoom 方案废止；.screen-scaler flex 居中，
// 不足方向留白融入 body 底色）。vscale 消费方仅此处；V2.21 用户缩放 z 仍在画布区域层
// （.fc-zoom/.st-zoomz），不受影响。useLayoutEffect 先于绘制设根字号（无 FOUC）。
export default function ScreenCanvas({ children }) {
  const pub = useStory();
  const v = pub && pub.vscale ? pub.vscale : { x: 1, y: 1 };
  const k = Math.min(v.x, v.y);
  useLayoutEffect(() => {
    document.documentElement.style.fontSize = 16 * k + 'px';
  }, [k]);
  return (
    <div className="screen-scaler">
      <div className="screen-canvas">{children}</div>
    </div>
  );
}
