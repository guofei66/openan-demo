import { useTranslation } from 'react-i18next'
import PostmanConsole from '../components/PostmanConsole.jsx'
import { EXECUTION_ENDPOINTS } from '../endpoints.js'
import Layout from '../Layout.jsx'

export default function ExecutionConsolePage() {
  const { t } = useTranslation()
  const FOLDERS = [
    { key: 'message', label: t('execution.folders.message'), items: ['send', 'stream'] },
    { key: 'tasks', label: t('execution.folders.tasks'), items: ['tasks', 'task', 'cancel'] },
  ]

  return (
    <Layout>
      <PostmanConsole
        feature="execution"
        title={t('execution.title')}
        subtitle={t('execution.subtitle')}
        targetKey="executionHostUrl"
        targetLabel="execution"
        endpoints={EXECUTION_ENDPOINTS}
        folders={FOLDERS}
      />
    </Layout>
  )
}
