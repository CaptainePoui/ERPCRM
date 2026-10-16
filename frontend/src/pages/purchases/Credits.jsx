import { useState, useEffect } from 'react'
import api from '../../services/api'
import {
  C, EMPTY, fmtMoney, fmtD, today, th, thR, td, tdR, headRow, rowStyle, Card, Modal, Field, Select, VendorPicker,
  CategorySelect, TaxTotals, TAX_CODES, TAX_MODES, AllocationTable, allocList, allocSum, computeTaxes, useRefs, errText,
} from './common'
import { askConfirm } from '../../components/Dialog'

// Avoir fournisseur (remboursement, retour) : reduit les factures du meme fournisseur ; ses taxes
// diminuent les CTI/RTI de la periode.
function CreditModal({ credit, onClose, onSaved }) {
  const refs = useRefs()
  const [f, setF] = useState(() => credit ? { ...credit, amount: String(credit.amount) }
    : { vendor_id: null, credit_number: '', credit_date: today(), tax_mode: 'exclusive', tax_code: 'tps_tvq', amount: '', category_id: null, description: '' })
  const [bills, setBills] = useState([])
  const [alloc, setAlloc] = useState(() => Object.fromEntries((credit?.allocations || []).map(a => [a.bill_id, a.amount.toFixed(2)])))
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/v1/purchases/bills').then(r => {
      const mine = Object.fromEntries((credit?.allocations || []).map(a => [a.bill_id, a.amount]))
      setBills(r.data.map(b => ({ ...b, balance: b.balance + (mine[b.id] || 0) }))
        .filter(b => b.balance > 0 && !['brouillon', 'annulee'].includes(b.status))
        .sort((x, y) => x.bill_date < y.bill_date ? -1 : 1))
    })
  }, [])
  const t = computeTaxes([[parseFloat(f.amount) || 0, f.tax_code]], f.tax_mode)
  const vendorBills = bills.filter(b => b.vendor_id === f.vendor_id)
  const allocated = allocSum(alloc)

  async function save() {
    setError('')
    if (!f.vendor_id || !(parseFloat(f.amount) > 0)) { setError('Fournisseur et montant requis'); return }
    if (allocated > t.total + 0.005) { setError(`L'application (${fmtMoney(allocated)}) dépasse l'avoir (${fmtMoney(t.total)})`); return }
    const body = { vendor_id: f.vendor_id, credit_number: f.credit_number || null, credit_date: f.credit_date, tax_mode: f.tax_mode, tax_code: f.tax_code,
      amount: parseFloat(f.amount), category_id: f.category_id || null, description: f.description || null,
      allocations: allocList(alloc).filter(a => vendorBills.some(b => b.id === a.bill_id)) }
    try {
      if (credit) await api.put(`/v1/purchases/credits/${credit.id}`, body)
      else await api.post('/v1/purchases/credits', body)
      onSaved()
    } catch (e) { setError(errText(e)) }
  }
  async function remove() {
    if (!await askConfirm('Supprimer cet avoir ? Les factures qu\'il réglait redeviennent à payer.')) return
    await api.delete(`/v1/purchases/credits/${credit.id}`)
    onSaved()
  }

  return (
    <Modal title={credit ? `Avoir fournisseur ${credit.credit_number || ''}` : 'Nouvel avoir fournisseur'} width={760} actions={<>
      {credit && <button className="btn-danger" style={{ marginRight: 'auto' }} onClick={remove}>Supprimer</button>}
      <button className="btn-secondary" onClick={onClose}>Annuler</button>
      <button className="btn-primary" onClick={save}>Enregistrer</button>
    </>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <VendorPicker vendors={refs.vendors} value={f.vendor_id} onCreated={refs.reload} required onChange={vid => { setF({ ...f, vendor_id: vid }); setAlloc({}) }} />
        <Field label="N° de l'avoir"><input value={f.credit_number || ''} onChange={e => setF({ ...f, credit_number: e.target.value })} /></Field>
        <Field label="Date *"><input type="date" value={f.credit_date} onChange={e => setF({ ...f, credit_date: e.target.value })} /></Field>
        <Field label="Montant *"><input type="number" step="0.01" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Le montant est"><Select value={f.tax_mode} onChange={v => setF({ ...f, tax_mode: v })} options={TAX_MODES} /></Field>
        <Field label="Taxes"><Select value={f.tax_code} onChange={v => setF({ ...f, tax_code: v })} options={TAX_CODES} /></Field>
        <Field label="Compte de dépense"><CategorySelect categories={refs.categories} value={f.category_id} onChange={v => setF({ ...f, category_id: v })} /></Field>
      </div>
      <Field label="Description"><input value={f.description || ''} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
      <TaxTotals t={t} />
      <strong style={{ fontSize: 13 }}>Appliquer sur les factures de ce fournisseur</strong>
      {f.vendor_id ? <AllocationTable bills={vendorBills} alloc={alloc} setAlloc={setAlloc} showVendor={false} />
        : <div style={{ color: C.faint, fontSize: 13 }}>Choisissez d'abord le fournisseur.</div>}
      <div style={{ fontSize: 13, textAlign: 'right' }}>Appliqué : <strong>{fmtMoney(allocated)}</strong> · reste {fmtMoney(Math.max(0, t.total - allocated))}</div>
      {error && <div style={{ color: C.red, fontSize: 13 }}>{error}</div>}
    </Modal>
  )
}

export function PurchaseCredits() {
  const [rows, setRows] = useState(null)
  const [edit, setEdit] = useState(undefined)
  const load = () => api.get('/v1/purchases/credits').then(r => setRows(r.data))
  useEffect(() => { load() }, [])
  const open = (rows || []).reduce((s, c) => s + c.remaining, 0)

  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">Avoirs fournisseur</h1><p className="page-sub">{(rows || []).length} avoir(s) · {fmtMoney(open)} pas encore appliqué</p></div>
        <button className="btn-primary" onClick={() => setEdit(null)}>+ Nouvel avoir</button>
      </div>
      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={headRow}>
              <th style={th}>Date</th><th style={th}>N°</th><th style={th}>Fournisseur</th><th style={th}>Statut</th><th style={thR}>Montant</th><th style={thR}>Reste</th>
            </tr></thead>
            <tbody>
              {rows === null && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: C.muted }}>Chargement...</td></tr>}
              {(rows || []).map(c => (
                <tr key={c.id} style={rowStyle} onClick={() => setEdit(c)}>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtD(c.credit_date)}</td>
                  <td style={td}>{c.credit_number || EMPTY}</td>
                  <td style={td}>{c.vendor_name}</td>
                  <td style={{ ...td, fontWeight: 600, fontSize: 12, color: c.remaining > 0.005 ? '#D97706' : C.green }}>{c.remaining > 0.005 ? 'Ouvert' : 'Appliqué'}</td>
                  <td style={tdR}>{fmtMoney(c.total)}</td>
                  <td style={{ ...tdR, fontWeight: 600 }}>{fmtMoney(c.remaining)}</td>
                </tr>
              ))}
              {rows && !rows.length && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: C.faint, padding: 24 }}>Aucun avoir fournisseur.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      {edit !== undefined && <CreditModal credit={edit} onClose={() => setEdit(undefined)} onSaved={() => { setEdit(undefined); load() }} />}
    </div>
  )
}
