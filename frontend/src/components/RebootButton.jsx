// Bouton « Redemarrer » (2026-10-10) : envoie au telephone du poste l'ordre de redemarrer (il relit sa configuration).
// Fiche du poste (a cote du statut en direct) et liste des postes de la compagnie (entre IP privee et Actif).
import { useState } from 'react'
import api from '../services/api'
import { askConfirm } from './Dialog'

export default function RebootButton({ sipExtId, extension, registered, compact = false }) {
  const [state, setState] = useState(null)      // null | 'busy' | 'ok' | message d'erreur
  async function reboot(ev) {
    ev?.stopPropagation()
    if (!await askConfirm(`Redémarrer le téléphone du poste ${extension} ? Un appel en cours sera coupé.`)) return
    setState('busy')
    try {
      await api.post(`/v1/telephony/extensions/${sipExtId}/reboot`)
      setState('ok')
      setTimeout(() => setState(null), 6000)
    } catch (e) { setState(e.response?.data?.detail || 'Échec') }
  }
  if (!sipExtId) return null
  const title = registered ? 'Redémarrer le téléphone à distance' : 'Aucun téléphone enregistré sous ce poste'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={ev => ev.stopPropagation()}>
      <button type="button" className="btn-secondary" onClick={reboot} disabled={!registered || state === 'busy'} title={title}
        style={{ fontSize: 12, padding: compact ? '3px 8px' : '4px 10px', whiteSpace: 'nowrap' }}>
        {state === 'busy' ? '…' : compact ? '↻' : '↻ Redémarrer'}
      </button>
      {state === 'ok' && <span style={{ fontSize: 12, color: '#059669', fontWeight: 600, whiteSpace: 'nowrap' }}>Envoyé</span>}
      {state && state !== 'ok' && state !== 'busy' && <span style={{ fontSize: 12, color: '#DC2626' }}>{state}</span>}
    </span>
  )
}
