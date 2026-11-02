// Fiche compagnie -> Transactions -> « Comptes à payer » (TASK-002.13 étape 2, GO de Philippe 2026-11-01) : les factures de
// sa fiche fournisseur, les paiements faits, les avoirs et les dépenses -- les mêmes données qu'Achats, regroupées sur la
// compagnie. Un clic ouvre le document dans Achats ; on y ajoute et modifie comme d'habitude.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { BILL_STATUS, fmtD } from './common'

const money = v => (v ?? 0).toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })
const FILTERS = [['', 'Tout'], ['ouvertes', 'À payer'], ['retard', 'En retard'], ['payees', 'Payées'], ['paiements', 'Paiements faits'],
                 ['avoirs', 'Avoirs'], ['depenses', 'Dépenses']]
const KIND = { payment: ['Paiement', '#059669'], credit: ['Avoir', '#D97706'], expense: ['Dépense', 'var(--c-muted)'] }
const OPEN = { bill: id => `/purchases/bills/${id}`, payment: id => `/purchases/payments?open=${id}`,
               credit: id => `/purchases/credits?open=${id}`, expense: id => `/purchases/expenses?open=${id}` }

// summaryOnly : seulement les totaux (carte « À payer » de Général, plus rapide)
export function usePayables(companyId, summaryOnly = false) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api.get(`/v1/companies/${companyId}/payables`, { params: summaryOnly ? { summary_only: true } : undefined }).then(r => setData(r.data))
      .catch(e => setError(e.response?.status === 403 ? 'Il faut le privilège « Achats » pour voir les comptes à payer.' : 'Lecture impossible'))
  }, [companyId, summaryOnly])
  return { data, error }
}

export default function CompanyPayables({ companyId }) {
  const navigate = useNavigate()
  const { data, error } = usePayables(companyId)
  const [filter, setFilter] = useState('')
  if (error) return <div className="empty-tab">{error}</div>
  if (!data) return <div className="loading">Chargement...</div>
  const live = t => t.kind === 'bill' && t.status !== 'brouillon' && t.status !== 'annulee'
  const shown = data.transactions.filter(t => {
    if (filter === 'ouvertes') return live(t) && t.remaining > 0.005
    if (filter === 'retard') return t.overdue
    if (filter === 'payees') return live(t) && t.remaining <= 0.005
    if (filter === 'paiements') return t.kind === 'payment'
    if (filter === 'avoirs') return t.kind === 'credit'
    if (filter === 'depenses') return t.kind === 'expense'
    return true
  })
  const bills = shown.filter(live)
  const sum = k => bills.reduce((s, t) => s + t[k], 0)
  const s = data.summary
  return (
    <div>
      <div className="cd-fin-row" style={{ marginBottom: 12 }}>
        <div className="cd-fin-card clickable" onClick={() => setFilter('ouvertes')}>
          <div className="cd-fin-label">À payer</div>
          <div className="cd-fin-value" style={{ color: s.balance_due > 0 ? 'var(--c-text)' : '#059669' }}>{money(s.balance_due)}</div>
          <div className="cd-fin-sub">{s.balance_due > 0 ? 'Voir les factures à payer' : 'Rien à payer'}</div>
        </div>
        {s.overdue > 0 && (
          <div className="cd-fin-card clickable" onClick={() => setFilter('retard')} style={{ borderColor: '#FCA5A5', background: 'var(--c-tint-red)' }}>
            <div className="cd-fin-label">En retard</div>
            <div className="cd-fin-value" style={{ color: '#DC2626' }}>{money(s.overdue)}</div>
            <div className="cd-fin-sub">{s.overdue_count} facture{s.overdue_count > 1 ? 's' : ''} · la plus vieille : {s.oldest_overdue_days} j</div>
          </div>
        )}
        {s.credits_available > 0 && (
          <div className="cd-fin-card clickable" onClick={() => setFilter('avoirs')}>
            <div className="cd-fin-label">Avoirs disponibles</div>
            <div className="cd-fin-value" style={{ color: '#D97706' }}>{money(s.credits_available)}</div>
            <div className="cd-fin-sub">À appliquer sur ses factures</div>
          </div>
        )}
        <div className="cd-fin-card">
          <div className="cd-fin-label">Dernier paiement fait</div>
          <div className="cd-fin-value">{s.last_payment ? money(s.last_payment.amount) : '—'}</div>
          <div className="cd-fin-sub">{s.last_payment ? `${fmtD(s.last_payment.date)} · ${s.last_payment.method || ''}` : 'Aucun paiement'}</div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div className="filter-tabs">
          {FILTERS.map(([v, l]) => <button key={v} className={`filter-tab${filter === v ? ' active' : ''}`} onClick={() => setFilter(v)}>{l}</button>)}
        </div>
        {data.vendor && <button className="btn-secondary" onClick={() => navigate(`/purchases/bills/new?vendor=${data.vendor.id}`)}>+ Facture fournisseur</button>}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="cd-tx-table">
          <thead>
            <tr>
              <th>Date</th><th>Numéro</th><th>État</th><th>Échéance</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th style={{ textAlign: 'right' }}>Payé / appliqué</th>
              <th style={{ textAlign: 'right' }}>Reste</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(t => {
              const [label, color] = t.kind === 'bill' ? (BILL_STATUS[t.status] || [t.status, 'var(--c-muted)']) : KIND[t.kind]
              return (
                <tr key={t.kind + t.id} className="cd-tx-row" onClick={() => navigate(OPEN[t.kind](t.id))}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtD(t.date)}</td>
                  <td style={{ fontWeight: 600 }}>
                    {t.kind !== 'bill' && <span className="cd-tx-credit" style={{ color }}>{label}</span>}
                    {t.number || (t.kind === 'bill' ? <span style={{ color: 'var(--c-faint)', fontWeight: 400 }}>sans numéro</span> : '')}
                    {t.recurring && <span style={{ fontSize: 11, color: 'var(--c-faint)', fontWeight: 400 }}> · périodique</span>}
                    {t.description && <div style={{ fontSize: 12, color: 'var(--c-muted)', fontWeight: 400 }}>{t.description}</div>}
                    {t.kind === 'payment' && t.bills?.length > 0 && (
                      <div style={{ fontSize: 12, color: 'var(--c-muted)', fontWeight: 400 }}>
                        règle {t.bills.map(b => b || 'sans numéro').join(', ')}
                        {t.grouped && <> · paiement groupé de {money(t.grouped_total)}</>}
                      </div>
                    )}
                  </td>
                  <td>
                    {t.kind === 'bill' ? <span className="cd-tx-badge" style={{ color, borderColor: color }}>{label}</span>
                      : <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>{t.status || ''}</span>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap', color: t.overdue ? '#DC2626' : undefined }}>{t.kind === 'bill' ? fmtD(t.due_date) : '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{money(t.total)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--c-muted)' }}>{t.kind === 'expense' ? '—' : money(t.paid)}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600,
                               color: t.remaining > 0.005 ? (t.overdue ? '#DC2626' : 'var(--c-text)') : 'var(--c-faint)' }}>
                    {t.kind === 'expense' ? '—' : money(t.remaining)}
                  </td>
                </tr>
              )
            })}
            {shown.length === 0 && <tr><td colSpan={7} className="empty-tab">Aucune transaction</td></tr>}
          </tbody>
          {bills.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={4}>Total des {bills.length} facture{bills.length > 1 ? 's' : ''} (avoirs compris dans « Payé », brouillons et annulées exclus)</td>
                <td style={{ textAlign: 'right' }}>{money(sum('total'))}</td>
                <td style={{ textAlign: 'right' }}>{money(sum('paid'))}</td>
                <td style={{ textAlign: 'right' }}>{money(sum('remaining'))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
