import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import NewTaskModal from '../components/NewTaskModal'
import './Invoices.css'
import { todayIso } from '../utils/date'
import useFeatures from '../hooks/useFeatures'

const STATUS_LABELS = {
  brouillon:  { label: 'Brouillon',  color: '#6B7280' },
  envoyee:    { label: 'Envoyée',    color: 'var(--brand)' },
  payee:      { label: 'Payée',      color: '#059669' },
  partiellement_payee: { label: 'Partiellement payée', color: '#D97706' },
  en_retard:  { label: 'En retard',  color: '#DC2626' },
  annulee:    { label: 'Annulée',    color: '#9CA3AF' },
}

const STATUS_TRANSITIONS = {
  brouillon: ['envoyee', 'annulee'],
  // « brouillon » : refusé par le serveur si un paiement est confirmé ou si la période de taxes est déclarée (TASK-005.8)
  envoyee:   ['brouillon', 'payee', 'en_retard', 'annulee'],
  en_retard: ['brouillon', 'payee', 'annulee'],
  payee:     [],
  // Statut calcule par les paiements (TASK-005.4) : pas de transition manuelle
  partiellement_payee: [],
  annulee:   [],
}

// Avoirs (TASK-005.10) : le statut suit l'application -- Ouvert tant qu'il reste un montant, Fermé une fois tout appliqué
const CREDIT_STATUS_LABELS = {
  ...STATUS_LABELS,
  envoyee: { label: 'Ouvert', color: 'var(--brand)' },
  payee:   { label: 'Fermé',  color: '#059669' },
}
const CREDIT_TRANSITIONS = { brouillon: ['envoyee', 'annulee'], envoyee: ['brouillon', 'annulee'], payee: [], annulee: [] }

const PAYMENT_STATUS = {
  pending:    { label: 'En attente', color: '#2563EB' },
  processing: { label: 'En traitement', color: '#2563EB' },
  confirmed:  { label: 'Confirmé', color: '#059669' },
  rejected:   { label: 'Rejeté', color: '#DC2626' },
  refunded:   { label: 'Remboursé', color: '#6B7280' },
  cancelled:  { label: 'Annulé', color: '#6B7280' },
}

function isPastDue(dueDate) {
  return new Date(dueDate + 'T00:00:00') < new Date(new Date().toDateString())
}

function fmt(val) {
  return new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(val)
}

function fmtOpened(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('fr-CA') + ' ' + d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
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
  const features = useFeatures()   // Echanges (troc) : options cachees si decochees (Administration → Integrations)
  const [showAddPayment, setShowAddPayment] = useState(false)
  const [showTaskModal, setShowTaskModal] = useState(false)
  const [pricePrompt, setPricePrompt] = useState(null)
  const [showSendModal, setShowSendModal] = useState(false)
  const [showOpens, setShowOpens] = useState(false)
  const [opens, setOpens] = useState([])
  const [opensLoading, setOpensLoading] = useState(false)
  const [creditInfo, setCreditInfo] = useState(null)      // sur un avoir : son application
  const [openCredits, setOpenCredits] = useState([])      // sur une facture : avoirs du client a appliquer
  const [showApplyCredit, setShowApplyCredit] = useState(false)

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
      loadCredits(r.data)
    })
  }, [id])

  async function loadCredits(invoice) {
    if (invoice.credit_of_id) {
      setCreditInfo((await api.get(`/v1/payments/credits/${invoice.id}`)).data)
    } else if (invoice.company_id) {
      setOpenCredits((await api.get('/v1/payments/credits/open', { params: { company_id: invoice.company_id } })).data)
    }
  }

  async function removeCreditAllocation(allocId) {
    if (!confirm("Retirer cette application de l'avoir ? Le montant redevient disponible sur l'avoir et dû sur la facture.")) return
    try {
      await api.delete(`/v1/payments/credit-allocations/${allocId}`)
    } catch (e) { alert(e.response?.data?.detail || 'Retrait impossible'); return }
    const r = await api.get(`/v1/invoices/${id}`)
    setInv(r.data)
    setPayments((await api.get(`/v1/payments/invoice/${id}`)).data)
    await loadCredits(r.data)
  }

  async function loadPayments() {
    const [r, inv_r] = await Promise.all([
      api.get(`/v1/payments/invoice/${id}`),
      api.get(`/v1/invoices/${id}`),
    ])
    setPayments(r.data)
    setInv(inv_r.data)
    await loadCredits(inv_r.data)
  }

  async function deletePayment(pid) {
    await api.delete(`/v1/payments/${pid}`)
    await loadPayments()
  }

  // Un paiement declare au portail peut couvrir plusieurs factures : confirmer/rejeter s'applique a toutes
  async function confirmPayment(p) {
    if (!confirm(`Confirmer la réception du paiement ${p.reference || ''} ? (s'applique à toutes les factures qu'il couvre)`)) return
    await api.patch(`/v1/payments/${p.id}/confirm`)
    await loadPayments()
  }

  async function rejectPayment(p) {
    if (!confirm(`Rejeter le paiement ${p.reference || ''} (jamais reçu) ? (s'applique à toutes les factures qu'il couvre)`)) return
    await api.patch(`/v1/payments/${p.id}/reject`)
    await loadPayments()
  }

  async function saveField(field, value) {
    const r = await api.put(`/v1/invoices/${id}`, { [field]: value })
    setInv(r.data)
  }

  async function changeStatus(s) {
    if (s === 'brouillon' && !confirm('Remettre cette facture en brouillon ? Elle redevient modifiable et ne compte plus dans les montants dus.')) return
    try {
      const r = await api.put(`/v1/invoices/${id}`, { status: s })
      setInv(r.data)
    } catch (e) { alert(e.response?.data?.detail || 'Changement de statut impossible') }
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

  async function toggleOpens() {
    if (showOpens) { setShowOpens(false); return }
    setShowOpens(true)
    setOpensLoading(true)
    try {
      const r = await api.get(`/v1/track/invoice/${id}/opens`)
      setOpens(r.data)
    } finally {
      setOpensLoading(false)
    }
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

  const confirmedPaid = payments.filter(p => p.status === 'confirmed').reduce((s, p) => s + p.net_amount, 0)
  const pendingPaid = payments.filter(p => p.status === 'pending' || p.status === 'processing').reduce((s, p) => s + p.net_amount, 0)

  const isCredit = !!inv.credit_of_id
  const labels = isCredit ? CREDIT_STATUS_LABELS : STATUS_LABELS
  const s = labels[inv.status] || STATUS_LABELS.brouillon
  const transitions = (isCredit ? CREDIT_TRANSITIONS : STATUS_TRANSITIONS)[inv.status] || []
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
              {features.barter && inv.barter_settlement && <span className="inv-recur-badge" style={{ background: '#ECFDF5', color: '#047857', whiteSpace: 'nowrap' }}>Troc</span>}
              {inv.late_fee_for_id && <span className="inv-recur-badge" style={{ background: '#FEF2F2', color: '#B91C1C', whiteSpace: 'nowrap' }}>Avis de retard</span>}
            </h1>
            <p className="page-sub">{inv.company_name}{inv.site_label_snapshot ? ` — ${inv.site_label_snapshot}` : ''}</p>
            {inv.site_address_snapshot && <p className="page-sub" style={{ fontSize: 12, color: '#9CA3AF', marginTop: 0 }}>{inv.site_address_snapshot}</p>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="inv-badge" style={{ background: s.color, fontSize: 13, padding: '5px 12px' }}>{s.label}</span>
          {transitions.map(t => (
            <button key={t} className="btn-secondary" onClick={() => changeStatus(t)} style={{ fontSize: 12 }}>
              → {isCredit && t === 'envoyee' ? 'Émettre' : STATUS_LABELS[t]?.label}
            </button>
          ))}
          {canCredit && <button className="btn-secondary" onClick={createCredit} disabled={actioning} style={{ fontSize: 12 }}>Créer un avoir</button>}
          {canGenerateNext && <button className="btn-secondary" onClick={generateNext} disabled={actioning} style={{ fontSize: 12 }}>Générer suivante</button>}
          <button className="btn-secondary" onClick={() => setShowSendModal(true)} style={{ fontSize: 12 }}>📧 Envoyer</button>
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
              <strong style={{ color: 'var(--brand)', cursor: 'pointer' }} onClick={() => navigate(`/invoices/${inv.credit_of_id}`)}>Voir facture originale</strong>
            </div>
          )}
          {inv.late_fee_for_id && (
            <div className="inv-info-row">
              <span>Avis de retard pour</span>
              <strong style={{ color: 'var(--brand)', cursor: 'pointer' }} onClick={() => navigate(`/invoices/${inv.late_fee_for_id}`)}>Voir la facture en retard</strong>
            </div>
          )}
          {features.barter && !inv.credit_of_id && !inv.late_fee_for_id && (
            <div className="inv-info-row">
              <span title="Une facture à régler en troc n'a jamais de frais de retard">À régler en troc</span>
              <input type="checkbox" checked={!!inv.barter_settlement} onChange={e => saveField('barter_settlement', e.target.checked)} />
            </div>
          )}
          <div className="inv-info-row">
            <span>Transmission</span>
            <select value={inv.transmission_status || ''} onChange={e => saveField('transmission_status', e.target.value)}
              style={{ fontSize: 13, color: inv.transmission_status === 'non_transmise' ? '#B45309' : undefined }}>
              {!inv.transmission_status && <option value="">Inconnue (importée)</option>}
              <option value="non_transmise">Non transmise</option>
              <option value="courriel">Envoyée par courriel</option>
              <option value="autre">Remise autrement</option>
            </select>
          </div>
          <div className="inv-info-row">
            <span>Courriel ouvert</span>
            {inv.last_opened_at ? (
              <span
                style={{ fontSize: 13, cursor: 'pointer' }}
                onClick={toggleOpens}
                title="Cliquer pour voir l'historique complet"
              >
                👁 {fmtOpened(inv.last_opened_at)}{inv.open_count > 1 ? ` (×${inv.open_count})` : ''}
              </span>
            ) : <span style={{ color: '#9CA3AF', fontSize: 13 }}>Jamais</span>}
          </div>
          {showOpens && (
            <div style={{ marginTop: -8, marginBottom: 8, fontSize: 12, color: '#6B7280', background: '#F9FAFB', borderRadius: 6, padding: '8px 12px' }}>
              {opensLoading ? 'Chargement...' : opens.length === 0 ? 'Aucune ouverture enregistrée.' : (
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {opens.map((o, i) => <li key={i}>{fmtOpened(o.opened_at)}</li>)}
                </ul>
              )}
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
          <NotesBox value={inv.notes || ''} onSave={v => saveField('notes', v)} />
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
              <th style={{ textAlign: 'center', width: 80 }} title="TPS/TVQ appliquées à cette ligne">Taxable</th>
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
                      <td style={{ textAlign: 'center' }}>
                        {editable
                          ? <input type="checkbox" checked={line.is_taxable !== false} title="TPS/TVQ sur cette ligne"
                              onChange={async e => { const r = await api.put(`/v1/invoices/${id}/lines/${line.id}`, { is_taxable: e.target.checked }); setInv(r.data) }} />
                          : <span style={{ fontSize: 12, color: line.is_taxable === false ? '#D97706' : '#9CA3AF' }}>{line.is_taxable === false ? 'Non' : 'Oui'}</span>}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(line.line_total)}</td>
                      {editable && <td style={{ textAlign: 'center' }}><button className="inv-del-btn" onClick={() => deleteLine(line.id)}>✕</button></td>}
                    </>
                }
              </tr>
            ))}
            {inv.lines.length === 0 && (
              <tr><td colSpan={editable ? 6 : 5} style={{ textAlign: 'center', color: '#9CA3AF', padding: 16 }}>Aucune ligne</td></tr>
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

      {/* Paiements -- seuls les paiements confirmes comptent dans l'encaisse et le solde */}
      {/* Avoir : sur quelles factures il est applique (TASK-005.10) */}
      {isCredit && creditInfo && inv.status !== 'brouillon' && inv.status !== 'annulee' && (
        <div className="inv-lines-section" style={{ marginTop: 16 }}>
          <div className="inv-section-title" style={{ marginBottom: 12 }}>
            Application de l'avoir
            {creditInfo.remaining > 0.005 && (
              <button className="btn-primary" style={{ marginLeft: 12, padding: '5px 12px', fontSize: 12 }} onClick={() => setShowApplyCredit(true)}>Appliquer sur des factures</button>
            )}
          </div>
          <table className="inv-lines-table">
            <thead><tr><th>Date</th><th>Facture</th><th style={{ textAlign: 'right' }}>Montant appliqué</th><th style={{ width: 40 }}></th></tr></thead>
            <tbody>
              {creditInfo.allocations.map(a => (
                <tr key={a.id}>
                  <td>{a.applied_at ? new Date(a.applied_at + 'T00:00:00').toLocaleDateString('fr-CA') : '—'}</td>
                  <td><span style={{ color: 'var(--brand)', cursor: 'pointer' }} onClick={() => navigate(`/invoices/${a.invoice_id}`)}>{a.invoice_number}</span></td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(a.amount)}</td>
                  <td><button className="inv-del-btn" title="Retirer l'application" onClick={() => removeCreditAllocation(a.id)}>✕</button></td>
                </tr>
              ))}
              {creditInfo.allocations.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9CA3AF', padding: 16 }}>Pas encore appliqué</td></tr>
              )}
            </tbody>
          </table>
          <div className="inv-totals">
            <div className="inv-total-row"><span>Total de l'avoir</span><span>{fmt(creditInfo.total)}</span></div>
            <div className="inv-total-row"><span>Appliqué</span><span>{fmt(creditInfo.applied)}</span></div>
            <div className="inv-total-row" style={{ color: creditInfo.remaining > 0.005 ? '#D97706' : '#059669' }}>
              <span>Reste à appliquer</span><span>{fmt(creditInfo.remaining)}</span>
            </div>
          </div>
        </div>
      )}

      {!isCredit && inv.status !== 'brouillon' && inv.status !== 'annulee' && (
        <div className="inv-lines-section" style={{ marginTop: 16 }}>
          <div className="inv-section-title" style={{ marginBottom: 12 }}>
            Paiements et avoirs reçus
            <button className="btn-primary" style={{ marginLeft: 12, padding: '5px 12px', fontSize: 12 }} onClick={() => setShowAddPayment(true)}>+ Encaisser</button>
            {openCredits.length > 0 && inv.total - confirmedPaid > 0.005 && (
              <button className="btn-secondary" style={{ marginLeft: 8, padding: '5px 12px', fontSize: 12 }} onClick={() => setShowApplyCredit(true)}>
                Appliquer un avoir ({fmt(openCredits.reduce((t, c) => t + c.remaining, 0))} disponible)
              </button>
            )}
          </div>
          <table className="inv-lines-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Mode</th>
                <th style={{ textAlign: 'right' }}>Montant</th>
                <th>Statut</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id} style={p.status === 'confirmed' ? undefined : { color: '#6B7280' }}>
                  <td>{p.paid_at ? new Date(p.paid_at + 'T00:00:00').toLocaleDateString('fr-CA') : '—'}</td>
                  <td>{p.method_name}{p.card_last4 ? ` ••••${p.card_last4}` : ''}{p.reference ? ` · ${p.reference}` : ''}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(p.net_amount)}</td>
                  <td>
                    <span style={{ fontSize: 12, fontWeight: 600, color: PAYMENT_STATUS[p.status]?.color || '#6B7280' }}>{PAYMENT_STATUS[p.status]?.label || p.status}</span>
                    {(p.status === 'pending' || p.status === 'processing') && (
                      <span style={{ marginLeft: 8, whiteSpace: 'nowrap' }}>
                        <button className="btn-primary" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => confirmPayment(p)}>Confirmer</button>
                        <button className="btn-secondary" style={{ padding: '2px 8px', fontSize: 11, marginLeft: 4 }} onClick={() => rejectPayment(p)}>Rejeter</button>
                      </span>
                    )}
                  </td>
                  <td><button className="inv-del-btn" title={p.kind === 'credit' ? "Retirer l'avoir" : undefined}
                    onClick={() => p.kind === 'credit' ? removeCreditAllocation(p.id) : deletePayment(p.id)}>✕</button></td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9CA3AF', padding: 16 }}>Aucun paiement</td></tr>
              )}
            </tbody>
          </table>
          {payments.length > 0 && (
            <div className="inv-totals">
              <div className="inv-total-row"><span>Total réglé (paiements + avoirs)</span><span>{fmt(confirmedPaid)}</span></div>
              {pendingPaid > 0 && (
                <div className="inv-total-row" style={{ color: '#2563EB' }}><span>En attente de confirmation</span><span>{fmt(pendingPaid)}</span></div>
              )}
              <div className="inv-total-row" style={{ color: inv.total - confirmedPaid > 0.01 ? '#DC2626' : '#059669' }}>
                <span>Solde restant</span><span>{fmt(Math.max(0, inv.total - confirmedPaid))}</span>
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
          amountPaid={confirmedPaid}
          onClose={() => setShowAddPayment(false)}
          onSave={async (data) => {
            await api.post(`/v1/payments/invoice/${id}`, data)
            await loadPayments()
            setShowAddPayment(false)
          }}
        />
      )}
      {showApplyCredit && (
        <ApplyCreditModal
          credit={isCredit ? creditInfo : null}
          invoice={isCredit ? null : { id: inv.id, number: inv.number, balance: inv.total - confirmedPaid }}
          openCredits={openCredits}
          onClose={() => setShowApplyCredit(false)}
          onSaved={async () => { setShowApplyCredit(false); await loadPayments() }}
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
      {showSendModal && (
        <SendInvoiceModal
          invoiceId={inv.id}
          companyId={inv.company_id}
          onClose={() => setShowSendModal(false)}
          onSent={data => { setInv(data); setShowSendModal(false) }}
        />
      )}
    </div>
  )
}

function SendInvoiceModal({ invoiceId, companyId, onClose, onSent }) {
  const [email, setEmail] = useState('')
  const [loadingEmail, setLoadingEmail] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/v1/companies/${companyId}`).then(r => {
      const contacts = r.data.contacts || []
      const primary = contacts.find(c => c.is_primary && c.email) || contacts.find(c => c.email)
      if (primary) setEmail(primary.email)
    }).finally(() => setLoadingEmail(false))
  }, [companyId])

  async function send() {
    if (!email.trim()) return
    setSending(true)
    setError('')
    try {
      const r = await api.post(`/v1/invoices/${invoiceId}/send`, { to_email: email.trim() })
      onSent(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Erreur envoi courriel')
      setSending(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Envoyer la facture</h3>
        {error && <div style={{ color: '#DC2626', marginBottom: 12, fontSize: 13 }}>{error}</div>}
        <div className="form-group">
          <label>Courriel du destinataire</label>
          <input
            type="email"
            autoFocus
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder={loadingEmail ? 'Chargement...' : 'courriel@exemple.com'}
          />
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={send} disabled={sending || !email.trim()}>{sending ? '...' : 'Envoyer'}</button>
        </div>
      </div>
    </div>
  )
}

// Appliquer un avoir (TASK-005.10) -- deux sens :
//  - depuis l'avoir (credit) : repartir son reste sur les factures ouvertes du client (plus anciennes d'abord)
//  - depuis une facture (invoice) : y appliquer un ou plusieurs avoirs ouverts du client
function ApplyCreditModal({ credit, invoice, openCredits, onClose, onSaved }) {
  const [rows, setRows] = useState(null)
  const [appliedAt, setAppliedAt] = useState(todayIso())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const prefill = (items, budget, key) => items.map(it => {
      const amt = Math.max(0, Math.min(it[key], budget))
      budget -= amt
      return { ...it, amount: amt ? amt.toFixed(2) : '' }
    })
    if (credit) {
      api.get(`/v1/payments/credits/${credit.credit_id}/candidates`).then(r => setRows(prefill(r.data, credit.remaining, 'balance')))
    } else {
      setRows(prefill(openCredits, invoice.balance, 'remaining'))
    }
  }, [])

  const total = (rows || []).reduce((t, r) => t + (parseFloat(r.amount) || 0), 0)
  const limit = credit ? credit.remaining : invoice.balance

  async function save() {
    setError('')
    if (total <= 0) { setError('Aucun montant à appliquer'); return }
    if (total > limit + 0.005) { setError(`Maximum ${fmt(limit)}`); return }
    setSaving(true)
    try {
      if (credit) {
        await api.post(`/v1/payments/credits/${credit.credit_id}/apply`, {
          applied_at: appliedAt,
          allocations: rows.filter(r => parseFloat(r.amount) > 0).map(r => ({ invoice_id: r.invoice_id, amount: parseFloat(r.amount) })),
        })
      } else {
        for (const r of rows.filter(r => parseFloat(r.amount) > 0)) {
          await api.post(`/v1/payments/credits/${r.credit_id}/apply`, {
            applied_at: appliedAt, allocations: [{ invoice_id: invoice.id, amount: parseFloat(r.amount) }],
          })
        }
      }
      await onSaved()
    } catch (e) {
      setError(e.response?.data?.detail || 'Application impossible')
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 640, width: '100%' }}>
        <div className="modal-title">{credit ? `Appliquer l'avoir ${credit.number}` : `Appliquer un avoir sur ${invoice.number}`}</div>
        <p style={{ fontSize: 13, color: '#6B7280', marginTop: 0 }}>
          {credit ? `Reste à appliquer : ${fmt(credit.remaining)}` : `Solde de la facture : ${fmt(invoice.balance)}`}
        </p>
        {rows === null ? <div className="loading">Chargement...</div> : rows.length === 0 ? (
          <p style={{ color: '#9CA3AF' }}>{credit ? 'Aucune facture ouverte pour ce client.' : 'Aucun avoir disponible.'}</p>
        ) : (
          <table className="inv-lines-table">
            <thead><tr><th>Date</th><th>{credit ? 'Facture' : 'Avoir'}</th><th style={{ textAlign: 'right' }}>{credit ? 'Solde' : 'Disponible'}</th><th style={{ textAlign: 'right' }}>À appliquer</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.invoice_id || r.credit_id}>
                  <td>{r.issue_date ? new Date(r.issue_date + 'T00:00:00').toLocaleDateString('fr-CA') : '—'}</td>
                  <td>{r.number}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(credit ? r.balance : r.remaining)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <input type="number" step="0.01" min="0" value={r.amount} style={{ width: 90, textAlign: 'right', boxSizing: 'border-box' }}
                      onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="form-group" style={{ marginTop: 12 }}>
          <label>Date d'application</label>
          <input type="date" value={appliedAt} onChange={e => setAppliedAt(e.target.value)} />
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, textAlign: 'right' }}>Total appliqué : {fmt(total)}</div>
        {error && <div style={{ color: '#DC2626', fontSize: 13, marginTop: 8 }}>{error}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving || !rows?.length}>Appliquer</button>
        </div>
      </div>
    </div>
  )
}

function EditLineRow({ line, onSave, onCancel }) {
  const [desc, setDesc] = useState(line.description)
  const [qty, setQty] = useState(line.qty)
  const [price, setPrice] = useState(line.unit_price)
  const [taxable, setTaxable] = useState(line.is_taxable !== false)

  return (
    <>
      <td><input value={desc} onChange={e => setDesc(e.target.value)} className="inv-inline-input" autoFocus /></td>
      <td><input type="number" value={qty} onChange={e => setQty(parseFloat(e.target.value) || 0)} className="inv-inline-input" style={{ textAlign: 'right' }} /></td>
      <td><input type="number" step="0.01" value={price} onChange={e => setPrice(parseFloat(e.target.value) || 0)} className="inv-inline-input" style={{ textAlign: 'right' }} /></td>
      <td style={{ textAlign: 'center' }}><input type="checkbox" checked={taxable} onChange={e => setTaxable(e.target.checked)} title="TPS/TVQ sur cette ligne" /></td>
      <td style={{ textAlign: 'right', fontWeight: 600 }}>{new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(qty * price)}</td>
      <td style={{ display: 'flex', gap: 4 }}>
        <button className="ifield-save" onClick={() => onSave({ description: desc, qty, unit_price: price, is_taxable: taxable })}>✓</button>
        <button className="ifield-cancel" onClick={onCancel}>✕</button>
      </td>
    </>
  )
}

// Notes modifiables meme sur une facture emise (2026-10-08, Philippe : « j'essaie d'ecrire dans les notes de la
// facture et je ne suis pas capable ») : elles ne changent ni les montants ni les taxes. Enregistrees quand on sort du
// champ (avant : une requete par lettre tapee, des caracteres pouvaient se perdre).
function NotesBox({ value, onSave }) {
  const [text, setText] = useState(value)
  const [state, setState] = useState('')
  useEffect(() => { setText(value) }, [value])
  async function save() {
    if (text === value) return
    setState('…')
    try { await onSave(text); setState('✓ Enregistré') } catch { setState('Erreur : non enregistré') }
  }
  return (
    <>
      <textarea className="inv-notes" value={text} placeholder="Notes internes ou message client..." rows={5}
        onChange={e => { setText(e.target.value); setState('') }} onBlur={save} />
      {state && <div style={{ fontSize: 12, color: state.startsWith('Erreur') ? '#DC2626' : '#059669', marginTop: 4 }}>{state}</div>}
    </>
  )
}

function AddPaymentModal({ methods, invoiceTotal, amountPaid, onClose, onSave }) {
  const remaining = Math.max(0, invoiceTotal - amountPaid)
  const [form, setForm] = useState({ method_code: methods[0]?.code || '', amount: remaining.toFixed(2), notes: '', card_last4: '' })
  const [saving, setSaving] = useState(false)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // Rabais par mode de paiement aboli (Philippe, 2026-10-02) : le montant encaisse est le montant paye
  const amount = parseFloat(form.amount) || 0

  async function save() {
    if (!form.method_code || amount <= 0) return
    setSaving(true)
    try {
      await onSave({ method_code: form.method_code, amount, notes: form.notes || null, card_last4: form.card_last4 || null })
    } finally { setSaving(false) }
  }

  const fmtC = v => new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(v)

  return (
    <div className="modal-overlay">
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Encaisser un paiement</h3>
        <div className="form-group">
          <label>Mode de paiement</label>
          <select value={form.method_code} onChange={e => f('method_code', e.target.value)} autoFocus>
            {methods.map(m => <option key={m.code} value={m.code}>{m.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Montant ({fmtC(remaining)} restant)</label>
          <input type="number" step="0.01" value={form.amount} onChange={e => f('amount', e.target.value)} />
        </div>
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
  const [form, setForm] = useState({ description: '', qty: 1, unit_price: 0, is_taxable: true })
  const [saving, setSaving] = useState(false)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  function pickItem(item) {
    setSelectedItem(item)
    setForm(p => ({ ...p, description: item.name, qty: 1, unit_price: item.price }))
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
        is_taxable: form.is_taxable,
      })
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay">
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={form.is_taxable} onChange={e => f('is_taxable', e.target.checked)} />
              Taxable (TPS/TVQ)
            </label>
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
