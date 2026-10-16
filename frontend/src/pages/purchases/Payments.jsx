import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import {
  C, EMPTY, fmtMoney, fmtD, today, th, thR, td, tdR, headRow, rowStyle, Card, Modal, Field, VendorPicker,
  AllocationTable, allocList, allocSum, useRefs, errText,
} from './common'
import { askConfirm } from '../../components/Dialog'

const METHODS = ['Virement', 'Prélèvement automatique', 'Carte de crédit', 'Chèque', 'Interac', 'Comptant']

// Paiement effectue : a un fournisseur, ou groupe (ex. remboursement de la carte de credit qui a paye
// les factures de plusieurs fournisseurs). Repartition facture par facture.
export function PaymentModal({ payment, presetVendorId, presetBillId, onClose, onSaved }) {
  const refs = useRefs()
  const [f, setF] = useState(() => payment ? {
    payment_date: payment.payment_date, kind: payment.vendor_id ? 'vendor' : 'other', vendor_id: payment.vendor_id,
    payee_label: payment.payee_label || '', amount: String(payment.amount), method: payment.method || '', reference: payment.reference || '', notes: payment.notes || '',
  } : { payment_date: today(), kind: 'vendor', vendor_id: presetVendorId || null, payee_label: '', amount: '', method: 'Virement', reference: '', notes: '' })
  const [bills, setBills] = useState([])
  const [alloc, setAlloc] = useState(() => Object.fromEntries((payment?.allocations || []).map(a => [a.bill_id, a.amount.toFixed(2)])))
  const [allVendors, setAllVendors] = useState(!!payment && !payment.vendor_id)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/v1/purchases/bills/open').then(r => {
      const open = r.data
      // En modification : ce que CE paiement couvre deja redevient disponible pour lui
      for (const a of payment?.allocations || []) {
        const b = open.find(x => x.id === a.bill_id)
        if (b) b.balance += a.amount
        else open.push({ id: a.bill_id, bill_date: a.bill_date, bill_number: a.bill_number, vendor_name: a.vendor_name, vendor_id: null, balance: a.amount })
      }
      open.sort((x, y) => x.bill_date < y.bill_date ? -1 : 1)
      setBills(open)
      if (presetBillId) {
        const b = open.find(x => x.id === presetBillId)
        if (b) { setAlloc({ [b.id]: b.balance.toFixed(2) }); setF(p => ({ ...p, amount: b.balance.toFixed(2) })) }
      }
    })
  }, [])

  const shownBills = bills.filter(b => allVendors || f.kind === 'other' || !f.vendor_id || b.vendor_id === f.vendor_id || alloc[b.id])
  const allocated = allocSum(alloc)
  const amount = parseFloat(f.amount) || 0

  function spread() {
    let left = amount
    const next = {}
    for (const b of shownBills) {
      const a = Math.min(b.balance, Math.max(0, left))
      if (a > 0) next[b.id] = a.toFixed(2)
      left = Math.round((left - a) * 100) / 100
    }
    setAlloc(next)
  }

  async function save() {
    setError('')
    const total = amount || allocated
    if (!total) { setError('Montant requis'); return }
    if (allocated > total + 0.005) { setError(`La répartition (${fmtMoney(allocated)}) dépasse le montant`); return }
    const body = { payment_date: f.payment_date, vendor_id: f.kind === 'vendor' ? f.vendor_id : null, payee_label: f.kind === 'other' ? f.payee_label : null,
      amount: total, method: f.method || null, reference: f.reference || null, notes: f.notes || null, allocations: allocList(alloc) }
    setSaving(true)
    try {
      if (payment) await api.put(`/v1/purchases/payments/${payment.id}`, body)
      else await api.post('/v1/purchases/payments', body)
      onSaved()
    } catch (e) { setError(errText(e)); setSaving(false) }
  }
  async function remove() {
    if (!await askConfirm('Supprimer ce paiement ? Les factures qu\'il réglait redeviennent à payer.')) return
    await api.delete(`/v1/purchases/payments/${payment.id}`)
    onSaved()
  }

  return (
    <Modal title={payment ? 'Paiement effectué' : 'Nouveau paiement'} width={820} actions={<>
      {payment && <button className="btn-danger" style={{ marginRight: 'auto' }} onClick={remove}>Supprimer</button>}
      <button className="btn-secondary" onClick={onClose}>Annuler</button>
      <button className="btn-primary" disabled={saving} onClick={save}>Enregistrer</button>
    </>}>
      <div style={{ display: 'flex', gap: 16, fontSize: 14 }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="radio" checked={f.kind === 'vendor'} onChange={() => setF({ ...f, kind: 'vendor' })} /> À un fournisseur</label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="radio" checked={f.kind === 'other'} onChange={() => setF({ ...f, kind: 'other' })} /> Paiement groupé (carte de crédit, plusieurs fournisseurs…)</label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {f.kind === 'vendor'
          ? <VendorPicker vendors={refs.vendors} value={f.vendor_id} onCreated={refs.reload} onChange={vid => setF({ ...f, vendor_id: vid })} />
          : <Field label="Payé à *"><input placeholder="ex. Carte de crédit Visa" value={f.payee_label} onChange={e => setF({ ...f, payee_label: e.target.value })} /></Field>}
        <Field label="Date *"><input type="date" value={f.payment_date} onChange={e => setF({ ...f, payment_date: e.target.value })} /></Field>
        <Field label="Montant"><input type="number" step="0.01" placeholder={allocated ? allocated.toFixed(2) : ''} value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Mode">
          <input list="vp-methods" value={f.method} onChange={e => setF({ ...f, method: e.target.value })} />
          <datalist id="vp-methods">{METHODS.map(m => <option key={m} value={m} />)}</datalist>
        </Field>
        <Field label="Référence"><input value={f.reference} onChange={e => setF({ ...f, reference: e.target.value })} /></Field>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13 }}>Factures réglées par ce paiement</strong>
        {f.kind === 'vendor' && f.vendor_id && (
          <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={allVendors} onChange={e => setAllVendors(e.target.checked)} /> Montrer les factures de tous les fournisseurs
          </label>
        )}
        {amount > 0 && <button className="btn-secondary" style={{ fontSize: 12, padding: '3px 10px' }} onClick={spread}>Répartir le montant (plus anciennes d'abord)</button>}
      </div>
      <AllocationTable bills={shownBills} alloc={alloc} setAlloc={setAlloc} />
      <div style={{ fontSize: 13, textAlign: 'right' }}>
        Réparti : <strong>{fmtMoney(allocated)}</strong>{amount > 0 && <> sur {fmtMoney(amount)}{amount - allocated > 0.005 && <span style={{ color: C.muted }}> · {fmtMoney(amount - allocated)} non attribué</span>}</>}
      </div>
      <Field label="Notes"><textarea rows={2} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></Field>
      {error && <div style={{ color: C.red, fontSize: 13 }}>{error}</div>}
    </Modal>
  )
}

export function PurchasePayments() {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [search, setSearch] = useState('')
  const [edit, setEdit] = useState(undefined)   // undefined = ferme, null = nouveau, objet = modification
  const load = () => api.get('/v1/purchases/payments').then(r => setRows(r.data))
  useEffect(() => { load() }, [])

  const q = search.trim().toLowerCase()
  const shown = (rows || []).filter(p => !q || [p.payee, p.method, p.reference, p.notes, String(p.amount), ...p.allocations.map(a => a.bill_number), ...p.allocations.map(a => a.vendor_name)]
    .some(x => (x || '').toLowerCase().includes(q)))
  const total = shown.reduce((s, p) => s + p.amount, 0)

  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">Paiements effectués</h1><p className="page-sub">{shown.length} paiement{shown.length > 1 ? 's' : ''} · {fmtMoney(total)}</p></div>
        <button className="btn-primary" onClick={() => setEdit(null)}>+ Nouveau paiement</button>
      </div>
      <div className="page-toolbar" style={{ gap: 10 }}>
        <input className="search-input" placeholder="Rechercher (payé à, facture, fournisseur, montant)..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 820, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={headRow}>
              <th style={th}>Date</th><th style={th}>Payé à</th><th style={th}>Mode</th><th style={th}>Factures réglées</th><th style={thR}>Montant</th>
            </tr></thead>
            <tbody>
              {rows === null && <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: C.muted }}>Chargement...</td></tr>}
              {shown.slice(0, 500).map(p => (
                <tr key={p.id} style={rowStyle} onClick={() => setEdit(p)}>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtD(p.payment_date)}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{p.payee || EMPTY}</td>
                  <td style={td}>{p.method || EMPTY}{p.reference ? <div style={{ fontSize: 12, color: C.muted }}>{p.reference}</div> : null}</td>
                  <td style={{ ...td, fontSize: 12 }}>
                    {p.allocations.map(a => (
                      <span key={a.bill_id} style={{ color: C.link, marginRight: 8, whiteSpace: 'nowrap' }} onClick={e => { e.stopPropagation(); navigate(`/purchases/bills/${a.bill_id}`) }}>
                        {p.vendor_id ? '' : `${a.vendor_name} `}{a.bill_number || 'facture'}
                      </span>
                    ))}
                    {!p.allocations.length && <span style={{ color: C.faint }}>Aucune</span>}
                    {p.amount - p.allocated > 0.005 && <span style={{ color: '#D97706' }}> · {fmtMoney(p.amount - p.allocated)} non attribué</span>}
                  </td>
                  <td style={{ ...tdR, fontWeight: 600 }}>{fmtMoney(p.amount)}</td>
                </tr>
              ))}
              {rows && !shown.length && <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: C.faint, padding: 24 }}>Aucun paiement.</td></tr>}
            </tbody>
          </table>
          {shown.length > 500 && <div style={{ fontSize: 12, color: C.muted, padding: 8 }}>500 premiers affichés — utilisez la recherche.</div>}
        </div>
      </Card>
      {edit !== undefined && <PaymentModal payment={edit} onClose={() => setEdit(undefined)} onSaved={() => { setEdit(undefined); load() }} />}
    </div>
  )
}
