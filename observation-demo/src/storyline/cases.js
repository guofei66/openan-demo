// cases.js — 案例剧本数据（故事线事件时间轴，t 为业务秒）
// 回放墙钟 = 业务秒 × TIME_SCALE / speed；日志时间戳为展示文案，不参与计时
// V5 回放编排（用户确认口径：每段文字/详情面板弹框 ≥3 观众秒 = ≥12 业务秒，且不影响业务时间线）：
//   ① 日志时钟冻结为业务时间线定稿值（§1.7/§2.7 表，见下方 CLOCKS）——回放时长/事件时刻可
//      独立调整，工单受理时间、步骤标称分钟、日志时钟等业务数据不变；
//   ② 步骤时长与事件时刻按「每段 ≥12 业务秒」重排（面板分步/弹框驻留/卡面描述/连线消息窗口），
//      事件顺序与故事内容不变：c1 总长 410→540 业务秒、c2 195→565 业务秒（V5.17 授权面板前插、
//      V5.18 Notification 后移至抢通执行后+粤东先回，1x 回放约 135s/141s）
// V4 两工单重写（A2A-T Demo.docx）：
//   c1 工单1 CMCC-GZ-TSCLX-20260924-004403 跨地市专线中断——含 Negotiation-T 协商（粤西发起，
//      cvlan=1208）、不支持抢通（问题处置=WAIMO 调度处置·现场上站修复 144 分钟）；
//      修复验证无独立子步骤（并入投诉闭环前核查端口告警）
//   c2 工单2 CMCC-GZ-TSCLX-20260928-008503 跨地市SLA劣化——含协商（V6.4，1020 文档修订：
//   粤西 A端端口名称不含子接口标识 → Negotiation-T 补 cvlan=409）与授权（Authorization-T
//   动网操作授权——抢通方案「隧道调优」涉及动网操作；问题处置=粤西SPN 抢通执行·隧道调优
//   10 分钟；Notification-T 方案上报+执行成功）
//   两案故障侧均为粤西；外层步骤更名：投诉定界→定界定位、方案生成→问题处置
// V4 子步骤规则（方案文档 0.4）：运行时才显示（执行到才渲染），未使用槽位在回放与完成态均
//   不展示——usedMini 为每案例槽位使用集；V5 槽位紧凑：后续子步骤前移补位，不留空槽
// 协作日志仅呈现 A2A-T（Task-T / Negotiation-T / Notification-T）与检索注册中心日志
//（Authorization-T 授权类消息不进入日志区域，V2.27）

import { CASE_EVENTS, buildLogs } from './case-data';
import { panelStageBeats } from './panel-timing';

export const TIME_SCALE = 0.25; // 1x 时：案例一 540s→约135s，案例二 565s→约141s（V5.18）

// 迷你步骤描述（卡片底部白色文字；V5.6 用户规格：与文档 §1.3/§2.3 原文完全一致——
// 超宽换行至多两行、卡片高度固定不增高）
// V5.2：投诉识别子步骤不显示卡底描述（内容已由意图识别详情面板承载）；
// 定界定位描述 = DJ 四句依次轮换（见下）
// c1：跨地市业务中断（故障=粤西光纤中断） / c2：SLA 劣化（故障=粤西光路隐患）
const D1 = {
  dd: '通过掌上运维通知并指导广州公司一线运维人员进行投诉工单的故障处置。',
  bjW: '处置完毕后核查端口告警已消除，客户回访问题已经解决，投诉工单闭环，处理信息回传流程中心。',
  sj: '根据专线业务的源宿端的接入网元明确接入网元所属的SPN网络内生智能。',
  bd: null, // 动态编排：弹框呈现，无描述文字（原文档）
  rw: '提取投诉诊断请求参数，创建投诉诊断任务。',
  zg: '跨城故障协同诊断汇总结果：粤西SPN网络内生智能端口收光无光，发光正常，原因是光纤中断。',
  yx0: '端口收光无光，发光正常，原因是光纤中断。',
  yd0: '未发现故障。',
  // V6.4（用户规格）：修复验证详细描述
  fix: '处置完毕后核查主备路由信号丢失类、端口告警均已消除，核查端口管功率已恢复至正常范围。',
};
const D2 = {
  bjW: '客户回访确认问题已经解决，投诉工单闭环，处理信息回传流程中心。',
  sj: '根据专线业务的源宿端的接入网元，明确接入网元所属的SPN网络内生智能。',
  bd: null,
  rw: '提取投诉诊断请求参数，创建投诉诊断任务。',
  zg: '跨城故障协同诊断汇总结果：粤西SPN网络内生智能端口收光弱光，发光正常，原因是光纤整体损耗大。',
  xf: '周期查询业务的SLA信息，指标已经恢复正常。',
  hf: '专线业务已经完成抢通修复，经过验证业务的SLA已经恢复正常。',
  yx0: '诊断结果详情：端口收光弱光，发光正常，原因是光纤整体损耗大。',
  yx1: '将流量带宽，时延越限和丢包越限受影响的隧道列表，调优到新的路径列表中。',
  yd0: '诊断结果详情：未发现故障',
};

// 定界定位卡底描述 3 句（mini1 窗口内依次出现、逐句替换，各 12s；无详情面板）——
// V6.4（用户规格）：第 2 句统一「网络情况：主路由中断，存在信号丢失类告警。备路由中断，
// 存在端口类告警。」；V6.10（用户规格）：「备用路由情况」句删除不展示（两案一致）
const DJ1 = [
  '业务状态：核查专线业务状态正常，状态为使用中。',
  '网络情况：主路由中断，存在信号丢失类告警。备路由中断，存在端口类告警。',
  '定界结论：传输大网线路问题。',
];
const DJ2 = [
  '业务状态：核查专线业务状态正常，状态为使用中。',
  '网络情况：主路由中断，存在信号丢失类告警。备路由中断，存在端口类告警。',
  '定界结论：传输大网线路问题。',
];

// 步骤 → 房间分区（V6.3 用户规格，两案统一固定分组）：
//   受理→客服；识别/定界→监控室；根因定位→传输室；问题处置/修复验证→监控室·传输室；
//   投诉报结→监控室
// 胶囊居步骤组中心、连线/竖线/光点随对齐步骤揭示——布局见 StorylineOverlays（覆盖层重绘）

// 日志时钟（业务时间线定稿，冻结——与工单受理时间 + 步骤标称分钟对应：
// c1 = 02:18:05 + 173分钟、c2 = 10:20:08 + 39分钟；回放编排调整不再重算，见文件头 V5 ①）
// V5.18（用户规格·故事顺序变更）：① 两案 粤东/粤西 Task-T响应 时钟对调（粤东先回复）；
// ② c2 抢通方案上报时钟后移 10:38:19.579→10:47:19.579（随抢通执行完成后发送——顺带修复
// V5.13 起上报行显示位置晚于汇总行、时钟却早于汇总的倒挂）
// V6.4（1020 文档修订）：c2 新增 Negotiation-T 请求/响应 + Authorization-T 请求/响应
// 四条日志——时钟随新故事线在既有锚点间内插、其后事件顺延（既有锚点值保持不变）；
// V6.11（用户规格）：粤东 Task-T响应 等粤西协商结束后发送——日志序调整为
// 协商请求(5)→协商响应(6)→粤东响应(7)；V6.12（用户规格）：粤东响应再延至 Negotiation-T
// 面板与胶囊消失后（376..388）——其后日志时钟随故事线顺延内插
const CLOCKS = {
  c1: ['02:29:13.889', '02:29:53.889', '02:33:09.444', '02:33:31.667', '02:33:36.111', '02:34:20.556', '02:36:11.667', '02:38:07.222', '02:37:40.556', '02:39:00.556'],
  c2: ['10:31:18.526', '10:32:11.158', '10:34:49.053', '10:35:52.211', '10:36:02.737', '10:37:58.526', '10:38:51.158', '10:40:28.663', '10:41:32.127', '10:43:55.054', '10:45:06.518', '10:46:17.982', '10:50:05.417', '10:52:14.548', '10:54:41.684'],
};

const c1 = {
  id: 'c1',
  orderNo: 'CMCC-GZ-TSCLX-20260924-004403',
  customer: '广州新市医院有限公司',
  desc: '客户表示广州至深圳的专线没法使用，但不能确定是哪个地方的问题，要求师傅尽快检测处理，没承诺，请跟进，谢谢。',
  // 协商补充 cvlan=1208 后的工单卡信息（t=348 Accept 重发任务时更新）
  orderDescUpdated: 'P36169-YWHJ-棠溪村微网格业务汇聚机房1（990）-1-1-TPN1EM10F-10-ETH (cvlan=1208)',
  steps: ['投诉受理', '投诉识别', '定界定位', '根因定位', '问题处置', '修复验证', '投诉报结'],
  // V5.56（用户规格）：检索智能体属于定界定位步骤——步骤2 延至 Task-T 弹窗出现（144），
  // 步骤3（根因定位）自 144 起回放（原 120..144 检索驻留段划入定界定位；标称分钟不变）
  durations: [12, 60, 72, 276, 64, 12, 44], // 合计 540s（边界 12/72/144/420/484/496/540）
  bmin: [1, 2, 8, 10, 144, 3, 5], // 步骤标称分钟（合计173分钟，问题处置=144）
  d: D1,
  // 槽位使用集（V4：未列出的槽位运行时不渲染、完成态不点亮；WAIMO 4/专线 4/粤东 1/粤西 1）
  usedMini: { WAIMO: [0, 1, 2, 3], ZX: [0, 1, 2, 3], YD: [0], YX: [0] },
  logs: buildLogs(CASE_EVENTS.c1),
  // A2A-T 消息文案（回放时展示在连线下方，宽度不超过连线长度、超出以 …… 截断，见 ConnectionFlow）：
  // 按「连线:标签」对应（无标签键 = 该连线默认消息）；
  // V5.48（用户规格）：连线文字精简为步骤概要（4~10 字，如 诊断任务/诊断结果——
  // 不承载详细描述，详情由日志表与消息面板呈现；原长文案废止）；
  // V5.53（用户规格）：抓取工单（工单信息下发）/工单报结消息不展示——
  // 与连线胶囊标签（抓取工单/工单报结）重复，只保留胶囊标签；
  // 注册中心检索线不加消息——检索结果已随胶囊标注；协商请求/回复由协商详细面板承载
  flowMsgs: {
    'waimo-zx-task': '诊断任务',
    'zx-yx-task': '诊断任务',
    'zx-yx-task:Task-T请求': '补充诊断任务',
    'zx-yd-task': '诊断任务',
    'zx-yx-neg:Task-T响应': '诊断结果',
    'zx-yd-neg:Task-T响应': '诊断结果',
    'waimo-zx-notif:Task-T响应': '诊断结果汇总',
  },
  events: [
    { t: 0, type: 'flow', line: 'lc-waimo-fetch', on: true },
    { t: 0, type: 'node', k: 'WAIMO', st: 'running' },
    { t: 0, type: 'step', i: 0, st: 'active' },
    { t: 12, type: 'flow', line: 'lc-waimo-fetch', on: false },
    { t: 12, type: 'step', i: 0, st: 'done' }, { t: 12, type: 'step', i: 1, st: 'active' },
    // 投诉识别子步骤：无卡底描述（V5.4 用户规格——内容已由意图识别详情面板承载）
    { t: 12, type: 'mini', k: 'WAIMO', i: 0, st: 'active' },
    // 识别步骤窗口 12..72——意图识别面板 5 段渐入（输入整体→Reasoning→Action→Observation→输出，
    // 顺时针依次出现、常驻累计，各 12s），全部展示完成后才进入定界定位
    { t: 72, type: 'mini', k: 'WAIMO', i: 0, st: 'done' },
    { t: 72, type: 'step', i: 1, st: 'done' }, { t: 72, type: 'step', i: 2, st: 'active' },
    // 定界定位无详情面板——卡底描述区 4 句依次出现（逐句替换，各 12s），完成后检索注册中心
    { t: 72, type: 'mini', k: 'WAIMO', i: 1, st: 'active', desc: DJ1[0] },
    { t: 84, type: 'desc', k: 'WAIMO', desc: DJ1[1] },
    { t: 96, type: 'desc', k: 'WAIMO', desc: DJ1[2] },
    // V6.10：第 4 句（备用路由情况）已删——定界结论自 96 起常驻至 mini1 完成
    // 定界定位末段：检索注册中心命中传输投诉处理智能体（连线 120..138，检索面板驻留至 144）
    // V5.10（用户规格）：检索面板在场（120..144）时 WAIMO 卡底不显示子步骤描述；
    // V5.56（用户规格）：检索智能体属于定界定位步骤——步骤2/mini1 延至检索面板退场（144）
    // 与 Task-T 面板同拍结束；步骤3（根因定位）自 Task-T 弹窗出现开始（原 120 废止）；
    // 事件须按 t 升序（foldWorld 以 ev.t > t 提前 break）——144 块在检索窗口（120..138）之后
    { t: 120, type: 'flow', line: 'reg-waimo-search', on: true, result: '命中：传输投诉处理智能体' },
    { t: 126, type: 'log', i: 0 },
    { t: 138, type: 'flow', line: 'reg-waimo-search', on: false },
    { t: 144, type: 'mini', k: 'WAIMO', i: 1, st: 'done' },
    { t: 144, type: 'step', i: 2, st: 'done' }, { t: 144, type: 'step', i: 3, st: 'active' },
    // V5.54（用户规格）：卡片登场即进行中——专线接收 Task-T（144）即显示进行中
    //（原 node running 240 废止；144..240 由 Task-T 面板承载交互过程）
    { t: 144, type: 'appear', k: 'ZX' },
    { t: 144, type: 'node', k: 'ZX', st: 'running' },
    { t: 144, type: 'flow', line: 'waimo-zx-task', on: true },
    { t: 150, type: 'log', i: 1 },
    { t: 156, type: 'flow', line: 'waimo-zx-task', on: false },
    // Task-T 交互详情面板 144..240（8 段 × 12s）——面板消失后专线内部子步骤才开始执行：
    // V5.31（用户规格）检索前移——数据关联 240..252 → 检索智能体 252..276（先检索到粤东/粤西，
    // 再编排/诊断）→ 动态编排 276..312 → 任务诊断 312..396
    { t: 240, type: 'mini', k: 'ZX', i: 0, st: 'active', desc: D1.sj },
    { t: 252, type: 'mini', k: 'ZX', i: 0, st: 'done' },
    // 数据关联完成 → 检索注册中心命中粤东/粤西（连线 252..270，检索面板驻留至 276）；
    // 面板在场期间无激活子步骤——卡底描述自然为空（原 V5.10 面板在场遮挡描述事件废止）
    { t: 252, type: 'flow', line: 'reg-zx-search', on: true, result: '命中：粤东、粤西SPN网络内生智能' },
    { t: 258, type: 'log', i: 2 },
    { t: 270, type: 'flow', line: 'reg-zx-search', on: false },
    // 检索命中 → 粤东/粤西登场 → 动态编排 276..312（面板 3 段 × 12s）
    // V5.54（用户规格）：登场即进行中（原 node running 324 废止）
    { t: 276, type: 'appear', k: 'YD' }, { t: 276, type: 'appear', k: 'YX' },
    { t: 276, type: 'node', k: 'YD', st: 'running' }, { t: 276, type: 'node', k: 'YX', st: 'running' },
    { t: 276, type: 'mini', k: 'ZX', i: 1, st: 'active', desc: D1.bd },
    // 动态编排面板 276..312——分步完成后任务诊断开始（双侧任务下发 312..324）
    { t: 312, type: 'mini', k: 'ZX', i: 1, st: 'done' }, { t: 312, type: 'mini', k: 'ZX', i: 2, st: 'active', desc: D1.rw },
    { t: 312, type: 'flow', line: 'zx-yx-task', on: true }, { t: 312, type: 'flow', line: 'zx-yd-task', on: true },
    { t: 316, type: 'log', i: 3 },
    { t: 318, type: 'log', i: 4 },
    { t: 324, type: 'flow', line: 'zx-yx-task', on: false }, { t: 324, type: 'flow', line: 'zx-yd-task', on: false },
    { t: 324, type: 'mini', k: 'YX', i: 0, st: 'active' },
    { t: 324, type: 'mini', k: 'YD', i: 0, st: 'active', desc: D1.yd0 },
    // 粤西（故障侧，A端端口名称不唯一）发起 Negotiation-T：请求 324..336（与任务线收尾同拍），
    // 协商面板 request 324..348
    { t: 324, type: 'flow', line: 'zx-yx-neg', on: true },
    { t: 324, type: 'negotiation', st: 'request' },
    { t: 328, type: 'log', i: 5 },
    { t: 336, type: 'flow', line: 'zx-yx-neg', on: false },
    // 专线返回补充信息（cvlan=1208）后以完整参数经 task 线重发任务（Task-T请求胶囊 348..360）
    { t: 348, type: 'flow', line: 'zx-yx-task', on: true, label: 'Task-T请求' },
    { t: 348, type: 'orderInfo', on: true },
    { t: 348, type: 'negotiation', st: 'accept' },
    { t: 352, type: 'log', i: 6 },
    { t: 360, type: 'flow', line: 'zx-yx-task', on: false },
    // V5.18（用户规格）：粤东先回复根因定位结果（Task-T响应：沿协商回程线正向 粤东→专线 372..384）；
    // 协商面板结束（accept 348..372）
    { t: 372, type: 'negotiation', st: null },
    { t: 372, type: 'flow', line: 'zx-yd-neg', on: true, label: 'Task-T响应' },
    // V6.16（用户规格）：粤西根因定位结果描述等 Negotiation-T 面板消失后再展示（同 c2 口径：
    // 372 结束 + 0.8s 淡出 → 376 落点）；
    // V6.19（用户规格）：展示时长≥3s——窗口 376..382（可见约 5.5 业务秒，V6.19 起描述
    // 延迟/淡出按业务秒计不再侵蚀窗口），done 382 落点清除描述；随后粤西 Task-T响应
    //（384..396）回传
    { t: 376, type: 'desc', k: 'YX', desc: D1.yx0 },
    { t: 376, type: 'log', i: 8 },
    { t: 382, type: 'mini', k: 'YX', i: 0, st: 'done' },
    { t: 384, type: 'flow', line: 'zx-yd-neg', on: false },
    { t: 384, type: 'mini', k: 'YD', i: 0, st: 'done' }, { t: 384, type: 'node', k: 'YD', st: 'success' },
    // 粤西（故障侧）诊断结论返回（Task-T响应：沿协商回程线正向 粤西→专线 384..396，V5.18 改后回复）
    { t: 384, type: 'flow', line: 'zx-yx-neg', on: true, label: 'Task-T响应' },
    { t: 388, type: 'log', i: 7 },
    { t: 396, type: 'flow', line: 'zx-yx-neg', on: false },
    { t: 396, type: 'node', k: 'YX', st: 'success' },
    // 双侧结论齐备 → 专线根因总结（396..408）→ Task-T响应 汇总回传 WAIMO（408..420）
    { t: 396, type: 'mini', k: 'ZX', i: 2, st: 'done' }, { t: 396, type: 'mini', k: 'ZX', i: 3, st: 'active', desc: D1.zg },
    { t: 408, type: 'mini', k: 'ZX', i: 3, st: 'done' },
    { t: 408, type: 'flow', line: 'waimo-zx-notif', on: true, label: 'Task-T响应' },
    { t: 412, type: 'log', i: 9 },
    { t: 420, type: 'flow', line: 'waimo-zx-notif', on: false },
    // ④问题处置（420..484，标称144分钟）：WAIMO 调度处置（掌上运维派单·现场上站修复，无 A2A 日志）
    { t: 420, type: 'step', i: 3, st: 'done' }, { t: 420, type: 'step', i: 4, st: 'active' },
    { t: 421, type: 'mini', k: 'WAIMO', i: 2, st: 'active', desc: D1.dd },
    // V5.54（用户规格）：调度处置子步骤 loading 持续至调度处置面板消失（面板窗口 421..473，
    // dispatchWindowOf=mini2 全窗；原 mini2 done 433 废止——433..473 面板仍在场而 loading 早停）
    { t: 473, type: 'mini', k: 'WAIMO', i: 2, st: 'done' },
    // ⑤修复验证（484..496）：无独立子步骤——核查端口告警已消除（V5.54：描述归位至本步骤
    // 全窗 484..496 展示，原 472..484 提前段废止；mini2 done 清描述，事件按序在其后重设）
    { t: 484, type: 'step', i: 4, st: 'done' }, { t: 484, type: 'step', i: 5, st: 'active' },
    { t: 484, type: 'desc', k: 'WAIMO', desc: D1.fix },
    // ⑥投诉报结：WAIMO 投诉闭环 → 工单报结回传流程中心
    { t: 496, type: 'step', i: 5, st: 'done' }, { t: 496, type: 'step', i: 6, st: 'active' },
    { t: 496, type: 'desc', k: 'WAIMO' },
    { t: 497, type: 'mini', k: 'WAIMO', i: 3, st: 'active', desc: D1.bjW },
    { t: 501, type: 'flow', line: 'lc-waimo-report', on: true },
    { t: 509, type: 'mini', k: 'WAIMO', i: 3, st: 'done' },
    { t: 513, type: 'flow', line: 'lc-waimo-report', on: false },
    { t: 534, type: 'node', k: 'WAIMO', st: 'success' }, { t: 534, type: 'node', k: 'ZX', st: 'success' },
    { t: 540, type: 'step', i: 6, st: 'done' },
    { t: 540, type: 'done' },
  ],
};

const c2 = {
  id: 'c2',
  orderNo: 'CMCC-GZ-TSCLX-20260928-008503',
  customer: '广州铁路工务工程实业发展有限公司',
  desc: '客户表示专线使用感知差，网络间歇性卡顿、丢包，业务时断时续，影响业务使用，要求排查处理。',
  steps: ['投诉受理', '投诉识别', '定界定位', '根因定位', '问题处置', '修复验证', '投诉报结'],
  // V6.4（1020 文档 3.2.3 修订）：流程新增 Negotiation-T 协商（324..372——粤西 A端端口
  // 名称不含子接口标识（-ETH.409 删除）→ 粤西发起协商，工作台补 cvlan=409 后重发任务）
  // 与 Authorization-T 动网操作授权（408..432——抢通方案「隧道调优」涉及动网操作，
  // 授权过程在连线展示、标签 Authorization-T，原 Authorization-T 预授权检查面板废止）；
  // 修复验证步骤扩为 26s 容纳专线两个子步骤（修复验证 481..493 + 结果回复 493..505）
  // V5.56（用户规格）：检索智能体属于定界定位步骤——步骤2 延至 Task-T 弹窗出现（144）、
  // 步骤3 自 144 起回放（原 120..144 检索驻留段划入定界定位；标称分钟不变）
  durations: [12, 60, 72, 280, 72, 26, 65], // 合计 587s（边界 12/72/144/424/496/522/587；根因定位含协商 144..424、问题处置 424..496）
  bmin: [1, 2, 8, 10, 10, 3, 5], // 步骤标称分钟（合计39分钟，问题处置=10）
  d: D2,
  // 协商补充 cvlan=409 后的工单卡信息（t=348 Accept 重发任务时更新）
  orderDescUpdated: 'P1310-中石油（黄埔大道中路-风光路）-VIP-JK-3A-1-1-TN81EG8E-1-ETH.409 (cvlan=409)',
  // 槽位使用集（WAIMO 3——调度处置空缺，V5 紧凑后投诉闭环前移至槽2位；专线 6 全量；
  // 粤西 2（根因定位+抢通执行）；粤东 1）
  usedMini: { WAIMO: [0, 1, 3], ZX: [0, 1, 2, 3, 4, 5], YD: [0], YX: [0, 1] },
  logs: buildLogs(CASE_EVENTS.c2),
  flowMsgs: {
    'waimo-zx-task': '诊断任务',
    'zx-yd-task': '诊断任务',
    'zx-yx-task': '诊断任务',
    'zx-yx-task:Task-T请求': '补充诊断任务',
    // Authorization-T 两段（V6.5 用户规格：请求经 zx-yx-task 线——传输→粤西 正向；
    // 响应经 zx-yx-neg 回程线；标签均为 Authorization-T）
    'zx-yx-task:Authorization-T': '新增动网操作授权',
    'zx-yx-neg:Authorization-T': '动网操作授权成功',
    'zx-yx-neg:Task-T响应': '诊断结果',
    'zx-yx-neg:Notification-T·上报': '抢通方案上报',
    'zx-yx-neg:Notification-T·成功': '抢通执行成功',
    'zx-yd-neg:Task-T响应': '诊断结果',
    'waimo-zx-notif:Task-T响应': '诊断结果汇总',
    'waimo-zx-notif:Notification-T': '业务抢通完成',
  },
  events: [
    { t: 0, type: 'flow', line: 'lc-waimo-fetch', on: true },
    { t: 0, type: 'node', k: 'WAIMO', st: 'running' },
    { t: 0, type: 'step', i: 0, st: 'active' },
    { t: 12, type: 'flow', line: 'lc-waimo-fetch', on: false },
    { t: 12, type: 'step', i: 0, st: 'done' }, { t: 12, type: 'step', i: 1, st: 'active' },
    // 投诉识别子步骤：无卡底描述（V5.4 用户规格——内容已由意图识别详情面板承载）
    { t: 12, type: 'mini', k: 'WAIMO', i: 0, st: 'active' },
    // 识别步骤窗口 12..72——意图识别面板 5 段渐入（顺时针依次出现、常驻累计，各 12s），完成后进入定界定位
    { t: 72, type: 'mini', k: 'WAIMO', i: 0, st: 'done' },
    { t: 72, type: 'step', i: 1, st: 'done' }, { t: 72, type: 'step', i: 2, st: 'active' },
    // 定界定位无详情面板——卡底描述区 4 句依次出现（逐句替换，各 12s），完成后检索注册中心
    { t: 72, type: 'mini', k: 'WAIMO', i: 1, st: 'active', desc: DJ2[0] },
    { t: 84, type: 'desc', k: 'WAIMO', desc: DJ2[1] },
    { t: 96, type: 'desc', k: 'WAIMO', desc: DJ2[2] },
    // V6.10：第 4 句（备用路由情况）已删——定界结论自 96 起常驻至 mini1 完成
    // 定界定位末段：检索注册中心命中传输投诉处理智能体（连线 120..138，检索面板驻留至 144）
    // V5.10（用户规格）：检索面板在场（120..144）时 WAIMO 卡底不显示子步骤描述；
    // V5.56（用户规格）：检索智能体属于定界定位步骤——步骤2/mini1 延至检索面板退场（144）
    // 与 Task-T 面板同拍结束；步骤3（根因定位）自 Task-T 弹窗出现开始（原 120 废止）；
    // 事件须按 t 升序（foldWorld 以 ev.t > t 提前 break）——144 块在检索窗口（120..138）之后
    { t: 120, type: 'flow', line: 'reg-waimo-search', on: true, result: '命中：传输投诉处理智能体' },
    { t: 126, type: 'log', i: 0 },
    { t: 138, type: 'flow', line: 'reg-waimo-search', on: false },
    { t: 144, type: 'mini', k: 'WAIMO', i: 1, st: 'done' },
    { t: 144, type: 'step', i: 2, st: 'done' }, { t: 144, type: 'step', i: 3, st: 'active' },
    // V5.54（用户规格）：卡片登场即进行中——专线接收 Task-T（144）即显示进行中
    //（原 node running 240 废止；144..240 由 Task-T 面板承载交互过程）
    { t: 144, type: 'appear', k: 'ZX' },
    { t: 144, type: 'node', k: 'ZX', st: 'running' },
    { t: 144, type: 'flow', line: 'waimo-zx-task', on: true },
    { t: 150, type: 'log', i: 1 },
    { t: 156, type: 'flow', line: 'waimo-zx-task', on: false },
    // Task-T 面板 144..240（8 段 × 12s）——专线内部子步骤待面板消失后开始执行：
    // V5.31（用户规格）检索前移——数据关联 240..252 → 检索智能体 252..276（先检索到粤东/粤西，
    // 再编排/诊断）→ 动态编排 276..312 → 任务诊断 312..384（本例含协商，V6.4）
    { t: 240, type: 'mini', k: 'ZX', i: 0, st: 'active', desc: D2.sj },
    { t: 252, type: 'mini', k: 'ZX', i: 0, st: 'done' },
    // 数据关联完成 → 检索注册中心命中粤东/粤西（连线 252..270，检索面板驻留至 276）；
    // 面板在场期间无激活子步骤——卡底描述自然为空（原 V5.10 面板在场遮挡描述事件废止）
    { t: 252, type: 'flow', line: 'reg-zx-search', on: true, result: '命中：粤东、粤西SPN网络内生智能' },
    { t: 258, type: 'log', i: 2 },
    { t: 270, type: 'flow', line: 'reg-zx-search', on: false },
    // 检索命中 → 粤东/粤西登场 → 动态编排 276..312（面板 3 段 × 12s）
    // V5.54（用户规格）：登场即进行中（原 node running 324 废止）
    { t: 276, type: 'appear', k: 'YD' }, { t: 276, type: 'appear', k: 'YX' },
    { t: 276, type: 'node', k: 'YD', st: 'running' }, { t: 276, type: 'node', k: 'YX', st: 'running' },
    { t: 276, type: 'mini', k: 'ZX', i: 1, st: 'active', desc: D2.bd },
    // 动态编排面板 276..312——分步完成后任务诊断开始（双侧任务下发 312..324）
    { t: 312, type: 'mini', k: 'ZX', i: 1, st: 'done' }, { t: 312, type: 'mini', k: 'ZX', i: 2, st: 'active', desc: D2.rw },
    { t: 312, type: 'flow', line: 'zx-yd-task', on: true }, { t: 312, type: 'flow', line: 'zx-yx-task', on: true },
    { t: 316, type: 'log', i: 3 },
    { t: 318, type: 'log', i: 4 },
    // V6.4（1020 文档修订）：粤东（Z端端口唯一）直接执行根因定位；粤西（A端端口
    // 名称不含子接口标识）发起 Negotiation-T 协商（请求 324..336、面板 request 324..348），
    // 专线补充 cvlan=409 后以完整参数经 task 线重发任务（Task-T请求胶囊 348..360）；
    // V6.8（用户规格）：粤西 根因定位子步骤的详情描述等协商完成（重发任务到达 360）后
    // 才展示——协商期间（324..360）mini0 进行中但卡底描述为空；
    // V6.11（用户规格）：粤东的 Task-T响应 等粤西协商结束后再发送（360..372）——
    // 与协商请求/重发任务串行展示（原 324..336 与 Negotiation-T 同拍废止）
    { t: 324, type: 'flow', line: 'zx-yd-task', on: false }, { t: 324, type: 'flow', line: 'zx-yx-task', on: false },
    { t: 324, type: 'mini', k: 'YX', i: 0, st: 'active' },
    { t: 324, type: 'mini', k: 'YD', i: 0, st: 'active', desc: D2.yd0 },
    { t: 324, type: 'flow', line: 'zx-yx-neg', on: true },
    { t: 324, type: 'negotiation', st: 'request' },
    { t: 332, type: 'log', i: 5 },
    { t: 336, type: 'flow', line: 'zx-yx-neg', on: false },
    { t: 348, type: 'flow', line: 'zx-yx-task', on: true, label: 'Task-T请求' },
    { t: 348, type: 'orderInfo', on: true },
    { t: 348, type: 'negotiation', st: 'accept' },
    { t: 352, type: 'log', i: 6 },
    { t: 360, type: 'flow', line: 'zx-yx-task', on: false },
    { t: 372, type: 'negotiation', st: null },
    // V6.14（用户规格）：粤西的根因定位结果描述等 Negotiation-T 面板消失后再展示
    //（negotiation 372 结束——面板 0.8s 淡出，同 V6.12 粤东响应的 376 落点）；
    // V6.16（用户规格）：mini 的 loading 持续到描述消失——done 从 372 移至 379 落点
    // 清除描述（展示 3s），取代原显式 desc 清除事件
    { t: 376, type: 'desc', k: 'YX', desc: D2.yx0 },
    // V6.12（用户规格）：粤东的 Task-T响应 等 Negotiation-T 面板与连线胶囊消失后
    //（negotiation 372 结束——面板 0.8s 淡出、held 胶囊即时卸载）再发送（376..388），
    // 与协商完全错拍；粤西诊断结论随后回传（388..400）
    { t: 376, type: 'flow', line: 'zx-yd-neg', on: true, label: 'Task-T响应' },
    { t: 380, type: 'log', i: 7 },
    // V6.19（用户规格）：展示时长≥3s——窗口 376..382（可见约 5.5 业务秒），done 382 清除
    { t: 382, type: 'mini', k: 'YX', i: 0, st: 'done' },
    { t: 388, type: 'flow', line: 'zx-yd-neg', on: false },
    { t: 388, type: 'mini', k: 'YD', i: 0, st: 'done' }, { t: 388, type: 'node', k: 'YD', st: 'success' },
    // 粤西（故障侧）诊断结论返回（Task-T响应：光路隐患，建议调优 388..400）
    { t: 388, type: 'flow', line: 'zx-yx-neg', on: true, label: 'Task-T响应' },
    { t: 392, type: 'log', i: 8 },
    { t: 400, type: 'flow', line: 'zx-yx-neg', on: false },
    // 双侧结论齐备 → 专线根因总结（400..412）→ Task-T响应 汇总回传 WAIMO（412..424）
    { t: 400, type: 'mini', k: 'ZX', i: 2, st: 'done' }, { t: 400, type: 'mini', k: 'ZX', i: 3, st: 'active', desc: D2.zg },
    { t: 412, type: 'mini', k: 'ZX', i: 3, st: 'done' },
    { t: 412, type: 'flow', line: 'waimo-zx-notif', on: true, label: 'Task-T响应' },
    { t: 416, type: 'log', i: 9 },
    { t: 424, type: 'flow', line: 'waimo-zx-notif', on: false },
    // ④问题处置（424..496，标称10分钟）：抢通方案为「隧道调优」，涉及动网操作——先经
    // Authorization-T 完成动网操作授权（V6.4 用户规格：授权过程在连线展示、标签
    // Authorization-T；V6.5 用户规格：授权操作是传输发给粤西的——请求 424..436 走
    // zx-yx-task 线（传输→粤西 正向）、响应 436..448 走 zx-yx-neg 回程线；原
    // Authorization-T 预授权检查面板废止）；授权成功后粤西SPN 抢通执行
    //（隧道调优）448..472；抢通执行完成后 Notification-T：方案上报 472..484、执行成功 484..496
    { t: 424, type: 'step', i: 3, st: 'done' }, { t: 424, type: 'step', i: 4, st: 'active' },
    { t: 424, type: 'flow', line: 'zx-yx-task', on: true, label: 'Authorization-T' },
    { t: 428, type: 'log', i: 10 },
    { t: 436, type: 'flow', line: 'zx-yx-task', on: false },
    { t: 436, type: 'flow', line: 'zx-yx-neg', on: true, label: 'Authorization-T' },
    { t: 440, type: 'log', i: 11 },
    { t: 448, type: 'flow', line: 'zx-yx-neg', on: false },
    { t: 448, type: 'mini', k: 'YX', i: 1, st: 'active', desc: D2.yx1 },
    { t: 472, type: 'mini', k: 'YX', i: 1, st: 'done' }, { t: 472, type: 'node', k: 'YX', st: 'success' },
    { t: 472, type: 'flow', line: 'zx-yx-neg', on: true, label: 'Notification-T·上报' },
    { t: 476, type: 'log', i: 12 },
    { t: 484, type: 'flow', line: 'zx-yx-neg', on: false },
    { t: 484, type: 'flow', line: 'zx-yx-neg', on: true, label: 'Notification-T·成功' },
    { t: 488, type: 'log', i: 13 },
    { t: 496, type: 'flow', line: 'zx-yx-neg', on: false },
    // ⑤修复验证（496..522，26s）：工作台周期查询SLA 指标恢复（497..509）+
    // 专线结果回复（509..521）——两个子步骤均属修复验证步骤（用户规格）；
    // 结果回复完成即进入投诉报结（522），Notification-T 通知/面板/投诉闭环随之展开
    { t: 496, type: 'step', i: 4, st: 'done' }, { t: 496, type: 'step', i: 5, st: 'active' },
    { t: 497, type: 'mini', k: 'ZX', i: 4, st: 'active', desc: D2.xf },
    { t: 509, type: 'mini', k: 'ZX', i: 4, st: 'done' },
    { t: 509, type: 'mini', k: 'ZX', i: 5, st: 'active', desc: D2.hf },
    { t: 521, type: 'mini', k: 'ZX', i: 5, st: 'done' },
    // ⑥投诉报结（522..587）：专线结果回复 Notification-T 通知 WAIMO（522..534）→
    // Notification-T 面板（522..558，3 段 × 12s，分步完成后投诉闭环才开始）→
    // WAIMO 投诉闭环（558..570）→ 工单报结回传流程中心
    { t: 522, type: 'step', i: 5, st: 'done' }, { t: 522, type: 'step', i: 6, st: 'active' },
    { t: 522, type: 'flow', line: 'waimo-zx-notif', on: true, label: 'Notification-T' },
    { t: 526, type: 'log', i: 14 },
    { t: 534, type: 'flow', line: 'waimo-zx-notif', on: false },
    { t: 558, type: 'mini', k: 'WAIMO', i: 3, st: 'active', desc: D2.bjW },
    { t: 562, type: 'flow', line: 'lc-waimo-report', on: true },
    { t: 566, type: 'mini', k: 'WAIMO', i: 3, st: 'done' },
    { t: 574, type: 'flow', line: 'lc-waimo-report', on: false },
    { t: 575, type: 'node', k: 'WAIMO', st: 'success' }, { t: 575, type: 'node', k: 'ZX', st: 'success' },
    { t: 587, type: 'step', i: 6, st: 'done' },
    { t: 587, type: 'done' },
  ],
};

for (const c of [c1, c2]) {
  c.total = c.durations.reduce((a, b) => a + b, 0);
  c.boundaries = [];
  let acc = 0;
  for (const d of c.durations) { acc += d; c.boundaries.push(acc); }
  // V5：日志时钟冻结（CLOCKS，业务时间线定稿）——按日志序号直接赋值；
  // 原「事件时刻 → 步骤边界分段线性映射」机制随回放编排解耦而移除（业务数据不再随编排变动）
  for (const ev of c.events) {
    if (ev.type !== 'log') continue;
    c.logs[ev.i].clock = CLOCKS[c.id][ev.i];
  }
  // 单步节拍：全部事件时刻 + 面板阶段边界（V3.23：意图识别/Task-T/检索面板内部分步）
  // 去重升序；单步逐节拍推进——专线↔粤东/粤西每条消息（含连线胶囊标签）、检索、协商、响应，
  // 以及数据关联/动态编排等内部步骤、各详情面板分步逐一呈现
  c.beats = [...new Set(c.events.map((e) => e.t).concat(panelStageBeats(c)).concat(c.total))].sort((a, b) => a - b);
}

export const CASES = { c1, c2 };
export const AGENTS = ['WAIMO', 'ZX', 'YD', 'YX'];

export function initialWorld(c) {
  const mini = {};
  for (const k of AGENTS) mini[k] = [];
  // 迷你步骤槽位数按卡片定义（WAIMO 4 / 专线 6 / 粤东 3 / 粤西 3）；
  // 未使用槽位（c.usedMini 未列出）状态恒为 todo → 不渲染（完成态由 usedMini 裁剪）
  const counts = { WAIMO: 4, ZX: 6, YD: 3, YX: 3 };
  for (const k of AGENTS) for (let i = 0; i < counts[k]; i++) mini[k].push('todo');
  return {
    steps: c.steps.map(() => 'todo'),
    nodes: { WAIMO: 'idle', ZX: 'idle', YD: 'idle', YX: 'idle' },
    visible: { WAIMO: true, ZX: false, YD: false, YX: false },
    mini,
    desc: { WAIMO: null, ZX: null, YD: null, YX: null },
    flows: {},
    seenLines: {},
    orderInfo: false,
    negotiation: null,
    logs: [],
    caseDone: false,
  };
}

export function foldWorld(c, t) {
  const w = initialWorld(c);
  for (const ev of c.events) {
    if (ev.t > t) break;
    switch (ev.type) {
      case 'step': w.steps[ev.i] = ev.st; break;
      case 'node': w.nodes[ev.k] = ev.st; break;
      case 'mini':
        w.mini[ev.k][ev.i] = ev.st;
        w.desc[ev.k] = ev.st === 'active' ? (ev.desc || null) : null;
        break;
      case 'appear': w.visible[ev.k] = true; break;
      case 'flow':
        // 激活连线：rev=响应方向（逆向激光）；label=胶囊文案覆盖（如 Task-T请求）；result=检索结果标注（检索标签后）；
        // msg=A2A-T 消息文案（连线下方展示，事件显式 msg > 案例按「连线:标签」映射 flowMsgs）
        w.flows[ev.line] = ev.on ? {
          rev: !!ev.rev,
          label: ev.label || null,
          result: ev.result || null,
          msg: ev.msg || (c.flowMsgs ? c.flowMsgs[ev.line + (ev.label ? ':' + ev.label : '')] : null) || null,
        } : null;
        if (ev.on) w.seenLines[ev.line] = true;
        break;
      // 工单信息更新（c1：Accept 补充 vlan 后工单卡信息切换，见 c1.orderDescUpdated）
      case 'orderInfo': w.orderInfo = ev.on !== false; break;
      // Negotiation-T 协商窗口（request=仅第一条消息 / accept=追加第二条消息，null=结束）
      case 'negotiation': w.negotiation = ev.st || null; break;
      case 'desc':
        // 无迷你步骤切换的执行中描述（如注册中心检索/修复验证核查），desc 置空即结束
        w.desc[ev.k] = ev.desc || null;
        break;
      case 'log': w.logs.push(c.logs[ev.i]); break;
      case 'done': w.caseDone = true; break;
      default: break;
    }
  }
  return w;
}

export function worldSig(w) {
  return [
    w.steps.join(''),
    Object.values(w.nodes).join(''),
    Object.keys(w.visible).map((k) => w.visible[k] ? 1 : 0).join(''),
    Object.keys(w.mini).map((k) => w.mini[k].join('')).join(';'),
    Object.keys(w.desc).map((k) => w.desc[k] || '').join(';'),
    Object.keys(w.flows).filter((k) => w.flows[k]).join(','),
    Object.keys(w.seenLines).length,
    w.logs.length,
    w.orderInfo ? 1 : 0,
    w.negotiation || '',
    w.caseDone ? 1 : 0,
  ].join('|');
}
