import { useTranslation } from 'react-i18next'
import PostmanConsole from '../components/PostmanConsole.jsx'
import { ONTOLOGY_ENDPOINTS } from '../endpoints.js'
import Layout from '../Layout.jsx'

export default function OntologyConsolePage() {
  const { t } = useTranslation()
  const FOLDERS = [
    { key: 'service', label: t('ontology.folders.service'), items: ['health'] },
    { key: 'reasoning', label: t('ontology.folders.reasoning'), items: ['runs'] },
  ]

  return (
    <Layout>
      <PostmanConsole
        feature="ontology"
        title={t('ontology.title')}
        subtitle={t('ontology.subtitle')}
        targetKey="ontologyUrl"
        targetLabel="ontology"
        endpoints={ONTOLOGY_ENDPOINTS}
        folders={FOLDERS}
      />
    </Layout>
  )
}
