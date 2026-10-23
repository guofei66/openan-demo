import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, setToken } from '../api.js'

function PulseIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  )
}

function LangSwitch() {
  const { i18n } = useTranslation()
  const current = (i18n.language || 'zh').toLowerCase().startsWith('zh') ? 'zh' : 'en'
  function change(lng) {
    i18n.changeLanguage(lng)
    localStorage.setItem('openan-debug-lang', lng)
  }
  return (
    <div className="lang-switch">
      <button type="button" className={current === 'zh' ? 'active' : ''} onClick={() => change('zh')}>中</button>
      <button type="button" className={current === 'en' ? 'active' : ''} onClick={() => change('en')}>EN</button>
    </div>
  )
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setError('')
    try {
      const result = await api.post('/debug/api/v1/auth/login', { username, password })
      setToken(result.token)
      navigate('/')
    } catch (err) {
      setError(err.message || t('login.failed'))
    }
  }

  return (
    <div className="login-page">
      <div className="login-lang">
        <LangSwitch />
      </div>
      <form className="login-box card" onSubmit={submit}>
        <span className="login-icon"><PulseIcon /></span>
        <div className="login-title">{t('login.title')}</div>
        <div className="login-subtitle">{t('login.subtitle')}</div>
        <p className="login-desc">{t('login.desc')}</p>
        <input placeholder={t('login.username')} value={username} onChange={(e) => setUsername(e.target.value)} />
        <input placeholder={t('login.password')} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="error-text">{error}</div>}
        <button type="submit">{t('login.submit')}</button>
      </form>
    </div>
  )
}
