// Bouton « Pousser la config » (2026-10-14) : le téléphone du poste relit sa configuration sans redémarrer (ordre
// check-sync;reboot=false), avec la date de la dernière config prise par le téléphone. À côté de « Redémarrer ».
import { useState } from 'react'
import api from '../services/api'

export function fmtConfigDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleString('fr-CA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function PushConfigButton({ sipExtId, extension, registered, takenAt, compact = false }) {
  const [state, setState] = useState(null)      // null | 'busy' | 'ok' | message d'erreur
  async function push(ev) {
    ev?.stopPropagation()
    setState('busy')
    try {
      await api.post(`/v1/telephony/extensions/${sipExtId}/push-config`)
      setState('ok')
      setTimeout(() => setState(null), 6000)
    } catch (e) { setState(e.response?.data?.detail || 'Échec') }
  }
  if (!sipExtId) return null
  const title = registered ? `Le téléphone du poste ${extension} relit sa configuration, sans redémarrer` : 'Aucun téléphone enregistré sous ce poste'
  const date = fmtConfigDate(takenAt)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={ev => ev.stopPropagation()}>
      <button type="button" className="btn-secondary" onClick={push} disabled={!registered || state === 'busy'} title={title}
        aria-label={`Pousser la config du poste ${extension}`}
        style={{ fontSize: 12, padding: compact ? '3px 8px' : '4px 10px', whiteSpace: 'nowrap' }}>
        {state === 'busy' ? '…' : compact ? '⇪' : '⇪ Pousser la config'}
      </button>
      <span style={{ fontSize: 12, color: 'var(--c-muted)', whiteSpace: 'nowrap' }} title="Dernière configuration prise par le téléphone">
        {date ? `prise ${date}` : '—'}
      </span>
      {state === 'ok' && <span style={{ fontSize: 12, color: '#059669', fontWeight: 600, whiteSpace: 'nowrap' }}>Envoyé</span>}
      {state && state !== 'ok' && state !== 'busy' && <span style={{ fontSize: 12, color: '#DC2626' }}>{state}</span>}
    </span>
  )
}
