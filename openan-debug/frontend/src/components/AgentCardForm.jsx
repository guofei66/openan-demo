import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'

const NAME_RE = /^[a-zA-Z0-9_-]+(?:\s+[a-zA-Z0-9_-]+)*$/
const BINDINGS = ['HTTP+JSON', 'GRPC']
const MAX_EXTENSIONS = 10
const MAX_SKILLS = 100
const MAX_INTERFACES = 3

// 常量数组只存 i18n key，展示文案在消费处经 t() 解析。
const REFERENCE_EXTENSIONS = [
  { uri: 'https://projects.tmforum.org/a2aproject/telecommunication/extensions/Task-T/v1', descriptionKey: 'agentCard.refExt.taskT' },
  { uri: 'https://projects.tmforum.org/a2aproject/telecommunication/extensions/Notification-T/v1', descriptionKey: 'agentCard.refExt.notificationT' },
  { uri: 'https://projects.tmforum.org/a2aproject/telecommunication/extensions/Authorization-T/v1', descriptionKey: 'agentCard.refExt.authorizationT' },
  { uri: 'https://projects.tmforum.org/a2aproject/telecommunication/extensions/Negotiation-T/v1', descriptionKey: 'agentCard.refExt.negotiationT' },
]

function splitCsv(text) {
  return (text || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

// 模块级工具函数：优先使用调用方传入的 t，缺省回退到 i18n 单例。
function resolveT(t) {
  return typeof t === 'function' ? t : (key, opts) => i18n.t(key, opts)
}

function Field({ label, hint, full, children }) {
  return (
    <div className={`form-field${full ? ' full' : ''}`}>
      <label className="form-label">{label}</label>
      {children}
      {hint && <div className="form-hint">{hint}</div>}
    </div>
  )
}

export function emptyAgentCard(t) {
  const tr = resolveT(t)
  return {
    name: '',
    version: '1.0.0',
    description: '',
    provider: { organization: '', url: '' },
    capabilities: { streaming: true, pushNotifications: false, extensions: REFERENCE_EXTENSIONS.map((ext) => ({ uri: ext.uri, description: tr(ext.descriptionKey) })) },
    skills: [],
    supportedInterfaces: [{ url: '', protocolBinding: 'HTTP+JSON', protocolVersion: '1.0.0' }],
    defaultInputModes: [],
    defaultOutputModes: [],
  }
}

function toForm(card) {
  const source = card || {}
  const provider = source.provider || {}
  const capabilities = source.capabilities || {}
  return {
    name: source.name || '',
    version: source.version || '',
    description: source.description || '',
    providerOrganization: provider.organization || '',
    providerUrl: provider.url || '',
    streaming: !!capabilities.streaming,
    pushNotifications: !!capabilities.pushNotifications,
    extensions: (capabilities.extensions || []).map((ext) => ({
      uri: ext.uri || '',
      description: ext.description || '',
    })),
    skills: (source.skills || []).map((skill) => ({
      id: skill.id || '',
      name: skill.name || '',
      description: skill.description || '',
      tags: (skill.tags || []).join(', '),
    })),
    interfaces: (source.supportedInterfaces || []).map((itf) => ({
      url: itf.url || '',
      protocolBinding: itf.protocolBinding || 'HTTP+JSON',
      protocolVersion: itf.protocolVersion || '',
    })),
    defaultInputModes: (source.defaultInputModes || []).join(', '),
    defaultOutputModes: (source.defaultOutputModes || []).join(', '),
  }
}

function toCard(form) {
  const card = {
    name: form.name.trim(),
    version: form.version.trim(),
    description: form.description.trim(),
    provider: { organization: form.providerOrganization.trim() },
    capabilities: {
      streaming: form.streaming,
      pushNotifications: form.pushNotifications,
      extensions: form.extensions
        .filter((ext) => ext.uri.trim())
        .map((ext) => ({ uri: ext.uri.trim(), description: ext.description.trim() })),
    },
    skills: form.skills.map((skill) => ({
      id: skill.id.trim(),
      name: skill.name.trim(),
      description: skill.description.trim(),
      tags: splitCsv(skill.tags),
    })),
    supportedInterfaces: form.interfaces.map((itf) => ({
      url: itf.url.trim(),
      protocolBinding: itf.protocolBinding,
      protocolVersion: itf.protocolVersion.trim(),
    })),
    defaultInputModes: splitCsv(form.defaultInputModes),
    defaultOutputModes: splitCsv(form.defaultOutputModes),
  }
  if (form.providerUrl.trim()) card.provider.url = form.providerUrl.trim()
  return card
}

export function validateAgentCard(card, t) {
  const tr = resolveT(t)
  const errors = []
  const source = card || {}
  const provider = source.provider || {}
  const capabilities = source.capabilities || {}
  const skills = source.skills || []
  const interfaces = source.supportedInterfaces || []
  const extensions = capabilities.extensions || []
  if (!source.name) errors.push(tr('agentCard.error.nameRequired'))
  else if (source.name.length > 100) errors.push(tr('agentCard.error.nameTooLong', { max: 100 }))
  else if (!NAME_RE.test(source.name)) errors.push(tr('agentCard.error.nameInvalid'))
  if (!source.description) errors.push(tr('agentCard.error.descriptionRequired'))
  else if (source.description.length > 1000) errors.push(tr('agentCard.error.descriptionTooLong', { max: 1000 }))
  if (!source.version) errors.push(tr('agentCard.error.versionRequired'))
  else if (source.version.length > 50) errors.push(tr('agentCard.error.versionTooLong', { max: 50 }))
  if (!provider.organization) errors.push(tr('agentCard.error.providerOrganizationRequired'))
  if (skills.length === 0) errors.push(tr('agentCard.error.skillsRequired'))
  skills.forEach((skill, index) => {
    if (!skill.id) errors.push(tr('agentCard.error.skillFieldRequired', { index: index + 1, field: 'id' }))
    if (!skill.name) errors.push(tr('agentCard.error.skillFieldRequired', { index: index + 1, field: 'name' }))
    if (!skill.description) errors.push(tr('agentCard.error.skillFieldRequired', { index: index + 1, field: 'description' }))
  })
  if (interfaces.length === 0) errors.push(tr('agentCard.error.interfacesRequired'))
  else if (interfaces.length > MAX_INTERFACES) errors.push(tr('agentCard.error.interfacesTooMany', { max: MAX_INTERFACES }))
  interfaces.forEach((itf, index) => {
    if (!itf.url) errors.push(tr('agentCard.error.interfaceFieldRequired', { index: index + 1, field: 'url' }))
    if (!itf.protocolBinding) errors.push(tr('agentCard.error.interfaceFieldRequired', { index: index + 1, field: 'protocolBinding' }))
  })
  if (extensions.length > MAX_EXTENSIONS) errors.push(tr('agentCard.error.extensionsTooMany', { max: MAX_EXTENSIONS }))
  extensions.forEach((ext, index) => {
    if (!ext.uri) errors.push(tr('agentCard.error.extensionUriRequired', { index: index + 1 }))
  })
  return errors
}

export default function AgentCardForm({ value, onChange }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(() => toForm(value))
  const lastEmitted = useRef(null)

  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value
      setForm(toForm(value))
    }
  }, [value])

  function patchForm(patch) {
    const next = { ...form, ...patch }
    setForm(next)
    const card = toCard(next)
    lastEmitted.current = card
    onChange(card)
  }

  function updateExtension(index, patch) {
    patchForm({ extensions: form.extensions.map((ext, i) => (i === index ? { ...ext, ...patch } : ext)) })
  }

  function updateSkill(index, patch) {
    patchForm({ skills: form.skills.map((skill, i) => (i === index ? { ...skill, ...patch } : skill)) })
  }

  function updateInterface(index, patch) {
    patchForm({ interfaces: form.interfaces.map((itf, i) => (i === index ? { ...itf, ...patch } : itf)) })
  }

  return (
    <div className="agentcard-form">
      <div className="form-section"><span>{t('agentCard.section.basic')}</span></div>
      <div className="form-grid">
        <Field label={t('agentCard.field.name')} hint={t('agentCard.field.nameHint')}>
          <input value={form.name} onChange={(e) => patchForm({ name: e.target.value })} placeholder={t('agentCard.field.namePlaceholder')} />
        </Field>
        <Field label={t('agentCard.field.version')} hint={t('agentCard.field.versionHint')}>
          <input value={form.version} onChange={(e) => patchForm({ version: e.target.value })} placeholder={t('agentCard.field.versionPlaceholder')} />
        </Field>
        <Field full label={t('agentCard.field.description')} hint={t('agentCard.field.descriptionHint')}>
          <textarea rows={3} value={form.description} onChange={(e) => patchForm({ description: e.target.value })} placeholder={t('agentCard.field.descriptionPlaceholder')} />
        </Field>
      </div>
      <div className="form-section"><span>{t('agentCard.section.provider')}</span></div>
      <div className="form-grid">
        <Field label={t('agentCard.field.organization')}>
          <input value={form.providerOrganization} onChange={(e) => patchForm({ providerOrganization: e.target.value })} placeholder={t('agentCard.field.organizationPlaceholder')} />
        </Field>
        <Field label={t('agentCard.field.providerUrl')}>
          <input value={form.providerUrl} onChange={(e) => patchForm({ providerUrl: e.target.value })} placeholder={t('agentCard.field.providerUrlPlaceholder')} />
        </Field>
      </div>
      <div className="form-section"><span>{t('agentCard.section.capabilities')}</span></div>
      <div className="form-checks">
        <label className="form-check">
          <input type="checkbox" checked={form.streaming} onChange={(e) => patchForm({ streaming: e.target.checked })} />
          <span>streaming</span>
        </label>
        <label className="form-check">
          <input type="checkbox" checked={form.pushNotifications} onChange={(e) => patchForm({ pushNotifications: e.target.checked })} />
          <span>pushNotifications</span>
        </label>
      </div>
      <div className="form-section">
        <span>{t('agentCard.section.extensions')}</span>
        <span className="form-counter">{form.extensions.length}/{MAX_EXTENSIONS}</span>
      </div>
      {form.extensions.map((ext, index) => (
        <div key={index} className="sub-card">
          <div className="sub-head">
            <span className="sub-index">#{index + 1}</span>
            <button className="btn ghost small sub-remove" title={t('common.delete')} onClick={() => patchForm({ extensions: form.extensions.filter((_, i) => i !== index) })}>✕</button>
          </div>
          <div className="form-grid">
            <Field full label={t('agentCard.ext.uri')} hint={t('agentCard.ext.uriHint')}>
              <input className="mono-input" value={ext.uri} onChange={(e) => updateExtension(index, { uri: e.target.value })} placeholder="https://projects.tmforum.org/a2aproject/telecommunication/extensions/Task-T/v1" />
            </Field>
            <Field full label={t('agentCard.ext.description')}>
              <input value={ext.description} onChange={(e) => updateExtension(index, { description: e.target.value })} placeholder={t('agentCard.ext.descriptionPlaceholder')} />
            </Field>
          </div>
        </div>
      ))}
      {form.extensions.length === 0 && <div className="muted" style={{ marginBottom: 8 }}>{t('agentCard.ext.empty')}</div>}
      <button className="btn ghost small" onClick={() => patchForm({ extensions: [...form.extensions, { uri: '', description: '' }] })} disabled={form.extensions.length >= MAX_EXTENSIONS}>{t('agentCard.ext.add')}</button>
      <div className="form-section">
        <span>{t('agentCard.section.skills')}</span>
        <span className="form-counter">{form.skills.length}/{MAX_SKILLS}</span>
      </div>
      {form.skills.map((skill, index) => (
        <div key={index} className="sub-card">
          <div className="sub-head">
            <span className="sub-index">#{index + 1}</span>
            <button className="btn ghost small sub-remove" title={t('agentCard.skill.remove')} onClick={() => patchForm({ skills: form.skills.filter((_, i) => i !== index) })}>✕</button>
          </div>
          <div className="form-grid">
            <Field label={t('agentCard.skill.id')} hint={t('agentCard.skill.hint')}>
              <input className="mono-input" value={skill.id} onChange={(e) => updateSkill(index, { id: e.target.value })} placeholder={t('agentCard.skill.idPlaceholder')} />
            </Field>
            <Field label={t('agentCard.skill.name')}>
              <input value={skill.name} onChange={(e) => updateSkill(index, { name: e.target.value })} placeholder={t('agentCard.skill.namePlaceholder')} />
            </Field>
            <Field full label={t('agentCard.skill.description')}>
              <textarea rows={2} value={skill.description} onChange={(e) => updateSkill(index, { description: e.target.value })} placeholder={t('agentCard.skill.descriptionPlaceholder')} />
            </Field>
            <Field full label={t('agentCard.skill.tags')}>
              <input value={skill.tags} onChange={(e) => updateSkill(index, { tags: e.target.value })} placeholder={t('agentCard.skill.tagsPlaceholder')} />
            </Field>
          </div>
        </div>
      ))}
      {form.skills.length === 0 && <div className="muted" style={{ marginBottom: 8 }}>{t('agentCard.skill.empty')}</div>}
      <button className="btn ghost small" onClick={() => patchForm({ skills: [...form.skills, { id: '', name: '', description: '', tags: '' }] })} disabled={form.skills.length >= MAX_SKILLS}>{t('agentCard.skill.add')}</button>
      <div className="form-section">
        <span>{t('agentCard.section.interfaces')}</span>
        <span className="form-counter">{form.interfaces.length}/{MAX_INTERFACES}</span>
      </div>
      <div className="iface-table">
        <div className="iface-row iface-head">
          <span>{t('agentCard.iface.url')}</span>
          <span>{t('agentCard.iface.binding')}</span>
          <span>{t('agentCard.iface.version')}</span>
          <span />
        </div>
        {form.interfaces.map((itf, index) => (
          <div className="iface-row" key={index}>
            <input className="mono-input" value={itf.url} onChange={(e) => updateInterface(index, { url: e.target.value })} placeholder={t('agentCard.iface.urlPlaceholder')} />
            <select value={itf.protocolBinding} onChange={(e) => updateInterface(index, { protocolBinding: e.target.value })}>
              {BINDINGS.map((binding) => (
                <option key={binding} value={binding}>{binding}</option>
              ))}
            </select>
            <input className="mono-input" value={itf.protocolVersion} onChange={(e) => updateInterface(index, { protocolVersion: e.target.value })} placeholder={t('agentCard.iface.versionPlaceholder')} />
            <button type="button" className="icon-btn" title={t('agentCard.iface.remove')} disabled={form.interfaces.length <= 1} onClick={() => patchForm({ interfaces: form.interfaces.filter((_, i) => i !== index) })}>✕</button>
          </div>
        ))}
      </div>
      {form.interfaces.length === 0 && <div className="muted" style={{ marginBottom: 8 }}>{t('agentCard.iface.empty')}</div>}
      <button type="button" className="btn ghost small" onClick={() => patchForm({ interfaces: [...form.interfaces, { url: '', protocolBinding: 'HTTP+JSON', protocolVersion: '1.0.0' }] })} disabled={form.interfaces.length >= MAX_INTERFACES}>{t('agentCard.iface.add')}</button>
      <div className="form-hint">{t('agentCard.iface.hint')}</div>
      <div className="form-section"><span>{t('agentCard.section.modes')}</span></div>
      <div className="form-grid">
        <Field label={t('agentCard.mode.input')} hint={t('agentCard.mode.hint')}>
          <input value={form.defaultInputModes} onChange={(e) => patchForm({ defaultInputModes: e.target.value })} placeholder={t('agentCard.mode.placeholder')} />
        </Field>
        <Field label={t('agentCard.mode.output')} hint={t('agentCard.mode.hint')}>
          <input value={form.defaultOutputModes} onChange={(e) => patchForm({ defaultOutputModes: e.target.value })} placeholder={t('agentCard.mode.placeholder')} />
        </Field>
      </div>
    </div>
  )
}
