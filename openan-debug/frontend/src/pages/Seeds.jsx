import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api.js'
import Layout from '../Layout.jsx'
import { TEMPLATE_URIS } from '../templates.js'
import JsonView from '../JsonView.jsx'

const emptySeed = { name: '', templateUri: TEMPLATE_URIS[2], seedJson: '{\n  \n}', description: '' }

export default function SeedsPage() {
  const { t } = useTranslation()
  const [seeds, setSeeds] = useState([])
  const [variants, setVariants] = useState([])
  const [agents, setAgents] = useState([])
  const [draft, setDraft] = useState(emptySeed)
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')
  const [importSeedId, setImportSeedId] = useState('')
  const [importAgentId, setImportAgentId] = useState('')
  const [importUri, setImportUri] = useState(TEMPLATE_URIS[2])
  const [importFile, setImportFile] = useState(null)

  const load = useCallback(async () => {
    try {
      setSeeds(await api.get('/debug/api/v1/seeds'))
      setVariants(await api.get('/debug/api/v1/variants'))
      const agentList = await api.get('/debug/api/v1/agents')
      setAgents(agentList)
      setImportAgentId((current) => {
        if (current) return current
        const preferred = agentList.find((agent) => agent.isDefault) || agentList[0]
        return preferred ? String(preferred.id) : ''
      })
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function editSeed(seed) {
    setEditingId(seed.id)
    setDraft({ ...seed, seedJson: JSON.stringify(seed.seedJson, null, 2) })
  }

  async function saveSeed(event) {
    event.preventDefault()
    setError('')
    let seedJson
    try {
      seedJson = JSON.parse(draft.seedJson || '{}')
    } catch {
      setError(t('seeds.invalidSeedJson'))
      return
    }
    const payload = {
      name: draft.name,
      templateUri: draft.templateUri,
      seedJson,
      description: draft.description || '',
    }
    try {
      if (editingId) await api.patch(`/debug/api/v1/seeds/${editingId}`, payload)
      else await api.post('/debug/api/v1/seeds', payload)
      setDraft(emptySeed)
      setEditingId(null)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function removeSeed(id) {
    if (!window.confirm(t('seeds.confirmDeleteSeed'))) return
    await api.del(`/debug/api/v1/seeds/${id}`)
    load()
  }

  async function importVariants(event) {
    event.preventDefault()
    setError('')
    if (!importFile) {
      setError(t('seeds.selectVariantsFile'))
      return
    }
    try {
      const parsed = JSON.parse(await importFile.text())
      const payload = {
        seedId: importSeedId ? Number(importSeedId) : null,
        agentId: importAgentId ? Number(importAgentId) : null,
        templateUri: importUri,
        variants: parsed.variants || parsed,
      }
      const result = await api.post('/debug/api/v1/variants/import', payload)
      alert(t('seeds.importSuccess', { imported: result.imported, firstSeq: result.firstSeq }))
      load()
    } catch (err) {
      setError(err.message || t('seeds.importFailed'))
    }
  }

  async function toggleVariant(variant) {
    await api.patch(`/debug/api/v1/variants/${variant.id}`, { enabled: !variant.enabled })
    load()
  }

  const agentNameMap = new Map(agents.map((agent) => [agent.id, agent.name]))

  return (
    <Layout>
      <h2>{t('seeds.title')}</h2>
      {error && <div className="error-text">{error}</div>}
      <div className="row">
        <div className="card">
          <h2>{editingId ? t('seeds.editSeed', { id: editingId }) : t('seeds.newSeed')}</h2>
          <form onSubmit={saveSeed}>
            <div className="filters">
              <input placeholder={t('seeds.namePlaceholder')} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              <select value={draft.templateUri} onChange={(e) => setDraft({ ...draft, templateUri: e.target.value })}>
                {TEMPLATE_URIS.map((uri) => (<option key={uri} value={uri}>{uri}</option>))}
              </select>
            </div>
            <textarea rows={8} value={draft.seedJson} onChange={(e) => setDraft({ ...draft, seedJson: e.target.value })} />
            <div className="filters" style={{ marginTop: 10 }}>
              <input placeholder={t('seeds.descriptionPlaceholder')} value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              <button type="submit">{t('common.save')}</button>
              {editingId && <button type="button" className="ghost" onClick={() => { setEditingId(null); setDraft(emptySeed) }}>{t('common.cancel')}</button>}
            </div>
          </form>
        </div>
        <div className="card">
          <h2>{t('seeds.importTitle')}</h2>
          <p className="muted">{t('seeds.importHint', { format: '{"templateUri", "variants": [..]}' })}</p>
          <form onSubmit={importVariants}>
            <div className="filters">
              <label className="field-label">{t('seeds.targetAgent')}</label>
              <select value={importAgentId} onChange={(e) => setImportAgentId(e.target.value)}>
                {agents.filter((agent) => agent.enabled).map((agent) => (
                  <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))}
              </select>
            </div>
            <div className="filters">
              <select value={importSeedId} onChange={(e) => setImportSeedId(e.target.value)}>
                <option value="">{t('seeds.noSeedBinding')}</option>
                {seeds.map((seed) => (<option key={seed.id} value={seed.id}>{seed.name}</option>))}
              </select>
              <select value={importUri} onChange={(e) => setImportUri(e.target.value)}>
                {TEMPLATE_URIS.map((uri) => (<option key={uri} value={uri}>{uri}</option>))}
              </select>
            </div>
            <input type="file" accept=".json" onChange={(e) => setImportFile(e.target.files[0])} />
            <button type="submit" style={{ marginTop: 10 }}>{t('seeds.import')}</button>
          </form>
        </div>
      </div>
      <div className="card">
        <h2>{t('seeds.listTitle')}</h2>
        <table>
          <thead><tr><th>ID</th><th>{t('seeds.colName')}</th><th>{t('seeds.colTemplate')}</th><th>{t('seeds.colVariants')}</th><th>{t('seeds.colDescription')}</th><th>{t('seeds.colActions')}</th></tr></thead>
          <tbody>
            {seeds.map((seed) => (
              <tr key={seed.id}>
                <td className="num">{seed.id}</td>
                <td>{seed.name}</td>
                <td>{seed.templateUri}</td>
                <td className="num">{seed.variantCount}</td>
                <td>{seed.description}</td>
                <td>
                  <button className="ghost" onClick={() => editSeed(seed)}>{t('common.edit')}</button>{' '}
                  <button className="danger" onClick={() => removeSeed(seed.id)}>{t('common.delete')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h2>{t('seeds.variantsTitle')}</h2>
        <table>
          <thead><tr><th>ID</th><th>seq</th><th>Agent</th><th>{t('seeds.colTemplate')}</th><th>{t('seeds.colContent')}</th><th>{t('seeds.colEnabled')}</th><th>{t('seeds.colSource')}</th></tr></thead>
          <tbody>
            {variants.map((variant) => (
              <tr key={variant.id} className={variant.enabled ? 'active-row' : ''}>
                <td className="num">{variant.id}</td>
                <td className="num">{variant.seq}</td>
                <td>{agentNameMap.get(variant.agentId) || '-'}</td>
                <td>{variant.templateUri}</td>
                <td><JsonView value={variant.variantJson} className="json" style={{ maxHeight: 120 }} /></td>
                <td>
                  <span className={`badge ${variant.enabled ? 'success' : 'neutral'}`}>{t(variant.enabled ? 'common.enabled' : 'common.disabled')}</span>{' '}
                  <button className="ghost" onClick={() => toggleVariant(variant)}>{variant.enabled ? t('seeds.disable') : t('seeds.enable')}</button>
                </td>
                <td>{variant.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  )
}
