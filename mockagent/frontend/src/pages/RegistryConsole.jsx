import PostmanConsole from '../components/PostmanConsole.jsx'
import { REGISTRY_ENDPOINTS } from '../endpoints.js'
import Layout from '../Layout.jsx'

const FOLDERS = [
  { key: 'cards', label: 'Agent 卡片管理', items: ['list', 'get', 'register', 'update', 'delete'] },
  { key: 'smart', label: '智能查询', items: ['semantic'] },
  { key: 'publish', label: '发布管理', items: ['manage', 'publish'] },
  { key: 'system', label: '系统', items: ['keys'] },
]

export default function RegistryConsolePage() {
  return (
    <Layout>
      <PostmanConsole
        feature="registry"
        title="注册中心调测"
        subtitle="Agent 卡片注册 / 查询 / 语义匹配 / JWKS"
        targetKey="registryUrl"
        targetLabel="registry"
        endpoints={REGISTRY_ENDPOINTS}
        folders={FOLDERS}
        enableAgentCard
        footer={(
          <div className="pm-footer">
            <span>注册结果可在注册中心门户查看：</span>
            <a href="http://203.0.113.10:9003/registry" target="_blank" rel="noreferrer">
              http://203.0.113.10:9003/registry ↗
            </a>
          </div>
        )}
      />
    </Layout>
  )
}
