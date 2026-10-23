import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api.js'

const EMPTY = {
  apiServer: '', token: '', namespace: 'components', insecureTLS: true,
  image: '', publicUrl: '', jwtSecret: '', adminPassword: '',
  release: 'openan-mockagent', componentId: 'TMFC900', apiVersion: 'v1beta3',
  storageSize: '2Gi', datasetSearch: true, stubFallback: true,
  selectedAgents: [], autoStart: false,
}

/** MockAgent 页「部署到 ODA Canvas」弹窗：表格勾选的实例为部署范围（内嵌默认 Agent 恒部署） */
export default function OdaDeployModal({ initialAgents = [], onClose }) {
  const { t } = useTranslation()
  const [cfg, setCfg] = useState(EMPTY)
  const [hasToken, setHasToken] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgError, setMsgError] = useState(false)
  const [busy, setBusy] = useState('')
  const [test, setTest] = useState(null)
  const [status, setStatus] = useState(null)
  const [log, setLog] = useState([])
  const [tab, setTab] = useState('deploy')   // deploy | status
  const [agents, setAgents] = useState([])   // 实例清单（展示勾选摘要用）
  const chosen = initialAgents.length ? initialAgents : (cfg.selectedAgents || [])

  // msg 错误标记随消息一起设置（原实现靠 msg.includes('失败') 判断，i18n 后改用显式标记）
  const showMsg = (text, error = false) => { setMsg(text); setMsgError(error) }

  useEffect(() => {
    api.get('/debug/api/v1/console/oda/config')
      .then((d) => { setCfg({ ...EMPTY, ...d.config, selectedAgents: initialAgents.length ? initialAgents : (d.config.selectedAgents || []) }); setHasToken(d.hasToken) })
      .catch((e) => showMsg(t('oda.msg.loadConfigFailed', { name: e.message }), true))
    api.get('/debug/api/v1/console/oda/agents')
      .then((d) => setAgents(d.agents || []))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const set = (k) => (e) => setCfg((c) => ({ ...c, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const savedToken = cfg.token === '' && hasToken
  const chosenMeta = chosen.map((id) => agents.find((a) => a.id === id)).filter(Boolean)

  async function saveAndDeploy() {
    setBusy('deploy'); showMsg('')
    try {
      // 部署范围 = 表格勾选清单：先落配置再部署（顺带保存表单里的地址/密钥改动）
      await api.put('/debug/api/v1/console/oda/config', { ...cfg, selectedAgents: chosen, token: savedToken ? '' : cfg.token })
      const d = await api.post('/debug/api/v1/console/oda/deploy')
      setLog(d.results.map((r) => ({ text: `${r.ok ? '✓' : '✗'} ${r.kind}/${r.name}  HTTP ${r.status}${r.detail ? '  ' + r.detail : ''}`, ok: r.ok })))
      setTab('status')
      refreshStatus(true)
    } catch (e) {
      showMsg(t('oda.msg.deployFailed', { name: e.message }), true)
    } finally { setBusy('') }
  }

  async function save() {
    setBusy('save'); showMsg('')
    try {
      await api.put('/debug/api/v1/console/oda/config', { ...cfg, token: savedToken ? '' : cfg.token })
      const d = await api.get('/debug/api/v1/console/oda/config')
      setCfg({ ...EMPTY, ...d.config }); setHasToken(d.hasToken)
      showMsg(t('oda.msg.configSaved'))
    } catch (e) { showMsg(t('oda.msg.saveFailed', { name: e.message }), true) } finally { setBusy('') }
  }

  async function run(action, labelKey, fn) {
    setBusy(action); showMsg('')
    try { return await fn() }
    catch (e) { showMsg(t('oda.msg.actionFailed', { name: labelKey ? t(labelKey) : '', msg: e.message }), true); return null }
    finally { setBusy('') }
  }

  async function testConn() {
    const d = await run('test', 'oda.action.test', () => api.post('/debug/api/v1/console/oda/test-connection'))
    if (d) { setTest(d); showMsg('') }
  }

  async function undeploy() {
    const d = await run('undeploy', 'oda.action.undeploy', () => api.post('/debug/api/v1/console/oda/undeploy'))
    if (d) {
      setLog(d.results.map((r) => ({ text: `${r.ok ? '✓' : '✗'} ${t('common.delete')} ${r.kind}/${r.name}  HTTP ${r.status}`, ok: r.ok })))
      refreshStatus(true)
    }
  }

  async function refreshStatus(silent = false) {
    const d = await run('status', silent ? '' : 'oda.action.refreshStatus', () => api.get('/debug/api/v1/console/oda/status'))
    if (d) setStatus(d)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 860, width: '94%' }}>
        <div className="modal-head">
          <h2 style={{ marginBottom: 0 }}>{t('oda.title')}</h2>
          <button className="btn ghost small" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '72vh', overflow: 'auto' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button type="button" className={`btn small${tab === 'deploy' ? '' : ' ghost'}`} onClick={() => setTab('deploy')}>{t('oda.tab.deploy')}</button>
            <button type="button" className={`btn small${tab === 'status' ? '' : ' ghost'}`} onClick={() => { setTab('status'); refreshStatus() }}>{t('oda.tab.status')}</button>
          </div>

          {msg && <div className={msgError ? 'error-text' : 'muted'} style={{ marginBottom: 10 }}>{msg}</div>}

          {tab === 'deploy' && (
            <>
              <div style={{ border: '1px solid rgba(128,128,128,.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                  <strong style={{ fontSize: 13 }}>{t('oda.scope.title')}</strong>
                  <span className="badge blue">{t('oda.scope.builtinAlways')}</span>
                  {chosenMeta.map((a) => (
                    <span key={a.id} className="badge indigo">{a.name} :{a.port}</span>
                  ))}
                  {chosen.length === 0 && <span className="muted" style={{ fontSize: 12 }}>{t('oda.scope.builtinOnly')}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {t('oda.scope.hint')}
                  </span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginLeft: 'auto' }}>
                    <input type="checkbox" checked={cfg.autoStart} onChange={set('autoStart')} />
                    {t('oda.scope.autoStart')}
                  </label>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                <label style={{ display: 'grid', gap: 4 }}>
                  {t('oda.field.apiServer')}
                  <input value={cfg.apiServer} onChange={set('apiServer')} placeholder="https://1.2.3.4:6443" />
                </label>
                <label style={{ display: 'grid', gap: 4 }}>
                  {t('oda.field.token')} {hasToken && <span className="badge blue" style={{ marginLeft: 4 }}>{t('oda.saved')}</span>}
                  <input type="password" value={cfg.token} onChange={set('token')} placeholder={hasToken ? t('oda.field.tokenSaved') : 'eyJhbGciOiJSUzI1NiIs…'} />
                </label>
                <label style={{ display: 'grid', gap: 4 }}>
                  {t('oda.field.namespace')}
                  <input value={cfg.namespace} onChange={set('namespace')} />
                </label>
                <label style={{ display: 'grid', gap: 4 }}>
                  {t('oda.field.image')}
                  <input value={cfg.image} onChange={set('image')} placeholder="registry.example.com/openan/mockagent:1.0.0" />
                </label>
                <label style={{ display: 'grid', gap: 4 }}>
                  {t('oda.field.publicUrl')}
                  <input value={cfg.publicUrl} onChange={set('publicUrl')} placeholder="https://mockagent.example.com" />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18 }}>
                  <input type="checkbox" checked={cfg.insecureTLS} onChange={set('insecureTLS')} />
                  {t('oda.field.insecureTLS')}
                </label>
              </div>
              <details style={{ marginTop: 10 }}>
                <summary className="muted" style={{ cursor: 'pointer', fontSize: 13 }}>{t('oda.advanced')}</summary>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 10 }}>
                  <label style={{ display: 'grid', gap: 4 }}>{t('oda.field.jwtSecret')}<input type="password" value={cfg.jwtSecret} onChange={set('jwtSecret')} placeholder={cfg.jwtSecret ? t('oda.saved') : t('oda.field.jwtSecretDefault')} /></label>
                  <label style={{ display: 'grid', gap: 4 }}>{t('oda.field.adminPassword')}<input type="password" value={cfg.adminPassword} onChange={set('adminPassword')} placeholder={t('oda.field.adminPasswordPlaceholder')} /></label>
                  <label style={{ display: 'grid', gap: 4 }}>{t('oda.field.storageSize')}<input value={cfg.storageSize} onChange={set('storageSize')} /></label>
                  <label style={{ display: 'grid', gap: 4 }}>{t('oda.field.componentId')}<input value={cfg.componentId} onChange={set('componentId')} /></label>
                  <label style={{ display: 'grid', gap: 4 }}>{t('oda.field.apiVersion')}
                    <select value={cfg.apiVersion} onChange={set('apiVersion')}>
                      <option value="v1beta3">{t('oda.apiVersion.v1beta3')}</option>
                      <option value="v1beta2">{t('oda.apiVersion.v1beta2')}</option>
                    </select>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18 }}>
                    <input type="checkbox" checked={cfg.datasetSearch} onChange={set('datasetSearch')} /> {t('oda.field.datasetSearch')}
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={cfg.stubFallback} onChange={set('stubFallback')} /> {t('oda.field.stubFallback')}
                  </label>
                </div>
              </details>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
                <button type="button" className="btn small" onClick={save} disabled={!!busy}>{busy === 'save' ? t('oda.busy.saving') : t('oda.action.saveConfig')}</button>
                <button type="button" className="btn ghost small" onClick={testConn} disabled={!!busy}>{busy === 'test' ? t('oda.busy.testing') : t('oda.action.test')}</button>
                <button type="button" className="btn" onClick={saveAndDeploy} disabled={!!busy} style={{ marginLeft: 'auto' }}>
                  {busy === 'deploy' ? t('oda.busy.deploying') : t('oda.action.deployOneClick', { num: chosen.length + 1 })}
                </button>
              </div>
              {test && (
                <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                  {t('oda.testResult.k8s')} <code>{test.k8sVersion || '?'}</code> · Component CRD{' '}
                  {test.componentCrd ? <span className="badge blue">{t('oda.testResult.crdPresent', { name: test.versions?.join(', ') })}</span> : <span style={{ color: '#dc2626' }}>{t('oda.testResult.crdMissing')}</span>} ·
                  {t('oda.testResult.namespace')} {test.namespaceReachable ? <span className="badge blue">{t('oda.testResult.reachable')}</span> : <span style={{ color: '#dc2626' }}>{test.namespaceError || t('oda.testResult.unreachable')}</span>}
                </div>
              )}
              <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                {t('oda.deployTargets', { num: chosen.length, total: chosen.length + 2 })}
              </div>
            </>
          )}

          {tab === 'status' && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <strong>{t('oda.status.component')}</strong>
                <span className={`badge ${String(status?.component?.deploymentStatus) === 'complete' ? 'blue' : ''}`}>{status?.component?.deploymentStatus || t('oda.status.unknown')}</span>
                <strong>{t('oda.status.service')}</strong>
                {status?.service?.exists ? <span className="badge blue">{status.service.clusterIP}</span> : <span className="muted">{t('oda.status.notCreated')}</span>}
                <span className="badge indigo">
                  {t('oda.status.deployedAgents', { name: status?.selectedAgents?.length ? status.selectedAgents.map((a) => a.name).join(t('oda.listSep')) : t('oda.status.builtinAgentsOnly') })}
                </span>
                <span style={{ flex: 1 }} />
                <button type="button" className="btn ghost small" onClick={() => refreshStatus()} disabled={!!busy}>{busy === 'status' ? t('oda.busy.refreshing') : t('common.refresh')}</button>
                <button type="button" className="btn danger small" onClick={undeploy} disabled={!!busy}>{busy === 'undeploy' ? t('oda.busy.undeploying') : t('oda.action.undeploy')}</button>
              </div>
              {(status?.pods || []).length > 0 ? (
                <table>
                  <thead><tr><th>Pod</th><th>Phase</th><th>Ready</th><th>{t('oda.status.restarts')}</th><th>{t('oda.status.image')}</th></tr></thead>
                  <tbody>
                    {status.pods.map((p) => (
                      <tr key={p.name}>
                        <td className="mono-text" style={{ fontSize: 12 }}>{p.name}</td>
                        <td>{p.phase}</td>
                        <td>{p.ready ? '✓' : '✗'}</td>
                        <td>{p.restarts}</td>
                        <td className="muted" style={{ fontSize: 12 }}>{p.image}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <span className="muted">{t('oda.status.noPods')}</span>}
              {log.length > 0 && (
                <pre style={{ margin: 0, padding: '10px 14px', background: 'rgba(128,128,128,.08)', borderRadius: 8, fontSize: 12, maxHeight: 180, overflow: 'auto' }}>
                  {log.map((l) => l.text).join('\n')}
                </pre>
              )}
              <div className="muted" style={{ fontSize: 12 }}>
                {t('oda.status.portForwardHint', { name: cfg.namespace })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
