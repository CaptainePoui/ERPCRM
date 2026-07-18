import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import NewInvoiceModal from '../components/NewInvoiceModal'
import './Invoices.css'

const STATUS_LABELS = {
  brouillon:  { label: 'Brouillon',  color: '#6B7280' },
  envoyee:    { label: 'Envoyée',    color: '#2563EB' },
  payee:      { label: 'Payée',      color: '#059669' },
  en_retard:  { label: 'En retard',  color: '#DC2626' },
  annulee:    { label: 'Annulée',    color: '#9CA3AF' },
}

const FILTERS = [
  ['', 'Toutes'],
  ['brouillon', 'Brouillon'],
  ['envoyee', 'Envoyée'],
  ['payee', 'Payée'],
  ['en_retard', 'En retard'],
]

export default function Invoices() {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [marking, setMarking] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    load()
  }, [filter])

  async function load() {
    setLoading(true)
    const params = filter ? `?status=${filter}` : ''
    const r = await api.get(`/v1/invoices${params}`)
    setInvoices(r.data)
    setLoading(false)
  }

  async function markOverdue() {
    setMarking(true)
    try {
      const r = await api.post('/v1/invoices/mark-overdue')
      if (r.data.updated > 0) await load()
    } finally { setMarking(false) }
  }

  const filtered = invoices.filter(i =>
    i.company_name.toLowerCase().includes(search.toLowerCase()) ||
    i.number.toLowerCase().includes(search.toLowerCase())
  )

  function fmt(val) {
    return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(val)
  }

  function fmtDate(d) {
    return new Date(d + 'T00:00:00').toLocaleDateString('fr-CA')
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Factures</h1>
          <p className="page-sub">{invoices.length} facture{invoices.length !== 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={markOverdue} disabled={marking} style={{ fontSize: 13 }}>{marking ? '...' : 'Marquer en retard'}</button>
          <button className="btn-primary" onClick={() => setShowNew(true)}>+ Nouvelle facture</button>
        </div>
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
                <th>Échéance</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => {
                const s = STATUS_LABELS[inv.status] || STATUS_LABELS.brouillon
                return (
                  <tr key={inv.id} className="inv-row" onClick={() => navigate(`/invoices/${inv.id}`)}>
                    <td className="inv-number">{inv.credit_of_id ? '[Avoir] ' : ''}{inv.number}{inv.is_recurring ? ' ↺' : ''}</td>
                    <td>{inv.company_name}</td>
                    <td><span className="inv-badge" style={{ background: s.color }}>{s.label}</span></td>
                    <td>{fmtDate(inv.issue_date)}</td>
                    <td className={inv.status === 'en_retard' ? 'overdue' : ''}>{fmtDate(inv.due_date)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(inv.total)}</td>
                    <td className="inv-arrow">›</td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9CA3AF', padding: '24px' }}>Aucune facture</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showNew && <NewInvoiceModal onClose={() => setShowNew(false)} />}
    </div>
  )
}

