import { useEffect, useRef, useState } from 'react'
import './App.css'
import './TBox.css'
import AgentDiagnosis from './AgentDiagnosis'

const PREFERENCES_STORAGE_KEY = 'ontology-demo:preferences'

const layers = [
  { key: 'business', zh: '业务运营层', en: 'Business operations', subZh: '商业面 / SLA / 客户流', subEn: 'Business / SLA / customer flows', color: 'purple' },
  { key: 'governance', zh: '治理与主权层', en: 'Governance & sovereignty', subZh: '治理策略 / 安全红线', subEn: 'Policies / security baseline', color: 'mint' },
  { key: 'cross_system', zh: '系统解决方案层', en: 'System solutions', subZh: '跨域故障与保障方案', subEn: 'Cross-domain fault and assurance', color: 'gold' },
  { key: 'logical', zh: '逻辑资源层', en: 'Logical resources', subZh: '5G NRM / 协议 / 时钟', subEn: '5G NRM / protocols / timing', color: 'teal' },
  { key: 'physical', zh: '物理资源层', en: 'Physical resources', subZh: '设备 / 光纤 / 动环', subEn: 'Devices / fiber / environment', color: 'blue' },
]

const readPreferences = () => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY))
    return {
      language: saved?.language === '中' ? '中' : 'EN',
      theme: saved?.theme === 'light' ? 'light' : 'dark',
    }
  } catch {
    return { language: 'EN', theme: 'dark' }
  }
}

function App() {
  const [preferences] = useState(readPreferences)
  const [activeTab, setActiveTab] = useState('abox')
  const [hasVisitedTbox, setHasVisitedTbox] = useState(false)
  const [query, setQuery] = useState('')
  const [enabledLayers, setEnabledLayers] = useState(layers.map((layer) => layer.zh))
  const [language, setLanguage] = useState(preferences.language)
  const [theme, setTheme] = useState(preferences.theme)
  const [toast, setToast] = useState('')
  const [canvasStyle, setCanvasStyle] = useState({})
  const ontologyFrame = useRef(null)

  useEffect(() => {
    const updateCanvas = () => {
      const { innerWidth: width, innerHeight: height } = window
      if (width < 901) {
        setCanvasStyle({})
        return
      }
      const scale = Math.max(1, Math.min(width / 1706.667, height / 960))
      setCanvasStyle({ '--canvas-width': `${width / scale}px`, '--canvas-height': `${height / scale}px`, '--canvas-scale': String(scale) })
      window.__ONTOLOGY_LAYOUT_INFO__ = { viewport: `${width}x${height}`, scale: Number(scale.toFixed(3)), designCanvas: `${Math.round(width / scale)}x${Math.round(height / scale)}` }
    }
    updateCanvas()
    window.addEventListener('resize', updateCanvas)
    return () => window.removeEventListener('resize', updateCanvas)
  }, [])

  useEffect(() => {
    try { window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ language, theme })) } catch { /* storage may be unavailable */ }
  }, [language, theme])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.body.dataset.theme = theme
    ontologyFrame.current?.contentWindow?.postMessage({ type: 'ontology-theme', theme }, '*')
  }, [theme])

  useEffect(() => { document.documentElement.lang = language === 'EN' ? 'en' : 'zh-CN' }, [language])

  const notify = (message) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2600)
  }

  const toggleLayer = (layerKey) => {
    setEnabledLayers((current) => {
      const layer = layers.find((item) => item.key === layerKey)
      const label = layer.zh
      const next = current.includes(label) ? current.filter((item) => item !== label) : [...current, label]
      ontologyFrame.current?.contentWindow?.postMessage({ type: 'ontology-layer-filter', enabled: next.map((item) => layers.find((candidate) => candidate.zh === item)?.key).filter(Boolean) }, '*')
      return next
    })
  }

  const previewLayer = (layerKey) => ontologyFrame.current?.contentWindow?.postMessage({ type: 'ontology-layer-preview', layer: layerKey }, '*')
  const clearLayerPreview = () => ontologyFrame.current?.contentWindow?.postMessage({ type: 'ontology-layer-preview', layer: null }, '*')

  const switchTab = (tab) => {
    if (tab === 'tbox') setHasVisitedTbox(true)
    setActiveTab(tab)
  }

  return (
    <div className={`app-shell ${theme === 'light' ? 'light-theme' : ''}`} style={canvasStyle}>
      <header className="topbar">
        <div className="brand" aria-label={language === 'EN' ? 'OpenAN Telecom Operator Ontology Demo' : 'OpenAN 某运营商 Ontology联创样机'}><img className="brand-logo" src="/OpenAN.png" alt="OpenAN" /><span>{language === 'EN' ? 'OpenAN Telecom Operator Ontology Demo' : 'OpenAN 某运营商 Ontology联创样机'}</span></div>
        <nav className={`primary-nav ${activeTab === 'tbox' ? 'tbox-active' : 'abox-active'}`} aria-label={language === 'EN' ? 'Primary navigation' : '主导航'}>
          <button className={activeTab === 'tbox' ? 'active' : ''} onClick={() => switchTab('tbox')}><span className="nav-icon" aria-hidden="true">⌕</span>{language === 'EN' ? 'Ontology T-Box' : '本体T-Box'}</button>
          <button className={activeTab === 'abox' ? 'active' : ''} onClick={() => switchTab('abox')}><span className="nav-icon" aria-hidden="true">◌</span>{language === 'EN' ? 'Ontology A-Box' : '本体A-Box'}</button>
        </nav>
        <div className="top-actions"><button className="icon-button theme-toggle" title={theme === 'dark' ? (language === 'EN' ? 'Switch to light mode' : '切换至浅色模式') : (language === 'EN' ? 'Switch to dark mode' : '切换至深色模式')} aria-label={theme === 'dark' ? (language === 'EN' ? 'Switch to light mode' : '切换至浅色模式') : (language === 'EN' ? 'Switch to dark mode' : '切换至深色模式')} aria-pressed={theme === 'light'} onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☀' : '☾'}</button><div className="language-switch" aria-label={language === 'EN' ? 'Language selection' : '语言选择'}>{['中', 'EN'].map((item) => <button key={item} className={language === item ? 'active' : ''} onClick={() => setLanguage(item)}>{item}</button>)}</div></div>
      </header>

      <main className="tab-content">
        <section className={`tab-panel ${activeTab === 'abox' ? 'is-active' : 'is-inactive'}`} aria-hidden={activeTab !== 'abox'}>
          <AgentDiagnosis notify={notify} theme={theme} language={language} />
        </section>
        {hasVisitedTbox && <section className={`tab-panel ${activeTab === 'tbox' ? 'is-active' : 'is-inactive'}`} aria-hidden={activeTab !== 'tbox'}>
          <section className="model-layout" aria-label={language === 'EN' ? 'T-Box explorer' : 'T-Box 查询'}>
            <aside className="model-sidebar panel">
              <div className="panel-title-row"><div><h1>{language === 'EN' ? 'Ontology explorer' : '本体查询'}</h1></div></div>
              <label className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={language === 'EN' ? 'Search objects, relations, actions' : '搜索对象、关系、动作'} /></label>
              {query && <p className="search-hint">{language === 'EN' ? 'Search: ' : '检索词：'}{query}</p>}
              <div className="section-label">{language === 'EN' ? 'Layer filter' : '层级过滤'}</div>
              <div className="layer-list">{layers.map((rawLayer) => { const layer = { ...rawLayer, name: language === 'EN' ? rawLayer.en : rawLayer.zh, sub: language === 'EN' ? rawLayer.subEn : rawLayer.subZh }; const checked = enabledLayers.includes(rawLayer.zh); return <button key={rawLayer.key} className={`layer-item ${checked ? 'selected' : ''}`} onClick={() => toggleLayer(rawLayer.key)} onMouseEnter={() => previewLayer(rawLayer.key)} onMouseLeave={clearLayerPreview} onFocus={() => previewLayer(rawLayer.key)} onBlur={clearLayerPreview}><span className={`layer-dot ${layer.color}`}></span><span className="layer-copy"><strong>{layer.name}</strong><small>{layer.sub}</small></span><span className="layer-state">{checked ? (language === 'EN' ? 'Shown' : '显示') : (language === 'EN' ? 'Hidden' : '隐藏')}</span></button> })}</div>
              <div className="section-label stats-title">{language === 'EN' ? 'Overview' : '统计概览'}</div>
              <div className="stats-stack"><div><span className="stat-icon violet">◇</span><span>{language === 'EN' ? 'Concept types' : '对象类型'}</span><b>26</b></div><div><span className="stat-icon gold">⌘</span><span>{language === 'EN' ? 'Relation types' : '关系类型'}</span><b>57</b></div><div><span className="stat-icon mint">✦</span><span>{language === 'EN' ? 'Actions' : '动作'}</span><b>39</b></div></div>
              <div className="section-label tbox-legend-title">{language === 'EN' ? 'Legend' : '图例'}</div>
              <div className="tbox-legend" aria-label={language === 'EN' ? 'Ontology legend' : '本体图例'}>
                <div className="tbox-legend-group">
                  <strong>{language === 'EN' ? 'Relation type' : '关系类型'}</strong>
                  <span><i className="tbox-legend-line structural"></i>{language === 'EN' ? 'Structural / governance' : '结构 / 治理关系'}</span>
                  <span><i className="tbox-legend-line evidence"></i>{language === 'EN' ? 'Evidence mapping' : '证据关系（故障对象映射）'}</span>
                  <span><i className="tbox-legend-line diagnosis"></i>{language === 'EN' ? 'Diagnosis mapping' : '诊断关系（故障根因映射）'}</span>
                </div>
                <div className="tbox-legend-group">
                  <strong>{language === 'EN' ? 'Node' : '节点'}</strong>
                  <span><i className="tbox-legend-node"></i>{language === 'EN' ? 'Ontology concept type' : '本体概念类型'}</span>
                  <span><i className="tbox-legend-action">✦</i>{language === 'EN' ? 'Select a node to view actions' : '选中节点可查看 Action'}</span>
                </div>
              </div>
            </aside>
            <section className="ontology-panel panel"><div className="canvas-header"><div><h2>{language === 'EN' ? 'T-Box ontology view' : 'T-Box 本体视图'}</h2></div><details className="ontology-download-menu tbox-download-menu"><summary>{language === 'EN' ? 'T-Box download' : 'T-Box 下载'}</summary><a href="/ontology/downloads/ip-network-fault-management.owl" download="ip-network-five-layer-tbox.owl">{language === 'EN' ? 'OWL format' : 'OWL格式'}</a><a href="/ontology/downloads/ip-network-fault-management.ttl" download="ip-network-five-layer-tbox.ttl">{language === 'EN' ? 'TTL format' : 'TTL格式'}</a></details></div><div className="model-canvas"><iframe ref={ontologyFrame} title={language === 'EN' ? 'AN Ontology T-Box 3D panorama' : 'AN Ontology T-Box 3D 全景'} src={`/ontology/index.html?theme=${theme}&language=${language}`} onLoad={() => { ontologyFrame.current?.contentWindow?.postMessage({ type: 'ontology-theme', theme }, '*'); ontologyFrame.current?.contentWindow?.postMessage({ type: 'ontology-layer-filter', enabled: enabledLayers.map((item) => layers.find((layer) => layer.zh === item)?.key).filter(Boolean) }, '*') }} /><div className="canvas-note"><span></span>{language === 'EN' ? 'Drag to rotate · Scroll to zoom · Select a node for details' : '拖拽旋转 · 滚轮缩放 · 点击节点查看详情'}</div></div></section>
          </section>
        </section>}
      </main>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}

export default App
