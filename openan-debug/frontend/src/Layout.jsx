import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getToken, setToken } from './api.js'
import { readJwtPayload } from './jwt.js'
import { getTheme, toggleTheme } from './theme.js'

function LangSwitch() {
  const { i18n } = useTranslation()
  const current = (i18n.language || 'zh').toLowerCase().startsWith('zh') ? 'zh' : 'en'
  function change(lng) {
    i18n.changeLanguage(lng)
    localStorage.setItem('openan-debug-lang', lng)
  }
  return (
    <div className="lang-switch header-lang" title="切换语言 / Language">
      <button type="button" className={current === 'zh' ? 'active' : ''} onClick={() => change('zh')}>中</button>
      <button type="button" className={current === 'en' ? 'active' : ''} onClick={() => change('en')}>EN</button>
    </div>
  )
}

function PulseIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  )
}

export default function Layout({ children }) {
  const payload = readJwtPayload()
  const { t } = useTranslation()
  const [theme, setThemeState] = useState(getTheme())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const location = useLocation()
  useEffect(() => {
    setSettingsOpen(false)
  }, [location.pathname])
  function flipTheme() {
    setThemeState(toggleTheme())
  }
  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-icon"><PulseIcon /></span>
          <span>
            <div className="brand-title">OpenAN Playground</div>
            <div className="brand-subtitle">{t('brand.subtitle')}</div>
          </span>
        </div>
        <nav className="nav">
          <NavLink to="/registry">{t('nav.registry')}</NavLink>
          <NavLink to="/orchestration">{t('nav.orchestration')}</NavLink>
          <NavLink to="/execution">{t('nav.execution')}</NavLink>
          <NavLink to="/" end>{t('nav.a2at')}</NavLink>
          <NavLink to="/dataset">{t('nav.dataset')}</NavLink>
          <NavLink to="/ontology">{t('nav.ontology')}</NavLink>
          <NavLink to="/settings/agents">{t('nav.mockagent')}</NavLink>
          <div className={`nav-dropdown${settingsOpen ? ' open' : ''}`}>
            <button
              type="button"
              className="nav-dropdown-toggle"
              onClick={() => setSettingsOpen((open) => !open)}
            >
              {t('nav.settings')} <span className="nav-caret">▾</span>
            </button>
            {settingsOpen && (
              <div className="nav-menu">
                <NavLink to="/seeds">{t('nav.seeds')}</NavLink>
                <NavLink to="/settings">{t('nav.urls')}</NavLink>
                {payload.role === 'admin' && <NavLink to="/users">{t('nav.users')}</NavLink>}
              </div>
            )}
          </div>
        </nav>
        <div className="header-spacer" />
        <span className="user-badge">{payload.sub || t('header.notLoggedIn')} · {payload.role || '-'}</span>
        <LangSwitch />
        <button className="icon-btn" onClick={flipTheme} title={theme === 'dark' ? t('header.toLight') : t('header.toDark')}>
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
        <a
          className="icon-btn"
          href="#logout"
          title={t('header.logout')}
          onClick={(event) => {
            event.preventDefault()
            setToken('')
            window.location.href = import.meta.env.BASE_URL
          }}
        >
          <LogoutIcon />
        </a>
      </header>
      <main className="content">{children}</main>
    </div>
  )
}
