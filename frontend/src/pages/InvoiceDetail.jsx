import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import NewTaskModal from '../components/NewTaskModal'
import './Invoices.css'

const STATUS_LABELS = {
  brouillon:  { label: 'Brouillon',  color: '#6B7280' },
  envoyee:    { label: 'Envoyée',    color: '#2563EB' },
  payee:      { label: 'Payée',      color: '#059669' },
  en_retard:  { label: 'En retard',  color: '#DC2626' },
  annulee:    { label: 'Annulée',    color: '#9CA3AF' },
}

const STATUS_TRANSITIONS = {
  brouillon: ['envoyee', 'annulee'],
  envoyee:   ['payee', 'en_retard', 'annulee'],
  en_retard: ['payee', 'annulee'],
  payee:     [],
  annulee:   [],
}

function isPastDue(dueDate) {
  return new Date(dueDate + 'T00:00:00') < new Date(new Date().toDateString())
}

function fmt(val) {
  return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(val)
}

export default function InvoiceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [inv, setInv] = useState(null)
  const [loading, setLoading] = useState(true)
  const [catalogue, setCatalogue] = useState([])
  const [addingLine, setAddingLine] = useState(false)
  const [editingLine, setEditingLine] = useState(null)
  const [actioning, setActioning] = useState(false)
  const [payments, setPayments] = useState([])
  const [paymentMethods, setPaymentMethods] = useState([])
  const [showAddPayment, setShowAddPayment] = useState(false)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [pricePrompt, setPricePrompt] = useState(null)

  useEffect(() => {
    Promise.all([
      api.get(`/v1/invoices/${id}`),
      api.get('/v1/catalogue'),
      api.get(`/v1/payments/invoice/${id}`),
      api.get('/v1/payments/methods'),
    ]).then(([r, c, p, m]) => {
      setInv(r.data)
      setCatalogue(c.data.filter(i => i.is_active))
      setPayments(p.data)
      setPaymentMethods(m.data.filter(x => x.is_active))
      setLoading(false)
    })
  }, [id])

  async function loadPayments() {
    const [r, inv_r] = await Promise.all([
      api.get(`/v1/payments/invoice/${id}`),
      api.get(`/v1/invoices/${id}`),
    ])
    setPayments(r.data)
    setInv(inv_r.data)
  }

  async function deletePayment(pid) {
    await api.delete(`/v1/payments/${pid}`)
    await loadPayments()
  }

  async function saveField(field, value) {
    const r = await api.put(`/v1/invoices/${id}`, { [field]: value })
    setInv(r.data)
  }

  async function changeStatus(s) {
    const r = await api.put(`/v1/invoices/${id}`, { status: s })
    setInv(r.data)
  }

  async function deleteLine(lineId) {
    const r = await api.delete(`/v1/invoices/${id}/lines/${lineId}`)
    setInv(r.data)
  }

  async function deleteInvoice() {
    if (!confirm('Supprimer cette facture ?')) return
    await api.delete(`/v1/invoices/${id}`)
    navigate('/invoices')
  }

  async function createCredit() {
    if (!confirm('Créer un avoir (note de crédit) pour cette facture ?')) return
    setActioning(true)
    try {
      const r = await api.post(`/v1/invoices/${id}/credit`)
      navigate(`/invoices/${r.data.id}`)
    } finally { setActioning(false) }
  }

  async function generateNext() {
    if (!confirm('Générer la prochaine facture récurrente ?')) return
    setActioning(true)
    try {
      const r = await api.post(`/v1/invoices/${id}/generate-next`)
      navigate(`/invoices/${r.data.id}`)
    } finally { setActioning(false) }
  }

  if (loading) return <div className="page"><div className="loading">Chargement...</div></div>
  if (!inv) return null

  const s = STATUS_LABELS[inv.status] || STATUS_LABELS.brouillon
  const transitions = STATUS_TRANSITIONS[inv.status] || []
  const editable = inv.status === 'brouillon'
  const canCredit = !inv.credit_of_id && (inv.status === 'envoyee' || inv.status === 'payee' || inv.status === 'en_retard')
  const canGenerateNext = inv.is_recurring && inv.status === 'payee'

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-secondary" onClick={() => navigate('/invoices')} style={{ padding: '6px 12px' }}>← Retour</button>
          <div>
            <h1 className="page-title" style={{ marginBottom: 2 }}>
              {inv.credit_of_id ? 'Avoir ' : 'Facture '}{inv.number}
              {inv.is_recurring && <span className="inv-recur-badge">Récurrente</span>}
            </h1>
            <p className="page-sub">{inv.company_name}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="inv-badge" style={{ background: s.color, fontSize: 13, padding: '5px 12px' }}>{s.label}</span>
          {transitions.map(t => (
            <button key={t} className="btn-secondary" onClick={() => changeStatus(t)} style={{ fontSize: 12 }}>
              → {STATUS_LABELS[t]?.label}
            </button>
          ))}
          {canCredit && <button className="btn-secondary" onClick={createCredit} disabled={actioning} style={{ fontSize: 12 }}>Créer un avoir</button>}
          {canGenerateNext && <button className="btn-secondary" onClick={generateNext} disabled={actioning} style={{ fontSize: 12 }}>Générer suivante</button>}
          <button className="btn-secondary" onClick={() => setShowTaskModal(true)} style={{ fontSize: 12 }}>+ Tâche</button>
          {editable && <button className="btn-danger" onClick={deleteInvoice}>Supprimer</button>}
        </div>
      </div>

      <div className="inv-detail-grid">

        {/* Infos générales */}
        <div className="inv-section">
          <div className="inv-section-title">Informations</div>
          {inv.credit_of_id && (
            <div className="inv-info-row">
              <span>Avoir pour</span>
              <strong style={{ color: '#184FA0', cursor: 'pointer' }} onClick={() => navigate(`/invoices/${inv.credit_of_id}`)}>Voir facture originale</strong>
            </div>
          )}
          <div className="inv-info-row">
            <span>Date d'émission</span>
            {editable
              ? <input type="date" value={inv.issue_date} onChange={e => saveField('issue_date', e.target.value)} className="inv-date-input" />
              : <strong>{new Date(inv.issue_date + 'T00:00:00').toLocaleDateString('fr-CA')}</strong>}
          </div>
          <div className="inv-info-row">
            <span>Date d'échéance</span>
            {editable
              ? <input type="date" value={inv.due_date} onChange={e => saveField('due_date', e.target.value)} className="inv-date-input" />
              : <strong className={inv.status === 'en_retard' ? 'overdue' : ''}>{new Date(inv.due_date + 'T00:00:00').toLocaleDateString('fr-CA')}</strong>}
          </div>
          {inv.is_recurring && (
            <div className="inv-info-row">
              <span>Fréquence</span>
              {editable
                ? <select value={inv.recurrence_frequency || ''} onChange={e => saveField('recurrence_frequency', e.target.value)} className="inv-date-input">
                    <option value="mensuel">Mensuelle</option>
                    <option value="trimestriel">Trimestrielle</option>
                    <option value="annuel">Annuelle</option>
                  </select>
                : <strong>{inv.recurrence_frequency}</strong>}
            </div>
          )}
          <div className="inv-info-row">
            <span>Taxes</span>
            <div style={{ display: 'flex', gap: 12 }}>
              <label className="tax-check">
                <input type="checkbox" checked={inv.apply_tps} disabled={!editable} onChange={e => saveField('apply_tps', e.target.checked)} />
                <span>TPS</span>
              </label>
              <label className="tax-check">
                <input type="checkbox" checked={inv.apply_tvq} disabled={!editable} onChange={e => saveField('apply_tvq', e.target.checked)} />
                <span>TVQ</span>
              </label>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="inv-section">
          <div className="inv-section-title">Notes</div>
          <textarea
            className="inv-notes"
            value={inv.notes || ''}
            disabled={!editable}
            placeholder="Notes internes ou message client..."
            onChange={e => saveField('notes', e.target.value)}
            rows={5}
          />
        </div>
      </div>

      {/* Lignes */}
      <div className="inv-lines-section">
        <div className="inv-section-title" style={{ marginBottom: 12 }}>
          Lignes de facturation
          {editable && <button className="btn-primary" style={{ marginLeft: 12, padding: '5px 12px', fontSize: 12 }} onClick={() => setAddingLine(true)}>+ Ajouter</button>}
        </div>

        <table className="inv-lines-table">
          <thead>
            <tr>
              <th>Description</th>
              <th style={{ textAlign: 'right', width: 80 }}>Qté</th>
              <th style={{ textAlign: 'right', width: 120 }}>Prix unit.</th>
              <th style={{ textAlign: 'right', width: 120 }}>Total</th>
              {editable && <th style={{ width: 60 }}></th>}
            </tr>
          </thead>
          <tbody>
            {inv.lines.map(line => (
              <tr key={line.id} className={editable ? 'inv-line-row' : ''}>
                {editingLine === line.id
                  ? <EditLineRow line={line} onSave={async (data) => {
                      const priceChanged = data.unit_price !== line.unit_price
                      const r = await api.put(`/v1/invoices/${id}/lines/${line.id}`, data)
                      setInv(r.data)
                      setEditingLine(null)
                      if (line.catalogue_item_id && priceChanged) {
                        setPricePrompt({ catalogue_item_id: line.catalogue_item_id, newPrice: data.unit_price })
                      }
                    }} onCancel={() => setEditingLine(null)} />
                  : <>
                      <td onClick={() => editable && setEditingLine(line.id)}>{line.description}</td>
                      <td style={{ textAlign: 'right' }} onClick={() => editable && setEditingLine(line.id)}>{line.qty}</td>
                      <td style={{ textAlign: 'right' }} onClick={() => editable && setEditingLine(line.id)}>{fmt(line.unit_price)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(line.line_total)}</td>
                      {editable && <td style={{ textAlign: 'center' }}><button className="inv-del-btn" onClick={() => deleteLine(line.id)}>✕</button></td>}
                    </>
                }
              </tr>
            ))}
            {inv.lines.length === 0 && (
              <tr><td colSpan={editable ? 5 : 4} style={{ textAlign: 'center', color: '#9CA3AF', padding: 16 }}>Aucune ligne</td></tr>
            )}
          </tbody>
        </table>

        {/* Totaux */}
        <div className="inv-totals">
          <div className="inv-total-row"><span>Sous-total</span><span>{fmt(inv.subtotal)}</span></div>
          {inv.apply_tps && <div className="inv-total-row"><span>TPS ({inv.tps_rate}%)</span><span>{fmt(inv.tps_amount)}</span></div>}
          {inv.apply_tvq && <div className="inv-total-row"><span>TVQ ({inv.tvq_rate}%)</span><span>{fmt(inv.tvq_amount)}</span></div>}
          <div className="inv-total-row inv-grand-total"><span>Total</span><span>{fmt(inv.total)}</span></div>
        </div>
      </div>

      {addingLine && (
        <AddLineModal
          catalogue={catalogue}
          onClose={() => setAddingLine(false)}
          onSave={async (data) => {
            const r = await api.post(`/v1/invoices/${id}/lines`, data)
            setInv(r.data); setAddingLine(false)
          }}
        />
      )}

      {/* Paiements */}
      {inv.status !== 'brouillon' && inv.status !== 'annulee' && (
        <div className="inv-lines-section" style={{ marginTop: 16 }}>
          <div className="inv-section-title" style={{ marginBottom: 12 }}>
            Paiements reçus
            <button className="btn-primary" style={{ marginLeft: 12, padding: '5px 12px', fontSize: 12 }} onClick={() => setShowAddPayment(true)}>+ Encaisser</button>
          </div>
          <table className="inv-lines-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Mode</th>
                <th style={{ textAlign: 'right' }}>Montant</th>
                <th style={{ textAlign: 'right' }}>Rabais</th>
                <th style={{ textAlign: 'right' }}>Net</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id}>
                  <td>{new Date(p.paid_at + 'T00:00:00').toLocaleDateString('fr-CA')}</td>
                  <td>{p.method_name}{p.card_last4 ? ` ••••${p.card_last4}` : ''}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(p.amount)}</td>
                  <td style={{ textAlign: 'right', color: '#059669' }}>{p.discount_rate > 0 ? `-${fmt(p.discount_amount)} (${p.discount_rate}%)` : '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(p.net_amount)}</td>
                  <td><button className="inv-del-btn" onClick={() => deletePayment(p.id)}>✕</button></td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9CA3AF', padding: 16 }}>Aucun paiement</td></tr>
              )}
            </tbody>
          </table>
          {payments.length > 0 && (
            <div className="inv-totals">
              <div className="inv-total-row"><span>Total encaissé (net)</span><span>{fmt(payments.reduce((s, p) => s + p.net_amount, 0))}</span></div>
              <div className="inv-total-row" style={{ color: inv.total - payments.reduce((s, p) => s + p.net_amount, 0) > 0.01 ? '#DC2626' : '#059669' }}>
                <span>Solde restant</span><span>{fmt(Math.max(0, inv.total - payments.reduce((s, p) => s + p.net_amount, 0)))}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {pricePrompt && (
        <PricePromptModal
          onClientOnly={() => setPricePrompt(null)}
          onUpdateCatalogue={async () => {
            await api.put(`/v1/catalogue/${pricePrompt.catalogue_item_id}`, { price: pricePrompt.newPrice })
            setPricePrompt(null)
          }}
        />
      )}

      {showAddPayment && (
        <AddPaymentModal
          methods={paymentMethods}
          invoiceTotal={inv.total}
          amountPaid={payments.reduce((s, p) => s + p.net_amount, 0)}
          onClose={() => setShowAddPayment(false)}
          onSave={async (data) => {
            await api.post(`/v1/payments/invoice/${id}`, data)
            await loadPayments()
            setShowAddPayment(false)
          }}
        />
      )}
      {showTaskModal && (
        <NewTaskModal
          prefillInvoice={{ id: inv.id, label: `Facture ${inv.number}` }}
          prefillCompany={inv.company_id ? { id: inv.company_id, label: inv.company_name } : null}
          onClose={() => setShowTaskModal(false)}
          onCreated={() => setShowTaskModal(false)}
        />
      )}
    </div>
  )
}

function EditLineRow({ line, onSave, onCancel }) {
  const [desc, setDesc] = useState(line.description)
  const [qty, setQty] = useState(line.qty)
  const [price, setPrice] = useState(line.unit_price)

  return (
    <>
      <td><input value={desc} onChange={e => setDesc(e.target.value)} className="inv-inline-input" autoFocus /></td>
      <td><input type="number" value={qty} onChange={e => setQty(parseFloat(e.target.value) || 0)} className="inv-inline-input" style={{ textAlign: 'right' }} /></td>
      <td><input type="number" step="0.01" value={price} onChange={e => setPrice(parseFloat(e.target.value) || 0)} className="inv-inline-input" style={{ textAlign: 'right' }} /></td>
      <td style={{ textAlign: 'right', fontWeight: 600 }}>{new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(qty * price)}</td>
      <td style={{ display: 'flex', gap: 4 }}>
        <button className="ifield-save" onClick={() => onSave({ description: desc, qty, unit_price: price })}>✓</button>
        <button className="ifield-cancel" onClick={onCancel}>✕</button>
      </td>
    </>
  )
}

function AddPaymentModal({ methods, invoiceTotal, amountPaid, onClose, onSave }) {
  const remaining = Math.max(0, invoiceTotal - amountPaid)
  const [form, setForm] = useState({ method_code: methods[0]?.code || '', amount: remaining.toFixed(2), notes: '', card_last4: '' })
  const [saving, setSaving] = useState(false)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const selectedMethod = methods.find(m => m.code === form.method_code)
  const discountRate = selectedMethod?.discount_rate || 0
  const amount = parseFloat(form.amount) || 0
  const discountAmt = Math.round(amount * discountRate) / 100
  const netAmt = amount - discountAmt

  async function save() {
    if (!form.method_code || amount <= 0) return
    setSaving(true)
    try {
      await onSave({ method_code: form.method_code, amount, notes: form.notes || null, card_last4: form.card_last4 || null })
    } finally { setSaving(false) }
  }

  const fmtC = v => new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(v)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Encaisser un paiement</h3>
        <div className="form-group">
          <label>Mode de paiement</label>
          <select value={form.method_code} onChange={e => f('method_code', e.target.value)} autoFocus>
            {methods.map(m => <option key={m.code} value={m.code}>{m.name}{m.discount_rate > 0 ? ` (rabais ${m.discount_rate}%)` : ''}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Montant ({fmtC(remaining)} restant)</label>
          <input type="number" step="0.01" value={form.amount} onChange={e => f('amount', e.target.value)} />
        </div>
        {discountRate > 0 && (
          <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#065F46' }}>
            Rabais {discountRate}% : -{fmtC(discountAmt)} → Net : {fmtC(netAmt)}
          </div>
        )}
        {(form.method_code === 'carte_credit' || form.method_code === 'elavon' || form.method_code === 'authorizenet') && (
          <div className="form-group">
            <label>4 derniers chiffres</label>
            <input maxLength={4} placeholder="1234" value={form.card_last4} onChange={e => f('card_last4', e.target.value)} />
          </div>
        )}
        <div className="form-group">
          <label>Notes (optionnel)</label>
          <input value={form.notes} onChange={e => f('notes', e.target.value)} />
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving || !form.method_code || amount <= 0}>{saving ? '...' : 'Encaisser'}</button>
        </div>
      </div>
    </div>
  )
}

function PricePromptModal({ onClientOnly, onUpdateCatalogue }) {
  const [saving, setSaving] = useState(false)

  async function updateCatalogue() {
    setSaving(true)
    try { await onUpdateCatalogue() } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Mise à jour du prix</h3>
        <p style={{ fontSize: 14, color: '#374151', marginBottom: 20, lineHeight: 1.5 }}>
          Ce prix vient du catalogue. Voulez-vous mettre à jour le catalogue pour tous les futurs clients ?
        </p>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClientOnly}>Juste pour ce client</button>
          <button className="btn-primary" onClick={updateCatalogue} disabled={saving}>
            {saving ? '...' : 'Prix fournisseur a changé'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddLineModal({ catalogue, onClose, onSave }) {
  const [mode, setMode] = useState('catalogue')
  const [selectedItem, setSelectedItem] = useState(null)
  const [form, setForm] = useState({ description: '', qty: 1, unit_price: 0 })
  const [saving, setSaving] = useState(false)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  function pickItem(item) {
    setSelectedItem(item)
    setForm({ description: item.name, qty: 1, unit_price: item.price })
  }

  async function save() {
    if (!form.description.trim()) return
    setSaving(true)
    try {
      await onSave({
        catalogue_item_id: selectedItem?.id || null,
        description: form.description,
        qty: form.qty,
        unit_price: form.unit_price,
      })
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-wide" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Ajouter une ligne</h3>
        <div className="inv-mode-tabs">
          <button className={`inv-mode-tab${mode === 'catalogue' ? ' active' : ''}`} onClick={() => setMode('catalogue')}>Catalogue</button>
          <button className={`inv-mode-tab${mode === 'custom' ? ' active' : ''}`} onClick={() => setMode('custom')}>Personnalisé</button>
        </div>

        {mode === 'catalogue' && (
          <div className="inv-cat-list">
            {catalogue.map(item => (
              <div
                key={item.id}
                className={`inv-cat-item${selectedItem?.id === item.id ? ' selected' : ''}`}
                onClick={() => pickItem(item)}
              >
                <span className="inv-cat-name">{item.name}</span>
                <span className={`cat-type ${item.type}`}>{item.type === 'service' ? 'Service' : 'Matériel'}</span>
                <span className="inv-cat-price">{new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(item.price)}</span>
              </div>
            ))}
          </div>
        )}

        {(mode === 'custom' || selectedItem) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Description</label>
              <input value={form.description} onChange={e => f('description', e.target.value)} autoFocus={mode === 'custom'} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label>Quantité</label>
                <input type="number" step="0.01" value={form.qty} onChange={e => f('qty', parseFloat(e.target.value) || 0)} />
              </div>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label>Prix unitaire</label>
                <input type="number" step="0.01" value={form.unit_price} onChange={e => f('unit_price', parseFloat(e.target.value) || 0)} />
              </div>
            </div>
            <div style={{ textAlign: 'right', fontWeight: 600, color: '#111827' }}>
              Total : {new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(form.qty * form.unit_price)}
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving || !form.description.trim()}>{saving ? '...' : 'Ajouter'}</button>
        </div>
      </div>
    </div>
  )
}
