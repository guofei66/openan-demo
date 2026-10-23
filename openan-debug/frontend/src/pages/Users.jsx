import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api.js'
import Layout from '../Layout.jsx'

export default function UsersPage() {
  const { t } = useTranslation()
  const [users, setUsers] = useState([])
  const [draft, setDraft] = useState({ username: '', password: '', role: 'user' })
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setUsers(await api.get('/debug/api/v1/users'))
  }, [])

  useEffect(() => {
    load().catch((err) => setError(err.message))
  }, [load])

  async function create(event) {
    event.preventDefault()
    setError('')
    try {
      await api.post('/debug/api/v1/users', draft)
      setDraft({ username: '', password: '', role: 'user' })
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function toggle(user) {
    await api.patch(`/debug/api/v1/users/${user.id}`, { enabled: !user.enabled })
    load()
  }

  return (
    <Layout>
      <h2>{t('users.title')}</h2>
      {error && <div className="error-text">{error}</div>}
      <div className="card">
        <h2>{t('users.createTitle')}</h2>
        <form className="filters" onSubmit={create}>
          <input placeholder={t('users.username')} value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} />
          <input placeholder={t('users.password')} type="password" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} />
          <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          <button type="submit">{t('users.create')}</button>
        </form>
      </div>
      <div className="card">
        <table>
          <thead><tr><th>ID</th><th>{t('users.username')}</th><th>{t('users.role')}</th><th>{t('users.enabledCol')}</th><th>{t('users.actions')}</th></tr></thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td className="num">{user.id}</td>
                <td>{user.username}</td>
                <td><span className={`badge ${user.role === 'admin' ? 'indigo' : 'neutral'}`}>{user.role}</span></td>
                <td><span className={`badge ${user.enabled ? 'success' : 'danger'}`}>{user.enabled ? t('users.yes') : t('users.no')}</span></td>
                <td><button className="ghost" onClick={() => toggle(user)}>{user.enabled ? t('users.disable') : t('users.enable')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  )
}
