import React from 'react';
import { StoryContext } from '../storyline/StorylineContext';

const SPRITE_URL = '/design/sprite-2x.png';
const CANVAS_W = 1920;
const CANVAS_H = 1080;

function Children({ node }) {
  if (!node.children) return null;
  return node.children.map((c) => <LayerView key={c.id} node={c} />);
}

export default function LayerView({ node }) {
  const pub = React.useContext(StoryContext);
  // 补丁合并（V2.13：uiPatches 的集群保比例 transform 与 buildPatches 的状态样式同节点共存 → s 深合并，
  // transition 拼接避免任一方丢失；其余键按世界补丁优先覆盖）
  let st = null;
  if (pub) {
    const a = pub.uiPatches ? pub.uiPatches.get(node.id) : null;
    const b = pub.patches.get(node.id);
    if (a && b) {
      st = { ...a, ...b };
      if (a.s && b.s) {
        st.s = { ...a.s, ...b.s };
        if (a.s.transition && b.s.transition) st.s.transition = a.s.transition + ', ' + b.s.transition;
      }
    } else st = a || b;
  }
  if (st && st.hide) return null;
  const stc = st && st.c ? st.c : undefined;
  const sts = st && st.s ? st.s : undefined;
  const stTitle = st && st.title ? st.title : undefined;
  // 节点级交互（V2.7：工单卡整卡点击，见 StorylineContext makeInteractions）；点击自子节点冒泡生效
  const inter = pub && pub.interactions ? pub.interactions[node.id] : null;
  const base = {
    position: 'absolute',
    left: node.x + 'px',
    top: node.y + 'px',
    width: node.w + 'px',
    height: node.h + 'px',
  };

  if (node.kind === 'sprite') {
    return (
      <div data-node={node.name} data-id={node.id} className={stc} title={stTitle}
        onClick={inter ? inter.onClick : undefined}
        onPointerDown={inter ? inter.onPointerDown : undefined}
        style={{
        ...base,
        backgroundImage: 'url(' + SPRITE_URL + ')',
        backgroundSize: CANVAS_W + 'px ' + CANVAS_H + 'px',
        backgroundPosition: -node.absX + 'px ' + -node.absY + 'px',
        backgroundRepeat: 'no-repeat',
        overflow: node.clip ? 'hidden' : undefined,
        ...sts,
      }}>
        <Children node={node} />
      </div>
    );
  }

  if (node.kind === 'icon') {
    // src 补丁（V2.15：业务抢通胶囊换扳手图标；与 text 补丁同模式，未打补丁时保持设计 src）
    // V5.53：icon/text 节点同样挂接交互（进度条标题/时长文字 zIndex2 浮于 chip 背板之上，
    // 点击不落背板——须在文字节点本身触发回放，见 StorylineContext makeInteractions）
    const stSrc = st && st.src ? st.src : node.src;
    return (
      <img data-node={node.name} data-id={node.id} src={stSrc} alt="" draggable={false} className={stc} title={stTitle}
        onClick={inter ? inter.onClick : undefined}
        onPointerDown={inter ? inter.onPointerDown : undefined}
        style={{ ...base, ...node.style, ...sts }} />
    );
  }

  if (node.kind === 'text') {
    const content = st && st.text !== undefined
      ? st.text
      : (node.segments
        ? node.segments.map((s, i) => (<span key={i} style={s.style}>{s.text}</span>))
        : node.text);
    return (
      <div data-node={node.name} data-id={node.id} className={stc} title={stTitle}
        onClick={inter ? inter.onClick : undefined}
        onPointerDown={inter ? inter.onPointerDown : undefined}
        style={{ ...base, ...node.style, ...sts }}>
        <span style={{ whiteSpace: 'pre' }}>
          {content}
        </span>
      </div>
    );
  }

  if (node.kind === 'group') {
    return (
      <React.Fragment>
        <Children node={node} />
      </React.Fragment>
    );
  }

  return (
    <div data-node={node.name} data-id={node.id} className={stc} title={stTitle}
      onClick={inter ? inter.onClick : undefined}
      onPointerDown={inter ? inter.onPointerDown : undefined}
      style={{ ...base, ...node.style, overflow: node.clip ? 'hidden' : undefined, ...sts }}>
      <Children node={node} />
    </div>
  );
}
