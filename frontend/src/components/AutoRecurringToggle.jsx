import { useState, useEffect } from 'react'
import api from '../services/api'

// Interrupteur de creation automatique des periodiques (parametres recurring_auto_sales /
// recurring_auto_purchases, services/recurring_poller.py cote serveur)
export default function AutoRecurringToggle({ settingKey, onText, offText }) {
  const [on, setOn] = useState(null)
  useEffect(() => { api.get('/v1/settings').then(r => setOn(r.data[settingKey])) }, [settingKey])
  async function toggle() {
    const next = !on
    if (!confirm(next ? `Activer la création automatique ?\n\n${onText}` : 'Désactiver la création automatique ? Il faudra cliquer chaque cycle à la main.')) return
    const r = await api.put('/v1/settings', { [settingKey]: next })
    setOn(r.data[settingKey])
  }
  if (on === null) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, background: on ? 'var(--c-tint-green)' : 'var(--c-surface-2)',
      border: `1px solid ${on ? '#A7F3D0' : 'var(--c-border)'}`, borderRadius: 8, padding: '8px 12px', marginBottom: 16 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600 }}>
        <input type="checkbox" checked={on} onChange={toggle} /> Création automatique {on ? 'activée' : 'désactivée'}
      </label>
      <span style={{ color: 'var(--c-muted)' }}>{on ? onText : offText}</span>
    </div>
  )
}
