// Administration -> Pastilles (TASK-002.3, 2026-10-10) : les pastilles des compagnies et des contacts (client,
// fournisseur, sous-traitant...). Ajouter, renommer, changer la couleur, désactiver. Jamais supprimées : une pastille
// désactivée ne s'offre plus sur les fiches, mais reste sur celles qui la portent.
import { useEffect, useState } from 'react'
import api from '../services/api'
import { contrastText } from '../utils/color'

const EMPTY = { name: '', color: '#6B7280' }

export default function PastillesPanel() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)      // id, ou 'new'
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    try { setRows((await api.get('/v1/admin/statuses')).data) }
    catch (e) { setError(e.response?.data?.detail || 'Accès refusé') }
  }

  function start(r) {
    setError('')
    setEditing(r ? r.id : 'new')
    setForm(r ? { name: r.name, color: r.color || '#6B7280', is_active: r.is_active } : EMPTY)
  }

  async function save() {
    setSaving(true); setError('')
    try {
      if (editing === 'new') await api.post('/v1/admin/statuses', form)
      else await api.put(`/v1/admin/statuses/${editing}`, form)
      setEditing(null)
      load()
    } catch (e) { setError(e.response?.data?.detail || 'Erreur') } finally { setSaving(false) }
  }

  if (!rows && !error) return <div className="loading">Chargement...</div>
  if (!rows) return <div className="adm-error">{error}</div>

  const chip = (name, color, faded) => (
    <span style={{ background: color, color: contrastText(color), borderRadius: 12, padding: '3px 10px', fontSize: 12, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap', opacity: faded ? 0.45 : 1 }}>{name || '…'}</span>
  )
  const editRow = (
    <>
      <td>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} autoFocus placeholder="Nom de la pastille"
            onKeyDown={e => e.key === 'Enter' && form.name.trim() && save()}
            style={{ border: '1px solid var(--c-border-strong)', borderRadius: 4, padding: '4px 8px', fontSize: 14 }} />
          <input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} title="Couleur"
            style={{ width: 36, height: 28, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }} />
          {chip(form.name, form.color)}
        </div>
      </td>
      <td />
      <td style={{ textAlign: 'center' }}>
        {editing !== 'new' && <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} />}
      </td>
      <td>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={save} disabled={saving || !form.name.trim()}>{saving ? '...' : 'Enregistrer'}</button>
          <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setEditing(null)}>Annuler</button>
        </div>
      </td>
    </>
  )

  return (
    <div>
      <div className="adm-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className="adm-count">Pastilles des compagnies et des contacts</span>
        {editing === null && <button className="btn-primary" onClick={() => start(null)}>+ Nouvelle pastille</button>}
      </div>
      <p style={{ color: 'var(--c-muted)', fontSize: 13, margin: '8px 0 16px' }}>
        Une compagnie ou un contact peut porter plusieurs pastilles (ex. client et sous-traitant). Une pastille désactivée
        ne s'offre plus sur les fiches, mais reste sur celles qui la portent déjà.
      </p>
      {error && <div className="form-error">{error}</div>}
      <div style={{ overflowX: 'auto' }}>
        <table className="adm-table">
          <thead><tr><th>Pastille</th><th>Fiches</th><th style={{ textAlign: 'center' }}>Active</th><th></th></tr></thead>
          <tbody>
            {editing === 'new' && <tr>{editRow}</tr>}
            {rows.map(r => (
              <tr key={r.id}>
                {editing === r.id ? editRow : (
                  <>
                    <td>{chip(r.name, r.color, !r.is_active)}</td>
                    <td style={{ color: 'var(--c-muted)', fontSize: 13 }}>{r.used}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ color: r.is_active ? '#059669' : 'var(--c-faint)', fontWeight: 600, fontSize: 13 }}>{r.is_active ? 'Oui' : 'Non'}</span>
                    </td>
                    <td>{editing === null && <button className="adm-edit-btn" onClick={() => start(r)}>Modifier</button>}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
