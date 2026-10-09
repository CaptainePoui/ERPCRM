// Changer son propre mot de passe (clic sur son nom, en haut a droite -- 2026-10-09). Le mot de passe actuel est
// demande ; jamais affiche ni envoye ailleurs.
import { useState } from 'react'
import api from '../services/api'

export default function ChangePasswordModal({ onClose }) {
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  async function save() {
    setErr('')
    if (next.length < 10) return setErr('Au moins 10 caractères')
    if (next !== again) return setErr('Les deux nouveaux mots de passe ne sont pas pareils')
    setSaving(true)
    try {
      await api.post('/v1/auth/change-password', { current_password: cur, new_password: next })
      setDone(true)
    } catch (e) { setErr(e.response?.data?.detail || 'Erreur') } finally { setSaving(false) }
  }

  const type = show ? 'text' : 'password'
  return (
    <div className="modal-overlay" style={{ zIndex: 400 }}>
      <div className="modal-box" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Changer mon mot de passe</h3>
        {done ? (
          <>
            <p style={{ fontSize: 14, color: '#047857' }}>✓ Mot de passe changé. Utilisez-le à votre prochaine connexion.</p>
            <div className="modal-actions"><button className="btn-primary" onClick={onClose}>Fermer</button></div>
          </>
        ) : (
          <>
            <div className="form-group"><label>Mot de passe actuel</label>
              <input type={type} value={cur} onChange={e => setCur(e.target.value)} autoComplete="current-password" autoFocus /></div>
            <div className="form-group"><label>Nouveau mot de passe (10 caractères ou plus)</label>
              <input type={type} value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" /></div>
            <div className="form-group"><label>Nouveau mot de passe, encore une fois</label>
              <input type={type} value={again} onChange={e => setAgain(e.target.value)} autoComplete="new-password" /></div>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} /> Afficher les mots de passe
            </label>
            {err && <div style={{ color: '#DC2626', fontSize: 13, marginTop: 8 }}>{err}</div>}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={onClose} disabled={saving}>Annuler</button>
              <button className="btn-primary" onClick={save} disabled={saving || !cur || !next || !again}>{saving ? '...' : 'Changer'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
