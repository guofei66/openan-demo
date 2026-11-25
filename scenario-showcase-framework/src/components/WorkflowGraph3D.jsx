// Copyright (c) 2026 Huawei Technologies Co., Ltd.
// All Rights Reserved.
//
// SPDX-License-Identifier: Apache-2.0

/** 3D view of the PSOP workflow (default graph view): a left-to-right layered
 *  DAG rendered with 3d-force-graph inside a dedicated dark "space" viewport.
 *
 *  Visual language (tech-conference style, works without postprocessing):
 *   ·nodes = bright self-lit core + wireframe icosahedron shell + additive
 *     radial-glow halo (sprite) —active nodes pulse and carry a tilted
 *     rotating orbit ring, done nodes keep a steady agent-colored glow,
 *     pending nodes stay dim gray
 *   ·edges = gently curved arcs (alternating curvature) with directional
 *     arrowheads; the active edge streams bright particles, done edges
 *     trickle emerald sparks
 *   ·ambience = two-layer starfield, exponential fog for depth, slow
 *     auto-rotation until the user grabs the scene, smooth zoom-to-fit
 *
 *  Falls back to the 2D swimlane when WebGL is unavailable. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import ForceGraph3D from '3d-force-graph';
import SpriteText from 'three-spritetext';
import { agentColor } from '../colors.js';
import WorkflowGraph from './WorkflowGraph.jsx';

/* Tailwind color keys —hex used by the 3D scene (matches colors.js) */
const HEX = {
    blue: '#3b82f6',
    indigo: '#6366f1',
    emerald: '#10b981',
    amber: '#f59e0b',
    violet: '#8b5cf6',
    rose: '#f43f5e',
    sky: '#0ea5e9',
    teal: '#14b8a6',
};
const hexOf = (key) => HEX[key] || '#71717a';
const SPACE_BG = '#060609';

/* Cached radial-glow textures per color (additive sprites). */
const glowCache = new Map();
function glowTexture(hex) {
    if (glowCache.has(hex)) return glowCache.get(hex);
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.18, `${hex}dd`);
    g.addColorStop(0.45, `${hex}55`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    glowCache.set(hex, tex);
    return tex;
}

class Graph3DErrorBoundary extends React.Component {
    constructor(props) { super(props); this.state = { failed: false }; }
    static getDerivedStateFromError() { return { failed: true }; }
    render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/* Layered layout (3D echo of the 2D swimlane):
 *   X = step order (left→right zigzag)
 *   Y = agent lane band (one horizontal layer per agent, first agent on top)
 *   Z = per-lane depth tier, so the stack reads as layers in perspective
 * Deterministic fixed coordinates (fx/fy/fz) — no force jitter. */
const LANE_GAP = 118;
const LANE_TIER = 72;
const STEP_SPACING = 58;
const laneY = (i, count) => ((count - 1) / 2 - i) * LANE_GAP;
const laneZ = (i, count) => (i - (count - 1) / 2) * LANE_TIER;

/** Build one node: bright core + wireframe shell + additive glow (+ orbit
 *  ring on active). Registers animatable parts into `reg` for the RAF loop. */
function nodeObject(node, pick, reg) {
    const group = new THREE.Group();
    const agentHex = hexOf(node.agentColor);
    const st = node.status;
    const active = st === 'active';
    const done = st === 'done';
    const dim = !active && !done;

    const entry = { active, phase: Math.random() * Math.PI * 2 };

    // self-lit core (MeshBasicMaterial reads "emissive" without lights)
    const core = new THREE.Mesh(
        new THREE.IcosahedronGeometry(active ? 7 : 6, 1),
        new THREE.MeshBasicMaterial({
            color: node.end ? '#a1a1aa' : (active ? '#ffffff' : done ? agentHex : '#52525b'),
        })
    );
    group.add(core);
    entry.core = core;

    // wireframe tech shell
    const shell = new THREE.Mesh(
        new THREE.IcosahedronGeometry(node.end ? 9 : (active ? 13 : 10.8), 1),
        new THREE.MeshBasicMaterial({
            color: node.end ? '#71717a' : agentHex,
            wireframe: true,
            transparent: true,
            opacity: dim ? 0.16 : (active ? 0.5 : 0.32),
        })
    );
    group.add(shell);
    entry.shell = shell;

    // additive radial glow
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(node.end ? '#a1a1aa' : agentHex),
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        opacity: node.end ? 0.12 : (active ? 0.95 : done ? 0.55 : 0.14),
    }));
    const base = node.end ? 15 : (active ? 52 : done ? 33 : 17);
    glow.scale.set(base, base, 1);
    group.add(glow);
    entry.glow = glow;
    entry.base = base;

    // tilted orbit ring on the active node
    if (active && !node.end) {
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(17, 0.5, 8, 64),
            new THREE.MeshBasicMaterial({ color: '#e0f2fe', transparent: true, opacity: 0.8 })
        );
        ring.rotation.x = Math.PI / 2.6;
        group.add(ring);
        entry.ring = ring;
        const ring2 = new THREE.Mesh(
            new THREE.TorusGeometry(21.5, 0.28, 8, 64),
            new THREE.MeshBasicMaterial({ color: agentHex, transparent: true, opacity: 0.45 })
        );
        ring2.rotation.x = Math.PI / 2.1;
        group.add(ring2);
        entry.ring2 = ring2;
    }

    // label
    const label = new SpriteText(node.end ? 'END' : (pick(node.short) || pick(node.name)));
    label.color = node.end ? '#a1a1aa' : (dim ? '#71717a' : '#fafafa');
    label.textHeight = 11;
    label.fontWeight = '700';
    label.position.set(0, -22, 0);
    label.backgroundColor = 'rgba(9,9,11,0.55)';
    label.padding = 2;
    label.borderRadius = 3;
    group.add(label);

    if (reg) reg.set(node.id, entry);
    return group;
}

/* Starfield layers for the space ambience. */
function makeStars(count, rMin, rMax, size, color, opacity) {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const r = rMin + Math.random() * (rMax - rMin);
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.55;
        pos[i * 3 + 2] = r * Math.cos(phi);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({
        color, size, sizeAttenuation: true, transparent: true,
        opacity, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
}

const WorkflowGraph3D = ({ tr, pick, steps, agents, stepStatus }) => {
    const containerRef = useRef(null);
    const fgRef = useRef(null);
    const regRef = useRef(new Map());
    const laneGroupRef = useRef(null);
    const rafRef = useRef(0);
    const pickRef = useRef(pick);
    const [failed, setFailed] = useState(false);
    pickRef.current = pick;

    /* Graph data: steps + an END cap, sequential links. Memoized so the
     * graph mounts once; live statuses are patched onto these objects. */
    const graphData = useMemo(() => {
        const colorById = Object.fromEntries(agents.map((a) => [a.id, a.color]));
        const nodes = steps.map((s) => ({
            id: s.id, name: s.name, short: s.short, agent: s.agent,
            agentColor: colorById[s.agent] || 'blue',
            status: stepStatus[s.id] || 'pending',
        }));
        if (steps.length) {
            const last = steps[steps.length - 1];
            nodes.push({
                id: '__end__', end: true, agent: last.agent,
                agentColor: colorById[last.agent] || 'blue',
                status: 'pending',
            });
        }
        const links = nodes.slice(0, -1).map((n, i) => ({
            source: n.id, target: nodes[i + 1].id, index: i,
            status: stepStatus[steps[i + 1]?.id] || 'pending',
        }));
        // assembly fan-out links (CRM 与其他智能体的流程串联): a step with
        // `next: [agentId…]` additionally hands off to the FIRST step of each
        // listed agent (skipping the agent already covered by the chain edge).
        for (let i = 0; i < steps.length; i++) {
            for (const ag of (steps[i].next || [])) {
                const j = steps.findIndex((t) => t.agent === ag);
                if (j > i + 1) {
                    links.push({
                        source: steps[i].id, target: steps[j].id,
                        index: links.length, fanout: true,
                        status: stepStatus[steps[j].id] || 'pending',
                    });
                }
            }
        }
        // per-agent flat tiling (echo of the byAgent execution-flow lanes):
        // each agent's lane packs ITS OWN steps left→right in workflow order;
        // chain/fanout links then arc across lanes and stay fully legible.
        const laneIdx = Object.fromEntries(agents.map((a, i) => [a.id, i]));
        const byLane = {};
        nodes.forEach((n) => {
            if (!n.end) (byLane[n.agent] = byLane[n.agent] || []).push(n);
        });
        Object.entries(byLane).forEach(([agentId, arr]) => {
            const li = laneIdx[agentId] ?? 0;
            arr.forEach((n, k) => {
                n.fx = (k - (arr.length - 1) / 2) * STEP_SPACING;
                n.fy = laneY(li, agents.length);
                n.fz = laneZ(li, agents.length);
            });
        });
        // END caps the LAST agent's lane, one slot past its final task
        const endNode = nodes.find((n) => n.end);
        if (endNode) {
            const lastAg = agents[agents.length - 1]?.id;
            const li = laneIdx[lastAg] ?? 0;
            const len = (byLane[lastAg] || []).length;
            endNode.fx = (len - (len - 1) / 2) * STEP_SPACING;
            endNode.fy = laneY(li, agents.length);
            endNode.fz = laneZ(li, agents.length);
        }
        return { nodes, links, byLane };
    }, [steps, agents]); // eslint-disable-line react-hooks/exhaustive-deps

    /* Push the CURRENT graph data + statuses into the mounted instance.
     * steps/agents arrive ASYNC after the first render —the lib must be
     * re-fed whenever the memo changes (identity check keeps step-status
     * updates cheap: statuses are patched in place, no layout reset). */
    const syncData = React.useCallback(() => {
        const fg = fgRef.current;
        if (!fg) return;
        if (fg.graphData() !== graphData) {
            fg.graphData(graphData);
            // rebuild the agent lane bands — sized per lane to hug that
            // agent's own flat task run (byAgent-style tiling)
            try {
                const scene = fg.scene();
                if (laneGroupRef.current) scene.remove(laneGroupRef.current);
                const lg = new THREE.Group();
                const byLane = graphData.byLane || {};
                agents.forEach((a, i) => {
                    const arr = byLane[a.id] || [];
                    const len = Math.max(arr.length, 1);
                    const midX = ((len - 1) / 2) * STEP_SPACING;
                    const rx = len * STEP_SPACING * 0.58 + 26;  // lane band span (task run)
                    const rz = 58;                              // lane band depth
                    const y = laneY(i, agents.length);
                    const z = laneZ(i, agents.length);
                    // elliptical layer base: tinted disc + bright rim
                    const disc = new THREE.Mesh(
                        new THREE.CircleGeometry(1, 72),
                        new THREE.MeshBasicMaterial({
                            color: hexOf(a.color), transparent: true, opacity: 0.16,
                            side: THREE.DoubleSide, depthWrite: false,
                        })
                    );
                    disc.rotation.x = -Math.PI / 2;
                    disc.scale.set(rx, rz, 1);
                    disc.position.set(midX, y - 9, z);
                    lg.add(disc);
                    const rim = new THREE.LineLoop(
                        new THREE.BufferGeometry().setFromPoints(
                            new THREE.EllipseCurve(0, 0, rx, rz, 0, Math.PI * 2).getPoints(96)
                        ),
                        new THREE.LineBasicMaterial({
                            color: hexOf(a.color), transparent: true, opacity: 0.5,
                        })
                    );
                    rim.rotation.x = -Math.PI / 2;
                    rim.position.copy(disc.position);
                    lg.add(rim);
                    const tag = new SpriteText(pickRef.current(a.name));
                    tag.color = hexOf(a.color);
                    tag.textHeight = 10;
                    tag.fontWeight = '700';
                    tag.position.set(midX - rx - 26, y, z);
                    lg.add(tag);
                });
                scene.add(lg);
                laneGroupRef.current = lg;
            } catch (e) { /* ignore */ }
            // frame the new layout once it settles —do NOT rely on
            // onEngineStop: the frequent status refreshes below re-heat the
            // d3 engine, so a plain engine-stop may never fire mid-replay.
            setTimeout(() => {
                try { fgRef.current?.zoomToFit(900, 1.15); } catch (e) { /* ignore */ }
            }, 600);
        }
        for (const n of graphData.nodes) n.status = n.end ? 'pending' : (stepStatus[n.id] || 'pending');
        for (const l of graphData.links) l.status = stepStatus[l.target?.id || l.target] || 'pending';
        regRef.current.clear();
        fg.refresh();
    }, [graphData, stepStatus]);
    const syncRef = useRef(null);
    syncRef.current = syncData;

    /* Reactive data updates (steps arriving, replay status changes). */
    useEffect(() => { syncData(); }, [syncData]);

    /* Mount the 3D scene once. */
    useEffect(() => {
        let disposed = false;
        let ro = null;
        const el = containerRef.current;
        if (!el) return undefined;
        let fg;
        try {
            fg = ForceGraph3D()(el)
                .backgroundColor('rgba(0,0,0,0)')
                .nodeRelSize(4.5)
                .nodeLabel((n) => `${n.end ? 'END' : pickRef.current(n.name)} ·${n.agent || ''}`)
                .nodeThreeObject((n) => nodeObject(n, pickRef.current, regRef.current))
                .linkCurvature((l) => (l.fanout ? 0.35 : ((l.index % 2) * 2 - 1) * 0.16))                .linkColor((l) => (l.status === 'done' ? '#34d399' : l.status === 'active' ? '#38bdf8' : '#27272a'))
                .linkWidth((l) => (l.status === 'active' ? 2.4 : l.fanout ? 1.2 : l.status === 'done' ? 1.1 : 0.5))
                .linkOpacity(0.9)
                .linkDirectionalParticles((l) => (l.status === 'active' ? 6 : l.status === 'done' ? 2 : 0))
                .linkDirectionalParticleWidth((l) => (l.status === 'active' ? 5 : 2.8))
                .linkDirectionalParticleColor((l) => (l.status === 'active' ? '#bae6fd' : '#6ee7b7'))
                .linkDirectionalParticleSpeed(0.014)
                .linkDirectionalArrowLength((l) => (l.status === 'active' ? 4.6 : l.status === 'done' ? 3 : 0))
                .linkDirectionalArrowRelPos(0.85)
                .linkDirectionalArrowColor((l) => (l.status === 'active' ? '#7dd3fc' : '#34d399'))
                .onEngineStop(() => {
                    // NOTE: zoomToFit(ms, factor) —factor is a zoom MULTIPLIER
                    // (1 = exactly fit), NOT padding. 1.15 leaves a margin.
                    try { fgRef.current?.zoomToFit(900, 1.15); } catch (e) { /* ignore */ }
                });
            fg.d3Force('charge')?.strength(-260);

            // ambience: fog + starfield (added once to the scene)
            const scene = fg.scene();
            scene.fog = new THREE.FogExp2(new THREE.Color(SPACE_BG), 0.0011);
            scene.add(makeStars(650, 380, 760, 1.7, '#cbd5e1', 0.55));
            scene.add(makeStars(110, 320, 700, 3.2, '#60a5fa', 0.7));

            // cinematic entry angle, then auto-rotate until grabbed
            try {
                fg.cameraPosition({ x: -320, y: 150, z: 560 });
                const controls = fg.controls();
                controls.autoRotate = true;
                controls.autoRotateSpeed = 0.5;
                controls.addEventListener('start', () => { controls.autoRotate = false; });
            } catch (e) { /* ignore */ }
            fgRef.current = fg;
            // feed the CURRENT data (steps may already be here on remount)
            try { syncRef.current?.(); } catch (e) { /* ignore */ }

            // animation loop: pulsing glows, spinning shells/rings
            const t0 = performance.now();
            const tick = () => {
                if (disposed) return;
                const t = (performance.now() - t0) / 1000;
                for (const e of regRef.current.values()) {
                    if (e.shell) { e.shell.rotation.y = t * 0.35; e.shell.rotation.x = t * 0.12; }
                    if (e.active) {
                        if (e.core) { e.core.rotation.y = t * 1.4; }
                        if (e.glow) {
                            const s = e.base * (1 + Math.sin(t * 2.6 + e.phase) * 0.14);
                            e.glow.scale.set(s, s, 1);
                        }
                        if (e.ring) { e.ring.rotation.z = t * 0.9; }
                        if (e.ring2) { e.ring2.rotation.z = -t * 0.6; }
                    }
                }
                rafRef.current = requestAnimationFrame(tick);
            };
            rafRef.current = requestAnimationFrame(tick);

            ro = new ResizeObserver(() => {
                if (disposed || !el.isConnected) return;
                try {
                    fg.width(el.clientWidth);
                    fg.height(el.clientHeight);
                } catch (e) { /* ignore */ }
            });
            ro.observe(el);

            return () => {
                disposed = true;
                cancelAnimationFrame(rafRef.current);
                if (ro) ro.disconnect();
                try { fg._destructor?.(); } catch (e) { /* ignore */ }
                el.innerHTML = '';
                fgRef.current = null;
                regRef.current.clear();
                laneGroupRef.current = null;
            };
        } catch (e) {
            setFailed(true);
            return undefined;
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    if (failed) {
        return <WorkflowGraph pick={pick} steps={steps} agents={agents} stepStatus={stepStatus} />;
    }

    return (
        <div className="relative h-full w-full rounded-xl overflow-hidden border border-white/10"
             style={{ background: `radial-gradient(120% 100% at 50% 0%, #0d0d14 0%, ${SPACE_BG} 55%, #000 100%)` }}>
            <div ref={containerRef} className="absolute inset-0" />
            {/* agent legend */}
            <div className="absolute left-2.5 top-2.5 z-10 flex flex-col gap-1 pointer-events-none">
                {agents.map((a) => (
                    <div key={a.id} className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-black/45 backdrop-blur-sm border border-white/10">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ background: hexOf(a.color), boxShadow: `0 0 6px ${hexOf(a.color)}` }} />
                        <span className="text-[11px] font-bold text-zinc-200 leading-none">{pick(a.name)}</span>
                    </div>
                ))}
            </div>
            {/* interaction hint */}
            <div className="absolute right-2.5 bottom-2.5 z-10 pointer-events-none px-2 py-0.5 rounded-md bg-black/45 backdrop-blur-sm border border-white/10 text-[11px] text-zinc-400">
                {tr('ss.flow3d.hint', '拖拽旋转 · 滚轮缩放', 'Drag to rotate · Wheel to zoom')}
            </div>
        </div>
    );
};

export default function WorkflowGraph3DSafe(props) {
    return (
        <Graph3DErrorBoundary
            fallback={<WorkflowGraph pick={props.pick} steps={props.steps} agents={props.agents} stepStatus={props.stepStatus} />}
        >
            <WorkflowGraph3D {...props} />
        </Graph3DErrorBoundary>
    );
}
