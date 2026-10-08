// Module Achats (TASK-044) -- elements partages par les pages Fournisseurs, Depenses, Factures
// fournisseurs, Paiements effectues, Avoirs fournisseur et leurs periodiques.
import { useState, useEffect, useCallback } from 'react'
import api from '../../services/api'
import Autocomplete from '../../components/Autocomplete'
import { C, EMPTY, fmtMoney, fmtDate } from '../Bank'
import { todayIso } from '../../utils/date'

export { C, EMPTY, fmtMoney }
export const fmtD = d => d ? fmtDate(d + 'T00:00:00') : EMPTY
export const today = () => todayIso()

export const th = { padding: '10px 8px', fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'left' }
export const thR = { ...th, textAlign: 'right' }
export const td = { padding: '10px 8px' }
export const tdR = { ...td, textAlign: 'right', whiteSpace: 'nowrap' }
export const headRow = { color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `1px solid ${C.border}` }
export const rowStyle = { borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }

export const TAX_CODES = [['tps_tvq', 'TPS + TVQ'], ['tps', 'TPS seulement'], ['tvq', 'TVQ seulement'], ['aucune', 'Aucune taxe']]
export const TAX_MODES = [['exclusive', 'Hors taxes (taxes ajoutées)'], ['inclusive', 'Taxes incluses']]
export const FREQS = [['hebdomadaire', 'Hebdomadaire'], ['mensuel', 'Mensuelle'], ['bimestriel', 'Aux 2 mois'],
  ['trimestriel', 'Trimestrielle'], ['biannuel', 'Aux 6 mois'], ['annuel', 'Annuelle']]
export const freqLabel = f => (FREQS.find(x => x[0] === f) || [f, f])[1]

export const BILL_STATUS = {
  brouillon: ['Brouillon', '#6B7280'], ouverte: ['À payer', '#1F5AA6'], partielle: ['Partiellement payée', '#D97706'],
  payee: ['Payée', '#059669'], en_retard: ['En retard', '#DC2626'], annulee: ['Annulée', '#9CA3AF'],
}

// Meme calcul que le serveur (purchases.compute_taxes) -- apercu seulement, le serveur fait foi
const r2 = v => Math.sign(v) * Math.round((Math.abs(v) + Number.EPSILON) * 100) / 100
const rates = code => [['tps_tvq', 'tps'].includes(code) ? 5 : 0, ['tps_tvq', 'tvq'].includes(code) ? 9.975 : 0]
export function computeTaxes(items, mode) {
  if (mode === 'inclusive') {
    let total = 0, tps = 0, tvq = 0
    for (const [a, code] of items) {
      const [t1, t2] = rates(code)
      total += a
      tps += r2(a * t1 / (100 + t1 + t2))
      tvq += r2(a * t2 / (100 + t1 + t2))
    }
    total = r2(total)
    return { subtotal: r2(total - tps - tvq), tps: r2(tps), tvq: r2(tvq), total }
  }
  const subtotal = r2(items.reduce((s, [a]) => s + a, 0))
  const tps = r2(items.filter(([, c]) => rates(c)[0]).reduce((s, [a]) => s + a, 0) * 5 / 100)
  const tvq = r2(items.filter(([, c]) => rates(c)[1]).reduce((s, [a]) => s + a, 0) * 9.975 / 100)
  return { subtotal, tps, tvq, total: r2(subtotal + tps + tvq) }
}

export function errText(e, fallback = 'Enregistrement impossible') {
  const d = e?.response?.data?.detail
  return typeof d === 'string' ? d : fallback
}

// Fournisseurs et categories, rechargeables (creation a la volee depuis un formulaire)
export function useRefs() {
  const [vendors, setVendors] = useState([])
  const [categories, setCategories] = useState([])
  const reload = useCallback(async () => {
    const [v, c] = await Promise.all([api.get('/v1/purchases/vendors'), api.get('/v1/purchases/categories')])
    setVendors(v.data)
    setCategories(c.data)
  }, [])
  useEffect(() => { reload() }, [reload])
  return { vendors, categories, reload }
}

export function Card({ children, style }) {
  return <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: '8px 16px', ...style }}>{children}</div>
}

// Popup : seuls Annuler / Enregistrer ferment (jamais un clic a l'exterieur -- perte de saisie)
export function Modal({ title, width = 560, children, actions }) {
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width, maxWidth: 'calc(100vw - 32px)', maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 className="modal-title" style={{ margin: 0 }}>{title}</h3>
        {children}
        <div className="modal-actions">{actions}</div>
      </div>
    </div>
  )
}

export function Field({ label, children, style }) {
  return <div className="form-group" style={style}><label>{label}</label>{children}</div>
}

export function Select({ value, onChange, options, empty }) {
  return (
    <select value={value ?? ''} onChange={e => onChange(e.target.value || null)}>
      {empty !== undefined && <option value="">{empty}</option>}
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}

export function VendorPicker({ vendors, value, onChange, onCreated, label = 'Fournisseur', required }) {
  const items = vendors.filter(v => v.is_active || v.id === value).map(v => ({ id: v.id, label: v.name }))
  const cur = vendors.find(v => v.id === value)
  async function create(name) {
    const r = await api.post('/v1/purchases/vendors', { name })
    await onCreated?.()
    onChange(r.data.id)
  }
  return <Autocomplete label={label} required={required} items={items} value={cur ? { id: cur.id, label: cur.name } : null}
    onSelect={i => onChange(i ? i.id : null)} onCreate={create} openOnFocus placeholder="Rechercher ou créer..." />
}

export function CategorySelect({ categories, value, onChange }) {
  return <Select value={value} onChange={onChange} empty="— Aucune —"
    options={categories.filter(c => c.is_active || c.id === value).map(c => [c.id, c.name])} />
}

export function TaxTotals({ t, adjustment = 0 }) {
  const row = (l, v, bold) => <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, fontWeight: bold ? 700 : 400 }}><span>{l}</span><span>{fmtMoney(v)}</span></div>
  return (
    <div style={{ marginLeft: 'auto', minWidth: 240, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {row('Sous-total', t.subtotal)}
      {row('TPS (5 %)', t.tps)}
      {row('TVQ (9,975 %)', t.tvq)}
      {adjustment ? row('Ajustement', adjustment) : null}
      {row('Total', r2(t.total + (adjustment || 0)), true)}
    </div>
  )
}

export function Filters({ value, onChange, options }) {
  return <div className="filter-tabs">{options.map(([v, l]) => <button key={v} className={`filter-tab${value === v ? ' active' : ''}`} onClick={() => onChange(v)}>{l}</button>)}</div>
}

// Repartition d'un paiement ou d'un avoir sur des factures fournisseurs (montant par facture)
export function AllocationTable({ bills, alloc, setAlloc, showVendor = true }) {
  if (!bills.length) return <div style={{ color: C.faint, fontSize: 13, padding: 8 }}>Aucune facture à payer.</div>
  return (
    <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={headRow}>
          <th style={th}>Date</th>{showVendor && <th style={th}>Fournisseur</th>}<th style={th}>N°</th>
          <th style={thR}>Solde</th><th style={thR}>À payer</th>
        </tr></thead>
        <tbody>
          {bills.map(b => (
            <tr key={b.id} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtD(b.bill_date)}</td>
              {showVendor && <td style={td}>{b.vendor_name}</td>}
              <td style={{ ...td, fontSize: 12 }}>{b.bill_number || EMPTY}</td>
              <td style={tdR}>{fmtMoney(b.balance)}</td>
              <td style={tdR}>
                <input type="number" step="0.01" min="0" value={alloc[b.id] ?? ''} style={{ width: 100, textAlign: 'right' }}
                  onChange={e => setAlloc({ ...alloc, [b.id]: e.target.value })} />
                <button type="button" className="btn-secondary" style={{ padding: '2px 6px', fontSize: 11, marginLeft: 4 }}
                  title="Payer le solde complet" onClick={() => setAlloc({ ...alloc, [b.id]: b.balance.toFixed(2) })}>Tout</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export const allocList = alloc => Object.entries(alloc).filter(([, v]) => parseFloat(v) > 0).map(([bill_id, v]) => ({ bill_id, amount: parseFloat(v) }))
export const allocSum = alloc => r2(Object.values(alloc).reduce((s, v) => s + (parseFloat(v) || 0), 0))
