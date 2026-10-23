export const TEMPLATE_URIS = [
  'Task-T/network-layer/private-line-complaint/v1',
  'Task-T/network-layer/ran-energy-saving/v1',
  'Notification-T/network-layer/subscribe-incident/v1',
  'Notification-T/network-layer/service-recovery/v1',
  'Authorization-T/authorization-policy-management/v1',
  'Negotiation-T/information-negotiation/propose/v1',
  'Negotiation-T/information-negotiation/accept-reject/v1',
  'Negotiation-T/target-negotiation/propose/v1',
  'Negotiation-T/target-negotiation/accept-reject/v1',
  'Negotiation-T/feasibility-negotiation/propose/v1',
  'Negotiation-T/feasibility-negotiation/accept-reject/v1',
  'Negotiation-T/common/abort/v1',
]

export const EXTENSION_URIS = {
  'Task-T': 'https://projects.tmforum.org/a2aproject/telecommunication/extensions/Task-T/v1',
  'Notification-T': 'https://projects.tmforum.org/a2aproject/telecommunication/extensions/Notification-T/v1',
  'Authorization-T': 'https://projects.tmforum.org/a2aproject/telecommunication/extensions/Authorization-T/v1',
  'Negotiation-T': 'https://projects.tmforum.org/a2aproject/telecommunication/extensions/Negotiation-T/v1',
}

// crypto.randomUUID 仅在安全上下文（HTTPS/localhost）可用，调测台常以 HTTP 访问，需兜底
export function uuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function')
    ? crypto.getRandomValues(new Uint8Array(16))
    : Uint8Array.from({ length: 16 }, () => Math.floor(Math.random() * 256))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export const PLACEHOLDER_PROMPT = '<在此粘贴 A2A-T 渲染后的 prompt 文本>'

export function buildExampleRequest(templateUri, promptText, partsText) {
  const metadata = { templateUri }
  if (!templateUri.startsWith('Negotiation-T')) {
    metadata[EXTENSION_URIS[templateUri.split('/')[0]]] = promptText || PLACEHOLDER_PROMPT
  }
  return {
    message: {
      messageId: uuid(),
      role: 'ROLE_USER',
      parts: [{ text: partsText || 'debug request' }],
      metadata,
    },
  }
}
