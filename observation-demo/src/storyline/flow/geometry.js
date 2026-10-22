// geometry.js — V6.3 卡片几何单源（流式布局）
// 卡片宽度 = 内容最宽行 + 左右 1rem（+左右边框 1px×2）——初始化按内部元素计算、
// 回放过程固定（不随子步骤逐个登场变化；传输卡两案子步骤数不同 → 按案计算：
// c1 四步 290 / c2 六步 410）。内容行 = 标题（700/0.875rem）/ 技能胶囊行
//（文字 0.75rem + 图标 12 + gap 4 + padding 16）/ 编排中心（92）/ 子步骤行视觉宽
//（点距 62 = 点 14 + 连线 48，标题以点中心对称外溢——含选中态 padding 8 + 边框 2）；
// 卡片在旧设计盒内居中（视觉中心 = 盒中心——连线端点/集群锚不漂移）。
// 纵向（V6.3 用户规格）：区域 = 步骤区域容器下边沿(230)..日志面板上边沿(882)、中心 556
// ——WAIMO/传输/流程中心垂直居中、粤东/粤西上下对称（外隙 24，y 见 roles.js CARD_Y_V62）。
import { CARDS } from '../roles';
import { CASES } from '../cases';

// 卡静态内容（设计树提取：图标/标题/技能胶囊/编排中心/迷你标题——文案为运行时定稿值）
// V6.5（用户规格）：技能标签间距统一 0.5rem（粤东/粤西原 2.5rem 废止——pillGap 移除）
export const CARD_META = {
  WAIMO: {
    icon: '/icons/ic_ict_autopilot_robot.svg', title: 'WAIMO投诉处理智能体',
    pills: [['ic_public_scans_person_skill', '意图驱动'], ['ic_ict_a_double_solid_line_skill', '多维特征定界'], ['ic_ict_intelligent_agent_skill', '多智能体协同定位']],
  },
  ZX: {
    icon: '/icons/ic_ict_smart_robot.svg', title: '传输投诉处理智能体',
    center: { icon: '/icons/ic_ict_choreography_configuration.svg', text: '编排中心' },
    pills: [['ic_public_calendar_list_skill', '任务规划'], ['ic_ict_replace_skill', '并行调度'], ['vs_filled_skill', '综合研判']],
  },
  YD: {
    icon: '/icons/ic_ict_robots1.svg', title: '粤东SPN网络内生智能',
    pills: [['ic_car_gps_4_skill', '故障定位'], ['ic_ict_closed_loop_skill', '业务抢通']],
  },
  YX: {
    icon: '/icons/ic_ict_robots1.svg', title: '粤西SPN网络内生智能',
    pills: [['ic_car_gps_4_skill', '故障定位'], ['ic_ict_closed_loop_skill', '业务抢通']],
  },
};
// V6.5（用户规格）：子步骤名按案——c1 粤东/粤西=根因定位；c2 粤东=根因定位、
// 粤西=根因定位+执行抢通（槽位 1，c2 usedMini [0,1]；两案共用槽位 0=根因定位，
// 未用槽位保留占位标题不渲染）
export const MINI_TITLES = {
  WAIMO: ['投诉识别', '定界定位', '调度处置', '投诉闭环'],
  ZX: ['数据关联', '动态编排', '任务诊断', '根因总结', '修复验证', '结果回复'],
  YD: ['根因定位', '方案生成', '抢通执行'],
  YX: ['根因定位', '执行抢通', '结果回复'],
};
// V6.2 定高（px = rem×16）：WAIMO 15.25rem(244) / 传输 17.25rem(276) / 粤东·粤西 14.75rem(236)
export const CARD_H_V62 = { WAIMO: 244, ZX: 276, YD: 236, YX: 236 };
// V6.5（用户规格）：粤东/粤西卡宽固定 14.25rem（228）——不按内容计算
export const CARD_W_FIXED = { YD: 228, YX: 228 };

export const FONT = "'HarmonyOS Sans SC','HarmonyOS Sans','HarmonyHeiTi','Microsoft YaHei','PingFang SC',sans-serif";
let _ctx = null;
// 文字量宽（canvas measureText——与渲染同字体栈回退，度量一致）
export function measureText(text, font) {
  if (!_ctx) _ctx = document.createElement('canvas').getContext('2d');
  _ctx.font = font;
  return Math.ceil(_ctx.measureText(text).width);
}

// 子步骤点距 = 点 14 + 连线 48（连线距左右图标 0.5rem 见 NodeCard conn rect）
const MINI_PITCH = 62;
const _wCache = {};
// 卡片宽度（按案记忆化）：粤东/粤西固定 14.25rem；其余 = 内容最宽行 + 1rem×2 + 边框 1×2
export function cardW(k, caseId) {
  if (CARD_W_FIXED[k] != null) return CARD_W_FIXED[k];
  const key = k + ':' + caseId;
  if (_wCache[key] != null) return _wCache[key];
  const m = CARD_META[k];
  // V6.5（用户规格）：标题 1rem/700
  const rows = [measureText(m.title, '700 16px ' + FONT)];
  const gap = 8;
  rows.push(m.pills.reduce((a, p) => a + measureText(p[1], '400 12px ' + FONT) + 32, 0) + gap * (m.pills.length - 1));
  if (m.center) rows.push(92);
  const used = (CASES[caseId] && CASES[caseId].usedMini[k]) || [];
  if (used.length) {
    // 迷你标题视觉宽：固定 3.5rem（56）；选中态 width:auto（文字 + 左右 padding 6，
    // 边框 inset box-shadow 不占宽——V6.4 选框收窄）取大者；V6.5：加粗 YaHei 度量
    const tw = Math.max(...used.map((i) => Math.max(56, measureText(MINI_TITLES[k][i], 'bold 14px "Microsoft YaHei"') + 6)));
    rows.push((used.length - 1) * MINI_PITCH + tw);
  }
  return (_wCache[key] = 34 + Math.max(...rows));
}
// 卡片视觉矩形（旧设计盒内居中；y/h 为 V6.2 定高拓扑，见 roles.js CARD_Y_V62）
export function cardRect(k, caseId) {
  const b = CARDS[k].box;
  const w = cardW(k, caseId);
  return { x: b.x + (b.w - w) / 2, y: b.y, w, h: CARD_H_V62[k] };
}
