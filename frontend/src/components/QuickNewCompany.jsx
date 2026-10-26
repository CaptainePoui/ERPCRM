import { useState } from 'react'
import { createChecked } from '../utils/duplicates'

export default function QuickNewCompany({ initialName = '', onCreated, onClose }) {
  const [name, setName] = useState(initialName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!name.trim()) { setError('Le nom est requis'); return }
    setSaving(true)
    try {
      const res = await createChecked('/v1/companies', { name: name.trim() }, { use: true })   // deja dans ERPCRM ? (TASK-003.3)
      if (res) onCreated(res.created || res.existing)
    } catch { setError('Erreur lors de la création') } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 300 }}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Nouvelle compagnie</h3>
        {error && <div className="form-error">{error}</div>}
        <div className="form-group">
          <label>Nom *</label>
          <input value={name} onChange={e => setName(e.target.value)} autoFocus
            onKeyDown={e => e.key === 'Enter' && save()} />
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving || !name.trim()}>{saving ? '...' : 'Créer'}</button>
        </div>
      </div>
    </div>
  )
}
