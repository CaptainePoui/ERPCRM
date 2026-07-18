import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import NewTicketModal from '../components/NewTicketModal'
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

