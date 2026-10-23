import { useTranslation } from 'react-i18next'

const STATE_VARIANTS = {
  TASK_STATE_COMPLETED: 'success',
  TASK_STATE_REJECTED: 'danger',
  TASK_STATE_FAILED: 'danger',
  TASK_STATE_INPUT_REQUIRED: 'warning',
  TASK_STATE_CANCELED: 'neutral',
}

export function StatusBadge({ state }) {
  const variant = STATE_VARIANTS[state] || 'neutral'
  const label = state ? state.replace('TASK_STATE_', '') : '-'
  return <span className={`badge ${variant}`}>{label}</span>
}

export function HttpStatusBadge({ status }) {
  const { t } = useTranslation()
  const variant = status >= 200 && status < 300 ? 'success' : 'danger'
  const label = status === 0 ? t('statusBadge.transportFailed') : status ? `HTTP ${status}` : '-'
  return <span className={`badge ${variant}`}>{label}</span>
}

export function DirectionBadge({ direction }) {
  return <span className={`badge ${direction ? 'blue' : 'neutral'}`}>{direction || '-'}</span>
}

export function NegotiatedBadge({ value }) {
  const { t } = useTranslation()
  return <span className={`badge ${value ? 'indigo' : 'neutral'}`}>{value ? t('statusBadge.yes') : t('statusBadge.no')}</span>
}

export default StatusBadge
