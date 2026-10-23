// 接口集合定义：label/note 走 i18n（labelKey/noteKey → src/i18n/base-*.json 的 endpoints.* 段）。
// exampleBody 中的中文为示例报文内容（随请求发送的数据），不属于 UI 文案，保持原样。
const A2A_SEND_EXAMPLE = {
  message: {
    messageId: '请替换为UUID',
    role: 'ROLE_USER',
    parts: [{ text: 'debug task' }],
    metadata: {
      templateUri: 'Task-T/network-layer/private-line-complaint/v1',
      'https://projects.tmforum.org/a2aproject/telecommunication/extensions/Task-T/v1': '<A2A-T 渲染后的 prompt 文本>',
    },
  },
}

export const REGISTRY_ENDPOINTS = [
  { key: 'list', labelKey: 'endpoints.registry.list.label', method: 'GET', path: '/rest/v1/registry-center/agent-cards?includeStatus=true', noteKey: 'endpoints.registry.list.note', exampleBody: null },
  { key: 'get', labelKey: 'endpoints.registry.get.label', method: 'GET', path: '/rest/v1/registry-center/agent-cards/OpenAN/Demo-Agent?includeStatus=true', noteKey: 'endpoints.registry.get.note', exampleBody: null },
  {
    key: 'register',
    labelKey: 'endpoints.registry.register.label',
    method: 'POST',
    path: '/rest/v1/registry-center/agent-cards',
    bodyEditor: 'agentcard',
    noteKey: 'endpoints.registry.register.note',
    exampleBody: {
      agentCards: [{
        name: 'Demo Agent',
        description: '演示用 Agent 卡片',
        version: '1.0.0',
        provider: { organization: 'OpenAN', url: 'https://example.com' },
        skills: [{ id: 's1', name: '示例技能', description: '演示技能', tags: ['demo'] }],
        capabilities: { streaming: true, pushNotifications: false, extensions: [] },
        supportedInterfaces: [{ url: 'http://127.0.0.1:8080/', protocolBinding: 'HTTP+JSON', protocolVersion: '1.0.0' }],
        defaultInputModes: ['text/plain'],
        defaultOutputModes: ['application/json'],
      }],
    },
  },
  { key: 'update', labelKey: 'endpoints.registry.update.label', method: 'PUT', path: '/rest/v1/registry-center/agent-cards/OpenAN/Demo-Agent', noteKey: 'endpoints.registry.update.note', bodyEditor: 'agentcard' },
  { key: 'semantic', labelKey: 'endpoints.registry.semantic.label', method: 'POST', path: '/rest/v1/registry-center/agent-cards/semantic-query', exampleBody: { task: '需要做全网节能优化' } },
  { key: 'delete', labelKey: 'endpoints.registry.delete.label', method: 'DELETE', path: '/rest/v1/registry-center/agent-cards/OpenAN/Demo-Agent', exampleBody: null },
  { key: 'manage', labelKey: 'endpoints.registry.manage.label', method: 'GET', path: '/rest/v1/registry-center/agent-cards/manage', noteKey: 'endpoints.registry.manage.note', exampleBody: null },
  { key: 'publish', labelKey: 'endpoints.registry.publish.label', method: 'POST', path: '/rest/v1/registry-center/agent-cards/{organization}/{name}/publish', noteKey: 'endpoints.registry.publish.note', exampleBody: { remark: '联调通过，允许发布' } },
  { key: 'keys', labelKey: 'endpoints.registry.keys.label', method: 'GET', path: '/rest/v1/registry-center/keys', exampleBody: null },
]

export const ORCHESTRATION_ENDPOINTS = [
  { key: 'workflows', labelKey: 'endpoints.orchestration.workflows.label', method: 'GET', path: '/rest/v1/orchestrate/workflows?limit=10', exampleBody: null },
  { key: 'cards', labelKey: 'endpoints.orchestration.cards.label', method: 'GET', path: '/rest/v1/orchestrate/agent-cards', exampleBody: null },
  { key: 'intent', labelKey: 'endpoints.orchestration.intent.label', method: 'POST', path: '/api/v1/orchestrate/intent', exampleBody: { intent: '帮我做全网节能优化', name: '节能评估' } },
  { key: 'search', labelKey: 'endpoints.orchestration.search.label', method: 'POST', path: '/api/v1/orchestrate/search', exampleBody: { intent: '网络故障根因分析', top_n: 3 } },
  { key: 'execute', labelKey: 'endpoints.orchestration.execute.label', method: 'POST', path: '/api/v1/orchestrate/execute', noteKey: 'endpoints.orchestration.execute.note', exampleBody: { task: '帮我做网络故障根因分析' } },
  { key: 'executeById', labelKey: 'endpoints.orchestration.executeById.label', method: 'GET', path: '/api/v1/orchestrate/execute/{psop_id}?user_intent=&lang=zh', noteKey: 'endpoints.orchestration.executeById.note', exampleBody: null },
  { key: 'dispatch', labelKey: 'endpoints.orchestration.dispatch.label', method: 'GET', path: '/rest/v1/orchestrate/dispatch?intent=查询设备告警&agent_name=&lang=zh', exampleBody: null },
  { key: 'executions', labelKey: 'endpoints.orchestration.executions.label', method: 'GET', path: '/api/v1/executions', exampleBody: null },
  { key: 'records', labelKey: 'endpoints.orchestration.records.label', method: 'GET', path: '/rest/v1/orchestrate/execution-records', exampleBody: null },
]

export const EXECUTION_ENDPOINTS = [
  { key: 'send', labelKey: 'endpoints.execution.send.label', method: 'POST', path: '/message:send', noteKey: 'endpoints.execution.send.note', defaultHeaders: { 'A2A-Version': '1.0' }, exampleBody: A2A_SEND_EXAMPLE },
  { key: 'stream', labelKey: 'endpoints.execution.stream.label', method: 'POST', path: '/message:stream', defaultHeaders: { 'A2A-Version': '1.0' }, exampleBody: A2A_SEND_EXAMPLE },
  { key: 'tasks', labelKey: 'endpoints.execution.tasks.label', method: 'GET', path: '/tasks', defaultHeaders: { 'A2A-Version': '1.0' }, exampleBody: null },
  { key: 'task', labelKey: 'endpoints.execution.task.label', method: 'GET', path: '/tasks/{task_id}', defaultHeaders: { 'A2A-Version': '1.0' }, exampleBody: null },
  { key: 'cancel', labelKey: 'endpoints.execution.cancel.label', method: 'POST', path: '/tasks/{task_id}:cancel', defaultHeaders: { 'A2A-Version': '1.0' }, exampleBody: null },
]

export const ONTOLOGY_ENDPOINTS = [
  { key: 'health', labelKey: 'endpoints.ontology.health.label', method: 'GET', path: '/api/health', exampleBody: null },
  { key: 'runs', labelKey: 'endpoints.ontology.runs.label', method: 'POST', path: '/api/runs', noteKey: 'endpoints.ontology.runs.note', exampleBody: { input: '查询设备告警并订阅严重故障' } },
]
