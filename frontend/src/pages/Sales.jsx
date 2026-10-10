import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { C, EMPTY, fmtMoney, fmtDate } from './Bank'

// Menu Ventes (TASK-044, 2026-10-02) : pages ajoutees a cote de Devis / Factures / Recurrence

const fmtD = d => d ? fmtDate(d + 'T00:00:00') : EMPTY
const th = { padding: '10px 8px', fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'left' }
const thR = { ...th, textAlign: 'right' }
const td = { padding: '10px 8px' }
const SOURCE = { zoho_import: 'Paiement antérieur', portal: 'Déclaré au portail', manual: 'Encaissement manuel', bank_import: 'Banque', gateway: 'Paiement en ligne', interac_email: 'Courriel Interac' }
const STATUS = { confirmed: ['Confirmé', '#059669'], pending: ['En attente', '#2563EB'], processing: ['En traitement', '#2563EB'], rejected: ['Rejeté', '#DC2626'], refunded: ['Remboursé', 'var(--c-muted)'], cancelled: ['Annulé', 'var(--c-muted)'] }

// Page structure (module pas encore construit) : titre, colonnes de la future liste, explication
export function ModulePlaceholder({ title, newLabel, columns, note }) {
  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">{title}</h1></div>
        {newLabel && <button className="btn-primary" disabled title="À venir">{newLabel}</button>}
      </div>
      <div style={{ background: 'var(--c-surface)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `1px solid ${C.border}` }}>
              {columns.map((c, i) => <th key={c} style={i >= columns.length - 2 && /Montant|Solde|Total|Dû/.test(c) ? thR : th}>{c}</th>)}
            </tr></thead>
            <tbody><tr><td colSpan={columns.length} style={{ ...td, textAlign: 'center', color: C.faint, padding: 32 }}>{note}</td></tr></tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export function SalesPayments() {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  useEffect(() => { api.get('/v1/payments').then(r => setRows(r.data)) }, [])
  const q = search.trim().toLowerCase()
  const shown = (rows || [])
    .filter(p => filter === 'all' || (filter === 'pending' ? ['pending', 'processing'].includes(p.status) : filter === 'unbanked' ? p.status === 'confirmed' && !p.bank_matched && p.source !== 'zoho_import' : p.status === filter))
    .filter(p => !q || [p.company_name, p.reference, p.method_name, ...p.invoice_numbers, String(p.amount)].some(v => (v || '').toLowerCase().includes(q)))
  const total = shown.filter(p => p.status === 'confirmed').reduce((s, p) => s + p.amount, 0)
  const FILTERS = [['all', 'Tous'], ['confirmed', 'Confirmés'], ['pending', 'En attente'], ['unbanked', 'Pas encore vus en banque'], ['rejected', 'Rejetés']]
  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">Paiements reçus</h1><p className="page-sub">{shown.length} paiement{shown.length > 1 ? 's' : ''} · {fmtMoney(total)} confirmés</p></div>
      </div>
      <div className="page-toolbar" style={{ gap: 10 }}>
        <input className="search-input" placeholder="Rechercher (client, facture, référence, montant)..." value={search} onChange={e => setSearch(e.target.value)} />
        <div className="filter-tabs">{FILTERS.map(([v, l]) => <button key={v} className={`filter-tab${filter === v ? ' active' : ''}`} onClick={() => setFilter(v)}>{l}</button>)}</div>
      </div>
      <div style={{ background: 'var(--c-surface)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '8px 16px' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 820, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `1px solid ${C.border}` }}>
              <th style={th}>Date</th><th style={th}>Client</th><th style={th}>Factures</th><th style={th}>Mode</th><th style={th}>Origine</th><th style={th}>Statut</th><th style={thR}>Montant</th>
            </tr></thead>
            <tbody>
              {rows === null && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: C.muted }}>Chargement...</td></tr>}
              {shown.slice(0, 500).map(p => {
                const [sl, sc] = STATUS[p.status] || [p.status, C.muted]
                return (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtD(p.received_at)}</td>
                    <td style={td}><span style={{ color: C.link, cursor: 'pointer' }} onClick={() => navigate(`/companies/${p.company_id}`)}>{p.company_name}</span></td>
                    <td style={{ ...td, fontSize: 12 }}>{p.invoice_numbers.join(', ') || EMPTY}</td>
                    <td style={td}>{p.method_name}{p.reference ? <div style={{ fontSize: 12, color: C.muted }}>{p.reference}</div> : null}</td>
                    <td style={{ ...td, fontSize: 12, color: C.muted }}>{SOURCE[p.source] || p.source}{p.bank_matched ? ' · vu en banque' : ''}</td>
                    <td style={{ ...td, color: sc, fontWeight: 600, fontSize: 12 }}>{sl}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtMoney(p.amount)}</td>
                  </tr>
                )
              })}
              {rows && !shown.length && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: C.faint, padding: 24 }}>Aucun paiement.</td></tr>}
            </tbody>
          </table>
          {shown.length > 500 && <div style={{ fontSize: 12, color: C.muted, padding: 8 }}>500 premiers affichés — utilisez la recherche.</div>}
        </div>
      </div>
    </div>
  )
}

export const SalesDeposits = () => <ModulePlaceholder title="Factures d'acompte" newLabel="+ Nouvelle facture d'acompte"
  columns={['Date', 'N°', 'Client', 'Statut', 'Montant', 'Solde']}
  note="Une facture d'acompte demande une partie du montant avant le travail ; l'acompte payé se déduit ensuite de la facture finale. À construire." />
