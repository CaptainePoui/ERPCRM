import { useState, useEffect } from 'react'
import useRowSelection from '../hooks/useRowSelection'
import BulkInvoiceBar from '../components/BulkInvoiceBar'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import NewInvoiceModal from '../components/NewInvoiceModal'
import './Invoices.css'

const STATUS_LABELS = {
  brouillon:  { label: 'Brouillon',  color: '#6B7280' },
  envoyee:    { label: 'Envoyée',    color: 'var(--brand)' },
  payee:      { label: 'Payée',      color: '#059669' },
  partiellement_payee: { label: 'Partielle', color: '#D97706' },
  en_retard:  { label: 'En retard',  color: '#DC2626' },
  annulee:    { label: 'Annulée',    color: '#9CA3AF' },
}

// Avoirs (TASK-005.10) : Ouvert = reste un montant a appliquer, Fermé = entierement applique
const CREDIT_STATUS_LABELS = {
  ...STATUS_LABELS,
  envoyee: { label: 'Ouvert', color: 'var(--brand)' },
  payee:   { label: 'Fermé',  color: '#059669' },
}
const CREDIT_FILTERS = [['', 'Tous'], ['brouillon', 'Brouillon'], ['envoyee', 'Ouvert'], ['payee', 'Fermé']]

const FILTERS = [
  ['', 'Toutes'],
  ['brouillon', 'Brouillon'],
  ['envoyee', 'Envoyée'],
  ['payee', 'Payée'],
  ['partiellement_payee', 'Partielle'],
  ['en_retard', 'En retard'],
  ['non_transmise', 'Non transmises'],
]

// creditsOnly : menu Ventes > Factures d'avoir (avoirs seulement)
export default function Invoices({ creditsOnly = false }) {
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
    // « Non transmises » : emises mais pas encore envoyees au client (ex. creees par la facturation periodique automatique)
    const params = filter && filter !== 'non_transmise' ? `?status=${filter}` : ''
    const r = await api.get(`/v1/invoices${params}`)
    setInvoices(filter === 'non_transmise'
      ? r.data.filter(i => i.transmission_status === 'non_transmise' && !['brouillon', 'annulee'].includes(i.status))
      : r.data)
    setLoading(false)
  }

  async function markOverdue() {
    setMarking(true)
    try {
      const r = await api.post('/v1/invoices/mark-overdue')
      if (r.data.updated > 0) await load()
    } finally { setMarking(false) }
  }

  const filtered = invoices.filter(i => creditsOnly ? !!i.credit_of_id : true).filter(i =>
    i.company_name.toLowerCase().includes(search.toLowerCase()) ||
    i.number.toLowerCase().includes(search.toLowerCase())
  )
  // Selection multiple (TASK-046) : case, Ctrl+clic, Maj+clic -> barre d'actions en bas
  const sel = useRowSelection(filtered)
  const picked = sel.visible.map(i => ({ ...i, paid: i.paid || 0, is_credit: !!i.credit_of_id, late_fee: !!i.late_fee_for_id,
    remaining: i.credit_of_id || ['brouillon', 'annulee'].includes(i.status) ? 0 : Math.max(0, Math.round((i.total - (i.paid || 0)) * 100) / 100) }))

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
          <h1 className="page-title">{creditsOnly ? "Factures d'avoir" : 'Factures'}</h1>
          <p className="page-sub">{creditsOnly ? `${invoices.filter(i => i.credit_of_id).length} avoir(s) — créer un avoir depuis la facture visée (« Créer un avoir »), puis l'appliquer` : `${invoices.length} facture${invoices.length !== 1 ? 's' : ''}`}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={markOverdue} disabled={marking} style={{ fontSize: 13 }}>{marking ? '...' : 'Marquer en retard'}</button>
          <button className="btn-primary" onClick={() => setShowNew(true)}>+ Nouvelle facture</button>
        </div>
      </div>

      <div className="page-toolbar" style={{ gap: 10 }}>
        <input className="search-input" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
        <div className="filter-tabs">
          {(creditsOnly ? CREDIT_FILTERS : FILTERS).map(([val, label]) => (
            <button key={val} className={`filter-tab${filter === val ? ' active' : ''}`} onClick={() => setFilter(val)}>{label}</button>
          ))}
        </div>
      </div>

      {loading ? <div className="loading">Chargement...</div> : (
        <div className="inv-table-wrap">
          <table className="inv-table">
            <thead>
              <tr>
                <th style={{ width: 28 }}><input type="checkbox" checked={sel.allChecked} onChange={sel.toggleAll} title="Tout sélectionner" /></th>
                <th>Date</th>
                <th>Numéro</th>
                <th>Compagnie</th>
                <th>Statut</th>
                <th>Échéance</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th>Vu</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => {
                const s = inv.offered_at ? { label: 'Offerte', color: '#8B5CF6' } : ((inv.credit_of_id ? CREDIT_STATUS_LABELS : STATUS_LABELS)[inv.status] || STATUS_LABELS.brouillon)
                return (
                  <tr key={inv.id} className="inv-row" onClick={e => sel.rowClick(e, inv.id, () => navigate(`/invoices/${inv.id}`))}
                    onMouseDown={sel.noTextSelect} style={sel.selected.has(inv.id) ? { background: 'var(--c-tint-blue)' } : undefined}>
                    <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={sel.selected.has(inv.id)} onChange={e => sel.toggle(inv.id, e.nativeEvent)} /></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(inv.issue_date)}</td>
                    <td className="inv-number" style={{ whiteSpace: 'nowrap' }}>{inv.credit_of_id ? '[Avoir] ' : ''}{inv.number}{inv.is_recurring ? ' ↺' : ''}</td>
                    <td>{inv.company_name}{inv.site_label_snapshot && <div style={{ fontSize: 11, color: 'var(--c-faint)' }}>{inv.site_label_snapshot}</div>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span className="inv-badge" style={{ background: s.color }}>{s.label}</span>
                      {inv.transmission_status === 'non_transmise' && inv.status !== 'brouillon' && (
                        <span title="Le PDF n'a pas été transmis au client" style={{ marginLeft: 6, fontSize: 11, fontWeight: 600, color: 'var(--c-on-amber)', border: '1px solid #FCD34D', background: 'var(--c-tint-amber)', borderRadius: 10, padding: '1px 7px' }}>Non transmise</span>
                      )}
                    </td>
                    <td className={inv.status === 'en_retard' ? 'overdue' : ''} style={{ whiteSpace: 'nowrap' }}>{fmtDate(inv.due_date)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(inv.total)}</td>
                    <td style={{ fontSize: 12, color: 'var(--c-muted)' }} title={inv.open_count > 1 ? `Ouvert ${inv.open_count} fois` : ''}>
                      {inv.last_opened_at ? `👁 ${fmtOpened(inv.last_opened_at)}` : '—'}
                    </td>
                    <td className="inv-arrow">›</td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--c-faint)', padding: '24px' }}>Aucune facture</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <BulkInvoiceBar items={picked} onClear={sel.clear} onDone={load} />
      {showNew && <NewInvoiceModal onClose={() => setShowNew(false)} />}
    </div>
  )
}

