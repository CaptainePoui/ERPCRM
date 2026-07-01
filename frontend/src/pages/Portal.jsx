import { useState, useEffect } from 'react'
import api from '../services/api'
import './Portal.css'

const PORTAL_KEY = 'portal_session'

function getSession() {
  try { return JSON.parse(localStorage.getItem(PORTAL_KEY)) } catch { return null }
}

export default function Portal() {
  const [session, setSession] = useState(() => getSession())

  function handleLogin(sess) {
    localStorage.setItem(PORTAL_KEY, JSON.stringify(sess))
    // Store portal token separately from internal token
    localStorage.setItem('portal_token', sess.access_token)
    setSession(sess)
  }

  function handleLogout() {
    localStorage.removeItem(PORTAL_KEY)
    localStorage.removeItem('portal_token')
    setSession(null)
  }

  if (!session) return <PortalLogin onLogin={handleLogin} />
  return <PortalDashboard session={session} onLogout={handleLogout} />
}

// ── Login ─────────────────────────────────────────────────────────────────────

function PortalLogin({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const r = await api.post('/v1/portal/login', { email, password })
      onLogin(r.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Identifiants invalides')
    } finally { setLoading(false) }
  }

  return (
    <div className="portal-login-wrap">
      <div className="portal-login-card">
        <div className="portal-logo">Simple IP</div>
        <h2 className="portal-login-title">Portail client</h2>
        <form onSubmit={submit}>
          {error && <div className="portal-error">{error}</div>}
          <div className="form-group"><label>Courriel</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus required /></div>
          <div className="form-group"><label>Mot de passe</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
          <button type="submit" className="portal-login-btn" disabled={loading}>{loading ? 'Connexion...' : 'Se connecter'}</button>
        </form>
      </div>
    </div>
  )
}

// ── Dashboard ────────────────────────────────────────────────────────────────

const portalApi = {
  async get(path) {
    const token = localStorage.getItem('portal_token')
    return api.get(path, { headers: { Authorization: `Bearer ${token}` } })
  },
  async post(path, data) {
    const token = localStorage.getItem('portal_token')
    return api.post(path, data, { headers: { Authorization: `Bearer ${token}` } })
  }
}

const TABS_MAP = {
  can_view_invoices: { label: 'Factures', key: 'invoices' },
  can_view_tickets: { label: 'Tickets', key: 'tickets' },
  can_view_equipment: { label: 'Équipements', key: 'equipment' },
}

const STATUS_FR = {
  // invoices
  brouillon: 'Brouillon', envoyee: 'Envoyée', payee: 'Payée', en_retard: 'En retard', annulee: 'Annulée',
  // tickets
  ouvert: 'Ouvert', en_cours: 'En cours', en_attente: 'En attente', resolu: 'Résolu', ferme: 'Fermé',
  // equipment
  actif: 'Actif', inactif: 'Inactif', hors_service: 'Hors service',
}
const STATUS_COLOR = {
  payee: '#059669', en_retard: '#DC2626', envoyee: '#2563EB', brouillon: '#6B7280', annulee: '#9CA3AF',
  ouvert: '#2563EB', en_cours: '#D97706', resolu: '#059669', ferme: '#9CA3AF', en_attente: '#7C3AED',
  actif: '#059669', inactif: '#9CA3AF', hors_service: '#DC2626',
}

function PortalDashboard({ session, onLogout }) {
  const perms = session.permissions || {}
  const tabs = Object.entries(TABS_MAP).filter(([key]) => perms[key]).map(([, v]) => v)
  const [tab, setTab] = useState(tabs[0]?.key || '')
  const [data, setData] = useState({})
  const [loading, setLoading] = useState(false)
  const [showNewTicket, setShowNewTicket] = useState(false)

  useEffect(() => {
    if (!tab) return
    setLoading(true)
    portalApi.get(`/v1/portal/${tab}`)
      .then(r => setData(p => ({ ...p, [tab]: r.data })))
      .finally(() => setLoading(false))
  }, [tab])

  const fmt = n => `${parseFloat(n || 0).toFixed(2)} $`
  const fmtDate = s => s ? new Date(s).toLocaleDateString('fr-CA') : '—'

  return (
    <div className="portal-page">
      <div className="portal-topbar">
        <div className="portal-brand">Simple IP — Portail client</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#9CA3AF', fontSize: 13 }}>{session.full_name}</span>
          <button className="portal-logout" onClick={onLogout}>Déconnexion</button>
        </div>
      </div>

      <div className="portal-body">
        <div className="portal-tabs">
          {tabs.map(t => (
            <button key={t.key} className={`portal-tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>

        {loading && <div className="loading" style={{ padding: '24px 0' }}>Chargement...</div>}

        {!loading && tab === 'invoices' && (
          <div>
            <table className="portal-table">
              <thead><tr><th>Numéro</th><th>Statut</th><th>Total</th><th>Échéance</th></tr></thead>
              <tbody>
                {(data.invoices || []).map(inv => (
                  <tr key={inv.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{inv.invoice_number}</td>
                    <td><span style={{ color: STATUS_COLOR[inv.status] || '#6B7280', fontWeight: 600, fontSize: 12 }}>{STATUS_FR[inv.status] || inv.status}</span></td>
                    <td style={{ fontFamily: 'monospace' }}>{fmt(inv.total_ttc)}</td>
                    <td style={{ color: '#6B7280', fontSize: 13 }}>{fmtDate(inv.due_date)}</td>
                  </tr>
                ))}
                {(data.invoices || []).length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9CA3AF', padding: '24px 0' }}>Aucune facture.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {!loading && tab === 'tickets' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              {perms.can_create_tickets && (
                <button className="btn-primary" style={{ fontSize: 13 }} onClick={() => setShowNewTicket(true)}>+ Nouveau ticket</button>
              )}
            </div>
            <table className="portal-table">
              <thead><tr><th>Titre</th><th>Priorité</th><th>Statut</th><th>Date</th></tr></thead>
              <tbody>
                {(data.tickets || []).map(t => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.title}</td>
                    <td style={{ color: '#6B7280', fontSize: 13 }}>{t.priority}</td>
                    <td><span style={{ color: STATUS_COLOR[t.status] || '#6B7280', fontWeight: 600, fontSize: 12 }}>{STATUS_FR[t.status] || t.status}</span></td>
                    <td style={{ color: '#6B7280', fontSize: 13 }}>{fmtDate(t.created_at)}</td>
                  </tr>
                ))}
                {(data.tickets || []).length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9CA3AF', padding: '24px 0' }}>Aucun ticket.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {!loading && tab === 'equipment' && (
          <table className="portal-table">
            <thead><tr><th>Nom</th><th>Catégorie</th><th>Marque/Modèle</th><th>IP</th><th>Statut</th></tr></thead>
            <tbody>
              {(data.equipment || []).map(e => (
                <tr key={e.id}>
                  <td style={{ fontWeight: 600 }}>{e.name}</td>
                  <td style={{ color: '#6B7280', fontSize: 13 }}>{e.category}</td>
                  <td style={{ color: '#6B7280', fontSize: 13 }}>{[e.brand, e.model].filter(Boolean).join(' ')}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{e.ip_address || '—'}</td>
                  <td><span style={{ color: STATUS_COLOR[e.status] || '#6B7280', fontWeight: 600, fontSize: 12 }}>{STATUS_FR[e.status] || e.status}</span></td>
                </tr>
              ))}
              {(data.equipment || []).length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9CA3AF', padding: '24px 0' }}>Aucun équipement.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showNewTicket && (
        <NewTicketModal onClose={() => setShowNewTicket(false)}
          onCreated={t => {
            setData(p => ({ ...p, tickets: [t, ...(p.tickets || [])] }))
            setShowNewTicket(false)
          }} />
      )}
    </div>
  )
}

function NewTicketModal({ onClose, onCreated }) {
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [saving, setSaving] = useState(false)
  async function save() {
    if (!title.trim()) return
    setSaving(true)
    try {
      const r = await portalApi.post('/v1/portal/tickets', { title, description: desc || null })
      onCreated(r.data)
    } finally { setSaving(false) }
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Nouveau ticket</h3>
        <div className="form-group"><label>Titre *</label><input value={title} onChange={e => setTitle(e.target.value)} autoFocus /></div>
        <div className="form-group"><label>Description</label><textarea value={desc} onChange={e => setDesc(e.target.value)} rows={4} /></div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving || !title.trim()}>{saving ? '...' : 'Envoyer'}</button>
        </div>
      </div>
    </div>
  )
}
