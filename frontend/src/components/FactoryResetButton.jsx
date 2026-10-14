// Bouton « Remise à zéro » (2026-10-14, Philippe : « l'option Factory Reset avec un popup Attention ») : remet le téléphone
// du poste aux réglages d'usine (ordre SIP « reset » authentifié). Popup Attention : il faut taper le numéro du poste ; le
// popup ne se ferme qu'avec Annuler ou Remettre à zéro.
import { useState } from 'react'
import api from '../services/api'

export default function FactoryResetButton({ sipExtId, extension, registered, compact = false }) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [state, setState] = useState(null)      // null | 'busy' | 'ok' | message d'erreur

  async function reset() {
    setState('busy')
    try {
      await api.post(`/v1/telephony/extensions/${sipExtId}/factory-reset`)
      setState('ok'); setOpen(false); setTyped('')
      setTimeout(() => setState(null), 8000)
    } catch (e) { setState(e.response?.data?.detail || 'Échec') }
  }
  if (!sipExtId) return null
  const title = registered ? `Remettre le téléphone du poste ${extension} aux réglages d'usine` : 'Aucun téléphone enregistré sous ce poste'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={ev => ev.stopPropagation()}>
      <button type="button" className="btn-secondary" onClick={() => { setOpen(true); setState(null) }} disabled={!registered || state === 'busy'} title={title}
        aria-label={`Remise à zéro du poste ${extension}`}
        style={{ fontSize: 12, padding: compact ? '3px 8px' : '4px 10px', whiteSpace: 'nowrap', color: '#DC2626' }}>
        {compact ? '⟲' : '⟲ Remise à zéro'}
      </button>
      {state === 'ok' && <span style={{ fontSize: 12, color: '#059669', fontWeight: 600, whiteSpace: 'nowrap' }}>Envoyé</span>}
      {state && state !== 'ok' && state !== 'busy' && !open && <span style={{ fontSize: 12, color: '#DC2626' }}>{state}</span>}
      {open && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 520, cursor: 'default' }}>
            <h3 className="modal-title" style={{ color: '#DC2626' }}>⚠ Attention — remise à zéro du poste {extension}</h3>
            <div style={{ fontSize: 14, lineHeight: 1.55 }}>
              <p style={{ margin: '0 0 10px' }}>Le téléphone sera remis aux <b>réglages d'usine</b> : un appel en cours est coupé, et tout ce qui est réglé dans le téléphone est effacé.</p>
              <p style={{ margin: '0 0 10px' }}>Il oublie aussi <b>l'adresse de son serveur de configuration</b> : il ne reviendra pas tout seul vers SIPV. Il faudra le reprovisionner sur place (Maintenance → Upgrade and Provisioning → Config Server Path), sauf si le réseau du client donne l'adresse automatiquement (DHCP option 66).</p>
              <p style={{ margin: 0 }}>Il faut aussi que le téléphone ait déjà pris une configuration récente (« Allow SIP Reset »), sinon il ignore l'ordre.</p>
            </div>
            <div className="form-group" style={{ marginTop: 14 }}>
              <label>Pour confirmer, tapez le numéro du poste ({extension})</label>
              <input value={typed} onChange={e => setTyped(e.target.value)} autoFocus aria-label="Numéro du poste à confirmer" />
            </div>
            {state && state !== 'busy' && state !== 'ok' && <div style={{ color: '#DC2626', fontSize: 13 }}>{state}</div>}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => { setOpen(false); setTyped(''); setState(null) }} disabled={state === 'busy'}>Annuler</button>
              <button className="btn-primary" style={{ background: '#DC2626', borderColor: '#DC2626' }} onClick={reset}
                disabled={typed.trim() !== String(extension) || state === 'busy'}>{state === 'busy' ? '...' : 'Remettre à zéro'}</button>
            </div>
          </div>
        </div>
      )}
    </span>
  )
}
