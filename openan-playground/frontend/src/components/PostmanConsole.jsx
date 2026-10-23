import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api.js'
import AgentCardForm, { emptyAgentCard, validateAgentCard } from './AgentCardForm.jsx'
import JsonView from '../JsonView.jsx'

const METHOD_OPTIONS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
const STATUS_TEXT = {
  200: 'OK', 201: 'Created', 204: 'No Content',
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
  405: 'Method Not Allowed', 409: 'Conflict', 422: 'Unprocessable Entity',
  500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable',
}

function statusText(status) {
  return STATUS_TEXT[status] || ''
}

function formatSize(bytes) {
  if (bytes == null) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function parseQuery(path) {
  const idx = path.indexOf('?')
  if (idx < 0) return { base: path, params: [] }
  const raw = path.slice(idx + 1)
  const params = raw.split('&').filter(Boolean).map((pair) => {
    const eq = pair.indexOf('=')
    const key = eq < 0 ? pair : pair.slice(0, eq)
    const value = eq < 0 ? '' : pair.slice(eq + 1)
    const decode = (text) => { try { return decodeURIComponent(text) } catch { return text } }
    return { key: decode(key), value: decode(value), enabled: true }
  })
  return { base: path.slice(0, idx), params }
}

function buildPath(base, params) {
  const query = params
    .filter((item) => item.enabled && item.key.trim())
    .map((item) => `${encodeURIComponent(item.key.trim())}=${encodeURIComponent(item.value)}`)
    .join('&')
  return query ? `${base}?${query}` : base
}

function shortTime(iso) {
  if (!iso) return '-'
  return iso.replace('T', ' ').slice(5, 19)
}

function MethodChip({ method }) {
  return <span className={`pm-method ${(method || 'GET').toLowerCase()}`}>{method || 'GET'}</span>
}

function ParamTable({ rows, onChange, keyPlaceholder, valuePlaceholder, descPlaceholder }) {
  const { t } = useTranslation()
  function patch(index, patchData) {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patchData } : row))
    const last = next[next.length - 1]
    if (last && (last.key.trim() || (patchData.value !== undefined && last.value.trim()))) {
      next.push({ key: '', value: '', enabled: true })
    }
    onChange(next)
  }
  function remove(index) {
    onChange(rows.filter((_, i) => i !== index))
  }
  return (
    <div className="pm-kv-table">
      <div className="pm-kv-row pm-kv-title">
        <span />
        <span>{keyPlaceholder}</span>
        <span>{valuePlaceholder}</span>
        <span>{t('postman.colDesc')}</span>
        <span />
      </div>
      {rows.map((row, index) => (
        <div className="pm-kv-row" key={index}>
          <input type="checkbox" checked={row.enabled} onChange={(e) => patch(index, { enabled: e.target.checked })} title={t('postman.toggleEnable')} />
          <input className="kv-input mono-text" value={row.key} placeholder={keyPlaceholder} onChange={(e) => patch(index, { key: e.target.value })} />
          <input className="kv-input mono-text" value={row.value} placeholder={valuePlaceholder} onChange={(e) => patch(index, { value: e.target.value })} />
          <input className="kv-input" value={row.desc || ''} placeholder={descPlaceholder} onChange={(e) => patch(index, { desc: e.target.value })} />
          <button type="button" className="kv-del" title={t('common.delete')} onClick={() => remove(index)}>✕</button>
        </div>
      ))}
      {rows.length === 0 && <div className="muted" style={{ padding: '4px 0 8px' }}>{t('postman.noEntries')}</div>}
      <div>
        <button type="button" className="btn ghost small" onClick={() => onChange([...rows, { key: '', value: '', enabled: true }])}>+ {t('postman.add')}</button>
      </div>
    </div>
  )
}

function headerRows(endpoint) {
  const defaults = endpoint && endpoint.defaultHeaders ? Object.entries(endpoint.defaultHeaders) : []
  const rows = defaults.map(([key, value]) => ({ key, value: String(value), enabled: true }))
  return rows.length ? [...rows, { key: '', value: '', enabled: true }] : [{ key: '', value: '', enabled: true }]
}

export default function PostmanConsole({
  feature,
  title,
  subtitle,
  targetKey,
  targetLabel,
  endpoints,
  folders,
  footer,
  enableAgentCard = false,
  sendAdapter,
  extractRequest,
  buildExample,
  topbarExtra,
  targetOverride,
  injectSignal,
}) {
  const { t } = useTranslation()
  // labelKey/noteKey 在渲染层解析（endpoints.js 是模块级常量，无法直接用 hook）
  const localize = (item) => ({
    ...item,
    label: item.labelKey ? t(item.labelKey) : item.label,
    note: item.noteKey ? t(item.noteKey) : item.note,
  })
  const EP_MAP = Object.fromEntries(endpoints.map((item) => [item.key, localize(item)]))
  const FOLDER_TREE = folders && folders.length
    ? folders
    : [{ key: 'endpoints', label: t('postman.collections'), items: endpoints.map((item) => item.key) }]
  const PROXY_URL = `/debug/api/v1/debug-proxy/${feature}`
  const HISTORY_URL = `/debug/api/v1/history?feature=${feature}&limit=100`

  const [sidebarTab, setSidebarTab] = useState('collections')
  const [openFolders, setOpenFolders] = useState(() => new Set(FOLDER_TREE.map((f) => f.key)))
  const [selectedKey, setSelectedKey] = useState(endpoints[0] ? endpoints[0].key : '')
  const endpoint = EP_MAP[selectedKey]

  const [method, setMethod] = useState(endpoint ? endpoint.method : 'GET')
  const [urlPath, setUrlPath] = useState(endpoint ? endpoint.path : '')
  const [params, setParams] = useState([])
  const [headers, setHeaders] = useState(() => headerRows(endpoints[0]))
  const [reqTab, setReqTab] = useState('params')

  const [bodyMode, setBodyMode] = useState('json')
  const [bodyPreview, setBodyPreview] = useState(false)
  const [bodyText, setBodyText] = useState(endpoint && endpoint.exampleBody ? JSON.stringify(endpoint.exampleBody, null, 2) : '')
  const [cardObj, setCardObj] = useState(null)
  const [samples, setSamples] = useState(null)
  const [sampleKey, setSampleKey] = useState('')
  const [loadOrg, setLoadOrg] = useState('')
  const [loadName, setLoadName] = useState('')
  const [loadingCard, setLoadingCard] = useState(false)

  const [targets, setTargets] = useState(null)
  const [response, setResponse] = useState(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [respTab, setRespTab] = useState('body')
  const [copied, setCopied] = useState(false)
  const [actionHint, setActionHint] = useState(null)

  const [history, setHistory] = useState([])
  const [historyError, setHistoryError] = useState('')
  const [historyKey, setHistoryKey] = useState(0)
  const [activeHistId, setActiveHistId] = useState(null)
  const sendRef = useRef(null)

  const baseUrl = targets ? (targets[targetKey] || t('postman.unknown')) : t('common.loading')
  const pathBase = urlPath.split('?')[0]
  const enabledParamCount = params.filter((item) => item.enabled && item.key.trim()).length
  const enabledHeaderCount = headers.filter((item) => item.enabled && item.key.trim()).length
  const hasBody = method !== 'GET' && method !== 'DELETE'
  const isCardEndpoint = enableAgentCard && endpoint.bodyEditor === 'agentcard'

  useEffect(() => {
    api.get('/debug/api/v1/settings/service-urls').then(setTargets).catch(() => setTargets({}))
  }, [])

  // 外部注入请求报文（如数据集请求生成器）：token 变化即回填 body
  useEffect(() => {
    if (!injectSignal || injectSignal.token == null) return
    setActiveHistId(null)
    setResponse(null)
    setError('')
    setBodyMode('json')
    setBodyPreview(false)
    setReqTab('body')
    setBodyText(injectSignal.body != null ? JSON.stringify(injectSignal.body, null, 2) : '')
  }, [injectSignal && injectSignal.token])

  useEffect(() => {
    if (!isCardEndpoint || samples) return
    api.get('/debug/api/v1/registry/samples')
      .then((data) => setSamples(Array.isArray(data) ? data : []))
      .catch(() => setSamples([]))
  }, [isCardEndpoint, samples])

  const loadHistory = useCallback(() => {
    api.get(HISTORY_URL)
      .then((data) => {
        setHistory(Array.isArray(data && data.items) ? data.items : [])
        setHistoryError('')
      })
      .catch((err) => setHistoryError((err && err.message) || t('postman.loadFailed')))
  }, [HISTORY_URL])

  useEffect(() => {
    loadHistory()
  }, [historyKey, loadHistory])

  // 后端部署重启期间加载失败时，窗口重新获得焦点自动重试，避免历史列表卡在空态
  useEffect(() => {
    const onFocus = () => loadHistory()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [loadHistory])

  const refreshHistory = loadHistory

  function applyEndpoint(next) {
    setSelectedKey(next.key)
    setMethod(next.method)
    setUrlPath(next.path)
    setParams(parseQuery(next.path).params)
    const exampleText = buildExample
      ? JSON.stringify(buildExample(next), null, 2)
      : (next.exampleBody ? JSON.stringify(next.exampleBody, null, 2) : '')
    setBodyText(exampleText)
    setBodyPreview(false)
    setBodyMode(next.bodyEditor === 'agentcard' ? 'form' : 'json')
    setCardObj(next.bodyEditor === 'agentcard' ? emptyAgentCard() : null)
    setHeaders(headerRows(next))
    setError('')
    setActiveHistId(null)
    setResponse(null)
    setSampleKey('')
  }

  function onUrlChange(value) {
    setUrlPath(value)
    setParams(parseQuery(value).params)
    setActiveHistId(null)
  }

  function onParamsChange(next) {
    setParams(next)
    setUrlPath(buildPath(pathBase, next))
  }

  function switchToForm() {
    setError('')
    if (bodyMode === 'form') return
    if (!bodyText.trim()) {
      setCardObj(emptyAgentCard())
      setBodyMode('form')
      return
    }
    let parsed
    try {
      parsed = JSON.parse(bodyText)
    } catch {
      setError(t('postman.jsonParseError'))
      return
    }
    const raw = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (Array.isArray(parsed.agentCards) && parsed.agentCards.length ? parsed.agentCards[0] : parsed)
      : {}
    setCardObj({ ...emptyAgentCard(), ...(raw && typeof raw === 'object' ? raw : {}) })
    setBodyMode('form')
  }

  function switchToJson() {
    setError('')
    if (bodyMode === 'json') return
    setBodyText(JSON.stringify({ agentCards: [cardObj || emptyAgentCard()] }, null, 2))
    setBodyMode('json')
  }

  function loadSample(key) {
    setSampleKey(key)
    setError('')
    if (!key) {
      setCardObj(emptyAgentCard())
      return
    }
    const sample = (samples || []).find((item) => item.key === key)
    if (sample && sample.card) setCardObj(JSON.parse(JSON.stringify(sample.card)))
  }

  async function loadExistingCard() {
    setError('')
    if (!loadOrg.trim() || !loadName.trim()) {
      setError(t('postman.enterOrgAndName'))
      return
    }
    setLoadingCard(true)
    try {
      const resp = await api.post(PROXY_URL, {
        method: 'GET',
        path: `/rest/v1/registry-center/agent-cards/${encodeURIComponent(loadOrg.trim())}/${encodeURIComponent(loadName.trim())}`,
      })
      if (resp.status !== 200) {
        setError(t('postman.loadFailedHttp', { status: resp.status }))
      } else if (resp.kind === 'json' && resp.body && resp.body.agentCards?.[0]) {
        setCardObj({ ...emptyAgentCard(), ...resp.body.agentCards[0] })
      } else {
        setError(t('postman.cardNotFound'))
      }
    } catch (err) {
      setError(err.message || t('postman.loadFailed'))
    } finally {
      setLoadingCard(false)
    }
  }

  async function send() {
    setError('')
    setActiveHistId(null)
    setActionHint(null)
    const payload = { method, path: urlPath.trim() }
    const headerObj = {}
    headers.forEach((item) => {
      if (item.enabled && item.key.trim()) headerObj[item.key.trim()] = item.value
    })
    if (Object.keys(headerObj).length > 0) payload.headers = headerObj
    if (isCardEndpoint && bodyMode === 'form') {
      const validationErrors = validateAgentCard(cardObj)
      if (validationErrors.length > 0) {
        setError(validationErrors.join(t('postman.errorSeparator')))
        return
      }
      payload.body = { agentCards: [cardObj] }
    } else if (hasBody) {
      let parsed
      if (bodyText.trim()) {
        try {
          parsed = JSON.parse(bodyText)
        } catch (err) {
          setError(t('postman.invalidBodyJson', { message: err.message }))
          return
        }
      }
      if (parsed !== undefined) payload.body = parsed
    }
    setSending(true)
    try {
      const result = sendAdapter ? await sendAdapter(payload) : await api.post(PROXY_URL, payload)
      setResponse(result)
      setRespTab('body')
      refreshHistory()
      if (enableAgentCard) {
        const detail = result && result.kind === 'json' && result.body
          ? (typeof result.body.detail === 'string' && result.body.detail)
            || (Array.isArray(result.body?.errors?.error) && result.body.errors.error[0]?.errorMessage)
            || null
          : null
        if (result.status === 409 && typeof detail === 'string' && detail.includes('duplicate agent')) {
          const match = detail.match(/duplicate agent \((.*),\s*([^)]+)\)\s*$/)
          if (match) setActionHint({ name: match[1].trim(), org: match[2].trim() })
        }
      }
    } catch (err) {
      setError(err.message || t('postman.sendFailed'))
    } finally {
      setSending(false)
    }
  }

  sendRef.current = send

  function switchToUpdate() {
    if (!actionHint) return
    const { org, name } = actionHint
    const updateEp = EP_MAP['update'] || endpoint
    setSelectedKey(updateEp.key)
    setMethod('PUT')
    setUrlPath(`/rest/v1/registry-center/agent-cards/${encodeURIComponent(org)}/${encodeURIComponent(name)}`)
    setParams([])
    setError('')
    setActiveHistId(null)
    setActionHint(null)
    setReqTab('body')
  }

  async function deleteAndReregister() {
    if (!actionHint || sending) return
    const { org, name } = actionHint
    setActionHint(null)
    setError('')
    setSending(true)
    try {
      const del = await api.post(PROXY_URL, {
        method: 'DELETE',
        path: `/rest/v1/registry-center/agent-cards/${encodeURIComponent(org)}/${encodeURIComponent(name)}`,
      })
      setResponse(del)
      setRespTab('body')
      refreshHistory()
    } catch (err) {
      setError(err.message || t('postman.deregisterFailed'))
      setSending(false)
      return
    }
    setSending(false)
    send()
  }

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        if (!sendRef.current.sending) sendRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function openHistoryItem(item) {
    const req = item.requestBody || {}
    const extracted = extractRequest ? (extractRequest(item) || {}) : null
    const histMethod = (extracted && extracted.method) || req.method || 'GET'
    const histPath = (extracted && extracted.path) || req.path || ''
    const matched = endpoints.find((ep) => ep.path === histPath.split('?')[0] && ep.method === histMethod)
    const nextEndpoint = extracted && extracted.endpointKey && EP_MAP[extracted.endpointKey]
      ? EP_MAP[extracted.endpointKey]
      : (matched ? localize(matched) : undefined)
    if (nextEndpoint) setSelectedKey(nextEndpoint.key)
    setMethod(histMethod)
    setUrlPath(histPath)
    setParams(parseQuery(histPath).params)
    const reqHeaders = req.headers && typeof req.headers === 'object' ? req.headers : {}
    const rows = Object.entries(reqHeaders).map(([key, value]) => ({ key, value: String(value), enabled: true }))
    setHeaders(rows.length ? [...rows, { key: '', value: '', enabled: true }] : [{ key: '', value: '', enabled: true }])
    setError('')
    setResponse(null)
    setActiveHistId(item.id)
    const bodyValue = extracted && extracted.body !== undefined
      ? extracted.body
      : (req.body !== undefined ? req.body : req)
    const cardMode = enableAgentCard && (isCardEndpoint || (nextEndpoint && nextEndpoint.bodyEditor === 'agentcard'))
    setBodyPreview(true)
    if (cardMode) {
      const card = bodyValue && Array.isArray(bodyValue.agentCards) ? bodyValue.agentCards[0] : null
      if (card) {
        setCardObj({ ...emptyAgentCard(), ...card })
        setBodyMode('form')
      } else {
        setCardObj(emptyAgentCard())
        setBodyMode('form')
      }
    } else {
      setBodyMode('json')
      setBodyText(bodyValue != null ? JSON.stringify(bodyValue, null, 2) : '')
    }
    const rawResp = item.responseBody
    let saved = null
    if (rawResp && rawResp.response) {
      saved = { ...rawResp.response, latencyMs: item.latencyMs }
    } else if (rawResp && typeof rawResp === 'object' && !Array.isArray(rawResp)) {
      // 兼容 Mock Agent 入站记录：response_body 为 {state, message, artifact, replyMetadata} 且无 .response 包装
      saved = {
        status: rawResp.status ?? null,
        kind: rawResp.kind || 'json',
        body: rawResp.body !== undefined ? rawResp.body : rawResp,
        latencyMs: item.latencyMs,
      }
    }
    if (saved) {
      setResponse(saved)
      setRespTab('body')
    }
  }

  function newRequest() {
    applyEndpoint(EP_MAP[selectedKey])
  }

  function toggleFolder(key) {
    setOpenFolders((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function bodyPreviewText() {
    if (!response) return ''
    if (response.kind === 'stream') return response.transcript || ''
    if (response.kind === 'json') return JSON.stringify(response.body, null, 2)
    return typeof response.body === 'string' ? response.body : JSON.stringify(response.body, null, 2)
  }

  async function copyResponse() {
    const text = respTab === 'raw' ? JSON.stringify(response, null, 2) : bodyPreviewText()
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  const responseSize = response ? new Blob([bodyPreviewText() || '']).size : null
  const statusClass = !response ? 'neutral' : (response.status >= 200 && response.status < 300 ? 'ok' : 'err')

  return (
    <div className="pm-page">
      <aside className="pm-sidebar">
        <div className="pm-sidebar-tabs">
          <button className={`pm-tab-btn${sidebarTab === 'collections' ? ' active' : ''}`} onClick={() => setSidebarTab('collections')}>{t('postman.collections')}</button>
          <button className={`pm-tab-btn${sidebarTab === 'history' ? ' active' : ''}`} onClick={() => setSidebarTab('history')}>{t('postman.history')} {history.length > 0 && <span className="pm-count">{history.length}</span>}</button>
        </div>
        <div className="pm-sb-actions">
          <button className="btn small" onClick={newRequest}>＋ {t('postman.newRequest')}</button>
        </div>
        <div className="pm-sidebar-body">
          {sidebarTab === 'collections' ? (
            FOLDER_TREE.map((folder) => (
              <div className="pm-folder" key={folder.key}>
                <button className="pm-folder-head" onClick={() => toggleFolder(folder.key)}>
                  <span className={`pm-caret${openFolders.has(folder.key) ? ' open' : ''}`}>▶</span>
                  {folder.label}
                  <span className="pm-folder-count">{folder.items.length}</span>
                </button>
                {openFolders.has(folder.key) && (
                  <div className="pm-folder-items">
                    {folder.items.map((key) => (
                      <div
                        key={key}
                        className={`pm-endpoint${selectedKey === key && !activeHistId ? ' active' : ''}`}
                        onClick={() => applyEndpoint(EP_MAP[key])}
                      >
                        <MethodChip method={EP_MAP[key].method} />
                        <span className="pm-ep-label" title={EP_MAP[key].label}>{EP_MAP[key].label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="pm-hist">
              <div className="pm-hist-head">
                <span>{t('postman.recentRequests')}</span>
                <button className="btn ghost small" onClick={() => setHistoryKey((key) => key + 1)}>↻ {t('common.refresh')}</button>
              </div>
              {historyError && <div className="pm-hist-error">{t('postman.historyLoadFailed', { error: historyError })}</div>}
              {history.map((item) => {
                const status = item.responseBody
                  ? (item.responseBody.status ?? (item.responseBody.state != null ? 200 : null))
                  : null
                const extracted = extractRequest ? (extractRequest(item) || {}) : null
                const rowMethod = (extracted && extracted.method) || (item.requestBody && item.requestBody.method)
                const rowPath = (extracted && (extracted.rowLabel || extracted.path)) || (item.requestBody && (item.requestBody.path || item.requestBody.note)) || item.templateUri
                return (
                  <div
                    key={item.id}
                    className={`pm-hist-item${activeHistId === item.id ? ' active' : ''}`}
                    onClick={() => openHistoryItem(item)}
                  >
                    <div className="pm-hist-line">
                      <MethodChip method={rowMethod} />
                      <span className="pm-hist-path" title={rowPath}>{rowPath || '-'}</span>
                    </div>
                    <div className="pm-hist-meta">
                      <span className={`dot ${status == null ? 'neutral' : (status >= 200 && status < 300 ? 'ok' : 'err')}`} />
                      <span>{status == null ? '-' : status}</span>
                      <span>{item.latencyMs != null ? `${item.latencyMs}ms` : ''}</span>
                      <span style={{ marginLeft: 'auto' }}>{shortTime(item.createdAt)}</span>
                    </div>
                  </div>
                )
              })}
              {!historyError && history.length === 0 && <div className="muted" style={{ padding: 8 }}>{t('postman.noHistory')}</div>}
            </div>
          )}
        </div>
      </aside>

      <section className="pm-main">
        <div className="pm-topbar">
          <div>
            <div className="pm-title">{title}</div>
            <div className="pm-sub">{subtitle}</div>
          </div>
          <div className="pm-topbar-side">
            {topbarExtra && <div className="pm-topbar-extra">{topbarExtra}</div>}
            <div className="pm-target">
              {t('postman.targetService')} <code>{`{{${targetLabel}}}`}</code>
              <span className="pm-target-url" title={targetOverride || baseUrl}>{targetOverride || baseUrl}</span>
            </div>
          </div>
        </div>

        {activeHistId != null && (
          <div className="pm-hist-banner">
            {t('postman.viewingHistory', { id: activeHistId })}
            <button className="btn ghost small" onClick={() => setActiveHistId(null)}>{t('common.close')}</button>
          </div>
        )}

        <div className="pm-urlbar">
          <select
            className={`pm-method-select ${method.toLowerCase()}`}
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            {METHOD_OPTIONS.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <span className="pm-base-chip" title={t('postman.targetAddress', { url: baseUrl })}>{`{{${targetLabel}}}`}</span>
          <input
            className="pm-path-input"
            value={urlPath}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="/rest/v1/..."
            spellCheck={false}
          />
          <button className="pm-send" onClick={send} disabled={sending}>{sending ? t('postman.sending') : t('postman.send')}</button>
        </div>

        {endpoint.note && <div className="pm-note">🛈 {endpoint.note}</div>}
        {error && <div className="error-text pm-inline-error">{error}</div>}
        {actionHint && (
          <div className="pm-action-hint">
            <span>
              {t('postman.dupCardPrefix')}<b>{actionHint.org} / {actionHint.name}</b>{t('postman.dupCardSuffix')}
            </span>
            <button className="btn small" onClick={switchToUpdate}>{t('postman.switchToUpdate')}</button>
            <button className="btn small" onClick={deleteAndReregister} disabled={sending}>{t('postman.deregisterAndReregister')}</button>
            <button className="btn ghost small" onClick={() => setActionHint(null)}>{t('postman.ignore')}</button>
          </div>
        )}

        <div className="pm-split">
          <div className="pm-split-left">
        <div className="pm-req-tabs">
          <button className={`pm-req-tab${reqTab === 'params' ? ' active' : ''}`} onClick={() => setReqTab('params')}>
            Params{enabledParamCount > 0 && <span className="pm-count">{enabledParamCount}</span>}
          </button>
          <button className={`pm-req-tab${reqTab === 'headers' ? ' active' : ''}`} onClick={() => setReqTab('headers')}>
            Headers{enabledHeaderCount > 0 && <span className="pm-count">{enabledHeaderCount}</span>}
          </button>
          <button className={`pm-req-tab${reqTab === 'body' ? ' active' : ''}`} onClick={() => setReqTab('body')}>
            Body
          </button>
        </div>

        <div className="pm-req-body">
          {reqTab === 'params' && (
            <ParamTable
              rows={params}
              onChange={onParamsChange}
              keyPlaceholder="name / organization …"
              valuePlaceholder={t('postman.value')}
              descPlaceholder={t('postman.optionalDesc')}
            />
          )}
          {reqTab === 'headers' && (
            <>
              <div className="pm-hint-line">{t('postman.headerHint')}</div>
              <ParamTable
                rows={headers}
                onChange={setHeaders}
                keyPlaceholder={t('postman.headerKeyPlaceholder')}
                valuePlaceholder={t('postman.value')}
                descPlaceholder={t('postman.optionalDesc')}
              />
            </>
          )}
          {reqTab === 'body' && (
            isCardEndpoint ? (
              <>
                <div className="tab-pills" style={{ marginBottom: 10 }}>
                  <button className={`tab-pill${bodyMode === 'form' ? ' active' : ''}`} onClick={switchToForm}>{t('postman.formEdit')}</button>
                  <button className={`tab-pill${bodyMode === 'json' ? ' active' : ''}`} onClick={switchToJson}>raw · JSON</button>
                </div>
                {bodyMode === 'form' ? (
                  <>
                    <div className="pm-form-toolbar">
                      <select value={sampleKey} onChange={(e) => loadSample(e.target.value)} title={t('postman.loadSample')} style={{ maxWidth: 220 }}>
                        <option value="">{t('postman.loadSampleOption')}</option>
                        {(samples || []).map((item) => (
                          <option key={item.key} value={item.key}>{item.label}</option>
                        ))}
                      </select>
                      <span className="toolbar-divider" />
                      <input style={{ width: 140 }} placeholder={t('postman.orgPlaceholder')} value={loadOrg} onChange={(e) => setLoadOrg(e.target.value)} />
                      <input style={{ width: 140 }} placeholder={t('postman.namePlaceholder')} value={loadName} onChange={(e) => setLoadName(e.target.value)} />
                      <button className="btn ghost small" title={t('postman.loadCardTitle')} onClick={loadExistingCard} disabled={loadingCard}>{t('postman.loadExistingCard')}</button>
                    </div>
                    <AgentCardForm value={cardObj || emptyAgentCard()} onChange={setCardObj} />
                  </>
                ) : (
                  <>
                    <div className="pm-body-toolbar">
                      <span className="pm-body-label">raw · JSON</span>
                      <div className="tab-pills">
                        <button className={`tab-pill${!bodyPreview ? ' active' : ''}`} onClick={() => setBodyPreview(false)}>{t('postman.edit')}</button>
                        <button className={`tab-pill${bodyPreview ? ' active' : ''}`} onClick={() => setBodyPreview(true)}>{t('postman.highlightPreview')}</button>
                      </div>
                    </div>
                    {bodyPreview ? (
                      <JsonView value={bodyText} className="pm-code pm-json-preview" />
                    ) : (
                      <textarea
                        className="pm-json-area"
                        value={bodyText}
                        onChange={(e) => setBodyText(e.target.value)}
                        placeholder='{"agentCards": [...]}'
                        spellCheck={false}
                      />
                    )}
                  </>
                )}
              </>
            ) : hasBody ? (
              <>
                <div className="pm-body-toolbar">
                  <span className="pm-body-label">raw · JSON</span>
                  <div className="tab-pills">
                    <button className={`tab-pill${!bodyPreview ? ' active' : ''}`} onClick={() => setBodyPreview(false)}>{t('postman.edit')}</button>
                    <button className={`tab-pill${bodyPreview ? ' active' : ''}`} onClick={() => setBodyPreview(true)}>{t('postman.highlightPreview')}</button>
                  </div>
                </div>
                {bodyPreview ? (
                  <JsonView value={bodyText} className="pm-code pm-json-preview" />
                ) : (
                  <textarea
                    className="pm-json-area"
                    value={bodyText}
                    onChange={(e) => setBodyText(e.target.value)}
                    placeholder={endpoint.exampleBody ? t('postman.bodyPlaceholder') : t('postman.bodyPlaceholderOptional')}
                    spellCheck={false}
                  />
                )}
              </>
            ) : (
              <div className="muted">{t('postman.noBody', { method })}</div>
            )
          )}
        </div>
          </div>
          <div className="pm-split-right">
        <div className="pm-response">
          <div className="pm-resp-head">
            {response ? (
              <>
                <span className={`pm-resp-status ${statusClass}`}>
                  {response.status === 0 ? t('postman.transferFailed') : `${response.status} ${statusText(response.status)}`.trim()}
                </span>
                <span className="pm-resp-meta">{response.latencyMs != null ? `${response.latencyMs} ms` : '-'}</span>
                <span className="pm-resp-meta">{formatSize(responseSize)}</span>
                <span className="kind-chip">{response.kind || '-'}</span>
                {response.contentType && <span className="pm-resp-meta">{response.contentType.split(';')[0]}</span>}
              </>
            ) : (
              <span className="pm-resp-status neutral">{t('postman.response')}</span>
            )}
            <div className="pm-resp-tabs">
              {response && (
                <>
                  <button className={`pm-req-tab${respTab === 'body' ? ' active' : ''}`} onClick={() => setRespTab('body')}>Body</button>
                  <button className={`pm-req-tab${respTab === 'raw' ? ' active' : ''}`} onClick={() => setRespTab('raw')}>{t('postman.rawResponse')}</button>
                  <button className="btn ghost small" onClick={copyResponse}>{copied ? t('postman.copied') : t('postman.copy')}</button>
                </>
              )}
            </div>
          </div>
          <div className="pm-resp-body">
            {!response ? (
              <div className="pm-empty">
                <div className="pm-empty-icon">⇢</div>
                <div>{t('postman.emptyResponseHint')}</div>
              </div>
            ) : response.status === 0 ? (
              <div className="pm-code error-text">{t('postman.forwardFailed')}{'\n'}{response.body && response.body.error ? response.body.error : ''}</div>
            ) : respTab === 'body' ? (
              response.kind === 'json' ? (
                <JsonView value={response.body} />
              ) : (
                <pre className="pm-code">{response.kind === 'stream' ? response.transcript : (typeof response.body === 'string' ? response.body : JSON.stringify(response.body, null, 2))}</pre>
              )
            ) : (
              <JsonView value={response} />
            )}
          </div>
        </div>
          </div>
        </div>
        {footer}
      </section>
    </div>
  )
}
