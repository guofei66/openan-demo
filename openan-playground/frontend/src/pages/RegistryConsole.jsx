import { useTranslation } from 'react-i18next'
import PostmanConsole from '../components/PostmanConsole.jsx'
import { REGISTRY_ENDPOINTS } from '../endpoints.js'
import Layout from '../Layout.jsx'

export default function RegistryConsolePage() {
  const { t } = useTranslation()
  const FOLDERS = [
    { key: 'cards', label: t('registry.folders.cards'), items: ['list', 'get', 'register', 'update', 'delete'] },
    { key: 'smart', label: t('registry.folders.smart'), items: ['semantic'] },
    { key: 'publish', label: t('registry.folders.publish'), items: ['manage', 'publish'] },
    { key: 'system', label: t('registry.folders.system'), items: ['keys'] },
  ]

  return (
    <Layout>
      <PostmanConsole
        feature="registry"
        title={t('registry.title')}
        subtitle={t('registry.subtitle')}
        targetKey="registryUrl"
        targetLabel="registry"
        endpoints={REGISTRY_ENDPOINTS}
        folders={FOLDERS}
        enableAgentCard
        footer={(
          <div className="pm-footer">
            <span>{t('registry.portalHint')}</span>
            <a href="http://47.236.98.226:9003/registry" target="_blank" rel="noreferrer">
              http://47.236.98.226:9003/registry ↗
            </a>
          </div>
        )}
      />
    </Layout>
  )
}
