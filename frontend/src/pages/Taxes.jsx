import { useState, useEffect } from 'react'
import EntityLink from '../components/EntityLink'
import { useSearchParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import { C, EMPTY, fmtMoney, fmtDate } from './Bank'
import { todayIso } from '../utils/date'
import { askConfirm, showAlert } from '../components/Dialog'

// Onglet « Impôts et formulaires » (TASK-043)

const SECTIONS = [
  { value: 'declaration', label: 'Déclaration de TPS/TVQ' },
  { value: 'adjustments', label: 'Ajustements fiscaux' },
  { value: 'payments',    label: 'Paiements de taxe' },
  { value: 'slips',       label: 'Feuillets T4A/T5018' },
]
const FREQS = [
  { value: 'mensuelle', label: 'Mensuelle' },
  { value: 'trimestrielle', label: 'Trimestrielle' },
  { value: 'annuelle', label: 'Annuelle' },
]
const STATE = {
  declaree:   { label: 'Déclarée',   color: '#059669', bg: 'var(--c-tint-green)' },
  a_produire: { label: 'À produire', color: 'var(--c-on-amber)', bg: 'var(--c-tint-amber)' },
  en_cours:   { label: 'En cours',   color: '#2563EB', bg: 'var(--c-tint-blue)' },
}
const fmtD = d => d ? fmtDate(d + 'T00:00:00') : EMPTY
const th = { padding: '10px 8px', fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'left' }
const thR = { ...th, textAlign: 'right' }
const td = { padding: '9px 8px' }
const tdR = { ...td, textAlign: 'right', whiteSpace: 'nowrap' }
const card = { background: 'var(--c-surface)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }
const errText = e => { const d = e.response?.data?.detail; return Array.isArray(d) ? d.map(x => x.msg).join(' ; ') : (d || 'Erreur') }
const periodLabel = p => `${fmtD(p.start)} au ${fmtD(p.end)}`

function Badge({ state }) {
  const s = STATE[state] || STATE.en_cours
  return <span style={{ fontSize: 12, fontWeight: 600, color: s.color, background: s.bg, borderRadius: 10, padding: '2px 8px', whiteSpace: 'nowrap' }}>{s.label}</span>
}

function Table({ head, children, minWidth = 700 }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth, borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `1px solid ${C.border}` }}>{head}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

// ── Déclaration de TPS/TVQ ─────────────────────────────────────────────────

function DeclarationSection({ onAddAdjustment, onAddPayment, refreshKey }) {
  const navigate = useNavigate()
  const [freq, setFreq] = useState(null)
  const [data, setData] = useState(null)
  const [selected, setSelected] = useState(null)
  const [report, setReport] = useState(null)
  const [showInvoices, setShowInvoices] = useState(false)
  const [showPurchases, setShowPurchases] = useState(false)
  const [error, setError] = useState(null)

  async function load(f = freq) {
    const r = await api.get('/v1/taxes/periods', { params: { count: 8, frequency: f || undefined } })
    setData(r.data)
    if (!f) setFreq(r.data.frequency)
    const keep = selected && r.data.periods.find(p => p.start === selected.start && p.end === selected.end)
    const pick = keep || r.data.periods.find(p => p.state === 'a_produire') || r.data.periods[0]
    setSelected(pick)
  }
  useEffect(() => { load() }, [refreshKey])
  useEffect(() => {
    if (!selected) return
    setReport(null); setShowInvoices(false)
    api.get('/v1/taxes/report', { params: { start: selected.start, end: selected.end } }).then(r => setReport(r.data))
  }, [selected?.start, selected?.end, refreshKey])

  async function declare() {
    if (!await askConfirm(`Marquer la période du ${periodLabel(selected)} comme déclarée ?\n\nLes factures de cette période seront verrouillées (plus de suppression ni de retour en brouillon) et la tâche de rappel sera fermée.`)) return
    setError(null)
    try { await api.post('/v1/taxes/declare', { end: selected.end }); await load() } catch (e) { setError(errText(e)) }
  }

  if (!data) return <div style={{ color: C.muted }}>Chargement...</div>
  const s = report?.summary

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: C.muted, display: 'flex', gap: 8, alignItems: 'center' }}>
          Période de déclaration
          <select value={freq || ''} onChange={e => { setFreq(e.target.value); setSelected(null); load(e.target.value) }}>
            {FREQS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </label>
        <span style={{ fontSize: 13, color: C.muted }}>
          Taxes déclarées jusqu'au : <strong style={{ color: 'var(--c-text)' }}>{data.tax_lock_date ? fmtD(data.tax_lock_date) : 'aucune période'}</strong>
        </span>
      </div>

      <div style={card}>
        <Table head={<>
          <th style={th}>Période</th><th style={th}>État</th><th style={th}>Échéance</th>
          <th style={thR}>Ventes</th><th style={thR}>TPS perçue</th><th style={thR}>TVQ perçue</th>
          <th style={thR}>CTI + RTI</th><th style={thR}>Ajustements</th><th style={thR}>Payé</th><th style={thR}>Solde</th>
        </>}>
          {data.periods.map(p => {
            const active = selected && p.start === selected.start && p.end === selected.end
            return (
              <tr key={p.start} onClick={() => setSelected(p)} style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer', background: active ? 'var(--c-tint-blue)' : undefined }}>
                <td style={{ ...td, fontWeight: active ? 600 : 400, minWidth: 110 }}>{fmtD(p.start)}<div style={{ fontSize: 12, color: C.muted }}>au {fmtD(p.end)}</div></td>
                <td style={td}><Badge state={p.state} /></td>
                <td style={{ ...td, whiteSpace: 'nowrap', color: p.state === 'a_produire' ? 'var(--c-on-amber)' : undefined }}>{fmtD(p.deadline)}</td>
                <td style={tdR}>{fmtMoney(p.sales)}</td>
                <td style={tdR}>{fmtMoney(p.tps_collected)}</td>
                <td style={tdR}>{fmtMoney(p.tvq_collected)}</td>
                <td style={tdR}>{p.tps_credits || p.tvq_credits ? fmtMoney(-(p.tps_credits + p.tvq_credits)) : EMPTY}</td>
                <td style={tdR}>{p.tps_adjustments || p.tvq_adjustments ? fmtMoney(p.tps_adjustments + p.tvq_adjustments) : EMPTY}</td>
                <td style={tdR}>{p.tps_paid || p.tvq_paid ? fmtMoney(p.tps_paid + p.tvq_paid) : EMPTY}</td>
                <td style={{ ...tdR, fontWeight: 600 }}>{fmtMoney(p.balance)}</td>
              </tr>
            )
          })}
        </Table>
      </div>

      {selected && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700 }}>Déclaration du {periodLabel(selected)}</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}><Badge state={selected.state} /> · à produire d'ici le {fmtD(selected.deadline)}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn-secondary" onClick={() => onAddAdjustment(selected)} disabled={selected.state === 'declaree'}>+ Ajustement</button>
              <button className="btn-secondary" onClick={() => onAddPayment(selected)}>+ Paiement de taxe</button>
              {selected.state === 'a_produire' && <button className="btn-primary" onClick={declare}>Marquer comme déclarée</button>}
            </div>
          </div>
          {error && <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>{error}</div>}
          {!s ? <div style={{ color: C.muted }}>Calcul...</div> : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                {[['TPS', 'tps'], ['TVQ', 'tvq']].map(([label, k]) => (
                  <div key={k} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, fontSize: 13 }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>{label}</div>
                    {[
                      ['Taxe perçue sur les ventes', s[`${k}_collected`]],
                      [k === 'tps' ? 'CTI — TPS payée sur les achats' : 'RTI — TVQ payée sur les achats', -s[`${k}_credits`]],
                      ['Ajustements', s[`${k}_adjustments`]],
                      ['Taxe nette à remettre', s[`${k}_net`], true],
                      ['Déjà payé pour cette période', s[`${k}_paid`]],
                    ].map(([t, v, b]) => (
                      <div key={t} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontWeight: b ? 700 : 400, borderTop: b ? `1px solid ${C.border}` : undefined }}>
                        <span>{t}</span><span>{fmtMoney(v)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, fontSize: 14, flexWrap: 'wrap', gap: 8 }}>
                <span style={{ color: C.muted }}>Ventes de la période (hors taxes) : <strong style={{ color: 'var(--c-text)' }}>{fmtMoney(s.sales)}</strong> · {s.invoice_count} facture{s.invoice_count > 1 ? 's' : ''}</span>
                <span>Solde à payer : <strong style={{ fontSize: 17 }}>{fmtMoney(s.balance)}</strong></span>
              </div>
              <div style={{ fontSize: 12, color: C.muted, background: 'var(--c-surface-2)', borderRadius: 8, padding: '8px 12px', marginTop: 12 }}>
                CTI/RTI calculés automatiquement depuis Achats : dépenses et factures fournisseurs datées dans la période, moins les avoirs fournisseur.
                Les comptes de dépense marqués « pas de CTI/RTI » (salaires, versements de taxe, impôts) sont exclus.
              </div>

              <button type="button" onClick={() => setShowPurchases(v => !v)} style={{ background: 'none', border: 'none', color: C.link, cursor: 'pointer', padding: 0, marginTop: 14, marginRight: 16, fontSize: 13 }}>
                {showPurchases ? 'Masquer les achats ▲' : `Voir les ${report.purchases.length} achats taxés de la période ▼`}
              </button>
              {showPurchases && (
                <div style={{ marginTop: 8 }}>
                  <Table head={<><th style={th}>Date</th><th style={th}>Document</th><th style={th}>Fournisseur</th><th style={thR}>TPS (CTI)</th><th style={thR}>TVQ (RTI)</th></>}>
                    {report.purchases.map(x => (
                      <tr key={x.kind + x.id} onClick={() => x.kind === 'bill' ? navigate(`/purchases/bills/${x.id}`) : navigate(x.kind === 'credit' ? '/purchases/credits' : '/purchases/expenses')}
                        style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtD(x.date)}</td>
                        <td style={td}>{x.kind === 'expense' ? 'Dépense — ' : ''}{x.label}</td>
                        <td style={td}>{x.vendor || EMPTY}</td>
                        <td style={tdR}>{fmtMoney(x.tps)}</td><td style={tdR}>{fmtMoney(x.tvq)}</td>
                      </tr>
                    ))}
                  </Table>
                </div>
              )}

              <button type="button" onClick={() => setShowInvoices(v => !v)} style={{ background: 'none', border: 'none', color: C.link, cursor: 'pointer', padding: 0, marginTop: 14, fontSize: 13 }}>
                {showInvoices ? 'Masquer les factures ▲' : `Voir les ${report.invoices.length} factures de la période ▼`}
              </button>
              {showInvoices && (
                <div style={{ marginTop: 8 }}>
                  <Table head={<><th style={th}>Date</th><th style={th}>Facture</th><th style={th}>Client</th><th style={thR}>Ventes</th><th style={thR}>TPS</th><th style={thR}>TVQ</th><th style={thR}>Total</th></>}>
                    {report.invoices.map(i => (
                      <tr key={i.id} onClick={() => navigate(`/invoices/${i.id}`)} style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtD(i.issue_date)}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{i.is_credit ? '[Avoir] ' : ''}<EntityLink kind="invoice" id={i.id}>{i.number}</EntityLink></td>
                        <td style={td}><EntityLink kind="company" id={i.company_id}>{i.company_name}</EntityLink></td>
                        <td style={tdR}>{fmtMoney(i.subtotal)}</td><td style={tdR}>{fmtMoney(i.tps)}</td>
                        <td style={tdR}>{fmtMoney(i.tvq)}</td><td style={tdR}>{fmtMoney(i.total)}</td>
                      </tr>
                    ))}
                  </Table>
                </div>
              )}
              {(report.adjustments.length > 0 || report.payments.length > 0) && (
                <div style={{ marginTop: 14, fontSize: 13 }}>
                  {report.adjustments.map(a => <div key={a.id}>Ajustement du {fmtD(a.adjustment_date)} — {a.category_label} : TPS {fmtMoney(a.tps_amount)}, TVQ {fmtMoney(a.tvq_amount)}{a.description ? ` · ${a.description}` : ''}</div>)}
                  {report.payments.map(p => <div key={p.id}>Paiement du {fmtD(p.payment_date)} : TPS {fmtMoney(p.tps_amount)}, TVQ {fmtMoney(p.tvq_amount)}{p.reference ? ` · réf. ${p.reference}` : ''}</div>)}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Ajustements fiscaux ─────────────────────────────────────────────────────

function AdjustmentModal({ initial, categories, onClose, onSaved }) {
  const [f, setF] = useState({
    adjustment_date: initial?.adjustment_date || todayIso(),
    category: initial?.category || 'correction',
    tps_amount: initial?.tps_amount ?? '', tvq_amount: initial?.tvq_amount ?? '', description: initial?.description || '',
  })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  async function save() {
    setSaving(true); setError(null)
    const body = { ...f, tps_amount: parseFloat(f.tps_amount) || 0, tvq_amount: parseFloat(f.tvq_amount) || 0, description: f.description || null }
    try {
      if (initial?.id) await api.put(`/v1/taxes/adjustments/${initial.id}`, body)
      else await api.post('/v1/taxes/adjustments', body)
      await onSaved()
    } catch (e) { setError(errText(e)) } finally { setSaving(false) }
  }
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 460 }}>
        <h3 className="modal-title">{initial?.id ? 'Modifier l\'ajustement' : 'Nouvel ajustement fiscal'}</h3>
        <div className="form-group"><label>Date (détermine la période)</label><input type="date" value={f.adjustment_date} onChange={e => set('adjustment_date', e.target.value)} /></div>
        <div className="form-group"><label>Catégorie</label>
          <select value={f.category} onChange={e => set('category', e.target.value)}>{Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="form-group" style={{ flex: 1 }}><label>TPS ($)</label><input type="number" step="0.01" value={f.tps_amount} onChange={e => set('tps_amount', e.target.value)} placeholder="-12.50" /></div>
          <div className="form-group" style={{ flex: 1 }}><label>TVQ ($)</label><input type="number" step="0.01" value={f.tvq_amount} onChange={e => set('tvq_amount', e.target.value)} placeholder="-24.94" /></div>
        </div>
        <div style={{ fontSize: 12, color: C.muted }}>Montant négatif = réduit la taxe à remettre (ex. CTI/RTI) ; positif = l'augmente.</div>
        <div className="form-group"><label>Description</label><input value={f.description} onChange={e => set('description', e.target.value)} /></div>
        {error && <div style={{ color: C.red, fontSize: 13 }}>{error}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? '...' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}

function AdjustmentsSection({ refreshKey, onEdit, onChanged }) {
  const [data, setData] = useState(null)
  useEffect(() => { api.get('/v1/taxes/adjustments').then(r => setData(r.data)) }, [refreshKey])
  async function remove(a) {
    if (!await askConfirm('Supprimer cet ajustement ?')) return
    try { await api.delete(`/v1/taxes/adjustments/${a.id}`); await onChanged() } catch (e) { showAlert(errText(e)) }
  }
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: C.muted }}>Un ajustement s'ajoute à la période qui contient sa date. Une période déjà déclarée ne se modifie plus.</div>
        <button className="btn-primary" onClick={() => onEdit({})}>+ Nouvel ajustement</button>
      </div>
      <Table head={<><th style={th}>Date</th><th style={th}>Catégorie</th><th style={th}>Description</th><th style={thR}>TPS</th><th style={thR}>TVQ</th><th style={th}></th></>}>
        {data?.items.map(a => (
          <tr key={a.id} style={{ borderBottom: `1px solid ${C.border}` }}>
            <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtD(a.adjustment_date)}</td><td style={td}>{a.category_label}</td><td style={td}>{a.description || ''}</td>
            <td style={tdR}>{fmtMoney(a.tps_amount)}</td><td style={tdR}>{fmtMoney(a.tvq_amount)}</td>
            <td style={tdR}>
              <button type="button" onClick={() => onEdit(a)} style={{ background: 'none', border: 'none', color: C.link, cursor: 'pointer', fontSize: 12 }}>Modifier</button>
              <button type="button" onClick={() => remove(a)} style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 12 }}>Supprimer</button>
            </td>
          </tr>
        ))}
        {data && !data.items.length && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: C.faint, padding: 24 }}>Aucun ajustement.</td></tr>}
      </Table>
    </div>
  )
}

// ── Paiements de taxe ───────────────────────────────────────────────────────

function PaymentModal({ initial, onClose, onSaved }) {
  const [periods, setPeriods] = useState([])
  const [f, setF] = useState({
    payment_date: initial?.payment_date || todayIso(),
    period: initial?.period_start ? `${initial.period_start}|${initial.period_end}` : '',
    tps_amount: initial?.tps_amount ?? '', tvq_amount: initial?.tvq_amount ?? '',
    method: initial?.method || '', reference: initial?.reference || '', notes: initial?.notes || '',
  })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  useEffect(() => {
    api.get('/v1/taxes/periods', { params: { count: 12 } }).then(r => {
      setPeriods(r.data.periods)
      if (f.tps_amount === '' && f.tvq_amount === '') {
        const p = r.data.periods.find(x => `${x.start}|${x.end}` === f.period) || r.data.periods.find(x => x.state === 'a_produire') || r.data.periods[0]
        setF(v => ({ ...v, period: `${p.start}|${p.end}`, tps_amount: v.tps_amount === '' ? Math.max(0, p.tps_net - p.tps_paid).toFixed(2) : v.tps_amount, tvq_amount: v.tvq_amount === '' ? Math.max(0, p.tvq_net - p.tvq_paid).toFixed(2) : v.tvq_amount }))
      }
    })
  }, [])
  async function save() {
    setSaving(true); setError(null)
    const [period_start, period_end] = f.period.split('|')
    const body = { payment_date: f.payment_date, period_start, period_end, tps_amount: parseFloat(f.tps_amount) || 0, tvq_amount: parseFloat(f.tvq_amount) || 0,
                   method: f.method || null, reference: f.reference || null, notes: f.notes || null }
    try {
      if (initial?.id) await api.put(`/v1/taxes/payments/${initial.id}`, body)
      else await api.post('/v1/taxes/payments', body)
      await onSaved()
    } catch (e) { setError(errText(e)) } finally { setSaving(false) }
  }
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 480 }}>
        <h3 className="modal-title">{initial?.id ? 'Modifier le paiement' : 'Paiement de taxe (Revenu Québec)'}</h3>
        <div className="form-group"><label>Période déclarée</label>
          <select value={f.period} onChange={e => set('period', e.target.value)}>
            {periods.map(p => <option key={p.start} value={`${p.start}|${p.end}`}>{periodLabel(p)} — {STATE[p.state].label}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Date du paiement</label><input type="date" value={f.payment_date} onChange={e => set('payment_date', e.target.value)} /></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="form-group" style={{ flex: 1 }}><label>TPS ($)</label><input type="number" step="0.01" value={f.tps_amount} onChange={e => set('tps_amount', e.target.value)} /></div>
          <div className="form-group" style={{ flex: 1 }}><label>TVQ ($)</label><input type="number" step="0.01" value={f.tvq_amount} onChange={e => set('tvq_amount', e.target.value)} /></div>
        </div>
        <div style={{ fontSize: 12, color: C.muted }}>Un remboursement reçu de Revenu Québec s'inscrit en montant négatif.</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="form-group" style={{ flex: 1 }}><label>Mode</label><input value={f.method} onChange={e => set('method', e.target.value)} placeholder="Paiement en ligne" /></div>
          <div className="form-group" style={{ flex: 1 }}><label>Référence</label><input value={f.reference} onChange={e => set('reference', e.target.value)} /></div>
        </div>
        <div className="form-group"><label>Notes</label><input value={f.notes} onChange={e => set('notes', e.target.value)} /></div>
        {error && <div style={{ color: C.red, fontSize: 13 }}>{error}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving || !f.period}>{saving ? '...' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}

function PaymentsSection({ refreshKey, onEdit, onChanged }) {
  const [rows, setRows] = useState(null)
  useEffect(() => { api.get('/v1/taxes/payments').then(r => setRows(r.data)) }, [refreshKey])
  async function remove(p) {
    if (!await askConfirm('Supprimer ce paiement de taxe ?')) return
    await api.delete(`/v1/taxes/payments/${p.id}`); await onChanged()
  }
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: C.muted }}>Versements faits à Revenu Québec (TPS et TVQ), rattachés à leur période.</div>
        <button className="btn-primary" onClick={() => onEdit({})}>+ Paiement de taxe</button>
      </div>
      <Table head={<><th style={th}>Date</th><th style={th}>Période</th><th style={th}>Mode / référence</th><th style={thR}>TPS</th><th style={thR}>TVQ</th><th style={thR}>Total</th><th style={th}></th></>}>
        {rows?.map(p => (
          <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}` }}>
            <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtD(p.payment_date)}</td>
            <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtD(p.period_start)} au {fmtD(p.period_end)}</td>
            <td style={td}>{[p.method, p.reference].filter(Boolean).join(' · ')}</td>
            <td style={tdR}>{fmtMoney(p.tps_amount)}</td><td style={tdR}>{fmtMoney(p.tvq_amount)}</td>
            <td style={{ ...tdR, fontWeight: 600 }}>{fmtMoney(p.tps_amount + p.tvq_amount)}</td>
            <td style={tdR}>
              <button type="button" onClick={() => onEdit(p)} style={{ background: 'none', border: 'none', color: C.link, cursor: 'pointer', fontSize: 12 }}>Modifier</button>
              <button type="button" onClick={() => remove(p)} style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 12 }}>Supprimer</button>
            </td>
          </tr>
        ))}
        {rows && !rows.length && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: C.faint, padding: 24 }}>Aucun paiement de taxe inscrit.</td></tr>}
      </Table>
    </div>
  )
}

// ── Feuillets T4A/T5018 (structure) ─────────────────────────────────────────

function SlipsSection() {
  const [year, setYear] = useState(new Date().getFullYear() - 1)
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, color: C.muted, display: 'flex', gap: 8, alignItems: 'center' }}>
          Année <select value={year} onChange={e => setYear(Number(e.target.value))}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
        </label>
        <button className="btn-primary" disabled title="Nécessite le module Dépenses (paiements aux fournisseurs et sous-traitants)">Générer les feuillets</button>
      </div>
      {[
        ['T4A', 'Honoraires, commissions et autres sommes versées à des travailleurs autonomes (plus de 500 $ dans l\'année).'],
        ['T5018', 'Paiements à des sous-traitants pour des services de construction (si la construction est votre activité principale).'],
      ].map(([code, text]) => (
        <div key={code} style={card}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Feuillets {code} — {year}</div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>{text}</div>
          <Table minWidth={560} head={<><th style={th}>Bénéficiaire</th><th style={th}>N° d'entreprise / NAS</th><th style={thR}>Montant</th><th style={th}>État</th></>}>
            <tr><td colSpan={4} style={{ ...td, textAlign: 'center', color: C.faint, padding: 24 }}>
              Les feuillets seront calculés à partir des paiements aux fournisseurs — module Dépenses à venir.
            </td></tr>
          </Table>
        </div>
      ))}
    </div>
  )
}

export default function Taxes() {
  const [params, setParams] = useSearchParams()
  const section = SECTIONS.some(s => s.value === params.get('section')) ? params.get('section') : 'declaration'
  const [refreshKey, setRefreshKey] = useState(0)
  const [adjEdit, setAdjEdit] = useState(null)
  const [payEdit, setPayEdit] = useState(null)
  const [categories, setCategories] = useState({})
  useEffect(() => { api.get('/v1/taxes/adjustments').then(r => setCategories(r.data.categories)) }, [])
  const refresh = async () => setRefreshKey(k => k + 1)

  return (
    <div className="page">
      <div className="page-header"><div><h1 className="page-title">Fiscalité</h1></div></div>
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <nav style={{ ...card, padding: 8, flex: '0 1 220px', minWidth: 200 }}>
          {SECTIONS.map(s => (
            <button key={s.value} type="button" onClick={() => setParams({ section: s.value }, { replace: true })}
              style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', borderRadius: 8, padding: '10px 12px', fontSize: 14, cursor: 'pointer',
                       background: section === s.value ? 'var(--c-tint-blue)' : 'none', color: section === s.value ? C.link : 'var(--c-text)', fontWeight: section === s.value ? 600 : 400 }}>
              {s.label}
            </button>
          ))}
        </nav>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          {section === 'declaration' && <DeclarationSection refreshKey={refreshKey}
            onAddAdjustment={p => setAdjEdit({ adjustment_date: p.end < todayIso() ? p.end : todayIso() })}
            onAddPayment={p => setPayEdit({ period_start: p.start, period_end: p.end })} />}
          {section === 'adjustments' && <AdjustmentsSection refreshKey={refreshKey} onEdit={setAdjEdit} onChanged={refresh} />}
          {section === 'payments' && <PaymentsSection refreshKey={refreshKey} onEdit={setPayEdit} onChanged={refresh} />}
          {section === 'slips' && <SlipsSection />}
        </div>
      </div>
      {adjEdit && <AdjustmentModal initial={adjEdit} categories={categories} onClose={() => setAdjEdit(null)} onSaved={async () => { setAdjEdit(null); await refresh() }} />}
      {payEdit && <PaymentModal initial={payEdit} onClose={() => setPayEdit(null)} onSaved={async () => { setPayEdit(null); await refresh() }} />}
    </div>
  )
}
