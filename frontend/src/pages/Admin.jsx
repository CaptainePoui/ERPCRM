import { useState, useEffect } from 'react'
import api from '../services/api'
import './Admin.css'

const ROLES = ['admin', 'manager', 'tech', 'billing', 'readonly']
const ROLE_LABELS = { admin: 'Admin', manager: 'Gérant', tech: 'Technicien', billing: 'Facturation', readonly: 'Lecture seule' }
const ROLE_COLORS = { admin: '#DC2626', manager: '#7C3AED', tech: '#2563EB', billing: '#059669', readonly: '#6B7280' }

const fmtDate = s => s ? new Date(s).toLocaleDateString('fr-CA', { year:'numeric', month:'short', day:'numeric' }) : '—'

const TABS = ['Utilisateurs', 'Portail client', 'Méthodes de paiement']

export default function Admin() {
  const [tab, setTab] = useState(0)

  return (
    <div className="adm-page">
      <div className="adm-header">
        <h1 className="adm-title">Administration</h1>
      </div>
      <div className="adm-tabs">
        {TABS.map((t, i) => (
          <button key={t} className={`adm-tab${tab === i ? ' active' : ''}`} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>
      <div className="adm-body">
        {tab === 0 && <UsersPanel />}
        {tab === 1 && <PortalUsersPanel />}
        {tab === 2 && <PaymentMethodsPanel />}
      </div>
    </div>
  )
}

// ── Users ─────────────────────────────────────────────────────────────────────

function UsersPanel() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const r = await api.get('/v1/admin/users')
      setUsers(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Accès refusé')
    } finally { setLoading(false) }
  }

  async function toggle(user) {
    const r = await api.put(`/v1/admin/users/${user.id}`, { is_active: !user.is_active })
    setUsers(p => p.map(u => u.id === user.id ? r.data : u))
  }

  async function deleteUser(user) {
    if (!confirm(`Supprimer ${user.full_name} ?`)) return
    await api.delete(`/v1/admin/users/${user.id}`)
    setUsers(p => p.filter(u => u.id !== user.id))
  }

  if (loading) return <div className="loading">Chargement...</div>
  if (error) return <div className="adm-error">{error}</div>

  return (
    <div>
      <div className="adm-panel-header">
        <span className="adm-count">{users.length} utilisateur{users.length !== 1 ? 's' : ''}</span>
        <button className="btn-primary" onClick={() => setShowNew(true)}>+ Nouvel utilisateur</button>
      </div>
      <table className="adm-table">
        <thead>
          <tr>{['Nom', 'Courriel', 'Rôle', 'Statut', 'Dernier accès', ''].map(h => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} className={u.is_active ? '' : 'adm-row-inactive'}>
              <td className="adm-name">{u.full_name}</td>
              <td style={{ color: '#6B7280', fontSize: 13 }}>{u.email}</td>
              <td>
                <span className="adm-role" style={{ background: ROLE_COLORS[u.role] + '20', color: ROLE_COLORS[u.role] }}>
                  {ROLE_LABELS[u.role] || u.role}
                </span>
              </td>
              <td>
                <button className={`adm-toggle ${u.is_active ? 'active' : 'inactive'}`} onClick={() => toggle(u)}>
                  {u.is_active ? 'Actif' : 'Inactif'}
                </button>
              </td>
              <td style={{ color: '#9CA3AF', fontSize: 13 }}>{fmtDate(u.last_login)}</td>
              <td>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="adm-edit-btn" onClick={() => setEditing(u)}>Modifier</button>
                  <button className="adm-del-btn" onClick={() => deleteUser(u)}>✕</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showNew && (
        <UserModal onClose={() => setShowNew(false)}
          onSaved={u => { setUsers(p => [...p, u]); setShowNew(false) }} />
      )}
      {editing && (
        <UserModal user={editing} onClose={() => setEditing(null)}
          onSaved={u => { setUsers(p => p.map(x => x.id === u.id ? u : x)); setEditing(null) }} />
      )}
    </div>
  )
}

function UserModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState({
    full_name: user?.full_name || '',
    email: user?.email || '',
    role: user?.role || 'readonly',
    password: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  async function save() {
    if (!form.full_name.trim() || !form.email.trim()) return
    if (!user && !form.password) { setError('Mot de passe requis'); return }
    setSaving(true)
    setError('')
    try {
      const payload = { full_name: form.full_name, email: form.email, role: form.role }
      if (form.password) payload.password = form.password
      let r
      if (user) {
        r = await api.put(`/v1/admin/users/${user.id}`, payload)
      } else {
        r = await api.post('/v1/admin/users', payload)
      }
      onSaved(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Erreur')
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">{user ? 'Modifier utilisateur' : 'Nouvel utilisateur'}</h3>
        {error && <div className="adm-form-error">{error}</div>}
        <div className="form-group"><label>Nom complet *</label><input value={form.full_name} onChange={e => f('full_name', e.target.value)} autoFocus /></div>
        <div className="form-group"><label>Courriel *</label><input type="email" value={form.email} onChange={e => f('email', e.target.value)} /></div>
        <div className="form-group">
          <label>Rôle</label>
          <select value={form.role} onChange={e => f('role', e.target.value)}>
            {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>{user ? 'Nouveau mot de passe (laisser vide = inchangé)' : 'Mot de passe *'}</label>
          <input type="password" value={form.password} onChange={e => f('password', e.target.value)} />
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? '...' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}


// ── Portal Users ──────────────────────────────────────────────────────────────

function PortalUsersPanel() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const r = await api.get('/v1/portal/users')
      setUsers(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Erreur de chargement')
    } finally { setLoading(false) }
  }

  async function toggleActive(u) {
    const r = await api.put(`/v1/portal/users/${u.id}`, { is_active: !u.is_active })
    setUsers(p => p.map(x => x.id === u.id ? r.data : x))
  }

  async function deleteUser(u) {
    if (!confirm(`Supprimer l'accès portail de ${u.full_name} ?`)) return
    await api.delete(`/v1/portal/users/${u.id}`)
    setUsers(p => p.filter(x => x.id !== u.id))
  }

  if (loading) return <div className="loading">Chargement...</div>
  if (error) return <div className="adm-error">{error}</div>

  const permLabel = u => [
    u.can_view_invoices && 'Factures',
    u.can_view_tickets && 'Tickets',
    u.can_create_tickets && 'Créer tickets',
    u.can_view_equipment && 'Équipements',
  ].filter(Boolean).join(', ') || 'Aucune'

  return (
    <div>
      <p style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>
        Gérez les accès au portail client. URL du portail : <strong>/portal</strong>
      </p>
      <div className="adm-panel-header">
        <span className="adm-count">{users.length} accès portail</span>
        <button className="btn-primary" onClick={() => setShowNew(true)}>+ Nouvel accès</button>
      </div>
      <table className="adm-table">
        <thead><tr><th>Nom</th><th>Courriel</th><th>Permissions</th><th>Statut</th><th>Dernier accès</th><th></th></tr></thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} className={u.is_active ? '' : 'adm-row-inactive'}>
              <td className="adm-name">{u.full_name}</td>
              <td style={{ color: '#6B7280', fontSize: 13 }}>{u.email}</td>
              <td style={{ color: '#6B7280', fontSize: 12 }}>{permLabel(u)}</td>
              <td>
                <button className={`adm-toggle ${u.is_active ? 'active' : 'inactive'}`} onClick={() => toggleActive(u)}>
                  {u.is_active ? 'Actif' : 'Inactif'}
                </button>
              </td>
              <td style={{ color: '#9CA3AF', fontSize: 13 }}>{fmtDate(u.last_login)}</td>
              <td><button className="adm-del-btn" onClick={() => deleteUser(u)}>✕</button></td>
            </tr>
          ))}
          {users.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9CA3AF', padding: '24px 0' }}>Aucun accès portail.</td></tr>}
        </tbody>
      </table>
      {showNew && (
        <PortalUserModal onClose={() => setShowNew(false)}
          onSaved={u => { setUsers(p => [...p, u]); setShowNew(false) }} />
      )}
    </div>
  )
}

function PortalUserModal({ onClose, onSaved }) {
  const [companies, setCompanies] = useState([])
  const [form, setForm] = useState({
    company_id: '', full_name: '', email: '', password: '',
    can_view_invoices: true, can_view_tickets: true, can_create_tickets: false, can_view_equipment: false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    api.get('/v1/companies/').then(r => setCompanies(r.data))
  }, [])

  async function save() {
    if (!form.company_id || !form.email || !form.full_name || !form.password) { setError('Tous les champs obligatoires'); return }
    setSaving(true)
    setError('')
    try {
      const r = await api.post('/v1/portal/users', form)
      onSaved(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Erreur')
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 460 }} onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Nouvel accès portail</h3>
        {error && <div className="adm-form-error">{error}</div>}
        <div className="form-group">
          <label>Compagnie *</label>
          <select value={form.company_id} onChange={e => f('company_id', e.target.value)} autoFocus>
            <option value="">— Sélectionner —</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Nom complet *</label><input value={form.full_name} onChange={e => f('full_name', e.target.value)} /></div>
        <div className="form-group"><label>Courriel *</label><input type="email" value={form.email} onChange={e => f('email', e.target.value)} /></div>
        <div className="form-group"><label>Mot de passe *</label><input type="password" value={form.password} onChange={e => f('password', e.target.value)} /></div>
        <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>PERMISSIONS</div>
          {[
            ['can_view_invoices', 'Voir les factures'],
            ['can_view_tickets', 'Voir les tickets'],
            ['can_create_tickets', 'Créer des tickets'],
            ['can_view_equipment', 'Voir l\'inventaire'],
          ].map(([key, label]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={form[key]} onChange={e => f(key, e.target.checked)} />
              {label}
            </label>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? '...' : 'Créer'}</button>
        </div>
      </div>
    </div>
  )
}


// ── Payment Methods ───────────────────────────────────────────────────────────

function PaymentMethodsPanel() {
  const [methods, setMethods] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const r = await api.get('/v1/admin/payment-methods')
      setMethods(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Accès refusé')
    } finally { setLoading(false) }
  }

  function startEdit(m) {
    setEditing(m.id)
    setEditForm({ name: m.name, discount_rate: m.discount_rate, is_active: m.is_active })
  }

  async function saveEdit(id) {
    setSaving(true)
    try {
      const r = await api.put(`/v1/admin/payment-methods/${id}`, editForm)
      setMethods(p => p.map(m => m.id === id ? r.data : m))
      setEditing(null)
    } finally { setSaving(false) }
  }

  if (loading) return <div className="loading">Chargement...</div>
  if (error) return <div className="adm-error">{error}</div>

  return (
    <div>
      <p style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>
        Configurez les modes de paiement disponibles et leur taux de rabais automatique.
      </p>
      <table className="adm-table">
        <thead>
          <tr>{['Code', 'Nom', 'Rabais (%)', 'Actif', ''].map(h => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {methods.map(m => (
            <tr key={m.id}>
              <td style={{ fontFamily: 'monospace', color: '#6B7280', fontSize: 12 }}>{m.code}</td>
              <td>
                {editing === m.id ? (
                  <input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                    style={{ border: '1px solid #D1D5DB', borderRadius: 4, padding: '4px 8px', fontSize: 14 }} />
                ) : m.name}
              </td>
              <td style={{ textAlign: 'center' }}>
                {editing === m.id ? (
                  <input type="number" min="0" max="100" step="0.1" value={editForm.discount_rate}
                    onChange={e => setEditForm(p => ({ ...p, discount_rate: parseFloat(e.target.value) }))}
                    style={{ width: 70, border: '1px solid #D1D5DB', borderRadius: 4, padding: '4px 8px', textAlign: 'center', fontSize: 14 }} />
                ) : `${m.discount_rate}%`}
              </td>
              <td style={{ textAlign: 'center' }}>
                {editing === m.id ? (
                  <input type="checkbox" checked={editForm.is_active} onChange={e => setEditForm(p => ({ ...p, is_active: e.target.checked }))} />
                ) : (
                  <span style={{ color: m.is_active ? '#059669' : '#9CA3AF', fontWeight: 600, fontSize: 13 }}>
                    {m.is_active ? 'Oui' : 'Non'}
                  </span>
                )}
              </td>
              <td>
                {editing === m.id ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => saveEdit(m.id)} disabled={saving}>{saving ? '...' : 'Sauvegarder'}</button>
                    <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setEditing(null)}>Annuler</button>
                  </div>
                ) : (
                  <button className="adm-edit-btn" onClick={() => startEdit(m)}>Modifier</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
