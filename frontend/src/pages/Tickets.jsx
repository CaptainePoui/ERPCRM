import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import './Tickets.css'

const PRIORITY_LABELS = {
  faible:   { label: 'Faible',    color: '#6B7280' },
  normal:   { label: 'Normal',    color: '#2563EB' },
  urgent:   { label: 'Urgent',    color: '#D97706' },
  critique: { label: 'Critique',  color: '#DC2626' },
}

const STATUS_LABELS = {
  ouvert:              { label: 'Ouvert',       color: '#184FA0' },
  en_cours:            { label: 'En cours',     color: '#059669' },
  en_attente:          { label: 'En attente',   color: '#D97706' },
  fermer_a_facturer:   { label: 'À facturer',   color: '#7C3AED' },
  facture:             { label: 'Facturé',      color: '#0891B2' },
  ferme:               { label: 'Fermé',        color: '#6B7280' },
  annule:              { label: 'Annulé',       color: '#9CA3AF' },
}

const STATUS_FILTERS = [['', 'Tous'], ['ouvert', 'Ouverts'], ['en_cours', 'En cours'], ['en_attente', 'En attente'], ['fermer_a_facturer', 'À facturer'], ['facture', 'Facturés'], ['ferme', 'Fermés']]

function fmtMins(min) {
  if (!min) return '—'
  const h = Math.floor(min / 60), m = min % 60
  return h > 0 ? `${h}h${m > 0 ? m + 'm' : ''}` : `${m}m`
}

export default function Tickets() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('ouvert')
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const navigate = useNavigate()

  useEffect(() => { load() }, [statusFilter])

  async function load() {
    setLoading(true)
    const params = statusFilter ? `?status=${statusFilter}` : ''
    const r = await api.get(`/v1/tickets${params}`)
    setTickets(r.data)
    setLoading(false)
  }

  const filtered = tickets.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.company_name.toLowerCase().includes(search.toLowerCase()) ||
    (t.contact_name || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tickets</h1>
          <p className="page-sub">{tickets.length} ticket{tickets.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowNew(true)}>+ Nouveau ticket</button>
      </div>

      <div className="page-toolbar" style={{ gap: 10 }}>
        <input className="search-input" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
        <div className="filter-tabs">
          {STATUS_FILTERS.map(([val, label]) => (
            <button key={val} className={`filter-tab${statusFilter === val ? ' active' : ''}`} onClick={() => setStatusFilter(val)}>{label}</button>
          ))}
        </div>
      </div>

      {loading ? <div className="loading">Chargement...</div> : (
        <div className="tkt-table-wrap">
          <table className="tkt-table">
            <thead>
              <tr>
                <th>Priorité</th>
                <th>Titre</th>
                <th>Compagnie</th>
                <th>Contact</th>
                <th>Assigné</th>
                <th>Statut</th>
                <th style={{ textAlign: 'right' }}>Temps</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => {
                const p = PRIORITY_LABELS[t.priority] || PRIORITY_LABELS.normal
                const s = STATUS_LABELS[t.status] || STATUS_LABELS.ouvert
                return (
                  <tr key={t.id} className="tkt-row" onClick={() => navigate(`/tickets/${t.id}`)}>
                    <td><span className="tkt-badge" style={{ background: p.color }}>{p.label}</span></td>
                    <td className="tkt-title">{t.title}</td>
                    <td>{t.company_name}</td>
                    <td style={{ color: '#6B7280', fontSize: 13 }}>{t.contact_name || '—'}</td>
                    <td style={{ color: '#6B7280' }}>{t.assigned_name || '—'}</td>
                    <td><span className="tkt-badge" style={{ background: s.color }}>{s.label}</span></td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtMins(t.total_minutes)}</td>
                    <td className="inv-arrow">›</td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9CA3AF', padding: '24px' }}>Aucun ticket</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showNew && <NewTicketModal onClose={() => setShowNew(false)} onCreated={t => { navigate(`/tickets/${t.id}`) }} />}
    </div>
  )
}

function NewTicketModal({ onClose, onCreated }) {
  const [companies, setCompanies] = useState([])
  const [contacts, setContacts] = useState([])
  const [form, setForm] = useState({ company_id: '', contact_id: '', title: '', priority: 'normal', description: '' })
  const [saving, setSaving] = useState(false)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => { api.get('/v1/companies').then(r => setCompanies(r.data)) }, [])

  useEffect(() => {
    if (!form.company_id) { setContacts([]); f('contact_id', ''); return }
    api.get(`/v1/contacts?company_id=${form.company_id}`).then(r => {
      setContacts(r.data)
      f('contact_id', '')
    })
  }, [form.company_id])

  async function save() {
    if (!form.company_id || !form.title.trim()) return
    setSaving(true)
    try {
      const r = await api.post('/v1/tickets', {
        company_id: form.company_id,
        contact_id: form.contact_id || null,
        title: form.title,
        priority: form.priority,
        description: form.description || null,
      })
      onCreated(r.data)
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Nouveau ticket</h3>
        <div className="form-group">
          <label>Compagnie *</label>
          <select value={form.company_id} onChange={e => f('company_id', e.target.value)} autoFocus>
            <option value="">-- Sélectionner --</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {contacts.length > 0 && (
          <div className="form-group">
            <label>Contact (pour notifications courriel)</label>
            <select value={form.contact_id} onChange={e => f('contact_id', e.target.value)}>
              <option value="">-- Aucun --</option>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.full_name}{c.email ? ` — ${c.email}` : ''}</option>)}
            </select>
          </div>
        )}
        <div className="form-group">
          <label>Titre *</label>
          <input value={form.title} onChange={e => f('title', e.target.value)} placeholder="Titre du ticket" />
        </div>
        <div className="form-group">
          <label>Priorité</label>
          <select value={form.priority} onChange={e => f('priority', e.target.value)}>
            <option value="faible">Faible</option>
            <option value="normal">Normal</option>
            <option value="urgent">Urgent</option>
            <option value="critique">Critique</option>
          </select>
        </div>
        <div className="form-group">
          <label>Description</label>
          <textarea value={form.description} onChange={e => f('description', e.target.value)} rows={3} />
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving || !form.company_id || !form.title.trim()}>{saving ? '...' : 'Créer'}</button>
        </div>
      </div>
    </div>
  )
}
