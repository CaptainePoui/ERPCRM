import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import NewTicketModal from '../components/NewTicketModal'
import './Tickets.css'

const PRIORITY_LABELS = {
  faible:   { label: 'Faible',    color: '#6B7280' },
  normal:   { label: 'Normal',    color: 'var(--brand)' },
  urgent:   { label: 'Urgent',    color: '#D97706' },
  critique: { label: 'Critique',  color: '#DC2626' },
}

const STATUS_LABELS = {
  ouvert:              { label: 'Ouvert',                   color: 'var(--brand)' },
  en_cours:            { label: 'En cours',                 color: '#059669' },
  en_attente_client:   { label: "En attente d'une réponse",  color: '#7C3AED' },
  facture:             { label: 'Facturé',                  color: '#0891B2' },
  ferme:               { label: 'Fermé',                    color: '#6B7280' },
}

// Chaque puce est un interrupteur (clic = ajoute/retire du groupe) -- plusieurs
// statuts actifs en meme temps combinent leurs tickets (TASK filtre combinable).
const STATUS_FILTERS = [['ouvert', 'Ouverts'], ['en_cours', 'En cours'], ['en_attente_client', "En attente d'une réponse"], ['facture', 'Facturés'], ['ferme', 'Fermés']]

// Groupe par defaut demande explicitement : "tous les tickets de ouvert, en
// cours, en attente" -- remplace l'ancien defaut a statut unique "ouvert".
const DEFAULT_STATUS_FILTERS = ['ouvert', 'en_cours', 'en_attente_client']

// Persiste le groupe de filtres choisi (localStorage) -- demande explicite : "je
// veux que quand je reviennne elle soit encore comme ca".
const FILTERS_STORAGE_KEY = 'tickets_status_filters'

function loadSavedStatusFilters() {
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY)
    if (raw === null) return new Set(DEFAULT_STATUS_FILTERS)
    return new Set(JSON.parse(raw))
  } catch {
    return new Set(DEFAULT_STATUS_FILTERS)
  }
}

function fmtMins(min) {
  if (!min) return '—'
  const h = Math.floor(min / 60), m = min % 60
  return h > 0 ? `${h}h${m > 0 ? m + 'm' : ''}` : `${m}m`
}

function fmtOpened(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('fr-CA') + ' ' + d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function Tickets() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilters, setStatusFilters] = useState(loadSavedStatusFilters)
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const navigate = useNavigate()

  useEffect(() => { load() }, [])

  useEffect(() => {
    localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify([...statusFilters]))
  }, [statusFilters])

  async function load() {
    setLoading(true)
    const r = await api.get('/v1/tickets')
    setTickets(r.data)
    setLoading(false)
  }

  function toggleStatus(val) {
    setStatusFilters(prev => {
      const next = new Set(prev)
      if (next.has(val)) next.delete(val)
      else next.add(val)
      return next
    })
  }

  const filtered = tickets.filter(t =>
    (statusFilters.size === 0 || statusFilters.has(t.status)) &&
    (t.title.toLowerCase().includes(search.toLowerCase()) ||
     t.company_name.toLowerCase().includes(search.toLowerCase()) ||
     (t.contact_name || '').toLowerCase().includes(search.toLowerCase()))
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
          <button
            className={`filter-tab${statusFilters.size === 0 ? ' active' : ''}`}
            onClick={() => setStatusFilters(new Set())}
          >
            Tous
          </button>
          {STATUS_FILTERS.map(([val, label]) => (
            <button
              key={val}
              className={`filter-tab${statusFilters.has(val) ? ' active' : ''}`}
              onClick={() => toggleStatus(val)}
              title="Cliquer pour ajouter/retirer du groupe affiché"
            >
              {label}
            </button>
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
                <th>Vu</th>
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
                    <td style={{ fontSize: 12, color: '#6B7280' }} title={t.open_count > 1 ? `Ouvert ${t.open_count} fois` : ''}>
                      {t.last_opened_at ? `👁 ${fmtOpened(t.last_opened_at)}` : '—'}
                    </td>
                    <td className="inv-arrow">›</td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: '#9CA3AF', padding: '24px' }}>Aucun ticket</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showNew && <NewTicketModal onClose={() => setShowNew(false)} onCreated={t => { navigate(`/tickets/${t.id}`) }} />}
    </div>
  )
}

