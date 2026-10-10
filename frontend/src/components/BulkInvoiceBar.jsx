// Barre d'actions de masse sur des factures cochees (TASK-046, 2026-10-08). Apparait en bas de l'ecran des qu'une
// facture est selectionnee (case, Ctrl+clic, Maj+clic -- hooks/useRowSelection.js). Actions : creer un echange (troc)
// qui paie exactement ces factures, marquer / retirer « a regler en troc » (les deux seulement si l'option Echanges est
// cochee), crediter le reste (avoir), paiement groupe.
// items : [{ id, number, company_id, company_name, status, total, paid, remaining, is_credit, barter_settlement, late_fee }]
import { useState, useEffect } from 'react'
import api from '../services/api'
import useFeatures from '../hooks/useFeatures'
import { BarterModal } from '../pages/barter/BarterTab'
import { C, fmtMoney } from '../pages/Bank'
import { todayIso } from '../utils/date'

const errText = e => e.response?.data?.detail || 'Erreur'
const live = i => !i.is_credit && i.status !== 'brouillon' && i.status !== 'annulee'

export default function BulkInvoiceBar({ items, onClear, onDone }) {
  const features = useFeatures()
  const [modal, setModal] = useState(null)      // barter | credit | payment
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [recurrences, setRecurrences] = useState(null)
  if (!items.length && !msg) return null

  const open = items.filter(i => live(i) && i.remaining > 0.004)
  const companies = [...new Set(items.map(i => i.company_id))]
  const oneCompany = companies.length === 1
  const remaining = open.reduce((t, i) => t + i.remaining, 0)
  const flaggable = items.filter(i => !i.is_credit && !i.late_fee)
  const allFlagged = flaggable.length > 0 && flaggable.every(i => i.barter_settlement)

  async function done(text) {
    setModal(null); setMsg(text); onClear()
    await onDone?.()
  }

  async function flag(value) {
    setBusy(true)
    try {
      const r = await api.post('/v1/invoices/bulk/barter-flag', { ids: flaggable.map(i => i.id), value })
      await done(`${r.data.done} facture${r.data.done > 1 ? 's' : ''} ${value ? 'marquée(s)' : 'retirée(s)'} « À régler en troc »`)
    } catch (e) { setMsg(errText(e)) } finally { setBusy(false) }
  }

  async function openBarter() {
    const r = await api.get(`/v1/barter/companies/${companies[0]}`)
    setRecurrences(r.data.recurrences.filter(x => x.is_active))
    setModal('barter')
  }

  const why = !oneCompany ? 'Choisissez les factures d\'une seule compagnie' : !open.length ? 'Aucune facture avec un reste à payer' : ''
  const btn = { fontSize: 13, padding: '6px 12px' }
  return (
    <>
      <div style={{ position: 'fixed', left: 16, right: 16, margin: '0 auto', width: 'fit-content', bottom: 16, zIndex: 250,
        background: 'var(--c-text)', color: '#fff', borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,.25)', padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {msg && !items.length ? (
          <>
            <span style={{ fontSize: 13 }}>{msg}</span>
            <button className="btn-secondary" style={btn} onClick={() => setMsg(null)}>OK</button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              {items.length} facture{items.length > 1 ? 's' : ''}{open.length ? ` · reste ${fmtMoney(remaining)}` : ''}
              {!oneCompany && <span style={{ fontWeight: 400, color: 'var(--c-faint)' }}> · {companies.length} compagnies</span>}
            </span>
            {features.barter && (
              <button className="btn-secondary" style={btn} disabled={busy || !!why} title={why} onClick={openBarter}>Créer un échange</button>
            )}
            {features.barter && flaggable.length > 0 && (
              <button className="btn-secondary" style={btn} disabled={busy} onClick={() => flag(!allFlagged)}>
                {allFlagged ? 'Retirer « troc »' : 'Marquer « À régler en troc »'}
              </button>
            )}
            <button className="btn-secondary" style={btn} disabled={busy || !open.length} title={open.length ? '' : 'Aucune facture avec un reste à payer'} onClick={() => setModal('credit')}>Créditer le reste</button>
            <button className="btn-secondary" style={btn} disabled={busy || !!why} title={why} onClick={() => setModal('payment')}>Paiement groupé</button>
            <button onClick={onClear} style={{ background: 'none', border: 'none', color: 'var(--c-faint)', cursor: 'pointer', fontSize: 13 }}>✕ Désélectionner</button>
            {msg && <span style={{ fontSize: 12, color: '#FCA5A5' }}>{msg}</span>}
          </>
        )}
      </div>

      {modal === 'barter' && recurrences && (
        <BarterModal companyId={companies[0]} initial={null} recurrences={recurrences} invoices={open}
          onClose={() => setModal(null)} onSaved={() => done(`Échange enregistré : ${open.map(i => i.number).join(', ')} payée(s) par le troc`)} />
      )}
      {modal === 'credit' && <CreditModal invoices={open} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'payment' && <PaymentModal invoices={open} onClose={() => setModal(null)} onDone={done} />}
    </>
  )
}

function InvoiceList({ invoices, amounts, setAmount }) {
  return (
    <div style={{ maxHeight: 260, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <tbody>
          {invoices.map(i => (
            <tr key={i.id} style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={{ padding: '6px 8px', fontWeight: 600 }}>{i.number}</td>
              <td style={{ padding: '6px 8px', color: C.muted }}>{i.company_name}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>reste {fmtMoney(i.remaining)}</td>
              {amounts && (
                <td style={{ padding: '6px 8px', width: 100 }}>
                  <input type="number" step="0.01" value={amounts[i.id]} onChange={e => setAmount(i.id, e.target.value)} style={{ width: 90, textAlign: 'right' }} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CreditModal({ invoices, onClose, onDone }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const total = invoices.reduce((t, i) => t + i.remaining, 0)
  async function save() {
    setSaving(true); setError(null)
    try {
      const r = await api.post('/v1/invoices/bulk/credit-remainder', { ids: invoices.map(i => i.id) })
      await onDone(`${r.data.credits.length} avoir${r.data.credits.length > 1 ? 's' : ''} créé${r.data.credits.length > 1 ? 's' : ''} et appliqué${r.data.credits.length > 1 ? 's' : ''} : ${r.data.credits.map(c => c.credit).join(', ')}`)
    } catch (e) { setError(errText(e)); setSaving(false) }
  }
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 620, width: '100%' }}>
        <div className="modal-title">Créditer le reste de {invoices.length} facture{invoices.length > 1 ? 's' : ''}</div>
        <InvoiceList invoices={invoices} />
        <p style={{ fontSize: 13, color: C.muted, marginTop: 0 }}>
          Un avoir par facture, du montant de son reste ({fmtMoney(total)} en tout), appliqué aussitôt : la dette est effacée.
          Les taxes de l'avoir suivent celles de la facture, ce qui baisse la TPS/TVQ à remettre. Pour une dette réglée en troc, utilisez plutôt « Créer un échange ».
        </p>
        {error && <div style={{ color: C.red, fontSize: 13, marginBottom: 8 }}>{error}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? '…' : `Créditer ${fmtMoney(total)}`}</button>
        </div>
      </div>
    </div>
  )
}

function PaymentModal({ invoices, onClose, onDone }) {
  const [methods, setMethods] = useState([])
  const [method, setMethod] = useState('')
  const [date, setDate] = useState(todayIso())
  const [notes, setNotes] = useState('')
  const [amounts, setAmounts] = useState(() => Object.fromEntries(invoices.map(i => [i.id, i.remaining.toFixed(2)])))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  useEffect(() => {
    api.get('/v1/payments/methods').then(r => {
      const m = r.data.filter(x => x.is_active && x.code !== 'troc')    // un troc passe par « Créer un échange »
      setMethods(m); setMethod(m.find(x => x.code === 'cheque')?.code || m[0]?.code || '')
    })
  }, [])
  const num = v => parseFloat(String(v).replace(',', '.')) || 0
  const total = invoices.reduce((t, i) => t + num(amounts[i.id]), 0)
  const over = invoices.find(i => num(amounts[i.id]) > i.remaining + 0.004)
  async function save() {
    setSaving(true); setError(null)
    try {
      await api.post('/v1/payments/multi', {
        method_code: method, source: 'manual', status: 'confirmed', received_at: date, notes: notes || null, generate_reference: true,
        allocations: invoices.map(i => ({ invoice_id: i.id, amount: Math.round(num(amounts[i.id]) * 100) / 100 })).filter(a => a.amount > 0),
      })
      await onDone(`Paiement de ${fmtMoney(total)} enregistré sur ${invoices.length} facture${invoices.length > 1 ? 's' : ''}`)
    } catch (e) { setError(errText(e)); setSaving(false) }
  }
  const input = { width: '100%', boxSizing: 'border-box' }
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 620, width: '100%' }}>
        <div className="modal-title">Paiement groupé — {invoices[0].company_name}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group"><label>Mode de paiement</label>
            <select style={input} value={method} onChange={e => setMethod(e.target.value)}>{methods.map(m => <option key={m.code} value={m.code}>{m.name}</option>)}</select>
          </div>
          <div className="form-group"><label>Reçu le</label><input type="date" style={input} value={date} onChange={e => setDate(e.target.value)} /></div>
        </div>
        <InvoiceList invoices={invoices} amounts={amounts} setAmount={(id, v) => setAmounts(a => ({ ...a, [id]: v }))} />
        <div className="form-group"><label>Notes (n° de chèque…)</label><input style={input} value={notes} onChange={e => setNotes(e.target.value)} /></div>
        {over && <div style={{ color: C.red, fontSize: 13, marginBottom: 8 }}>{over.number} : le montant dépasse son reste ({fmtMoney(over.remaining)})</div>}
        {error && <div style={{ color: C.red, fontSize: 13, marginBottom: 8 }}>{error}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving || !method || !!over || total <= 0}>{saving ? '…' : `Enregistrer ${fmtMoney(total)}`}</button>
        </div>
      </div>
    </div>
  )
}
