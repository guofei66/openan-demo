import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api.js'
import { readJwtPayload } from '../jwt.js'
import Layout from '../Layout.jsx'
import JsonView from '../JsonView.jsx'
import OdaDeployModal from './OdaDeployModal.jsx'

function PairDetailBody({ pair }) {
  const { t } = useTranslation()
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div className="muted" style={{ fontSize: 12 }}>
        {t('settingsAgents.templateLabel')}<code>{pair.templateUri}</code> · pairId: {pair.pairId}
      </div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <strong style={{ fontSize: 13 }}>{t('settingsAgents.requestTitle')}</strong>
          <span style={{ flex: 1 }} />
          <button className="btn ghost small" onClick={() => navigator.clipboard?.writeText(pair.requestPrompt)}>{t('settingsAgents.copy')}</button>
        </div>
        <pre className="pair-body">{pair.requestPrompt}</pre>
      </div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <strong style={{ fontSize: 13 }}>{t('settingsAgents.responseTitle')}</strong>
        </div>
        <pre className="pair-body pair-body-response">{pair.responseText}</pre>
      </div>
      {pair.source && <div className="muted" style={{ fontSize: 12 }}>{t('settingsAgents.sourceLabel')}{pair.source}</div>}
    </div>
  )
}

function AssocPairBrowser({ agentRowId, templates }) {
  const { t, i18n } = useTranslation()
  const lang = (i18n.language || 'zh').startsWith('en') ? 'en' : 'zh'
  const [ds, setDs] = useState('expanded')
  const [data, setData] = useState(null)
  const [page, setPage] = useState(1)
  const [tpl, setTpl] = useState('全部')
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState(null)
  const [err, setErr] = useState('')
  const pageSize = 20

  useEffect(() => {
    if (!agentRowId) return
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), agentId: String(agentRowId), lang })
    if (tpl !== '全部') params.set('templateUri', tpl)
    if (query.trim()) params.set('q', query.trim())
    setData(null)
    api.get(`/debug/api/v1/console/datasets/${ds}/pairs?${params.toString()}`)
      .then(setData)
      .catch((e) => setErr(e.message || String(e)))
  }, [ds, page, tpl, query, agentRowId, lang])

  useEffect(() => { setPage(1); setOpenId(null) }, [ds, tpl, query, agentRowId])

  if (!agentRowId) {
    return <div className="muted">{t('settingsAgents.notStartedHint')}</div>
  }
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {t('settingsAgents.datasetLabel')}
          <select value={ds} onChange={(e) => setDs(e.target.value)}>
            <option value="expanded">{t('settingsAgents.expandedDataset')}</option>
            <option value="seed">{t('settingsAgents.seedDataset')}</option>
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 220 }}>
          {t('settingsAgents.templateFilterLabel')}
          <select value={tpl} onChange={(e) => setTpl(e.target.value)} style={{ flex: 1 }}>
            <option value="全部">{t('settingsAgents.all')}</option>
            {(templates || []).map((tplUri) => <option key={tplUri} value={tplUri}>{tplUri}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {t('settingsAgents.keywordLabel')}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('settingsAgents.searchPlaceholder')} />
          <button className="btn small" onClick={() => setQuery(q)}>{t('common.search')}</button>
        </label>
        <span className="badge blue">{data ? t('settingsAgents.pairCount', { n: data.total }) : '…'}</span>
      </div>
      {err && <div className="error-text">{err}</div>}
      <div style={{ display: 'grid', gap: 8 }}>
        {(data ? data.items : []).map((item) => (
          <div key={item.pairId} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <button
              type="button"
              className="pair-card-header"
              onClick={() => setOpenId(openId === item.pairId ? null : item.pairId)}
              style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer', boxSizing: 'border-box' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 14px' }}>
                <span className="mono-text" style={{ fontSize: 12 }}>{item.pairId}</span>
                <span style={{ fontWeight: 600 }}>{item.scenario}</span>
                <span className="muted" style={{ fontSize: 12, flex: 1, minWidth: 120 }}>{item.requestPromptPreview}</span>
                <span className="nav-caret" style={{ transform: openId === item.pairId ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
              </div>
            </button>
            {openId === item.pairId && (
              <div style={{ padding: '0 14px 14px' }}>
                <PairDetailBody pair={item} />
              </div>
            )}
          </div>
        ))}
        {data && data.items.length === 0 && <div className="muted">{t('settingsAgents.noMatchingPairs')}</div>}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn ghost small" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>{t('settingsAgents.prevPage')}</button>
        <span className="muted" style={{ fontSize: 12 }}>{t('settingsAgents.pageInfo', { page, totalPages })}</span>
        <button className="btn ghost small" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>{t('settingsAgents.nextPage')}</button>
      </div>
    </div>
  )
}

export default function SettingsAgentsPage() {
  const { t } = useTranslation()
  const [instances, setInstances] = useState([])
  const [definePath, setDefinePath] = useState('')
  const [instanceError, setInstanceError] = useState('')
  const [instBusy, setInstBusy] = useState('')
  const [instModal, setInstModal] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [odaModal, setOdaModal] = useState(false)
  const [assocs, setAssocs] = useState([])
  const isAdmin = readJwtPayload().role === 'admin'

  const loadInstances = useCallback(async () => {
    try {
      const data = await api.get('/debug/api/v1/mock-instances')
      setInstances(data.instances || [])
      setDefinePath(data.definePath || '')
      setInstanceError('')
    } catch (err) {
      setInstanceError(err.message || t('settingsAgents.listLoadFailed'))
    }
  }, [t])

  useEffect(() => {
    loadInstances()
    api.get('/debug/api/v1/console/datasets/agent-associations')
      .then((d) => setAssocs(d.associations || []))
      .catch(() => {})
    const timer = setInterval(loadInstances, 5000)
    return () => clearInterval(timer)
  }, [loadInstances])

  const assocByInstance = Object.fromEntries(assocs.map((a) => [a.instanceId, a]))

  // 表格批量选择（按实例 id；列表自动刷新后保持已勾选）
  const allRowIds = instances.map((i) => i.id)
  const allChecked = allRowIds.length > 0 && allRowIds.every((id) => selectedIds.includes(id))
  const toggleRow = (id, on) =>
    setSelectedIds((cur) => (on ? (cur.includes(id) ? cur : [...cur, id]) : cur.filter((x) => x !== id)))
  const toggleAll = (on) => setSelectedIds(on ? allRowIds : [])

  async function instanceAction(instance, action) {
    setInstanceError('')
    setInstBusy(instance.id + ':' + action)
    try {
      await api.post(`/debug/api/v1/mock-instances/${instance.id}/${action}`)
      await loadInstances()
    } catch (err) {
      setInstanceError(err.message || t('settingsAgents.actionFailed'))
    } finally {
      setInstBusy('')
    }
  }

  async function showInstanceLogs(instance) {
    setInstModal({ mode: 'logs', title: t('settingsAgents.instanceLogsTitle', { name: instance.name }), text: t('common.loading') })
    try {
      const text = await api.getText(`/debug/api/v1/mock-instances/${instance.id}/logs?lines=200`)
      setInstModal({ mode: 'logs', title: t('settingsAgents.instanceLogsTitle', { name: instance.name }), text: text || t('settingsAgents.noLogs') })
    } catch (err) {
      setInstModal({ mode: 'logs', title: t('settingsAgents.instanceLogsTitle', { name: instance.name }), text: t('settingsAgents.logsLoadFailed', { message: err.message }) })
    }
  }

  async function showInstanceCard(instance) {
    setInstModal({ mode: 'card', title: `AgentCard · ${instance.name}`, card: null, error: '' })
    try {
      const card = await api.get(`/debug/api/v1/mock-instances/${instance.id}/card`)
      setInstModal({ mode: 'card', title: `AgentCard · ${instance.name}`, card, error: '' })
    } catch (err) {
      setInstModal({ mode: 'card', title: `AgentCard · ${instance.name}`, card: null, error: err.message || t('settingsAgents.cardLoadFailed') })
    }
  }

  function showInstanceAssoc(instance, assoc) {
    setInstModal({ mode: 'assoc', title: t('settingsAgents.datasetAssocTitle', { name: instance.name }), assoc })
  }

  function assocTotal(assoc) {
    return (assoc?.pairCounts?.seed || 0) + (assoc?.pairCounts?.expanded || 0)
  }

  return (
    <Layout>
      <h2>{t('settingsAgents.title')}</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        {t('settingsAgents.descPrefix')}
        <code>config/mock_agent_define.json</code>
        {t('settingsAgents.descMiddle')}
        <code>http://{'{host}'}:{'{port}'}</code>
        {t('settingsAgents.descSuffix')}
      </p>
      <div className="card">
        <h2>{t('settingsAgents.stubInstancesTitle')}</h2>
        <p className="muted" style={{ marginBottom: 10 }}>
          {t('settingsAgents.stubDescPrefix')}
          <code>{definePath || 'config/mock_agent_define.json'}</code>
          {t('settingsAgents.stubDescSuffix')}
          {instanceError && <span className="error-text" style={{ marginLeft: 8 }}>{instanceError}</span>}
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '4px 0 10px' }}>
          <span className="badge blue">{t('settingsAgents.selectedCount', { selected: selectedIds.length, total: instances.length })}</span>
          {isAdmin && (
            <button
              className="btn"
              disabled={selectedIds.length === 0}
              title={selectedIds.length === 0 ? t('settingsAgents.selectDeployFirst') : ''}
              onClick={() => setOdaModal(true)}
            >
              {t('settingsAgents.deployToOda')}
            </button>
          )}
          {isAdmin && selectedIds.length === 0 && (
            <span className="muted" style={{ fontSize: 12 }}>{t('settingsAgents.deployHint')}</span>
          )}
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  aria-label={t('settingsAgents.selectAllAria')}
                  checked={allChecked}
                  onChange={(e) => toggleAll(e.target.checked)}
                />
              </th>
              <th>{t('settingsAgents.colInstanceId')}</th>
              <th>{t('settingsAgents.colName')}</th>
              <th>{t('settingsAgents.colEndpoint')}</th>
              <th>{t('settingsAgents.colWorkDir')}</th>
              <th>{t('settingsAgents.colModel')}</th>
              <th>{t('settingsAgents.colAssoc')}</th>
              <th>{t('settingsAgents.colStatus')}</th>
              <th>{t('settingsAgents.colActions')}</th>
            </tr>
          </thead>
          <tbody>
            {instances.map((instance) => (
              <tr key={instance.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={t('settingsAgents.selectRowAria', { name: instance.name })}
                    checked={selectedIds.includes(instance.id)}
                    onChange={(e) => toggleRow(instance.id, e.target.checked)}
                  />
                </td>
                <td className="mono-text">{instance.id}</td>
                <td>{instance.name}<div className="muted" style={{ fontSize: 12 }}>{instance.description}</div></td>
                <td className="mono-text">{instance.endpoint}</td>
                <td className="mono-text" style={{ fontSize: 12 }}>{instance.workDir}</td>
                <td>
                  {instance.llm.enabled
                    ? <span><span className="badge indigo">{t('settingsAgents.llmMode')}</span><div className="muted" style={{ fontSize: 12 }}>{instance.llm.model}<br />{instance.llm.baseUrl}</div></span>
                    : <span className="badge neutral">{t('settingsAgents.datasetMode')}</span>}
                  {instance.workflow && instance.workflow.enabled && (
                    <div style={{ marginTop: 4 }}><span className="badge blue">{t('settingsAgents.workflowMode', { id: instance.workflow.workflowId })}</span></div>
                  )}
                </td>
                <td>
                  {(() => {
                    const a = assocByInstance[instance.id]
                    if (!a) return <span className="muted" style={{ fontSize: 12 }}>…</span>
                    const total = (a.pairCounts?.seed || 0) + (a.pairCounts?.expanded || 0)
                    return (
                      <span style={{ whiteSpace: 'nowrap' }}>
                        <span className="badge blue">{t('settingsAgents.seedBadge', { n: a.pairCounts?.seed || 0 })}</span>
                        <span className="badge indigo" style={{ marginLeft: 4 }}>{t('settingsAgents.expandedBadge', { n: a.pairCounts?.expanded || 0 })}</span>
                        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                          {a.scoped ? t('settingsAgents.tplSummary', { tplCount: a.templateCount, pairTotal: total }) : t('settingsAgents.unscoped')}
                        </div>
                        <button className="btn ghost small" style={{ marginTop: 2 }} onClick={() => showInstanceAssoc(instance, a)}>{t('settingsAgents.details')}</button>
                      </span>
                    )
                  })()}
                </td>
                <td>
                  <span className={`badge ${instance.healthy ? 'success' : (instance.running ? 'danger' : 'neutral')}`}>
                    {instance.healthy ? t('settingsAgents.statusRunning') : (instance.running ? t('settingsAgents.statusAbnormal') : t('settingsAgents.statusStopped'))}
                  </span>
                  {instance.agentId && <span className="badge indigo" style={{ marginLeft: 6 }}>Agent#{instance.agentId}</span>}
                </td>
                <td>
                  {isAdmin && !instance.running && (
                    <button className="btn small" disabled={instBusy === instance.id + ':start'} onClick={() => instanceAction(instance, 'start')}>
                      {instBusy === instance.id + ':start' ? t('settingsAgents.starting') : t('settingsAgents.start')}
                    </button>
                  )}
                  {isAdmin && instance.running && (
                    <button className="btn danger small" disabled={instBusy === instance.id + ':stop'} onClick={() => instanceAction(instance, 'stop')}>
                      {instBusy === instance.id + ':stop' ? t('settingsAgents.stopping') : t('settingsAgents.stop')}
                    </button>
                  )}
                  <button className="btn ghost small" style={{ marginLeft: 6 }} onClick={() => showInstanceLogs(instance)}>{t('settingsAgents.logsBtn')}</button>
                  <button className="btn ghost small" style={{ marginLeft: 6 }} onClick={() => showInstanceCard(instance)}>{t('settingsAgents.cardBtn')}</button>
                </td>
              </tr>
            ))}
            {instances.length === 0 && (
              <tr><td colSpan={9}><span className="muted">{t('settingsAgents.noInstances')}</span></td></tr>
            )}
          </tbody>
        </table>
      </div>
      {odaModal && (
        <OdaDeployModal
          initialAgents={selectedIds}
          onClose={() => setOdaModal(false)}
        />
      )}
      {instModal && (
        <div className="modal-overlay" onClick={() => setInstModal(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 style={{ marginBottom: 0 }}>{instModal.title}</h2>
              <button className="btn ghost small" onClick={() => setInstModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {instModal.mode === 'logs' && (
                <pre className="json" style={{ maxHeight: '55vh', whiteSpace: 'pre-wrap' }}>{instModal.text}</pre>
              )}
              {instModal.mode === 'card' && (
                <>
                  {instModal.error && <div className="error-text">{instModal.error}</div>}
                  {instModal.card && <JsonView value={instModal.card} className="json" style={{ maxHeight: '55vh' }} />}
                </>
              )}
              {instModal.mode === 'assoc' && instModal.assoc && (
                <div style={{ display: 'grid', gap: 10 }}>
                  <p className="muted" style={{ margin: 0 }}>
                    {t('settingsAgents.assocScopeDesc')}
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {!instModal.assoc.scoped && <div className="badge indigo">{t('settingsAgents.unscopedFull')}</div>}
                    <span className="badge blue">{t('settingsAgents.seedTotal', { n: instModal.assoc.pairCounts?.seed || 0 })}</span>
                    <span className="badge indigo">{t('settingsAgents.expandedTotal', { n: instModal.assoc.pairCounts?.expanded || 0 })}</span>
                    {instModal.assoc.agentRowId && (
                      <span className="badge neutral">Agent#{instModal.assoc.agentRowId}{instModal.assoc.agentEnabled ? '' : t('settingsAgents.agentRowDisabled')}</span>
                    )}
                  </div>
                  <div>
                    <table>
                      <thead>
                        <tr>
                          <th>{t('settingsAgents.colTemplate')}</th>
                          <th>{t('settingsAgents.seedDataset')}</th>
                          <th>{t('settingsAgents.expandedDataset')}</th>
                          <th>{t('settingsAgents.colTotal')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(instModal.assoc.templates || []).map((tplRow) => (
                          <tr key={tplRow.templateUri}>
                            <td className="mono-text" style={{ fontSize: 12 }}>{tplRow.templateUri}</td>
                            <td>{t('settingsAgents.pairCount', { n: tplRow.seed })}</td>
                            <td>{t('settingsAgents.pairCount', { n: tplRow.expanded })}</td>
                            <td><strong>{t('settingsAgents.pairCount', { n: tplRow.seed + tplRow.expanded })}</strong></td>
                          </tr>
                        ))}
                        {(instModal.assoc.templates || []).length === 0 && (
                          <tr><td colSpan={4}><span className="muted">{t('settingsAgents.noAssocTemplates')}</span></td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <h3 style={{ margin: '4px 0 8px' }}>{t('settingsAgents.pairBrowserTitle')}</h3>
                    <AssocPairBrowser agentRowId={instModal.assoc.agentRowId} templates={(instModal.assoc.templates || []).map((tplRow) => tplRow.templateUri)} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
