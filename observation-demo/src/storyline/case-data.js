// case-data.js — A2A-T 协作日志参考数据（与《故事线方案文档.md》§1.7/§2.7 同步维护）
// t 为历史排序源（仅保证数组顺序；回放事件时刻以 cases.js events 为准）；
// clock 为占位初始值（base+t），回放时钟由 cases.js CLOCKS 定稿值覆写
//（V5：时钟冻结为业务时间线定稿——工单1=02:18:05+173分、工单2=10:20:08+39分，
// 与回放编排解耦，见方案文档 0.2/0.6）。
// dir: request=请求 / response=响应
// V4 两工单重写：工单1（CMCC-GZ-TSCLX-20260924-004403，跨地市专线中断，含 Negotiation-T 协商、
// 不支持抢通——问题处置=WAIMO 调度处置）；工单2（CMCC-GZ-TSCLX-20260928-008503，跨地市SLA劣化，
// 无协商、仅抢通——问题处置=粤西SPN 隧道调优）。两案故障侧均为粤西（原文档标注矛盾勘误见方案文档 0.5）。
// message 为日志详情完整报文（POST 请求头 / SSE data: 原样呈现，白色等宽 pre-wrap），
// 消息体内时间/流水号已按故事线修正（工单1=2026-09-24 02:18:05；工单2=2026-09-28 10:20:08；
// 末条 Notification OSS流水号=CMCC-GZ-TSCLX-20260928-008503）
export const CASE_EVENTS = {
  c1: {
    base: '02:18:05',
    events: [
      { t: 146, type: '检索', from: 'WAIMO投诉处理智能体', to: '注册中心', summary: '检索命中：传输投诉处理智能体',
        message: '## 检索请求\nagent.skill = 专线投诉诊断\n\n## 检索结果\n1. 传输投诉处理智能体（传输工作台）\n   - 技能：任务规划 / 并行调度 / 综合研判' },
      { t: 155, type: 'Task-T', dir: 'request', from: 'WAIMO投诉处理智能体', to: '传输投诉处理智能体', summary: '进行集客专线业务投诉场景网络侧故障诊断，达成诊断目标，电路编号：广州-深圳GE1508KA/P。故障现象：专线中断。',
        message: `{
    "message": {
        "messageId": "d87876d1-b4b4-477e-a561-662dca28b387",
        "contextId": "0fd7c500-8193-40a4-beb6-bafc354f76b7",
        "role": "ROLE_USER",
        "parts": [
            {
                "text": "发起专线投诉诊断",
                "metadata": { }
            }
        ],
        "metadata": {
            "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Task-T/v1": "
## 任务类型(Task Type)
集客专线业务投诉诊断
## 任务描述(Task Description)
基于<任务对象>、<任务上下文> 进行集客专线业务投诉场景网络侧故障根因诊断, 达成<任务目标>中定义的投诉诊断目标，按照<预期输出>中定义的结构返回任务处理结果。
## 任务目标(Task Target)
基于用户的投诉上下文信息，对网络侧故障进行根因诊断，返回故障根因、修复建议等诊断结果信息。
## 任务对象(Task Object)
电路编号：广州-深圳GE1508KA/P。产品编号：30122038024。A端接入端口：P36169-YWHJ-棠溪村微网格业务汇聚机房1（990）-1-1-TPN1EM10F-10-ETH。
Z端接入端口：24696-华泰证券万国数据-L-T-3-1-1-TPK1EX4S-4-ETH.2501-2502。
## 任务上下文(Task Context)
故障发生时间：2026-09-24 02:18:05。故障现象：专线中断。投诉工单编号：CMCC-GZ-TSCLX-20260924-004403。投诉所在城市：广州。
## 预期输出(Expected Output)
要求投诉诊断任务的结果包含如下信息：1. 诊断结果；参数的取值范围包括：成功、失败；(必选)2. 诊断结果详细信息； (必选)3. 修复建议； (可选)4. 故障根因列表，每个故障根因包含故障根因名称、详细描述、修复建议、故障根因点位置等信息； (可选)",
            "templateUri": "Task-T/network-layer/complaint-diagnosis/v1"
        },
        "extensions": [
            "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Task-T/v1"
        ]
    },
    "metadata": { }
}` },
      { t: 199, type: '检索', from: '传输投诉处理智能体', to: '注册中心', summary: '检索命中：粤东SPN网络内生智能、粤西SPN网络内生智能',
        message: '## 检索请求\nagent.skill = 专线故障定位·抢通\n\n## 检索结果\n1. 粤东SPN网络内生智能（专线故障定位·抢通）\n2. 粤西SPN网络内生智能（专线故障定位·抢通）' },
      { t: 204, type: 'Task-T', dir: 'request', from: '传输投诉处理智能体', to: '粤西SPN网络内生智能', summary: '对网络侧故障进行诊断，返回故障根因和修复建议等诊断结果信息。接入端口名称：P36169-YWHJ-棠溪村微网格业务汇聚机房1（990）-1-1-TPN1EM10F-10-ETH',
        message: `POST https://OMCIP:26335/a2a/json/message:stream
Content-Type: application/json
Authorization: Bearer token
A2A-Extensions: https://projects.tmforum.org/a2aproject/telecommunication/extensions/Task-T/v1
A2A-Version: 1.0
{
  "message": {
    "messageId": "0a51dbd4-6473-4967-83f0-f6d769cf80e5",
    "role": "ROLE_USER",
    "parts": [
      {
        "text": "创建专线业务投诉诊断任务"
      }
    ],
    "metadata": {
      "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Task-T/v1": "
## 任务类型(Task Type)
传输专线业务投诉诊断

## 任务描述(Task Description)
基于<任务对象>、<任务上下文> 进行投诉场景的网络侧故障根因诊断, 达成<任务目标>中定义的投诉诊断目标，按照<预期输出>中定义的结构返回任务处理结果。

## 任务目标(Task Target)
对网络侧故障进行诊断，返回故障根因和修复建议等诊断结果信息。

## 任务对象(Task Object)
接入端口名称：P36169-YWHJ-棠溪村微网格业务汇聚机房1（990）-1-1-TPN1EM10F-10-ETH

## 任务上下文(Task Context)
投诉分类：专线中断；问题发生时间：2026-09-24T02:18:05；OSS侧事件流水号：CMCC-GZ-TSCLX-20260924-004403；投诉详情：专线中断，本智能体负责片区为粤西，片区内告警：告警区域GX-L-U2000
",
      "templateUri": "Task-T/private-line-complaint/v1"
    }
  }
}` },
      { t: 205, type: 'Task-T', dir: 'request', from: '传输投诉处理智能体', to: '粤东SPN网络内生智能', summary: '对网络侧故障进行诊断，返回故障根因和修复建议等诊断结果信息。接入端口名称：24696-华泰证券万国数据-L-T-3-1-1-TPK1EX4S-4-ETH.2501-2502',
        message: `POST https://OMCIP:26335/a2a/json/message:stream
Content-Type: application/json
Authorization: Bearer token
A2A-Extensions: https://projects.tmforum.org/a2aproject/telecommunication/extensions/Task-T/v1
A2A-Version: 1.0
{
  "message": {
    "messageId": "0a51dbd4-6473-4967-83f0-f6d769cf80e5",
    "role": "ROLE_USER",
    "parts": [
      {
        "text": "创建专线业务投诉诊断任务"
      }
    ],
    "metadata": {
      "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Task-T/v1": "
## 任务类型(Task Type)
传输专线业务投诉诊断

## 任务描述(Task Description)
基于<任务对象>、<任务上下文> 进行投诉场景的网络侧故障根因诊断, 达成<任务目标>中定义的投诉诊断目标，按照<预期输出>中定义的结构返回任务处理结果。

## 任务目标(Task Target)
对网络侧故障进行诊断，返回故障根因和修复建议等诊断结果信息。

## 任务对象(Task Object)
接入端口名称：24696-华泰证券万国数据-L-T-3-1-1-TPK1EX4S-4-ETH.2501-2502

## 任务上下文(Task Context)
投诉分类：专线中断；问题发生时间：2026-09-24T02:18:05；OSS侧事件流水号：CMCC-GZ-TSCLX-20260924-004403；投诉详情：专线中断，本智能体负责片区为粤东，片区内告警：告警区域GD-L-U2000
",
      "templateUri": "Task-T/private-line-complaint/v1"
    }
  }
}` },
      { t: 215, type: 'Negotiation-T', dir: 'request', from: '粤西SPN网络内生智能', to: '传输投诉处理智能体', summary: '接入端口名称不唯一，该端口下存在多个业务接入口，请提供具体的子接口ID或VLAN ID以确认唯一的业务',
        message: `{
    "message": {
        "messageId": "ea1a3323-b108-417f-b827-ef0c5c1a8cb8",
        "contextId": "5a22e858-e5eb-4db6-9579-824d0b18724d",
        "role": "ROLE_AGENT",
        "parts": [
            {
                "text": "存在信息缺失，请补充信息",
                "metadata": { }
            }
        ],
        "metadata": {
            "templateUri": "Negotiation-T/information-negotiation/propose/v1",
            "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Negotiation-T/v1": "## 信息协商请根据<所需信息项>补充相关内容## 所需信息项1. 接入端口名称不唯一，该端口下存在多个业务接入口，请提供具体的子接口ID或VLAN ID以确认唯一的业务，示例："网元名-端口名(cvlan=xx)"",
            "negotiationContext": {
                "id": "594c3b8b-7bd3-4d60-8a99-3c7fedddca70",
                "performative": "PROPOSE",
                "round": 1,
                "maxRounds": 5
            }
        }
    }
}` },
      { t: 240, type: 'Negotiation-T', dir: 'response', from: '传输投诉处理智能体', to: '粤西SPN网络内生智能', summary: '接入端口名称：P36169-YWHJ-棠溪村微网格业务汇聚机房1（990）-1-1-TPN1EM10F-10-ETH (cvlan=1208)',
        message: `{
    "message": {
        "taskId": "ea1a3323-b108-417f-b827-ef0c5c1a8cb8",
        "role": "ROLE_USER",
        "parts": [
            {
                "text": "已补充信息"
            }
        ],
        "metadata": {
            "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Negotiation-T": "
## 信息协商结果内容
接入端口名称：P36169-YWHJ-棠溪村微网格业务汇聚机房1（990）-1-1-TPN1EM10F-10-ETH (cvlan=1208)"
        },
        "messageId": "cdbc13b5-bd57-4c2b-b503-24e381b6c8dc"
    }
}` },
      { t: 260, type: 'Task-T', dir: 'response', from: '粤西SPN网络内生智能', to: '传输投诉处理智能体', summary: '诊断结果详情：P33206-YWHJ - 业务汇聚机房 1 (990) 的 12-TPJ1EM8F-4 端口收光无光，发光正常，原因是光纤中断。',
        message: `data: {
    "artifactUpdate": {
        "taskId": "f179e921-7261-47f3-8ffb-0bda55f93b87",
        "contextId": "3a510cd1-acf7-42e8-89ec-a237bee25ee3",
        "artifact": {
            "artifactId": "711dd103-a69b-4422-bf8e-712b33d46e12",
            "parts": [
                {
                    "text": "专线业务投诉诊断任务诊断结果消息"
                }
            ],
            "metadata": { "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Task-T/v1": "
1. 诊断结果：成功
2. 诊断结果详情：P33206-YWHJ - 业务汇聚机房 1 (990) 的 12-TPJ1EM8F-4 端口收光无光，发光正常，原因是光纤中断。
3. 修复建议： 检查端口的尾纤连接状态，光纤是否存在物理损伤或断裂。
"            }
        }
    }
}` },
      { t: 266, type: 'Task-T', dir: 'response', from: '粤东SPN网络内生智能', to: '传输投诉处理智能体', summary: '诊断结果详情：未发现故障。',
        message: `data: {
    "artifactUpdate": {
        "taskId": "f179e921-7261-47f3-8ffb-0bda55f93b87",
        "contextId": "3a510cd1-acf7-42e8-89ec-a237bee25ee3",
        "artifact": {
            "artifactId": "711dd103-a69b-4422-bf8e-712b33d46e12",
            "parts": [
                {
                    "text": "专线业务投诉诊断任务诊断结果消息"
                }
            ],
            "metadata": { "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Task-T/v1": "
1. 诊断结果：成功
2. 诊断结果详情：未诊断到业务中断，请人工接管
3. 修复建议：未诊断到业务中断，请人工接管
"            }
        }
    }
}` },
      { t: 278, type: 'Task-T', dir: 'response', from: '传输投诉处理智能体', to: 'WAIMO投诉处理智能体', summary: '跨城故障协同诊断汇总结果：粤西SPN网络内生智能 33206-YWHJ - 业务汇聚机房 1 (990) 的 12-TPJ1EM8F-4 端口收光无光，发光正常，原因是光纤中断。',
        message: `data: {
    "artifactUpdate": {
        "taskId": "f179e921-7261-47f3-8ffb-0bda55f93b87",
        "contextId": "3a510cd1-acf7-42e8-89ec-a237bee25ee3",
        "artifact": {
            "artifactId": "711dd103-a69b-4422-bf8e-712b33d46e12",
            "parts": [
                {
                    "text": "专线业务投诉诊断任务诊断结果消息"
                }
            ],
            "metadata": { "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Task-T/v1": "
1. 诊断结果：成功
2. 诊断结果详情：跨城故障协同诊断汇总结果：粤西SPN网络内生智能 33206-YWHJ - 业务汇聚机房 1 (990) 的 12-TPJ1EM8F-4 端口收光无光，发光正常，原因是光纤中断；粤东SPN网络内生智能未发现故障。
3. 修复建议：检查端口的尾纤连接状态，光纤是否存在物理损伤或断裂；建议派单现场上站修复。
"            }
        }
    }
}` },
    ],
  },
  c2: {
    base: '10:20:08',
    events: [
      { t: 69, type: '检索', from: 'WAIMO投诉处理智能体', to: '注册中心', summary: '检索命中：传输投诉处理智能体',
        message: '## 检索请求\nagent.skill = 专线投诉诊断\n\n## 检索结果\n1. 传输投诉处理智能体（传输工作台）\n   - 技能：任务规划 / 并行调度 / 综合研判' },
      { t: 74, type: 'Task-T', dir: 'request', from: 'WAIMO投诉处理智能体', to: '传输投诉处理智能体', summary: '进行集客专线业务投诉场景网络侧故障诊断，达成诊断目标，电路编号：广州-汕头FE2100KA/P。故障现象：专线质差。',
        message: `{
    "message": {
        "messageId": "d87876d1-b4b4-477e-a561-662dca28b387",
        "contextId": "0fd7c500-8193-40a4-beb6-bafc354f76b7",
        "role": "ROLE_USER",
        "parts": [
            {
                "text": "发起专线投诉诊断",
                "metadata": { }
            }
        ],
        "metadata": {
            "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Task-T/v1": "
## 任务类型(Task Type)
集客专线业务投诉诊断
## 任务描述(Task Description)
基于<任务对象>、<任务上下文> 进行集客专线业务投诉场景网络侧故障根因诊断, 达成<任务目标>中定义的投诉诊断目标，按照<预期输出>中定义的结构返回任务处理结果。
## 任务目标(Task Target)
基于用户的投诉上下文信息，对网络侧故障进行根因诊断，返回故障根因、修复建议等诊断结果信息。
## 任务对象(Task Object)
电路编号：广州-汕头FE2100KA/P。产品编号：30122038024。A端接入端口：P1310-中石油（黄埔大道中路-风光路）-VIP-JK-3A-1-1-TN81EG8E-1。
Z端接入端口：21722-汕头潮阳关埠加油站-1-4-TND1EF8T-1-ETH.3532。
## 任务上下文(Task Context)
故障发生时间：2026-09-28 10:20:08。故障现象：专线质差。投诉工单编号：CMCC-GZ-TSCLX-20260928-008503。投诉所在城市：广州。
## 预期输出(Expected Output)
要求投诉诊断任务的结果包含如下信息：1. 诊断结果；参数的取值范围包括：成功、失败；(必选)2. 诊断结果详细信息； (必选)3. 修复建议； (可选)4. 故障根因列表，每个故障根因包含故障根因名称、详细描述、修复建议、故障根因点位置等信息； (可选)",
            "templateUri": "Task-T/network-layer/complaint-diagnosis/v1"
        },
        "extensions": [
            "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Task-T/v1"
        ]
    },
    "metadata": { }
}` },
      { t: 89, type: '检索', from: '传输投诉处理智能体', to: '注册中心', summary: '检索命中：粤东SPN网络内生智能、粤西SPN网络内生智能',
        message: '## 检索请求\nagent.skill = 专线故障定位·抢通\n\n## 检索结果\n1. 粤东SPN网络内生智能（专线故障定位·抢通）\n2. 粤西SPN网络内生智能（专线故障定位·抢通）' },
      { t: 95, type: 'Task-T', dir: 'request', from: '传输投诉处理智能体', to: '粤东SPN网络内生智能', summary: '对网络侧故障进行诊断，返回故障根因和修复建议等诊断结果信息。接入端口名称：21722-汕头潮阳关埠加油站-1-4-TND1EF8T-1-ETH.3532',
        message: `POST https://OMCIP:26335/a2a/json/message:stream
Content-Type: application/json
Authorization: Bearer token
A2A-Extensions: https://projects.tmforum.org/a2aproject/telecommunication/extensions/Task-T/v1
A2A-Version: 1.0
{
  "message": {
    "messageId": "0a51dbd4-6473-4967-83f0-f6d769cf80e5",
    "role": "ROLE_USER",
    "parts": [
      {
        "text": "创建专线业务投诉诊断任务"
      }
    ],
    "metadata": {
      "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Task-T/v1": "
## 任务类型(Task Type)
传输专线业务投诉诊断

## 任务描述(Task Description)
基于<任务对象>、<任务上下文> 进行投诉场景的网络侧故障根因诊断, 达成<任务目标>中定义的投诉诊断目标，按照<预期输出>中定义的结构返回任务处理结果。

## 任务目标(Task Target)
对网络侧故障进行诊断，返回故障根因和修复建议等诊断结果信息。

## 任务对象(Task Object)
接入端口名称：21722-汕头潮阳关埠加油站-1-4-TND1EF8T-1-ETH.3532

## 任务上下文(Task Context)
投诉分类：专线质差；问题发生时间：2026-09-28T10:20:08；OSS侧事件流水号：CMCC-GZ-TSCLX-20260928-008503；投诉详情：专线质差，本智能体负责片区为粤东，片区内告警：告警区域GD-L-U2000
",
      "templateUri": "Task-T/private-line-complaint/v1"
    }
  }
}` },
      // V6.4（1020 文档 3.2.3 修订）：Task-T 任务对象 A端端口名未含子接口标识
      //（-ETH.409 删除）→ 粤西 发起 Negotiation-T 协商
      { t: 96, type: 'Task-T', dir: 'request', from: '传输投诉处理智能体', to: '粤西SPN网络内生智能', summary: '对网络侧故障进行诊断，返回故障根因和修复建议等诊断结果信息。接入端口名称：P1310-中石油（黄埔大道中路-风光路）-VIP-JK-3A-1-1-TN81EG8E-1',
        message: `POST https://OMCIP:26335/a2a/json/message:stream
Content-Type: application/json
Authorization: Bearer token
A2A-Extensions: https://projects.tmforum.org/a2aproject/telecommunication/extensions/Task-T/v1
A2A-Version: 1.0
{
  "message": {
    "messageId": "0a51dbd4-6473-4967-83f0-f6d769cf80e5",
    "role": "ROLE_USER",
    "parts": [
      {
        "text": "创建专线业务投诉诊断任务"
      }
    ],
    "metadata": {
      "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Task-T/v1": "
## 任务类型(Task Type)
传输专线业务投诉诊断

## 任务描述(Task Description)
基于<任务对象>、<任务上下文> 进行投诉场景的网络侧故障根因诊断, 达成<任务目标>中定义的投诉诊断目标，按照<预期输出>中定义的结构返回任务处理结果。

## 任务目标(Task Target)
对网络侧故障进行诊断，返回故障根因和修复建议等诊断结果信息。

      ## 任务对象(Task Object)
      接入端口名称：P1310-中石油（黄埔大道中路-风光路）-VIP-JK-3A-1-1-TN81EG8E-1

      ## 任务上下文(Task Context)
      投诉分类：专线质差；问题发生时间：2026-09-28T10:20:08；OSS侧事件流水号：CMCC-GZ-TSCLX-20260928-008503；投诉详情：专线质差，本智能体负责片区为粤西，片区内告警：告警区域GX-L-U2000
      ",
      "templateUri": "Task-T/private-line-complaint/v1"
    }
  }
}` },
      // 粤东（Z端端口唯一）的诊断结果响应；粤西 发起 Negotiation-T 协商补充子接口标识，
      // 工作台 补充 cvlan=409（V6.4，1020 文档 3.2.3 修订）——V6.11（用户规格）：粤东的
      // Task-T响应 等粤西协商结束后发送（回放 360..372），日志表按故事时序排列：
      // 协商请求 → 协商响应 → 粤东响应 → 粤西响应
      { t: 101, type: 'Negotiation-T', dir: 'request', from: '粤西SPN网络内生智能', to: '传输投诉处理智能体', summary: '接入端口名称不唯一，该端口下存在多个业务接入口，请提供具体的子接口ID或VLAN ID以确认唯一的业务',
        message: `{
    "message": {
        "messageId": "ea1a3323-b108-417f-b827-ef0c5c1a8cb8",
        "contextId": "5a22e858-e5eb-4db6-9579-824d0b18724d",
        "role": "ROLE_AGENT",
        "parts": [
            {
                "text": "存在信息缺失，请补充信息",
                "metadata": { }
            }
        ],
        "metadata": {
            "templateUri": "Negotiation-T/information-negotiation/propose/v1",
            "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Negotiation-T/v1": "## 信息协商请根据<所需信息项>补充相关内容## 所需信息项1. 接入端口名称不唯一，该端口下存在多个业务接入口，请提供具体的子接口ID或VLAN ID以确认唯一的业务，示例："网元名-端口名(cvlan=xx)"",
            "negotiationContext": {
                "id": "594c3b8b-7bd3-4d60-8a99-3c7fedddca70",
                "performative": "PROPOSE",
                "round": 1,
                "maxRounds": 5
            }
        }
    }
}` },
      { t: 102, type: 'Negotiation-T', dir: 'response', from: '传输投诉处理智能体', to: '粤西SPN网络内生智能', summary: '接入端口名称：P1310-中石油（黄埔大道中路-风光路）-VIP-JK-3A-1-1-TN81EG8E-1 (cvlan=409)',
        message: `{
    "message": {
        "taskId": "ea1a3323-b108-417f-b827-ef0c5c1a8cb8",
        "role": "ROLE_USER",
        "parts": [
            {
                "text": "已补充信息"
            }
        ],
        "metadata": {
            "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Negotiation-T": "
## 信息协商结果内容
接入端口名称：P1310-中石油（黄埔大道中路-风光路）-VIP-JK-3A-1-1-TN81EG8E-1 (cvlan=409)"
        },
        "messageId": "cdbc13b5-bd57-4c2b-b503-24e381b6c8dc",
        "contextId": "5a22e858-e5eb-4db6-9579-824d0b18724d"
    }
}` },
      { t: 103, type: 'Task-T', dir: 'response', from: '粤东SPN网络内生智能', to: '传输投诉处理智能体', summary: '诊断结果未发现业务质差',
        message: `data: {"artifactUpdate": {"taskId": "a9848066-22cb-413d-9431-6aa42bb6cd6e","contextId": "b9991460-10a2-4c90-ae6d-82bedac1ebcd","artifact": {"artifactId": "73180402-f4cb-424d-8a2e-cc88ab21a4bc","name": "private-line-service-complain-diagnosis","parts": [{"text": "业务投诉诊断任务诊断结果消息","metadata": {}}],"metadata": {"https://projects.tmforum.org/a2aproject/telecommunication/extensions/Task-T/v1": "
1. 诊断结果：成功
2. 诊断结果详情：未诊断到业务质差，请人工接管
3. 修复建议：未诊断到业务质差，请人工接管"}},"metadata": {}}}` },
      { t: 106, type: 'Task-T', dir: 'response', from: '粤西SPN网络内生智能', to: '传输投诉处理智能体', summary: '检测到链路存在光路隐患，建议下发调优',
        message: `data: {
    "artifactUpdate": {
        "taskId": "3a433236-5cc7-441c-b05d-68ae27fd70f2",
        "contextId": "3a510cd1-acf7-42e8-89ec-a237bee25ee3",
        "artifact": {
            "artifactId": "e2fd8379-3642-4d0f-9f32-3d696d3b11ef",
            "parts": [
                {
                    "text": "专线业务投诉诊断任务诊断结果消息"
                }
            ],
            "metadata": { "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Task-T/v1": "
1. 诊断结果：成功
2. 诊断结果详情：网元P45054-HW-PTN980B的端口1-TPN2EX10S-3(PORT-3)到网元P45053-HW-PTN980B_P48010-海珠2时钟源下沉-CPE-03 -HW-PTN980B的端口1-TPN2EX10S-3(PORT-3)链路存在光路隐患。当前业务流在保护隧道，保护隧道存在光路隐患，建议进行调优操作。
隐患位置及隐患详情如下：
P45054-HW-PTN980B 收光方向0.226km处存在纤损
P45053-HW-PTN980B_P48010-海珠2时钟源下沉-CPE-03 -HW-PTN980B收光方向 0.309km处存在纤损
3. 修复建议：确认思维链结果后下发调优，检查告警是否清除。
4. 故障根因列表：
   - 故障根因名称：光路隐患，详细描述：网元P45054-HW-PTN980B的端口1-TPN2EX10S-3(PORT-3)到网元P45053-HW-PTN980B的端口1-TPN2EX10S-3(PORT-3)链路存在光路隐患。当前业务流在保护隧道，保护隧道存在光路隐患，建议进行调优操作。
隐患位置及隐患详情如下：
P45054-HW-PTN980B收光方向0.226km处存在纤损
P45053-HW-PTN980B收光方向0.309km处存在纤损
，修复建议：确认思维链结果后下发调优，检查告警是否清除。，故障根因点位置：链路c92dd025-fc42-3f75-88f7-8c328e98f0aa，故障对象标识：c92dd025-fc42-3f75-88f7-8c328e98f0aa，故障对象类型：LINK
"            }
        }
    }
}` },
      { t: 119, type: 'Task-T', dir: 'response', from: '传输投诉处理智能体', to: 'WAIMO投诉处理智能体', summary: '跨城故障协同诊断汇总结果：粤西SPN网络内生智能端口收光弱光，发光正常，原因是光纤整体损耗大。',
        message: `data: {
    "artifactUpdate": {
        "taskId": "3a433236-5cc7-441c-b05d-68ae27fd70f2",
        "contextId": "3a510cd1-acf7-42e8-89ec-a237bee25ee3",
        "artifact": {
            "artifactId": "e2fd8379-3642-4d0f-9f32-3d696d3b11ef",
            "parts": [
                {
                    "text": "专线业务投诉诊断任务诊断结果消息"
                }
            ],
            "metadata": { "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Task-T/v1": "
1. 诊断结果：成功
2. 诊断结果详情：跨城故障协同诊断汇总结果：粤西SPN网络内生智能端口收光弱光，发光正常，原因是光纤整体损耗大；粤东SPN网络内生智能未发现故障。
3. 修复建议：确认思维链结果后下发隧道调优，检查告警是否清除。
4. 故障根因列表：
   - 故障根因名称：光路隐患，详细描述：网元P45054-HW-PTN980B的端口1-TPN2EX10S-3(PORT-3)到网元P45053-HW-PTN980B的端口1-TPN2EX10S-3(PORT-3)链路存在光路隐患。当前业务流在保护隧道，保护隧道存在光路隐患，建议进行调优操作。
隐患位置及隐患详情如下：
P45054-HW-PTN980B收光方向0.226km处存在纤损
P45053-HW-PTN980B收光方向0.309km处存在纤损
，修复建议：确认思维链结果后下发调优，检查告警是否清除。，故障根因点位置：链路c92dd025-fc42-3f75-88f7-8c328e98f0aa，故障对象标识：c92dd025-fc42-3f75-88f7-8c328e98f0aa，故障对象类型：LINK
"            }
        }
    }
}` },
      // V6.4（1020 文档 3.2.3 修订）：抢通方案为「隧道调优」，涉及动网操作——先经
      // Authorization-T 完成动网操作授权（请求/响应），成功后粤西执行抢通
      { t: 120, type: 'Authorization-T', dir: 'request', from: '传输投诉处理智能体', to: '粤西SPN网络内生智能', summary: '新增动网操作授权',
        message: `{
    "message": {
        "messageId": "3dbc13b5-bd57-4c2b-b503-24e381b6c8d3",
        "role": "ROLE_USER",
        "parts": [
            {
                "text": "新增动网操作授权"
            }
        ],
        "metadata": {
            "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Authorization-T/v1": "
## 授权策略的操作类型
新增授权策略

## 授权策略的操作描述
请根据<授权策略的操作类型>和<动网操作的授权策略列表>完成相应的授权操作，按照<预期输出>中定义的结构返回授权策略的操作执行结果。<预期输出>表示预期返回内容。

## 动网操作的授权策略列表
  - 动网操作的授权策略1
    - 动网操作的业务场景：业务投诉诊断
    - 动网操作的处置类型：业务抢通
    - 动网操作名称：隧道调优
    - 有效期：2026-09-28T12:00:00Z ~ 2030-09-28T12:00:00Z

## 预期输出
1. 授权操作执行结果，取值范围：成功、失败、部分成功；
2. 授权操作执行成功时，返回执行成功的<动网操作的授权策略列表>；
3. 授权操作执行失败或部分成功时，返回失败列表，包含授权策略和失败原因；
",
            "templateUri": "Authorization-T/authorization-policy-management/v1"
        }
    }
}` },
      { t: 121, type: 'Authorization-T', dir: 'response', from: '粤西SPN网络内生智能', to: '传输投诉处理智能体', summary: '授权操作执行结果：成功',
        message: `data: {
    "artifactUpdate": {
        "taskId": "7dbc13b5-bd57-4c2b-b503-24e381b6c8d7",
        "contextId": "c295ea44-7543-4f78-b524-7a38915ad6e4",
        "artifact": [
            {
                "parts": [
                    {
                        "text": "动网操作授权结果"
                    }
                ],
                "metadata": { "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Authorization-T/v1": "
## 授权操作执行结果
    授权操作执行结果：成功

## 动网操作的授权策略列表
  - 动网操作的授权策略1
      - 动网操作的授权策略标识：7d8c7b00-3c8c-4f8e-9b1e-9b17b6a3e5c3
      - 动网操作的业务场景：业务投诉诊断
      - 动网操作的处置类型：业务抢通
      - 动网操作名称：隧道调优
      - 有效期：2026-09-28T12:00:00Z ~ 2030-09-28T12:00:00Z
      - 创建时间：2026-09-28T12:00:00Z
      - 最后修改时间：2026-09-28T12:00:00Z
"
            }
        ]
    }
}` },
      { t: 130, type: 'Notification-T', from: '粤西SPN网络内生智能', to: '传输投诉处理智能体', summary: '抢通方案上报',
        message: `data: {
    "artifactUpdate": {
        "taskId": "3a433236-5cc7-441c-b05d-68ae27fd70f2",
        "contextId": "19ed43b5-9aef-4183-8889-77ca17604376",
        "artifact": {
            "artifactId": "1b6314f8-a79c-4468-b1c4-833e6dfeb83c",
            "parts": [
                {
                    "text": "业务抢通事件"
                }
            ],
            "metadata": { "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Notification-T/v1": "
### 业务抢通事件
1. 业务抢通方案执行状态：未启动
2. 投诉诊断任务流水号；3a433236-5cc7-441c-b05d-68ae27fd70f2
3. OSS侧事件流水号；CMCC-GZ-TSCLX-20260928-008503
4. 接入端口名称；P1310-中石油（黄埔大道中路-风光路）-VIP-JK-3A-1-1-TN81EG8E-1-ETH.409
5. 是否已授权OMC自动抢通；是
6. 业务抢通方案名称；隧道调优
7. 业务抢通方案详情；
    场景: PROTECT_PATH_FAULT; 抢通方案已就绪，已自动下发执行
    调优前：
    - 隧道1：P45053-HW-PTN980B_P48010-海珠2时钟源下沉-CPE-03_20260922 Tunnel2，源网元:P48010-海珠2时钟源下沉-CPE-03，宿网元:P45053-HW-PTN980B，主备类型：protect，状态：down，时延：28ms，丢包率：0.9%
       - 隧道路由列表：
          - 链路0：P48010-海珠2时钟源下沉-CPE-03_2-HGF1CXPB0-2-CPE-03 ETH-14(TO-P45054)-P45054-HW-PTN980B_1-TPN2EX10S-7(PORT-7)，源网元:P48010-海珠2时钟源下沉-CPE-03，源端口：2-HGF1CXPB0-2-CPE-03 ETH-14(TO-P45054)，宿网元:P45054-HW-PTN980B，宿端口：1-TPN2EX10S-7(PORT-7)，时延：28ms
          - 链路1：P45054-HW-PTN980B_1-TPN2EX10S-3(PORT-3)-P45053-HW-PTN980B_1-TPN2EX10S-3(PORT-3)，源网元:P45054-HW-PTN980B，源端口：1-TPN2EX10S-3(PORT-3)，宿网元:P45053-HW-PTN980B，宿端口：1-TPN2EX10S-3(PORT-3)，时延：28ms
    - 隧道2：P45053-HW-PTN980B_P48010-海珠2时钟源下沉-CPE-03_20260922 Tunnel12，源网元:P45053-HW-PTN980B，宿网元:P48010-海珠2时钟源下沉-CPE-03，主备类型：protect，状态：down，时延：28ms，丢包率：0.9%
       - 隧道路由列表：
          - 链路0：P45053-HW-PTN980B_1-TPN2EX10S-3(PORT-3)-P45054-HW-PTN980B_1-TPN2EX10S-3(PORT-3)，源网元:P45053-HW-PTN980B，源端口：1-TPN2EX10S-3(PORT-3)，宿网元:P45054-HW-PTN980B，宿端口：1-TPN2EX10S-3(PORT-3)，时延：28ms
          - 链路1：P45054-HW-PTN980B_1-TPN2EX10S-7(PORT-7)-P48010-海珠2时钟源下沉-CPE-03_2-HGF1CXPB0-2-CPE-03 ETH-14(TO-P45054)，源网元:P45054-HW-PTN980B，源端口：1-TPN2EX10S-7(PORT-7)，宿网元:P48010-海珠2时钟源下沉-CPE-03，宿端口：2-HGF1CXPB0-2-CPE-03 ETH-14(TO-P45054)，时延：28ms
    调优后：
    - 隧道1：P45053-HW-PTN980B_P48010-海珠2时钟源下沉-CPE-03_20260922 Tunnel2，源网元:P48010-海珠2时钟源下沉-CPE-03，宿网元:P45053-HW-PTN980B，主备类型：protect，状态：up，时延：5ms，丢包率：0.01%
       - 隧道路由列表：
          - 链路0：P48010-海珠2时钟源下沉-CPE-03_2-HGF1CXPB0-2-CPE-03 ETH-13(TO-P45053)-P45053-HW-PTN980B_1-TPN2EX10S-7(PORT-7)，源网元:P48010-海珠2时钟源下沉-CPE-03，源端口：2-HGF1CXPB0-2-CPE-03 ETH-13(TO-P45053)，宿网元:P45053-HW-PTN980B，宿端口：1-TPN2EX10S-7(PORT-7)，时延：5ms
    - 隧道2：P45053-HW-PTN980B_P48010-海珠2时钟源下沉-CPE-03_20260922 Tunnel12，源网元:P45053-HW-PTN980B，宿网元:P48010-海珠2时钟源下沉-CPE-03，主备类型：protect，状态：up，时延：5ms，丢包率：0.01%
       - 隧道路由列表：
          - 链路0：P45053-HW-PTN980B_1-TPN2EX10S-7(PORT-7)-P48010-海珠2时钟源下沉-CPE-03_2-HGF1CXPB0-2-CPE-03 ETH-13(TO-P45053)，源网元:P45053-HW-PTN980B，源端口：1-TPN2EX10S-7(PORT-7)，宿网元:P48010-海珠2时钟源下沉-CPE-03，宿端口：2-HGF1CXPB0-2-CPE-03 ETH-13(TO-P45053)，时延：5ms
" }
        }
    }
}` },
      { t: 141, type: 'Notification-T', from: '粤西SPN网络内生智能', to: '传输投诉处理智能体', summary: '业务抢通执行成功',
        message: `data: {
    "artifactUpdate": {
        "taskId": "3a433236-5cc7-441c-b05d-68ae27fd70f2",
        "contextId": "19ed43b5-9aef-4183-8889-77ca17604376",
        "artifact": {
            "artifactId": "ead7e3f5-de1f-4bb5-b31e-d826f6096cbe",
            "parts": [
                {
                    "text": "业务抢通事件"
                }
            ],
            "metadata": { "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Notification-T/v1": "
### 业务抢通事件
1. 业务抢通方案执行状态：已结束
2. 投诉诊断任务流水号；3a433236-5cc7-441c-b05d-68ae27fd70f2
3. OSS侧事件流水号；CMCC-GZ-TSCLX-20260928-008503
4. 接入端口名称；P1310-中石油（黄埔大道中路-风光路）-VIP-JK-3A-1-1-TN81EG8E-1-ETH.409
5. 是否已授权OMC自动抢通；是
6. 业务抢通方案名称；隧道调优
7. 业务抢通方案详情；
    场景: PROTECT_PATH_FAULT; 调优下发: 成功
    调优前：
    - 隧道1：P45053-HW-PTN980B_P48010-海珠2时钟源下沉-CPE-03_20260922 Tunnel2，源网元:P48010-海珠2时钟源下沉-CPE-03，宿网元:P45053-HW-PTN980B，主备类型：protect，状态：down，时延：28ms，丢包率：0.9%
       - 隧道路由列表：
          - 链路0：P48010-海珠2时钟源下沉-CPE-03_2-HGF1CXPB0-2-CPE-03 ETH-14(TO-P45054)-P45054-HW-PTN980B_1-TPN2EX10S-7(PORT-7)，源网元:P48010-海珠2时钟源下沉-CPE-03，源端口：2-HGF1CXPB0-2-CPE-03 ETH-14(TO-P45054)，宿网元:P45054-HW-PTN980B，宿端口：1-TPN2EX10S-7(PORT-7)，时延：28ms
          - 链路1：P45054-HW-PTN980B_1-TPN2EX10S-3(PORT-3)-P45053-HW-PTN980B_1-TPN2EX10S-3(PORT-3)，源网元:P45054-HW-PTN980B，源端口：1-TPN2EX10S-3(PORT-3)，宿网元:P45053-HW-PTN980B，宿端口：1-TPN2EX10S-3(PORT-3)，时延：28ms
    - 隧道2：P45053-HW-PTN980B_P48010-海珠2时钟源下沉-CPE-03_20260922 Tunnel12，源网元:P45053-HW-PTN980B，宿网元:P48010-海珠2时钟源下沉-CPE-03，主备类型：protect，状态：down，时延：28ms，丢包率：0.9%
       - 隧道路由列表：
          - 链路0：P45053-HW-PTN980B_1-TPN2EX10S-3(PORT-3)-P45054-HW-PTN980B_1-TPN2EX10S-3(PORT-3)，源网元:P45053-HW-PTN980B，源端口：1-TPN2EX10S-3(PORT-3)，宿网元:P45054-HW-PTN980B，宿端口：1-TPN2EX10S-3(PORT-3)，时延：28ms
          - 链路1：P45054-HW-PTN980B_1-TPN2EX10S-7(PORT-7)-P48010-海珠2时钟源下沉-CPE-03_2-HGF1CXPB0-2-CPE-03 ETH-14(TO-P45054)，源网元:P45054-HW-PTN980B，源端口：1-TPN2EX10S-7(PORT-7)，宿网元:P48010-海珠2时钟源下沉-CPE-03，宿端口：2-HGF1CXPB0-2-CPE-03 ETH-14(TO-P45054)，时延：28ms
    调优后：
    - 隧道1：P45053-HW-PTN980B_P48010-海珠2时钟源下沉-CPE-03_20260922 Tunnel2，源网元:P48010-海珠2时钟源下沉-CPE-03，宿网元:P45053-HW-PTN980B，主备类型：protect，状态：up，时延：5ms，丢包率：0.01%
       - 隧道路由列表：
          - 链路0：P48010-海珠2时钟源下沉-CPE-03_2-HGF1CXPB0-2-CPE-03 ETH-13(TO-P45053)-P45053-HW-PTN980B_1-TPN2EX10S-7(PORT-7)，源网元:P48010-海珠2时钟源下沉-CPE-03，源端口：2-HGF1CXPB0-2-CPE-03 ETH-13(TO-P45053)，宿网元:P45053-HW-PTN980B，宿端口：1-TPN2EX10S-7(PORT-7)，时延：5ms
    - 隧道2：P45053-HW-PTN980B_P48010-海珠2时钟源下沉-CPE-03_20260922 Tunnel12，源网元:P45053-HW-PTN980B，宿网元:P48010-海珠2时钟源下沉-CPE-03，主备类型：protect，状态：up，时延：5ms，丢包率：0.01%
       - 隧道路由列表：
          - 链路0：P45053-HW-PTN980B_1-TPN2EX10S-7(PORT-7)-P48010-海珠2时钟源下沉-CPE-03_2-HGF1CXPB0-2-CPE-03 ETH-13(TO-P45053)，源网元:P45053-HW-PTN980B，源端口：1-TPN2EX10S-7(PORT-7)，宿网元:P48010-海珠2时钟源下沉-CPE-03，宿端口：2-HGF1CXPB0-2-CPE-03 ETH-13(TO-P45053)，时延：5ms
8. 业务抢通方案执行结束时间；2026-09-28T10:47:05.000000000Z
9. 业务抢通方案执行结果：成功
" }
        }
    }
}` },
      { t: 160, type: 'Notification-T', from: '传输投诉处理智能体', to: 'WAIMO投诉处理智能体', summary: '专线业务已经完成抢通修复，经过验证业务的SLA已经恢复正常。',
        message: `data: {
    "artifactUpdate": {
        "taskId": "3a433236-5cc7-441c-b05d-68ae27fd70f2",
        "contextId": "19ed43b5-9aef-4183-8889-77ca17604376",
        "artifact": {
            "artifactId": "ead7e3f5-de1f-4bb5-b31e-d826f6096cbe",
            "parts": [
                {
                    "text": "业务抢通事件"
                }
            ],
            "metadata": { "https://projects.tmforum.org/a2aproject/telecommunication/extensions/Notification-T/v1": "
### 业务抢通事件
1. 业务抢通方案执行状态：已结束
2. 投诉诊断任务流水号；3a433236-5cc7-441c-b05d-68ae27fd70f2
3. OSS侧事件流水号；CMCC-GZ-TSCLX-20260928-008503
4. 接入端口名称；P1310-中石油（黄埔大道中路-风光路）-VIP-JK-3A-1-1-TN81EG8E-1-ETH.409
5. 是否已授权OMC自动抢通；是
6. 业务抢通方案名称；隧道调优
7. 业务抢通方案详情；
    场景: PROTECT_PATH_FAULT; 调优下发: 成功
    调优前：
    - 隧道1：P45053-HW-PTN980B_P48010-海珠2时钟源下沉-CPE-03_20260922 Tunnel2，源网元:P48010-海珠2时钟源下沉-CPE-03，宿网元:P45053-HW-PTN980B，主备类型：protect，状态：down，时延：28ms，丢包率：0.9%
       - 隧道路由列表：
          - 链路0：P48010-海珠2时钟源下沉-CPE-03_2-HGF1CXPB0-2-CPE-03 ETH-14(TO-P45054)-P45054-HW-PTN980B_1-TPN2EX10S-7(PORT-7)，源网元:P48010-海珠2时钟源下沉-CPE-03，源端口：2-HGF1CXPB0-2-CPE-03 ETH-14(TO-P45054)，宿网元:P45054-HW-PTN980B，宿端口：1-TPN2EX10S-7(PORT-7)，时延：28ms
          - 链路1：P45054-HW-PTN980B_1-TPN2EX10S-3(PORT-3)-P45053-HW-PTN980B_1-TPN2EX10S-3(PORT-3)，源网元:P45054-HW-PTN980B，源端口：1-TPN2EX10S-3(PORT-3)，宿网元:P45053-HW-PTN980B，宿端口：1-TPN2EX10S-3(PORT-3)，时延：28ms
    - 隧道2：P45053-HW-PTN980B_P48010-海珠2时钟源下沉-CPE-03_20260922 Tunnel12，源网元:P45053-HW-PTN980B，宿网元:P48010-海珠2时钟源下沉-CPE-03，主备类型：protect，状态：down，时延：28ms，丢包率：0.9%
       - 隧道路由列表：
          - 链路0：P45053-HW-PTN980B_1-TPN2EX10S-3(PORT-3)-P45054-HW-PTN980B_1-TPN2EX10S-3(PORT-3)，源网元:P45053-HW-PTN980B，源端口：1-TPN2EX10S-3(PORT-3)，宿网元:P45054-HW-PTN980B，宿端口：1-TPN2EX10S-3(PORT-3)，时延：28ms
          - 链路1：P45054-HW-PTN980B_1-TPN2EX10S-7(PORT-7)-P48010-海珠2时钟源下沉-CPE-03_2-HGF1CXPB0-2-CPE-03 ETH-14(TO-P45054)，源网元:P45054-HW-PTN980B，源端口：1-TPN2EX10S-7(PORT-7)，宿网元:P48010-海珠2时钟源下沉-CPE-03，宿端口：2-HGF1CXPB0-2-CPE-03 ETH-14(TO-P45054)，时延：28ms
    调优后：
    - 隧道1：P45053-HW-PTN980B_P48010-海珠2时钟源下沉-CPE-03_20260922 Tunnel2，源网元:P48010-海珠2时钟源下沉-CPE-03，宿网元:P45053-HW-PTN980B，主备类型：protect，状态：up，时延：5ms，丢包率：0.01%
       - 隧道路由列表：
          - 链路0：P48010-海珠2时钟源下沉-CPE-03_2-HGF1CXPB0-2-CPE-03 ETH-13(TO-P45053)-P45053-HW-PTN980B_1-TPN2EX10S-7(PORT-7)，源网元:P48010-海珠2时钟源下沉-CPE-03，源端口：2-HGF1CXPB0-2-CPE-03 ETH-13(TO-P45053)，宿网元:P45053-HW-PTN980B，宿端口：1-TPN2EX10S-7(PORT-7)，时延：5ms
    - 隧道2：P45053-HW-PTN980B_P48010-海珠2时钟源下沉-CPE-03_20260922 Tunnel12，源网元:P45053-HW-PTN980B，宿网元:P48010-海珠2时钟源下沉-CPE-03，主备类型：protect，状态：up，时延：5ms，丢包率：0.01%
       - 隧道路由列表：
          - 链路0：P45053-HW-PTN980B_1-TPN2EX10S-7(PORT-7)-P48010-海珠2时钟源下沉-CPE-03_2-HGF1CXPB0-2-CPE-03 ETH-13(TO-P45053)，源网元:P45053-HW-PTN980B，源端口：1-TPN2EX10S-7(PORT-7)，宿网元:P48010-海珠2时钟源下沉-CPE-03，宿端口：2-HGF1CXPB0-2-CPE-03 ETH-13(TO-P45053)，时延：5ms
8. 业务抢通方案执行结束时间；2026-09-28T10:47:05.000000000Z
9. 业务抢通方案执行结果：成功
" }
        }
    }
}` },
    ],
  },
};

// 由参考数据生成日志行（badge/clock/from/to/summary/prompt/step）
// 徽章规则：检索 →「检索」；Notification-T →「Notification-T通知」；
// 其余 Task-T/Negotiation-T + 请求/响应；clock 为占位初始值（base+t），
// 回放时钟由 cases.js CLOCKS 冻结定稿值覆写（V5，业务时间线不随回放编排变动）
export function buildLogs(src) {
  const [h, m, s] = src.base.split(':').map(Number);
  const base = h * 3600 + m * 60 + s;
  return src.events.map((e) => {
    const tot = base + e.t;
    const p2 = (v) => String(Math.floor(v)).padStart(2, '0');
    const ms = String(Math.round((tot - Math.floor(tot)) * 1000)).padStart(3, '0');
    const badge = e.from === e.to
      ? '内部'
      : e.type === '检索'
        ? '检索'
        : e.type === 'Notification-T'
          ? 'Notification-T通知'
          : e.type + (e.dir === 'response' ? '响应' : '请求');
    return {
      badge,
      clock: p2(Math.floor(tot / 3600)) + ':' + p2(Math.floor(tot / 60) % 60) + ':' + p2(Math.floor(tot) % 60) + '.' + ms,
      from: e.from,
      to: e.to,
      summary: e.summary,
      prompt: e.message,
      step: e.step || null,
    };
  });
}
