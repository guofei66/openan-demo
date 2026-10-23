export const AGENT_LAYERS = [
  { key: 'service', label: '服务层 Agent' },
  { key: 'network', label: '网络层 Agent' },
]

export const NETWORK_DOMAINS = [
  { key: 'wireless', label: '无线' },
  { key: 'datacom', label: '数通' },
  { key: 'optical', label: '光' },
  { key: 'cloudcore', label: '云核' },
]

const DOMAIN_LABELS = Object.fromEntries(NETWORK_DOMAINS.map((item) => [item.key, item.label]))

export function layerLabel(layer) {
  if (layer === 'service') return '服务层'
  if (layer === 'network') return '网络层'
  return ''
}

export function domainLabel(domain) {
  return DOMAIN_LABELS[domain] || ''
}

export function groupLabel(agent) {
  if (agent.layer === 'network') {
    const domain = domainLabel(agent.networkDomain)
    return domain ? `网络层 · ${domain}` : '网络层'
  }
  if (agent.layer === 'service') return '服务层'
  return ''
}

export function groupAgents(agents) {
  const buckets = {
    service: [],
    'network-wireless': [],
    'network-datacom': [],
    'network-optical': [],
    'network-cloudcore': [],
  }
  for (const agent of agents) {
    if (agent.layer === 'service') {
      buckets.service.push(agent)
    } else if (agent.layer === 'network' && buckets[`network-${agent.networkDomain}`]) {
      buckets[`network-${agent.networkDomain}`].push(agent)
    }
  }
  const labels = {
    service: '服务层 Agent',
    'network-wireless': '网络层 · 无线',
    'network-datacom': '网络层 · 数通',
    'network-optical': '网络层 · 光',
    'network-cloudcore': '网络层 · 云核',
  }
  return Object.entries(buckets)
    .filter(([, list]) => list.length > 0)
    .map(([key, list]) => ({ key, label: labels[key], agents: list }))
}
