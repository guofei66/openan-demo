import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { readJwtPayload } from '../jwt.js'
import Layout from '../Layout.jsx'

const FIELDS = [
  { key: 'registryUrl', label: '注册中心' },
  { key: 'orchestrationUrl', label: '编排中心' },
  { key: 'executionHostUrl', label: '执行中心（宿主 Agent）' },
  { key: 'ontologyUrl', label: '本体' },
]

const EMPTY_URLS = { registryUrl: '', orchestrationUrl: '', executionHostUrl: '', ontologyUrl: '' }

export default function SettingsUrlsPage() {
  const [urls, setUrls] = useState(EMPTY_URLS)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const isAdmin = readJwtPayload().role === 'admin'

  useEffect(() => {
    api.get('/debug/api/v1/settings/service-urls').then(setUrls).catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    if (!saved) return undefined
    const timer = setTimeout(() => setSaved(false), 3000)
    return () => clearTimeout(timer)
  }, [saved])

  async function save(event) {
    event.preventDefault()
    setError('')
    setSaved(false)
    setSaving(true)
    try {
      setUrls(await api.put('/debug/api/v1/settings/service-urls', urls))
      setSaved(true)
    } catch (err) {
      setError(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout>
      <h2>服务地址</h2>
      <div className="card">
        <p className="muted" style={{ marginBottom: 12 }}>
          配置各目标服务的 Base URL，调测台将通过 /debug/api/v1/debug-proxy 转发请求。
          默认地址直接写阿里云 IP（203.0.113.10:9004），经 nginx 短前缀转发到服务器内部服务：
          /rc/ → 注册中心(5000)，/oc/ → 编排中心(5001)，/a2a/ → 本系统 Mock Agent(9100)，/ot/ → 本体(8787)。
        </p>
        <form onSubmit={save}>
          {FIELDS.map((field) => (
            <div className="filters" key={field.key}>
              <label className="field-label">{field.label}</label>
              <input
                value={urls[field.key] || ''}
                onChange={(e) => setUrls({ ...urls, [field.key]: e.target.value })}
                placeholder="例如 http://127.0.0.1:8080"
                disabled={!isAdmin}
              />
            </div>
          ))}
          {error && <div className="error-text">{error}</div>}
          {saved && <div className="success-text">保存成功</div>}
          {isAdmin && <button type="submit" disabled={saving}>{saving ? '保存中...' : '保存'}</button>}
          {!isAdmin && <div className="muted">仅管理员可修改服务地址</div>}
        </form>
      </div>
    </Layout>
  )
}
