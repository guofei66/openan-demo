const now = () => new Date().toISOString()
const serviceUrls = {
  registryUrl: 'http://47.236.98.226:9004/rc',
  orchestrationUrl: 'http://47.236.98.226:9004/oc',
  executionHostUrl: 'http://47.236.98.226:9004/a2a',
  ontologyUrl: 'http://47.236.98.226:9004/ot',
}
const mockProxyResult = () => ({ status: 200, contentType: 'application/json', kind: 'json', body: { mock: true }, latencyMs: 5 })
const seed = {
  id: 1,
  templateUri: 'Notification-T/network-layer/subscribe-incident/v1',
  name: '订阅事件样本（mock）',
  description: '内置演示数据',
  createdBy: 'mock',
  variantCount: 1,
  seedJson: { 'faultManagement.Incident': { csn: 'INC-001', priority: 'critical' } },
}

const agent = { id: 1, organization: 'OpenAN', name: 'OpenAN Debug Mock Agent', description: '', enabled: true, layer: 'service', networkDomain: null, isDefault: true }
const networkAgent = { id: 3, organization: 'OpenAN', name: '无线网络 Agent', description: '无线子域打桩', enabled: true, layer: 'network', networkDomain: 'wireless', isDefault: false }

const fixtures = {
  'POST /debug/api/v1/auth/login': () => ({ token: 'mock-token', username: 'admin', role: 'admin' }),
  'GET /debug/api/v1/auth/me': () => ({ username: 'admin', role: 'admin' }),
  'GET /debug/api/v1/seeds': () => [seed],
  'POST /debug/api/v1/seeds': () => ({ ...seed, id: 2 }),
  'GET /debug/api/v1/variants': () => [
    { id: 1, seedId: 1, templateUri: seed.templateUri, variantJson: seed.seedJson, enabled: true, source: 'import', seq: 0 },
  ],
  'GET /debug/api/v1/history': () => ({
    total: 1,
    items: [
      {
        id: 1,
        templateUri: seed.templateUri,
        direction: 'console',
        taskState: 'TASK_STATE_COMPLETED',
        negotiated: false,
        latencyMs: 12,
        createdAt: now(),
        requestBody: {},
        responseBody: {},
      },
    ],
  }),
  'GET /debug/api/v1/users': () => [{ id: 1, username: 'admin', role: 'admin', enabled: true }],
  'POST /debug/api/v1/console/send': () => ({
    status: 200,
    latencyMs: 9,
    response: { task: { id: 'mock', status: { state: 'TASK_STATE_COMPLETED' } } },
  }),
  'GET /debug/api/v1/agents': () => [agent, networkAgent],
  'GET /debug/api/v1/registry/samples': () => [
    {
      key: 'minimal-agent',
      label: '样例：极简 Agent（快速上手）',
      description: '注册中心 README 的最小可注册卡片',
      card: {
        name: 'My Agent',
        description: '一个示例 Agent。',
        version: '1.0.0',
        provider: { organization: 'MyOrg', url: 'https://example.com' },
        capabilities: { streaming: true, pushNotifications: false, extensions: [] },
        skills: [{ id: 'example-skill', name: '示例技能', description: '演示基本的 Agent 注册流程。', tags: ['demo'] }],
        supportedInterfaces: [{ url: 'http://127.0.0.1:8080/', protocolBinding: 'HTTP+JSON', protocolVersion: '1.0.0' }],
      },
    },
    {
      key: 'mock-sample-agent',
      label: '样例：Mock Agent（离线演示）',
      description: '无后端时的演示卡片',
      card: {
        name: 'Mock Sample Agent',
        description: '用于 mock 模式演示的 Agent 卡片。',
        version: '0.1.0',
        provider: { organization: 'MockOrg' },
        capabilities: { streaming: false, pushNotifications: false, extensions: [] },
        skills: [{ id: 'mock-skill', name: 'Mock Skill', description: '演示技能。', tags: ['mock'] }],
        supportedInterfaces: [{ url: 'http://127.0.0.1:8080/', protocolBinding: 'GRPC', protocolVersion: '1.0.0' }],
      },
    },
  ],
  'POST /debug/api/v1/agents': (options) => {
    let draft = {}
    try {
      draft = JSON.parse(options.body || '{}')
    } catch {
      draft = {}
    }
    return {
      id: 2,
      organization: draft.organization || 'OpenAN',
      name: draft.name || '新 Mock Agent',
      description: draft.description || '',
      enabled: true,
      layer: draft.layer || 'service',
      networkDomain: draft.layer === 'network' ? draft.networkDomain || null : null,
      isDefault: false,
    }
  },
  'GET /debug/api/v1/settings/service-urls': () => ({ ...serviceUrls }),
  'PUT /debug/api/v1/settings/service-urls': () => ({ ...serviceUrls }),
  'POST /debug/api/v1/debug-proxy/registry': mockProxyResult,
  'POST /debug/api/v1/debug-proxy/orchestration': mockProxyResult,
  'POST /debug/api/v1/debug-proxy/execution': mockProxyResult,
  'POST /debug/api/v1/debug-proxy/ontology': mockProxyResult,
}

export async function mockApi(path, options = {}) {
  await new Promise((resolve) => setTimeout(resolve, 100))
  const key = `${options.method || 'GET'} ${path.split('?')[0]}`
  const fixture = fixtures[key]
  if (fixture) return fixture(options)
  if (/^\/debug\/api\/v1\/agents\/\d+$/.test(path) && ['PATCH', 'DELETE'].includes(options.method)) {
    return { ok: true }
  }
  throw new Error(`no mock for ${key}`)
}
