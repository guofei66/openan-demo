import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api.js'

const PROTOCOL_COLORS = {
  'Task-T': '#2563eb',
  'Negotiation-T': '#9333ea',
  'Notification-T': '#059669',
  'Authorization-T': '#d97706',
}

/**
 * 数据集请求选择器：从（按智能体关联范围过滤的）数据集中选一条请求-响应对，
 * 生成 A2A SendMessageRequest 报文注入调测台。
 */
export default function DatasetRequestPicker({ open, onClose, agentRowId, templates, onPick }) {
  const { t, i18n } = useTranslation()
  const lang = (i18n.language || 'zh').startsWith('en') ? 'en' : 'zh'
  const [ds, setDs] = useState('expanded')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [tpl, setTpl] = useState('全部')
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState(null)
  const [showResponse, setShowResponse] = useState(false)
  const pageSize = 12

  useEffect(() => {
    if (!open) return
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), lang })
    if (agentRowId) params.set('agentId', String(agentRowId))
    if (tpl !== '全部') params.set('templateUri', tpl)
    if (query.trim()) params.set('q', query.trim())
    setData(null)
    setError('')
    api.get(`/debug/api/v1/console/datasets/${ds}/pairs?${params.toString()}`)
      .then(setData)
      .catch((e) => setError(e.message || String(e)))
  }, [open, ds, page, tpl, query, agentRowId, lang])

  useEffect(() => { setPage(1) }, [ds, tpl, query, agentRowId])

  if (!open) return null
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 style={{ marginBottom: 0 }}>{agentRowId ? t('picker.titleWithAgent', { id: agentRowId }) : t('picker.title')}</h2>
          <button className="btn ghost small" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {t('picker.dataset')}
              <select value={ds} onChange={(e) => setDs(e.target.value)}>
                <option value="expanded">{t('picker.expandedDataset')}</option>
                <option value="seed">{t('picker.seedDataset')}</option>
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 220 }}>
              {t('picker.template')}
              <select value={tpl} onChange={(e) => setTpl(e.target.value)} style={{ flex: 1 }}>
                <option value="全部">{t('picker.all')}</option>
                {(templates && templates.length ? templates : (data ? data.templateUris : [])).map((uri) => (
                  <option key={uri} value={uri}>{uri}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {t('picker.keyword')}
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('picker.searchPlaceholder')} />
              <button className="btn small" onClick={() => setQuery(q)}>{t('common.search')}</button>
            </label>
            <span className="badge blue">{data ? t('picker.pairCount', { total: data.total }) : '…'}</span>
          </div>
          {error && <div className="error-text">{error}</div>}
          <div style={{ display: 'grid', gap: 8 }}>
            {(data ? data.items : []).map((item) => {
              const expanded = openId === item.pairId
              return (
                <div key={item.pairId} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div
                    className="pair-card-header"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 14px', cursor: 'pointer' }}
                    onClick={() => { setOpenId(expanded ? null : item.pairId); setShowResponse(false) }}
                    title={t('picker.expandHint')}
                  >
                    <span style={{ background: PROTOCOL_COLORS[item.protocol] || '#6b7280', color: '#fff', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                      {item.protocol}
                    </span>
                    <span className="mono-text" style={{ fontSize: 12 }}>{item.pairId}</span>
                    <span style={{ fontWeight: 600 }}>{item.scenario}</span>
                    <span className="muted" style={{ fontSize: 12, flex: 1, minWidth: 140 }}>{item.requestPromptPreview}</span>
                    <span className="nav-caret" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
                    <button
                      type="button"
                      className="btn small"
                      onClick={(e) => { e.stopPropagation(); onPick(item) }}
                      title={t('picker.pickHint')}
                    >
                      {t('picker.pick')} →
                    </button>
                  </div>
                  {expanded && (
                    <div style={{ padding: '10px 14px 14px', display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <strong style={{ fontSize: 13 }}>{t('picker.requestMessage')}</strong>
                        <span style={{ flex: 1 }} />
                        <button className="btn ghost small" onClick={() => navigator.clipboard?.writeText(item.requestPrompt)}>{t('picker.copy')}</button>
                        <button className="btn ghost small" onClick={() => setShowResponse((v) => !v)}>
                          {showResponse ? t('picker.hideResponse') : t('picker.showResponse')}
                        </button>
                      </div>
                      <pre className="pair-body">{item.requestPrompt}</pre>
                      {showResponse && (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <strong style={{ fontSize: 13 }}>{t('picker.pairedResponse')}</strong>
                            <span className="muted" style={{ fontSize: 12 }}>artifact.name: {item.responseArtifactName}</span>
                          </div>
                          <pre className="pair-body pair-body-response">{item.responseText}</pre>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            {data && data.items.length === 0 && <div className="muted">{t('picker.noPairs')}</div>}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn ghost small" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>{t('picker.prevPage')}</button>
            <span className="muted" style={{ fontSize: 12 }}>{t('picker.pageInfo', { page, total: totalPages })}</span>
            <button className="btn ghost small" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>{t('picker.nextPage')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
