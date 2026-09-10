import { useState } from 'react'

export default function UnsavedChangesPrompt({ blocker, onSave }) {
  const [saving, setSaving] = useState(false)
  if (!blocker || blocker.state !== 'blocked') return null

  async function save() {
    setSaving(true)
    try {
      await onSave()
      blocker.proceed()
    } catch {
      // l'erreur de sauvegarde est deja affichee par le formulaire lui-meme -- on reste sur la page
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 400 }}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Informations non sauvegardées</h3>
        <p style={{ fontSize: 14, color: '#374151', margin: 0 }}>
          Des informations non sauvegardées seront perdues si vous quittez maintenant.
        </p>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={() => blocker.reset()}>Rester sur la page</button>
          <button className="btn-secondary" onClick={() => blocker.proceed()}>Continuer sans sauvegarder</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? '...' : 'Sauvegarder'}</button>
        </div>
      </div>
    </div>
  )
}
