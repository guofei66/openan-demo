import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api.js'
import { readJwtPayload } from '../jwt.js'
import Layout from '../Layout.jsx'

const FIELDS = [
  { key: 'registryUrl', labelKey: 'settingsUrls.registry' },
  { key: 'orchestrationUrl', labelKey: 'settingsUrls.orchestration' },
  { key: 'executionHostUrl', labelKey: 'settingsUrls.executionHost' },
  { key: 'ontologyUrl', labelKey: 'settingsUrls.ontology' },
]

const EMPTY_URLS = { registryUrl: '', orchestrationUrl: '', executionHostUrl: '', ontologyUrl: '' }

export default function SettingsUrlsPage() {
  const { t } = useTranslation()
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
      setError(err.message || t('settingsUrls.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout>
      <h2>{t('settingsUrls.title')}</h2>
      <div className="card">
        <p className="muted" style={{ marginBottom: 12 }}>
          {t('settingsUrls.desc')}
        </p>
        <form onSubmit={save}>
          {FIELDS.map((field) => (
            <div className="filters" key={field.key}>
              <label className="field-label">{t(field.labelKey)}</label>
              <input
                value={urls[field.key] || ''}
                onChange={(e) => setUrls({ ...urls, [field.key]: e.target.value })}
                placeholder={t('settingsUrls.urlPlaceholder')}
                disabled={!isAdmin}
              />
            </div>
          ))}
          {error && <div className="error-text">{error}</div>}
          {saved && <div className="success-text">{t('settingsUrls.saveSuccess')}</div>}
          {isAdmin && <button type="submit" disabled={saving}>{saving ? t('settingsUrls.saving') : t('common.save')}</button>}
          {!isAdmin && <div className="muted">{t('settingsUrls.adminOnly')}</div>}
        </form>
      </div>
    </Layout>
  )
}
