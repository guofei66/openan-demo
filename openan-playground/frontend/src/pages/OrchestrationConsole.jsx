import { useTranslation } from 'react-i18next'
import PostmanConsole from '../components/PostmanConsole.jsx'
import { ORCHESTRATION_ENDPOINTS } from '../endpoints.js'
import Layout from '../Layout.jsx'

export default function OrchestrationConsolePage() {
  const { t } = useTranslation()
  const FOLDERS = [
    { key: 'browse', label: t('orchestration.folders.browse'), items: ['workflows', 'cards'] },
    { key: 'intent', label: t('orchestration.folders.intent'), items: ['intent', 'search', 'execute', 'executeById', 'dispatch'] },
    { key: 'records', label: t('orchestration.folders.records'), items: ['executions', 'records'] },
  ]

  return (
    <Layout>
      <PostmanConsole
        feature="orchestration"
        title={t('orchestration.title')}
        subtitle={t('orchestration.subtitle')}
        targetKey="orchestrationUrl"
        targetLabel="orchestration"
        endpoints={ORCHESTRATION_ENDPOINTS}
        folders={FOLDERS}
      />
    </Layout>
  )
}
