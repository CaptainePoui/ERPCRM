import { useState } from 'react'
import api from '../services/api'

export default function QuickNewContact({ initialName = '', onCreated, onClose }) {
  const parts = initialName.trim().split(' ')
  const [form, setForm] = useState({
    first_name: parts[0] || '',
    last_name: parts.slice(1).join(' ') || '',
    email: '',
    phone: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  async function save() {
    if (!form.first_name.trim()) { setError('Le prénom est requis'); return }
    setSaving(true)
    try {
      const r = await api.post('/v1/contacts', form)
      onCreated(r.data)
    } catch { setError('Erreur lors de la création') } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 300 }}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Nouveau contact</h3>
        {error && <div className="form-error">{error}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Prénom *</label>
            <input value={form.first_name} onChange={e => f('first_name', e.target.value)} autoFocus />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Nom</label>
            <input value={form.last_name} onChange={e => f('last_name', e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label>Courriel</label>
          <input type="email" value={form.email} onChange={e => f('email', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Téléphone</label>
          <input value={form.phone} onChange={e => f('phone', e.target.value)} />
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving || !form.first_name.trim()}>{saving ? '...' : 'Créer'}</button>
        </div>
      </div>
    </div>
  )
}
