import { useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getToken } from './api.js'
import { getTheme, toggleTheme } from './theme.js'
import LoginPage from './pages/Login.jsx'
import ConsolePage from './pages/Console.jsx'
import DatasetPage from './pages/Dataset.jsx'
import RegistryConsolePage from './pages/RegistryConsole.jsx'
import OrchestrationConsolePage from './pages/OrchestrationConsole.jsx'
import ExecutionConsolePage from './pages/ExecutionConsole.jsx'
import OntologyConsolePage from './pages/OntologyConsole.jsx'
import SettingsUrlsPage from './pages/SettingsUrls.jsx'
import SettingsAgentsPage from './pages/SettingsAgents.jsx'
import SeedsPage from './pages/Seeds.jsx'
import UsersPage from './pages/Users.jsx'

function ThemeToggle() {
  const { t } = useTranslation()
  const [theme, setThemeState] = useState(getTheme())
  function flipTheme() {
    setThemeState(toggleTheme())
  }
  return (
    <button className="theme-fab" onClick={flipTheme} title={theme === 'dark' ? t('header.toLight') : t('header.toDark')}>
      {theme === 'dark' ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  )
}

function RequireAuth({ children }) {
  if (!getToken()) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<RequireAuth><ConsolePage /></RequireAuth>} />
        <Route path="/dataset" element={<RequireAuth><DatasetPage /></RequireAuth>} />
        <Route path="/registry" element={<RequireAuth><RegistryConsolePage /></RequireAuth>} />
        <Route path="/orchestration" element={<RequireAuth><OrchestrationConsolePage /></RequireAuth>} />
        <Route path="/execution" element={<RequireAuth><ExecutionConsolePage /></RequireAuth>} />
        <Route path="/ontology" element={<RequireAuth><OntologyConsolePage /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><SettingsUrlsPage /></RequireAuth>} />
        <Route path="/settings/agents" element={<RequireAuth><SettingsAgentsPage /></RequireAuth>} />
        <Route path="/seeds" element={<RequireAuth><SeedsPage /></RequireAuth>} />
        <Route path="/users" element={<RequireAuth><UsersPage /></RequireAuth>} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ThemeToggle />
    </>
  )
}
