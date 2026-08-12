import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import NewDevisModal from '../components/NewDevisModal'
import './Invoices.css'

const STATUS_LABELS = {
  brouillon: { label: 'Brouillon', color: '#6B7280' },
  envoye:    { label: 'Envoyé',    color: 'var(--brand)' },
  accepte:   { label: 'Accepté',   color: '#059669' },
  refuse:    { label: 'Refusé',    color: '#DC2626' },
  expire:    { label: 'Expiré',    color: '#9CA3AF' },
}

const FILTERS = [
  ['', 'Tous'],
  ['brouillon', 'Brouillon'],
  ['envoye', 'Envoyé'],
  ['accepte', 'Accepté'],
  ['refuse', 'Refusé'],
  ['expire', 'Expiré'],
]

export default function Devis() {
  const [devisList, setDevisList] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const navigate = useNavigate()

  useEffect(() => { load() }, [filter])

  async function load() {
    setLoading(true)
    const params = filter ? `?status=${filter}` : ''
    const r = await api.get(`/v1/devis${params}`)
    setDevisList(r.data)
    setLoading(false)
  }

  const filtered = devisList.filter(d =>
    d.company_name.toLowerCase().includes(search.toLowerCase()) ||
    d.number.toLowerCase().includes(search.toLowerCase())
  )

  function fmt(val) {
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(val)
  }

  function fmtDate(d) {
    return new Date(d + 'T00:00:00').toLocaleDateString('fr-CA')
  }

  function fmtOpened(iso) {
    if (!iso) return null
    const d = new Date(iso)
    return d.toLocaleDateString('fr-CA') + ' ' + d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Devis</h1>
          <p className="page-sub">{devisList.length} devis</p>
        </div>
        <button className="btn-primary" onClick={() => setShowNew(true)}>+ Nouveau devis</button>
      </div>

      <div className="page-toolbar" style={{ gap: 10 }}>
        <input className="search-input" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
        <div className="filter-tabs">
          {FILTERS.map(([val, label]) => (
            <button key={val} className={`filter-tab${filter === val ? ' active' : ''}`} onClick={() => setFilter(val)}>{label}</button>
          ))}
        </div>
      </div>

      {loading ? <div className="loading">Chargement...</div> : (
        <div className="inv-table-wrap">
          <table className="inv-table">
            <thead>
              <tr>
                <th>Numéro</th>
                <th>Compagnie</th>
                <th>Statut</th>
                <th>Date</th>
                <th>Valide jusqu'au</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th>Vu</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => {
                const s = STATUS_LABELS[d.status] || STATUS_LABELS.brouillon
                return (
                  <tr key={d.id} className="inv-row" onClick={() => navigate(`/devis/${d.id}`)}>
                    <td className="inv-number">{d.number}{d.invoice_id ? ' ✓' : ''}</td>
                    <td>{d.company_name}</td>
                    <td><span className="inv-badge" style={{ background: s.color }}>{s.label}</span></td>
                    <td>{fmtDate(d.issue_date)}</td>
                    <td>{fmtDate(d.valid_until)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(d.total)}</td>
                    <td style={{ fontSize: 12, color: '#6B7280' }} title={d.open_count > 1 ? `Ouvert ${d.open_count} fois` : ''}>
                      {d.last_opened_at ? `👁 ${fmtOpened(d.last_opened_at)}` : '—'}
                    </td>
                    <td className="inv-arrow">›</td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9CA3AF', padding: '24px' }}>Aucun devis</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showNew && <NewDevisModal onClose={() => setShowNew(false)} />}
    </div>
  )
}
