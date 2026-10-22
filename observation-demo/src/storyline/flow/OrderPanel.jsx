// OrderPanel.jsx — V6.0 流式布局：工单区域工单卡（覆盖层流式组件）
// 设计工单卡子树（ORDERS.c1/c2）整组隐藏（roles.js FLOW_HIDE），本组件按同一列表槽位
//（24,170 起、卡 256×142、间距 16）重建，卡内纵向流式：工单号 → [图标+客户名+状态胶囊] →
// 描述（两行截断）→ 时间行（margin-top:auto 贴底）。选中态/角标/回放中胶囊/搜索与状态
// 过滤（orderVisible）/整卡点击切换案例（拖拽守卫）口径与 buildPatches/makeInteractions 一致。
import React, { useRef } from 'react';
import { ORDERS, orderVisible } from '../roles';
import { CASES } from '../cases';
import WorkOrderDetailPanel from '../../components/panels/WorkOrderDetailPanel.jsx';
import { CASE_INPUT } from '../../components/panels/IntentRecognitionPanel.jsx';
import './flow.css';

// 受理时间行（设计烤入文案：日期｜用时N分钟）
const TIMES = {
  c1: '09-24 02:18:05｜用时173分钟',
  c2: '09-28 10:20:08｜用时39分钟',
};
// 卡图标（V5.44：两卡同款医院图标）
const ICONS = { c1: '/icons/ic_ebg_hospital.svg', c2: '/icons/ic_ebg_hospital.svg' };

// V6.32（用户规格）：工单展开详情数据——工单描述/归属地市/归属区县与投诉识别面板
// 同源（IntentRecognitionPanel CASE_INPUT：投诉现象文案 + 客户所在地「广州市X区…」解析）；
// 集团名称 = 工单客户；受理电话 30122036172 / c1 集团编号 2002596335 为 V4.0 设计值；
// V6.42（用户规格）：集团编号仅医院工单（c1，第二张卡）保留设计值，其余一律「无」
const orderDetailData = (k) => {
  const [phen, loc] = CASE_INPUT[k === 'c1' ? 'c1' : 'c2'];
  const location = loc.replace('客户所在地：', '');
  return {
    head: '【热线客服受理-智能】受理电话号码：30122036172',
    desc: phen.replace('投诉现象：', ''),
    rows: [
      { label: '归属地市', value: location.slice(0, 3) },
      { label: '归属区县', value: (location.match(/市(.+?区)/) || [])[1] || '' },
      { label: '集团编号', value: k === 'c1' ? '2002596335' : '无' },
      { label: '集团名称', value: CASES[k].customer },
      { label: '故障地点', value: '未知' },
    ],
  };
};

function OrderCard({ k, pub, bc }) {
  const d = useRef({ x: 0, y: 0 });
  const c = CASES[k];
  const selected = pub.caseId === k;
  const expanded = pub.orderDetail === k;
  const playing = !pub.world ? false : !pub.world.caseDone;
  const pill = selected && playing
    ? { text: '回放中', bg: 'rgba(92,172,255,0.15)', fg: 'rgba(92,172,255,1)' } // V5.32 蓝系
    : { text: '已完成', bg: 'rgba(9,170,113,0.15)', fg: 'rgba(54,193,141,1)' };
  return (
    <div className="fl-order"
      style={{
        border: '1px solid ' + bc,
        /* V6.36（用户规格）：底边两态恒显式给定（在 border 之后覆盖）——展开态卡与
            详情区以直线分隔（色=未选中边框灰）；收起态复原卡色底边（显式给定规避
            样式 diff 移除长会后底边塌陷）；展开态下角方角使侧边框与详情边框连续 */
        borderBottom: '1px solid ' + (expanded ? 'rgba(119,119,119,1)' : bc),
        ...(expanded ? { borderRadius: '0.5rem 0.5rem 0 0' } : null),
      }}
      onPointerDown={(e) => { d.current = { x: e.clientX, y: e.clientY }; }}
      onClick={(e) => {
        if (Math.abs(e.clientX - d.current.x) > 5 || Math.abs(e.clientY - d.current.y) > 5) return;
        const sel = window.getSelection ? window.getSelection() : null;
        if (sel && String(sel).length > 0) return;
        pub.api.selectCase(k);
      }}>
      {selected ? (
        <div className="fl-order__check"><img src="/icons/ic_selected.svg" alt="" draggable={false} /></div>
      ) : null}
      {/* V6.2（用户规格）：三行内容（行距 0.5rem）——工单号 / 单位名称行 / 末行
          （时间 + 展开[文字+向下角标]）；描述行删除；
          V6.32（用户规格）：hover 提示不再展示工单描述（详情已由展开面板承载） */}
      <div className="fl-order__no">{c.orderNo}</div>
      <div className="fl-order__row">
        <img src={ICONS[k]} alt="" draggable={false} />
        <span className="fl-order__cust" title={c.customer}>{c.customer}</span>
        <span className="fl-order__pill" style={{ background: pill.bg, color: pill.fg }}>{pill.text}</span>
      </div>
      <div className="fl-order__last">
        <span className="fl-order__time">{TIMES[k]}</span>
        {/* V6.32（用户规格）：点击展开/收起工单详情面板（数据随卡；stopPropagation
            不触发整卡切案）；V6.33（用户规格）：展开态按钮变「收起」、箭头转向上 */}
        <span
          className={'fl-order__expand' + (expanded ? ' fl-order__expand--open' : '')}
          onClick={(e) => { e.stopPropagation(); pub.api.setOrderDetail(expanded ? null : k); }}
        >
          {expanded ? '收起' : '展开'}
          <svg width="0.625rem" height="0.625rem" viewBox="0 0 10 10" style={{ transform: expanded ? 'rotate(-90deg)' : 'rotate(90deg)' }} aria-hidden="true">
            <path d="M3 1.5 L7.5 5 L3 8.5" fill="none" stroke="rgba(92,162,233,1)" strokeWidth="1.4"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </div>
  );
}

// 左尖角 SVG（V6.2：收起把手图标——参考日志面板把手箭头样式，10px 描边尖角；
// V6.2 用户规格：增亮提对比度 #C9C9C9）
const Chevron = () => (
  <svg width="0.625rem" height="0.625rem" viewBox="0 0 10 10" style={{ transform: 'rotate(180deg)' }} aria-hidden="true">
    <path d="M3 1.5 L7.5 5 L3 8.5" fill="none" stroke="rgba(201,201,201,1)" strokeWidth="1.4"
      strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// V6.37/40（用户规格）：静态展示工单卡×4——列于现有两卡下方，卡体不支持点击
// （无选中/切案/过滤联动）；展开支持（V6.40）——演示数据详情面板与真卡同款
// （WorkOrderDetailPanel），与真卡共用 orderDetail 单开互斥
// V6.41（用户规格）：静态工单数据定稿（用户提供——工单号/单位/受理时间/描述/
// 归属地市区县/集团编号；首枚工单号与案例一工单同号）
// V6.42（用户规格）：集团编号一律「无」（仅医院工单 c1 保留设计值 2002596335）
const STATIC_ORDERS = [
  { id: 's1', no: 'CMCC-GZ-TSCLX-20260924-004403', customer: '广东省建行', time: '09-24 02:18:05｜用时5分钟',
    desc: '（夜间服务）客户来电表示广东省建行的专线中断，地址：广州市天河区建中路55-57号。要求尽快处理。',
    city: '广州市', district: '天河区', corpNo: '无' },
  { id: 's2', no: 'CMCC-GZ-TSCLX-20260928-006402', customer: '北京乐金系统集成有限公司', time: '09-28 01:55:39｜用时5分钟',
    desc: '用户来电反映广州市黄浦区东翔路50号到黄浦区业成1路1号专线使用不到，要求我司尽快安排人员前往处理，请加急，谢谢。',
    city: '广州市', district: '黄埔区', corpNo: '无' },
  { id: 's3', no: 'CMCC-DG-TSCLX-20261004-020038', customer: '中华人民共和国黄埔海关', time: '10-04 16:32:40｜用时5分钟',
    desc: '用户反馈公司专线无法使用，要求我司尽快处理回复，谢谢。',
    city: '东莞市', district: '松山湖', corpNo: '无' },
  { id: 's4', no: 'CMCC-GZ-TSCLX-20261008-010777', customer: '中国人民解放军广东省军区战备建设局', time: '10-08 10:41:33｜用时3分钟',
    desc: '【热线客服受理-智能】客户经理来电反馈客户的数据专线故障，要求我司马上安排人员处理，联系1881885771，请跟进。',
    city: '广州市', district: '越秀区', corpNo: '无' },
];

// V6.40/41：静态卡展开详情数据（用户提供——地市随单（广州/东莞）；不与投诉识别
// 面板/案例数据同源：静态工单无右侧拓扑故事线承载）
const staticDetailData = (o) => ({
  head: '【热线客服受理-智能】受理电话号码：30122036172',
  desc: o.desc,
  rows: [
    { label: '归属地市', value: o.city },
    { label: '归属区县', value: o.district },
    { label: '集团编号', value: o.corpNo },
    { label: '集团名称', value: o.customer },
    { label: '故障地点', value: '未知' },
  ],
});

function StaticOrderCard({ o, pub, expanded }) {
  return (
    <div className="fl-order fl-order--static"
      style={{
        border: '1px solid rgba(119,119,119,1)',
        ...(expanded ? { borderRadius: '0.5rem 0.5rem 0 0' } : null),
      }}>
      <div className="fl-order__no">{o.no}</div>
      <div className="fl-order__row">
        <img src="/icons/ic_ebg_hospital.svg" alt="" draggable={false} />
        <span className="fl-order__cust" title={o.customer}>{o.customer}</span>
        <span className="fl-order__pill" style={{ background: 'rgba(9,170,113,0.15)', color: 'rgba(54,193,141,1)' }}>已完成</span>
      </div>
      <div className="fl-order__last">
        <span className="fl-order__time">{o.time}</span>
        {/* V6.40（用户规格）：展开可点击（详情随卡演示数据；单开互斥同真卡）；
            卡体仍不可点击（不选中/不切案） */}
        <span
          className={'fl-order__expand' + (expanded ? ' fl-order__expand--open' : '')}
          onClick={(e) => { e.stopPropagation(); pub.api.setOrderDetail(expanded ? null : o.id); }}
        >
          {expanded ? '收起' : '展开'}
          <svg width="0.625rem" height="0.625rem" viewBox="0 0 10 10" style={{ transform: expanded ? 'rotate(-90deg)' : 'rotate(90deg)' }} aria-hidden="true">
            <path d="M3 1.5 L7.5 5 L3 8.5" fill="none" stroke="rgba(92,162,233,1)" strokeWidth="1.4"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </div>
  );
}

export default function OrderPanel({ pub }) {
  if (pub.ordersHidden) return null;
  return (
    <>
      {/* V6.2（用户规格）：工单列表收起把手——设计 boder/箭头（23:137098/I23:137099）隐藏，
          本组件重建（12×48 @ 304,492，右圆角贴面板右缘；图标参考日志面板把手箭头样式，
          左指 = 收起方向）；点击收起（收起态由 PanelHandles 左缘把手展开） */}
      <button className="fl-ordertab" onClick={pub.api.toggleOrders}
        title="收起工单列表" aria-label="收起工单列表">
        <Chevron />
      </button>
      <div className="fl-orders" style={{ left: ORDERS.c1.box.x, top: ORDERS.c1.box.y }}>
        {/* V6.6（用户规格）：两案位置对调——第一张卡片展示 case2、第二张展示 case1
             （选中态/角标/回放中胶囊/过滤/点击切换按案例挂卡，随渲染序自动落位）；
             V6.33（用户规格）：卡「展开」后详情面板占位于卡列流内（下方卡片自动下移，
             不遮盖）；数据随所展开工单；
             V6.34/36（用户规格）：展开态边框包住详情区——边框色随选中态（蓝/灰）
             经 bc/--wo-bc 卡与面板共用；卡底边为卡/详情直线分隔线（恒灰=未选中色） */}
        {['c2', 'c1'].filter((k) => orderVisible(k, pub)).map((k) => {
          const bc = pub.caseId === k ? 'rgba(46,134,222,1)' : 'rgba(119,119,119,1)';
          return (
            <React.Fragment key={k}>
              <OrderCard k={k} pub={pub} bc={bc} />
              {pub.orderDetail === k ? (
                <div className="fl-order-detail" style={{ '--wo-bc': bc }}>
                  <WorkOrderDetailPanel {...orderDetailData(k)} />
                </div>
              ) : null}
            </React.Fragment>
          );
        })}
        {/* V6.37/40（用户规格）：静态展示工单卡×4（两卡下方，卡体不可点击；
            展开可点击——演示数据详情面板，与真卡单开互斥、随列流式下移） */}
        {STATIC_ORDERS.map((o) => (
          <React.Fragment key={o.no}>
            <StaticOrderCard o={o} pub={pub} expanded={pub.orderDetail === o.id} />
            {pub.orderDetail === o.id ? (
              <div className="fl-order-detail" style={{ '--wo-bc': 'rgba(119,119,119,1)' }}>
                <WorkOrderDetailPanel {...staticDetailData(o)} />
              </div>
            ) : null}
          </React.Fragment>
        ))}
      </div>
    </>
  );
}
