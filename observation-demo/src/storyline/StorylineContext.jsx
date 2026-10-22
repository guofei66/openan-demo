// StorylineContext.jsx — 播放头状态机（play/pause/单步/倍速/停止/seek/案例切换）
// + 画布缩放（zoom）+ 日志实时模式（logLive：快照态点亮日志表，仅影响日志区域）
// + 纯 UI 补丁（uiPatches：缩放百分比/倍速标签，不进 worldSig）
// 仅在事件边界发布状态（离散），连续动效全部由 CSS/SMIL 承担
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CASES, TIME_SCALE, foldWorld, worldSig } from './cases';
import { buildPatches, buildUiPatches, ORDERS, ORDER_SLOT, CHEVRONS } from './roles';
import { taskTWindowOf } from './panel-timing';
import './storyline.css';

export const StoryContext = createContext(null);

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;
export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

// V6.1（用户规格）：A2A-T 协作日志面板可拖拽调高——高度范围 [默认 198（panelBox.h），
// 1032（顶缘 y48：遮盖整个拓扑区）]；拖拽仅改面板高度（拓扑不缩放不重排，被面板遮盖）
export const LOG_H_DEFAULT = 198;
export const LOG_H_MAX = 1032;

// 工单卡整卡点击交互（V2.7）：按 ORDERS 容器节点 id 挂接到设计 DOM（见 LayerView），
// 替代原透明覆盖按钮 —— 卡内文字可选中；拖拽超过阈值或已选中文本时不触发案例切换
// V5.53（用户规格）：进度条（步骤条）chip 点击——从该步骤起始时刻回放
//（背板 chipId + 标题/时长文字 nameId/durId + 图标 iconId 四节点同注册：
// 文字 zIndex2 浮于背板之上须单独挂接；icon 无挂接分支但注册无害兜底）
function makeInteractions(apiRef) {
  let dx = 0;
  let dy = 0;
  // 点击守卫：拖拽超阈值（拖动进度/选字）或存在选中文本时不触发
  const guard = (e) => {
    if (Math.abs(e.clientX - dx) > 5 || Math.abs(e.clientY - dy) > 5) return false;
    const sel = typeof window !== 'undefined' && window.getSelection ? window.getSelection() : null;
    if (sel && String(sel).length > 0) return false;
    return true;
  };
  const card = (id) => ({
    onPointerDown: (e) => { dx = e.clientX; dy = e.clientY; },
    onClick: (e) => { if (guard(e)) apiRef.current.selectCase(id); },
  });
  const chip = (i) => ({
    onPointerDown: (e) => { dx = e.clientX; dy = e.clientY; },
    onClick: (e) => { if (guard(e)) apiRef.current.replayStep(i); },
  });
  const m = {};
  // V5.23：工单卡整卡点击切换案例——按对调后槽位挂接（case2 在第一卡）
  for (const k of ['c1', 'c2']) m[ORDERS[ORDER_SLOT[k]].id] = card(k);
  // V5.53：进度条 chip 点击从该步骤回放（replayStep 见 api——回放按钮/工单卡状态随 mode/world 自动跟随）
  CHEVRONS.forEach((ch, i) => {
    m[ch.chipId] = chip(i);
    m[ch.nameId] = chip(i);
    m[ch.durId] = chip(i);
    m[ch.iconId] = chip(i);
  });
  // 面板收起把手（V2.12）：设计把手 boder 条 + 箭头切图（兄弟节点需单独挂接）点击收起；
  // 收起态面板卸载，由覆盖层副本把手（PanelHandles）承担展开
  m['23:137098'] = { onClick: () => apiRef.current.toggleOrders() };
  m['I23:137099;2:325077'] = { onClick: () => apiRef.current.toggleOrders() };
  m['23:137189'] = { onClick: () => apiRef.current.toggleLog() };
  m['I23:137190;2:325077'] = { onClick: () => apiRef.current.toggleLog() };
  return m;
}

function makePub(mode, caseId, t, speed, zoom, logLive, logHidden, logH, pan, ordersHidden, vscale, api, interactions, search, status, orderDetail) {
  const world = mode === 'snapshot' ? null : foldWorld(CASES[caseId], t);
  const ctx = { mode, caseId, t, speed, zoom, logLive, logHidden, ordersHidden, vscale, orderInfo: world ? !!world.orderInfo : false, search, status };
  return {
    mode, caseId, t, speed, zoom, logLive, logHidden, logH, pan, ordersHidden, vscale, world, api, interactions, search, status, orderDetail,
    patches: buildPatches(world, ctx),
    uiPatches: buildUiPatches(ctx),
  };
}

export function StorylineProvider({ children }) {
  const apiRef = useRef(null);
  const st = useRef(null);
  const raf = useRef(0);
  const lastTs = useRef(0);
  const lastSig = useRef('');
  const interactions = useMemo(() => makeInteractions(apiRef), []);

  const commit = (over) => {
    const s = Object.assign(st.current, over);
    lastSig.current = s.mode === 'snapshot' ? '' : worldSig(foldWorld(CASES[s.caseId], s.t));
    setPub(makePub(s.mode, s.caseId, s.t, s.speed, s.zoom, s.logLive, s.logHidden, s.logH, s.pan, s.ordersHidden, s.vscale, apiRef.current, interactions, s.search, s.status, s.orderDetail));
  };

  const stopLoop = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = 0; lastTs.current = 0;
  };

  const startLoop = () => {
    stopLoop();
    const tick = (ts) => {
      const s = st.current;
      if (s.mode !== 'playing') { raf.current = 0; return; }
      raf.current = requestAnimationFrame(tick);
      const prev = lastTs.current || ts;
      lastTs.current = ts;
      const c = CASES[s.caseId];
      const dt = Math.min((ts - prev) / 1000, 0.1) * s.speed / TIME_SCALE;
      const t = Math.min(s.t + dt, c.total);
      s.t = t;
      if (t >= c.total) {
        commit({ mode: 'ended', t });
        return;
      }
      const w = foldWorld(c, t);
      const sig = worldSig(w);
      if (sig !== lastSig.current) {
        lastSig.current = sig;
        const s2 = st.current;
        // V2.16 修复：播放循环发布必须携带 vscale（缺失则画布回落 1× → 页面缩小）；
        // V5.63 修复：ctx 必须携带 t——缺失则 roles 组间光点窗口 ctx.t 恒 0（tb=0）：
        // g1（监控室→传输室）在播放中永不出现、g0 窗口结束不隐藏（seek/暂停路径不受影响）
        const ctx = { mode: 'playing', caseId: s2.caseId, t, speed: s2.speed, zoom: s2.zoom, logLive: true, logHidden: s2.logHidden, logH: s2.logH, pan: s2.pan, ordersHidden: s2.ordersHidden, vscale: s2.vscale, orderInfo: !!w.orderInfo, search: s2.search, status: s2.status };
        setPub({ mode: 'playing', caseId: s2.caseId, t, speed: s2.speed, zoom: s2.zoom, logLive: true, logHidden: s2.logHidden, logH: s2.logH, pan: s2.pan, ordersHidden: s2.ordersHidden, vscale: s2.vscale, world: w, api: apiRef.current, interactions, search: s2.search, status: s2.status, orderDetail: s2.orderDetail, patches: buildPatches(w, ctx), uiPatches: buildUiPatches(ctx) });
      }
    };
    raf.current = requestAnimationFrame(tick);
  };

  const api = useMemo(() => {
    const stepZoom = (dir) => {
      const z = st.current.zoom;
      let i = ZOOM_STEPS.findIndex((s) => Math.abs(s - z) < 0.001);
      if (i === -1) i = ZOOM_STEPS.indexOf(1);
      const ni = Math.max(0, Math.min(ZOOM_STEPS.length - 1, i + dir));
      commit({ zoom: ZOOM_STEPS[ni] });
    };
    return {
      play() {
        const s = st.current;
        if (s.mode === 'playing') { stopLoop(); commit({ mode: 'paused' }); return; }
        const c = CASES[s.caseId];
        const t = s.mode === 'paused' && s.t > 0 && s.t < c.total ? s.t : 0;
        commit({ mode: 'playing', t, logLive: true });
        startLoop();
      },
      stepOnce() {
        const s = st.current;
        const c = CASES[s.caseId];
        let t;
        // 单步逐事件节拍推进（c.beats：登场/节点状态/迷你步骤/连线开关/日志等全部事件时刻），
        // 每条消息的连线激光+胶囊标签、数据关联/动态编排等内部步骤逐一可见；
        // 快照/完成后点击 → 从头（t=0：投诉受理 + 抓取工单）
        if (s.mode === 'snapshot' || s.t >= c.total) t = c.beats[0];
        else {
          t = c.beats.find((b) => b > s.t + 0.001);
          if (t === undefined) t = c.total;
        }
        stopLoop();
        commit({ mode: 'paused', t, logLive: true });
      },
      stop() {
        // 停止 → 全完成态：所有节点/步骤/迷你步骤已完成、连线静态全量呈现、日志全量
        // （原回快照态，V2.9 按用户要求改为完成态；V2.13 起页面默认加载亦为完成态）
        stopLoop();
        commit({ mode: 'ended', t: CASES[st.current.caseId].total, logLive: true });
      },
      setSpeed(v) { commit({ speed: v }); },
      selectCase(id) {
        // 点击工单卡：直接呈现该案例完成态（节点/子步骤/工单卡全部已完成，连线无激光）
        stopLoop();
        commit({ caseId: id, mode: 'ended', t: CASES[id].total, logLive: true });
      },
      seek(t) {
        const c = CASES[st.current.caseId];
        stopLoop();
        commit({ mode: 'paused', t: Math.max(0, Math.min(t, c.total)), logLive: true });
      },
      // V5.53（用户规格）：进度条 chip 点击——从该步骤起始时刻回放（seek 到步起 + 立即播放）；
      // 步起 = durations 前缀和（V5.56：c1: 0/12/72/144/420/484/496；c2: 0/12/72/144/384/469/495）；
      // 任何当前态（完成/暂停/播放中）均可触发；回放按钮（暂停图标）/工单卡「回放中」
      // 状态随 mode/world 发布自动跟随；
      // V5.54/V5.56（用户规格）：根因定位（步骤3）从专线接收 Task-T 面板开始
      //（taskTWindowOf.t0=144；V5.56 起步骤3 时间边界即 144——检索智能体已划入定界定位）
      replayStep(i) {
        const c = CASES[st.current.caseId];
        let t = 0;
        for (let k = 0; k < i && k < c.durations.length; k++) t += c.durations[k];
        if (i === 3) t = taskTWindowOf(c).t0;
        stopLoop();
        commit({ mode: 'playing', t, logLive: true });
        startLoop();
      },
      zoomIn() { stepZoom(1); },
      zoomOut() { stepZoom(-1); },
      // V6.2（用户规格）：适应画布同时复位平移（拓扑回到原位）
      zoomFit() { commit({ zoom: 1, pan: { x: 0, y: 0 } }); },
      // V6.2：拓扑图区域鼠标平移（纯 UI 状态；画布坐标系 px）
      setPan(x, y) { commit({ pan: { x: Math.round(x), y: Math.round(y) } }); },
      activateLog() { if (!st.current.logLive) commit({ logLive: true }); },
      // 面板收起/展开（V2.12；V6.1 拖拽调高后三态语义）：收起态点击 → 展开回默认位置；
      // 非默认高度点击 → 回默认位置（不收起）；默认高度点击 → 收起（收起态由
      // PanelHandles 底缘把手承担展开，同样回默认位置）
      toggleLog() {
        const s = st.current;
        if (s.logHidden) commit({ logHidden: false, logH: LOG_H_DEFAULT });
        else if (s.logH !== LOG_H_DEFAULT) commit({ logH: LOG_H_DEFAULT });
        else commit({ logHidden: true });
      },
      // V6.1：日志面板拖拽调高（纯 UI 状态，钳制 [默认, 遮盖拓扑顶]）
      setLogH(v) { commit({ logH: Math.max(LOG_H_DEFAULT, Math.min(LOG_H_MAX, Math.round(v))) }); },
      toggleOrders() { commit({ ordersHidden: !st.current.ordersHidden }); },
      // V5.13（用户规格）：左侧搜索框输入/状态筛选（纯 UI 状态）——过滤工单列表
      //（buildUiPatches orderVisible = 搜索 orderMatches ∧ 状态 statusMatches）
      setSearch(v) { commit({ search: String(v == null ? '' : v) }); },
      setStatus(v) { commit({ status: v }); },
      // V6.32（用户规格）：工单卡「展开」详情面板（纯 UI 状态 null | 'c1' | 'c2'——
      // 面板数据跟随所展开的工单，与选中案例无关；再点展开即收起）
      setOrderDetail(v) { commit({ orderDetail: v || null }); },
    };
  }, []);
  apiRef.current = api;

  const [pub, setPub] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    // V6.9（用户规格）：默认选中第一张工单卡——V6.6 位置对调后第一张卡 = case2
    //（无参默认 case2；?case=1 显式指定案例一，其余取值仍为 case2）
    const caseId = q.get('case') === '1' ? 'c1' : 'c2';
    const mode = q.get('story') === 'seek' ? 'paused' : 'ended';
    // 默认完成态（V2.13）：刷新页面直接呈现所选案例完成态
    // （节点/步骤/迷你步骤全部已完成、连线静态全量、日志全量；?story=seek/t 与 ?story=auto 保持原行为）
    // 默认回放速度 1x（V2.25：原 0.5x；倍速按钮文案按 ctx.speed !== 0.5 补丁，设计稿烤入 0.5x）
    const t = mode === 'paused' ? Math.max(0, parseFloat(q.get('t') || '0') || 0) : CASES[caseId].total;
    // 视口适配（V2.14）：整页非等比铺满（G=scale(vw/1920, vh/1080)），
    // 文字/图标等经 uiPatches 反向缩放保比例（见 roles.js totalFactors）
    const vscale = { x: window.innerWidth / 1920, y: window.innerHeight / 1080 };
    st.current = { mode, caseId, t, speed: 1, zoom: 1, logLive: true, logHidden: false, logH: LOG_H_DEFAULT, pan: { x: 0, y: 0 }, ordersHidden: false, vscale, search: '', status: '全部状态', orderDetail: null };
    return makePub(mode, caseId, t, 1, 1, true, false, LOG_H_DEFAULT, { x: 0, y: 0 }, false, vscale, api, interactions, '', '全部状态', null);
  });

  useEffect(() => {
    window.__story = api;
    const q = new URLSearchParams(window.location.search);
    const sp = parseFloat(q.get('speed'));
    if (sp) commit({ speed: sp });
    if (q.get('story') === 'auto') { commit({ mode: 'playing', t: 0, logLive: true }); startLoop(); }
    // 视口尺寸变化 → 重适配（resize 节流由浏览器事件天然稀疏，差异阈值防抖动）
    const onResize = () => {
      const v = { x: window.innerWidth / 1920, y: window.innerHeight / 1080 };
      const cur = st.current.vscale;
      if (Math.abs(cur.x - v.x) > 1e-4 || Math.abs(cur.y - v.y) > 1e-4) commit({ vscale: v });
    };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); return stopLoop(); };
    // eslint-disable-line react-hooks/exhaustive-deps
  }, []);

  return <StoryContext.Provider value={pub}>{children}</StoryContext.Provider>;
}

export function useStory() {
  return useContext(StoryContext);
}
