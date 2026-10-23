import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api.js'
import Layout from '../Layout.jsx'

const PROTOCOL_COLORS = {
  'Task-T': '#2563eb',
  'Negotiation-T': '#9333ea',
  'Notification-T': '#059669',
  'Authorization-T': '#d97706',
}

// 筛选器“全部”哨兵值：仅 UI 内部使用，不进入 API 参数；渲染时经 t('dataset.all') 显示
const ALL = '__all__'

function FullPair({ pair }) {
  const { t } = useTranslation()
  return (
    <div style={{ padding: '0 16px 16px', display: 'grid', gap: 12 }}>
      <div className="muted" style={{ fontSize: 12 }}>
        {t('dataset.templateUriLabel')}<code>{pair.templateUri}</code>{t('dataset.pairIdLabel')}{pair.pairId}
      </div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <strong>{t('dataset.request')}</strong>
          <span className="muted" style={{ fontSize: 12 }}>parts.text: {pair.partsText}</span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="btn ghost"
            style={{ padding: '2px 10px', fontSize: 12 }}
            onClick={() => navigator.clipboard?.writeText(pair.requestPrompt)}
          >
            {t('dataset.copy')}
          </button>
        </div>
        <pre className="pair-body">{pair.requestPrompt}</pre>
      </div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <strong>{t('dataset.responsePaired')}</strong>
          <span className="muted" style={{ fontSize: 12 }}>artifact.name: {pair.responseArtifactName}</span>
        </div>
        <pre className="pair-body pair-body-response">{pair.responseText}</pre>
      </div>
      {pair.source && <div className="muted" style={{ fontSize: 12 }}>{t('dataset.source', { source: pair.source })}</div>}
    </div>
  )
}

function PairHeader({ pair, open, onToggle, trailing }) {
  const protoColor = PROTOCOL_COLORS[pair.protocol] || '#6b7280'
  return (
    <button
      type="button"
      className="pair-card-header"
      onClick={onToggle}
      style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer', boxSizing: 'border-box' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '12px 16px' }}>
        <span style={{ background: protoColor, color: '#fff', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
          {pair.protocol}
        </span>
        <span style={{ fontWeight: 600 }}>#{pair.order} {pair.scenario}</span>
        <span style={{ flex: 1 }} />
        {trailing}
        <span className="muted" style={{ fontSize: 12 }}>{pair.direction}</span>
        <span className="nav-caret" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
      </div>
    </button>
  )
}

function SeedPairCard({ pair, showWorkOrder = true }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <PairHeader
        pair={pair}
        open={open}
        onToggle={() => setOpen((v) => !v)}
        trailing={showWorkOrder ? <span className="muted" style={{ fontSize: 12 }}>{pair.workOrder}</span> : null}
      />
      {open && <FullPair pair={pair} />}
    </div>
  )
}

function ExpandedPairCard({ dsId, pair }) {
  const { t, i18n } = useTranslation()
  const lang = (i18n.language || 'zh').startsWith('en') ? 'en' : 'zh'
  const [open, setOpen] = useState(false)
  const [full, setFull] = useState(null)
  const [err, setErr] = useState('')
  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && !full) {
      try {
        setFull(await api.get(`/debug/api/v1/console/datasets/${dsId}/pairs/${pair.pairId}?lang=${lang}`))
      } catch (e) {
        setErr(e.message || String(e))
      }
    }
  }
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <PairHeader pair={pair} open={open} onToggle={toggle} trailing={null} />
      {open && (full ? <FullPair pair={full} /> : <div style={{ padding: '0 16px 16px' }} className="muted">{err ? t('dataset.loadFailed', { error: err }) : t('common.loading')}</div>)}
    </div>
  )
}

function SeedTab({ scopeTemplates }) {
  const { t, i18n } = useTranslation()
  const lang = (i18n.language || 'zh').startsWith('en') ? 'en' : 'zh'
  const [dataset, setDataset] = useState(null)
  const [error, setError] = useState('')
  const [workOrder, setWorkOrder] = useState(ALL)
  const [protocol, setProtocol] = useState(ALL)
  useEffect(() => {
    api.get(`/debug/api/v1/console/demo-dataset?lang=${lang}`)
      .then(setDataset)
      .catch((e) => setError(e.message || String(e)))
  }, [lang])
  const workOrders = useMemo(() => (dataset ? [ALL, ...Array.from(new Set(dataset.pairs.map((p) => p.workOrder)))] : []), [dataset])
  const protocols = useMemo(() => (dataset ? [ALL, ...Array.from(new Set(dataset.pairs.map((p) => p.protocol)))] : []), [dataset])
  const pairs = useMemo(() => {
    if (!dataset) return []
    return dataset.pairs.filter((p) => {
      if (workOrder !== ALL && p.workOrder !== workOrder) return false
      if (protocol !== ALL && p.protocol !== protocol) return false
      if (scopeTemplates && !scopeTemplates.includes(p.templateUri)) return false
      return true
    })
  }, [dataset, workOrder, protocol, scopeTemplates])
  if (error) return <div className="card error-text">{t('dataset.loadFailed', { error })}</div>
  if (!dataset) return <div className="muted">{t('common.loading')}</div>
  return (
    <>
      <div className="card" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {t('dataset.workOrder')}
          <select value={workOrder} onChange={(e) => setWorkOrder(e.target.value)}>
            {workOrders.map((w) => <option key={w} value={w}>{w === ALL ? t('dataset.all') : w}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {t('dataset.protocol')}
          <select value={protocol} onChange={(e) => setProtocol(e.target.value)}>
            {protocols.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <span className="badge blue">{t('dataset.pairCount', { total: pairs.length })}</span>
        <span className="muted" style={{ flex: 1, minWidth: 240 }}>{t('dataset.meta.seed.note')}</span>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {pairs.map((p) => <SeedPairCard key={p.pairId} pair={p} showWorkOrder={!scopeTemplates} />)}
      </div>
    </>
  )
}

function ExpandedTab({ agentId }) {
  const { t, i18n } = useTranslation()
  const lang = (i18n.language || 'zh').startsWith('en') ? 'en' : 'zh'
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [protocol, setProtocol] = useState(ALL)
  const [templateUri, setTemplateUri] = useState(ALL)
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), lang })
    if (agentId) params.set('agentId', String(agentId))
    if (protocol !== ALL) params.set('protocol', protocol)
    if (templateUri !== ALL) params.set('templateUri', templateUri)
    if (query.trim()) params.set('q', query.trim())
    setData(null)
    api.get(`/debug/api/v1/console/datasets/expanded/pairs?${params.toString()}`)
      .then(setData)
      .catch((e) => setError(e.message || String(e)))
  }, [page, pageSize, protocol, templateUri, query, agentId, lang])

  useEffect(() => { setPage(1) }, [agentId])

  if (error) return <div className="card error-text">{t('dataset.loadFailed', { error })}</div>
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const scoped = Boolean(agentId) && data && Array.isArray(data.agentScopeTemplates)
  return (
    <>
      <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {t('dataset.protocol')}
          <select value={protocol} onChange={(e) => { setProtocol(e.target.value); setPage(1) }}>
            <option value={ALL}>{t('dataset.all')}</option>
            {(data ? data.protocols : []).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 280 }}>
          {t('dataset.template')}
          <select value={templateUri} onChange={(e) => { setTemplateUri(e.target.value); setPage(1) }} style={{ flex: 1, minWidth: 200 }}>
            <option value={ALL}>{t('dataset.all')}</option>
            {(data ? data.templateUris : []).map((uri) => <option key={uri} value={uri}>{uri}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {t('dataset.keyword')}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('dataset.keywordPlaceholder')} />
          <button type="button" className="btn" onClick={() => { setQuery(q); setPage(1) }}>{t('common.search')}</button>
        </label>
        <span className="badge blue">{data ? t('dataset.pairCount', { total: data.total }) : '…'}</span>
      </div>
      {scoped && (
        <div className="muted" style={{ fontSize: 12, margin: '6px 2px' }}>
          {t('dataset.agentScopeFiltered', { num: data.agentScopeTemplates.length })}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', margin: '10px 2px' }}>
        <button type="button" className="btn ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>{t('dataset.prevPage')}</button>
        <span className="muted">{t('dataset.pageInfo', { page, totalPages })}</span>
        <button type="button" className="btn ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>{t('dataset.nextPage')}</button>
        <span className="muted" style={{ fontSize: 12 }}>
          {t('dataset.expandedHint')}
        </span>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {(data ? data.items : []).map((p) => <ExpandedPairCard key={`${lang}:${p.pairId}`} dsId="expanded" pair={p} />)}
      </div>
    </>
  )
}

export default function DatasetPage() {
  const { t, i18n } = useTranslation()
  const lang = (i18n.language || 'zh').startsWith('en') ? 'en' : 'zh'
  const [tab, setTab] = useState('seed')
  const [meta, setMeta] = useState(null)
  const [assocs, setAssocs] = useState(null)
  const [agentSel, setAgentSel] = useState('')
  const [showAssoc, setShowAssoc] = useState(false)
  useEffect(() => {
    api.get(`/debug/api/v1/console/datasets?lang=${lang}`).then(setMeta).catch(() => {})
    api.get('/debug/api/v1/console/datasets/agent-associations').then(setAssocs).catch(() => {})
  }, [lang])
  const byId = useMemo(() => {
    const m = {}
    for (const d of meta?.datasets || []) m[d.id] = d
    return m
  }, [meta])
  const assocList = assocs?.associations || []
  const selected = assocList.find((a) => `${a.instanceId || ''}:${a.agentRowId || 'default'}` === agentSel) || null
  const scopeTemplates = selected ? (selected.scoped ? selected.templates.map((tpl) => tpl.templateUri) : null) : null
  return (
    <Layout>
      <div className="page">
        <div className="page-header">
          <div>
            <h1>{t('nav.dataset')}</h1>
            <p className="muted">{t('dataset.subtitle')}</p>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className={`btn${tab === 'seed' ? '' : ' ghost'}`} onClick={() => setTab('seed')}>
            {t('dataset.seedTab')}{byId.seed ? t('dataset.pairCountShort', { total: byId.seed.pairCount }) : ''}
          </button>
          <button type="button" className={`btn${tab === 'expanded' ? '' : ' ghost'}`} onClick={() => setTab('expanded')}>
            {t('dataset.expandedTab')}{byId.expanded ? t('dataset.pairCountShort', { total: byId.expanded.pairCount }) : ''}
          </button>
          <span style={{ flex: 1 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {t('dataset.assocAgent')}
            <select value={agentSel} onChange={(e) => setAgentSel(e.target.value)} style={{ minWidth: 190 }}>
              <option value="">{t('dataset.allAgents')}</option>
              {assocList.map((a) => (
                <option key={`${a.instanceId || ''}:${a.agentRowId || 'default'}`} value={`${a.instanceId || ''}:${a.agentRowId || 'default'}`}>
                  {a.name}{a.port ? ` :${a.port}` : ''}{a.scoped ? t('dataset.pairCountShort', { total: a.pairCounts.seed + a.pairCounts.expanded }) : t('dataset.allShort')}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn ghost" onClick={() => setShowAssoc((v) => !v)}>
            {showAssoc ? t('dataset.hideAssocDetail') : t('dataset.assocDetail')}
          </button>
        </div>
        {showAssoc && (
          <div className="card" style={{ display: 'grid', gap: 8 }}>
            {assocList.map((a) => (
              <div key={`${a.instanceId || ''}:${a.agentRowId || 'default'}`} style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', borderBottom: '1px solid rgba(128,128,128,.15)', paddingBottom: 6 }}>
                <strong style={{ minWidth: 170 }}>{a.name}{a.port ? ` :${a.port}` : ''}</strong>
                <span className="badge blue">{t('dataset.seedPairs', { total: a.pairCounts.seed })}</span>
                <span className="badge indigo">{t('dataset.expandedPairs', { total: a.pairCounts.expanded })}</span>
                {a.agentRowId && <span className="muted" style={{ fontSize: 12 }}>Agent#{a.agentRowId}{a.agentEnabled ? '' : t('dataset.agentNotEnabled')}</span>}
                <span className="muted" style={{ fontSize: 12, flex: 1, minWidth: 260 }}>
                  {a.scoped ? a.templates.map((tpl) => tpl.templateUri).join(t('dataset.joiner')) : t('dataset.noScopeHint')}
                </span>
              </div>
            ))}
          </div>
        )}
        <span className="muted" style={{ fontSize: 12, margin: '6px 2px' }}>
          {tab === 'seed' ? t('dataset.meta.seed.source') : t('dataset.meta.expanded.source')}
        </span>
        {tab === 'seed' ? <SeedTab scopeTemplates={scopeTemplates} /> : <ExpandedTab agentId={selected?.agentRowId || null} />}
      </div>
    </Layout>
  )
}
