import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PostmanConsole from '../components/PostmanConsole.jsx'
import DatasetRequestPicker from '../components/DatasetRequestPicker.jsx'
import { api } from '../api.js'
import Layout from '../Layout.jsx'
import { EXTENSION_URIS, TEMPLATE_URIS, buildExampleRequest, uuid } from '../templates.js'

function shortLabel(uri) {
  const [family, , name] = uri.split('/')
  return `${family} · ${name}`
}

const DEFAULT_TEMPLATE = TEMPLATE_URIS[0]

// 常量数组只存 i18n key（labelKey/noteKey/labelValues），渲染处经 t() 解析（见 A2aConsole）
const ENDPOINTS = [
  {
    key: 'send',
    labelKey: 'console.endpoint.send',
    method: 'POST',
    path: '/message:send',
    noteKey: 'console.endpoint.sendNote',
  },
  ...TEMPLATE_URIS.map((uri) => ({
    key: uri,
    label: shortLabel(uri),
    method: 'POST',
    path: '/message:send',
    noteKey: 'console.endpoint.templateNote',
  })),
]

const FOLDERS = [
  { key: 'a2a', labelKey: 'console.folder.a2a', items: ['send'] },
  ...[...new Set(TEMPLATE_URIS.map((uri) => uri.split('/')[0]))].map((family) => ({
    key: family,
    labelKey: 'console.folder.template',
    labelValues: { name: family },
    items: TEMPLATE_URIS.filter((uri) => uri.startsWith(`${family}/`)),
  })),
]

function A2aConsole() {
  const { t } = useTranslation()
  const [instances, setInstances] = useState([])
  const [target, setTarget] = useState('')
  const [instanceError, setInstanceError] = useState('')
  const [traceExamples, setTraceExamples] = useState([])

  const loadInstances = useCallback(async () => {
    try {
      const data = await api.get('/debug/api/v1/mock-instances')
      setInstances(data.instances || [])
      setInstanceError('')
    } catch (err) {
      setInstanceError(err.message || t('console.msg.loadInstancesFailed'))
    }
  }, [t])

  useEffect(() => {
    loadInstances()
    const timer = setInterval(loadInstances, 5000)
    return () => clearInterval(timer)
  }, [loadInstances])

  useEffect(() => {
    api.get('/debug/api/v1/console/trace-prompts')
      .then((data) => setTraceExamples(data.examples || []))
      .catch(() => setTraceExamples([]))
  }, [])

  // 按当前模板解析实采示例（自动匹配该模板的实采条目），使示例请求与提取的请求报文 body 完全一致
  function resolveExample(templateUri) {
    return traceExamples.find((ex) => ex.templateUri === templateUri) || null
  }

  const selectedInstance = instances.find((item) => item.id === target) || null

  // —— 数据集请求生成：选中智能体后，从其关联数据集挑一条对，自动生成请求报文 ——
  const [assocList, setAssocList] = useState([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [injectSignal, setInjectSignal] = useState(null)
  useEffect(() => {
    api.get('/debug/api/v1/console/datasets/agent-associations')
      .then((d) => setAssocList(d.associations || []))
      .catch(() => setAssocList([]))
  }, [])
  const activeAssoc = useMemo(() => {
    if (!target) return null
    return assocList.find((a) => a.instanceId === target) || null
  }, [target, assocList])
  const pickerAgentRowId = activeAssoc ? activeAssoc.agentRowId : null
  const pickerTemplates = activeAssoc && activeAssoc.scoped
    ? activeAssoc.templates.map((tpl) => tpl.templateUri)
    : null
  function buildRequestFromPair(pair) {
    const extUri = EXTENSION_URIS[pair.protocol] || ''
    const metadata = { templateUri: pair.templateUri }
    if (extUri) metadata[extUri] = pair.requestPrompt
    return {
      message: {
        messageId: uuid(),
        role: 'ROLE_USER',
        parts: [{ text: pair.partsText || t('console.dataset.taskPrompt', { name: pair.scenario || '' }), metadata: {} }],
        metadata,
      },
    }
  }
  function onPickDatasetPair(pair) {
    setPickerOpen(false)
    setInjectSignal({ token: Date.now(), body: buildRequestFromPair(pair) })
  }

  async function sendAdapter(payload) {
    const payload2 = { request: payload.body, note: payload.body?.message?.metadata?.templateUri || payload.path }
    if (target) payload2.instanceId = target
    const result = await api.post('/debug/api/v1/console/send', payload2)
    return { status: 200, kind: 'json', body: result }
  }

  function extractRequest(item) {
    const rb = item.requestBody || {}
    const note = rb.note
    // console/send 记录：requestBody = {note, request}
    if (rb.request !== undefined) {
      return {
        method: 'POST',
        path: '/message:send',
        body: rb.request,
        endpointKey: 'send',
        rowLabel: note || item.templateUri,
      }
    }
    // Mock Agent 入站记录（direction=inbound）：requestBody = {templateUri, promptText, negotiationContext, requestedExtensions}
    // 重建为可回发的标准报文体（与 SDK MetadataContent 契约一致）
    const templateUri = rb.templateUri || item.templateUri || ''
    const promptText = rb.promptText || ''
    const extUri = (Array.isArray(rb.requestedExtensions) && rb.requestedExtensions[0])
      || EXTENSION_URIS[templateUri.split('/')[0]]
      || ''
    const metadata = {}
    if (templateUri) metadata.templateUri = templateUri
    if (extUri && promptText) metadata[extUri] = promptText
    if (rb.negotiationContext) metadata.negotiationContext = rb.negotiationContext
    return {
      method: 'POST',
      path: '/message:send',
      body: {
        message: {
          messageId: uuid(),
          role: 'ROLE_USER',
          parts: [{ text: note || templateUri || 'inbound replay', metadata: {} }],
          metadata,
        },
      },
      endpointKey: 'send',
      rowLabel: t('console.row.inbound', { name: templateUri || note || item.templateUri }),
    }
  }

  const targetLabel = selectedInstance
    ? `${selectedInstance.name} · :${selectedInstance.port}${selectedInstance.healthy ? '' : t('console.state.notRunning')}`
    : t('console.target.builtinDefault')

  // 常量数组中的 key 在渲染处解析为当前语言文案
  const endpoints = useMemo(() => ENDPOINTS.map((e) => ({
    ...e,
    label: e.labelKey ? t(e.labelKey) : e.label,
    note: t(e.noteKey),
  })), [t])
  const folders = useMemo(() => FOLDERS.map((f) => ({
    key: f.key,
    label: t(f.labelKey, f.labelValues || {}),
    items: f.items,
  })), [t])

  const topbarExtra = (
    <>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('console.targetUnderTest')}</span>
      <select
        className="agent-trigger"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        style={{ paddingRight: 24 }}
      >
        <option value="">{t('console.target.builtinWithPath')}</option>
        {instances.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name} · :{item.port}{item.healthy ? t('console.state.running') : t('console.state.notRunning')}
          </option>
        ))}
      </select>
      {traceExamples.length > 0 && (
        <span className="muted" style={{ fontSize: 12, marginLeft: 10 }}>
          {t('console.hint.realTrafficOrDataset')}
        </span>
      )}
      {instanceError && <span className="error-text" style={{ fontSize: 12 }}>{instanceError}</span>}
      <button
        type="button"
        className="btn small"
        style={{ marginLeft: 10 }}
        onClick={() => setPickerOpen(true)}
        title={t('console.dataset.buttonTitle')}
      >
        {t('console.dataset.button')}
      </button>
      <DatasetRequestPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        agentRowId={pickerAgentRowId}
        templates={pickerTemplates}
        onPick={onPickDatasetPair}
      />
    </>
  )

  return (
    <PostmanConsole
      feature="a2at"
      title={t('console.title')}
      subtitle={t('console.subtitle')}
      targetKey="mockAgent"
      targetLabel="mockAgent"
      targetOverride={targetLabel}
      endpoints={endpoints}
      folders={folders}
      buildExample={(endpoint) => {
        const templateUri = endpoint.key === 'send' ? DEFAULT_TEMPLATE : endpoint.key
        const ex = resolveExample(templateUri)
        return buildExampleRequest(templateUri, ex ? ex.promptText : '', ex ? ex.partsText : '')
      }}
      sendAdapter={sendAdapter}
      extractRequest={extractRequest}
      topbarExtra={topbarExtra}
      injectSignal={injectSignal}
    />
  )
}

export default function ConsolePage() {
  return (
    <Layout>
      <A2aConsole />
    </Layout>
  )
}
