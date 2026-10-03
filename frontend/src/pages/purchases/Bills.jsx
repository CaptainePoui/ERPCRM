import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import api from '../../services/api'
import {
  C, EMPTY, fmtMoney, fmtD, today, th, thR, td, tdR, headRow, rowStyle, Card, Modal, Field, Select, VendorPicker,
  CategorySelect, TaxTotals, Filters, TAX_CODES, TAX_MODES, FREQS, freqLabel, BILL_STATUS, computeTaxes, useRefs, errText,
} from './common'
import { recurringState } from './Expenses'
import { PaymentModal } from './Payments'

const toNum = v => parseFloat(v) || 0
const lineAmount = l => Math.round(toNum(l.qty) * toNum(l.rate) * 100) / 100
const newLine = (categoryId = null) => ({ description: '', category_id: categoryId, qty: 1, rate: '', tax_code: 'tps_tvq' })

// Lignes d'une facture fournisseur (ou d'une facture periodique)
export function LinesEditor({ lines, setLines, categories, mode, readOnly }) {
  const set = (i, k, v) => setLines(lines.map((l, j) => j === i ? { ...l, [k]: v } : l))
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={headRow}>
          <th style={th}>Description</th><th style={th}>Compte de dépense</th><th style={thR}>Qté</th>
          <th style={thR}>{mode === 'inclusive' ? 'Prix (taxes incl.)' : 'Prix'}</th><th style={th}>Taxes</th><th style={thR}>Montant</th><th style={th}></th>
        </tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={td}><input disabled={readOnly} value={l.description} style={{ width: '100%', minWidth: 180 }} onChange={e => set(i, 'description', e.target.value)} /></td>
              <td style={td}><CategorySelect categories={categories} value={l.category_id} onChange={v => set(i, 'category_id', v)} /></td>
              <td style={tdR}><input disabled={readOnly} type="number" step="0.01" value={l.qty} style={{ width: 70, textAlign: 'right' }} onChange={e => set(i, 'qty', e.target.value)} /></td>
              <td style={tdR}><input disabled={readOnly} type="number" step="0.01" value={l.rate} style={{ width: 100, textAlign: 'right' }} onChange={e => set(i, 'rate', e.target.value)} /></td>
              <td style={td}><Select value={l.tax_code} onChange={v => set(i, 'tax_code', v)} options={TAX_CODES} /></td>
              <td style={{ ...tdR, fontWeight: 600 }}>{fmtMoney(lineAmount(l))}</td>
              <td style={td}>{!readOnly && lines.length > 1 && <button className="inv-del-btn" title="Retirer la ligne" onClick={() => setLines(lines.filter((_, j) => j !== i))}>✕</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!readOnly && <button className="btn-secondary" style={{ marginTop: 8, fontSize: 12 }} onClick={() => setLines([...lines, newLine(lines[lines.length - 1]?.category_id)])}>+ Ajouter une ligne</button>}
    </div>
  )
}

const linesPayload = lines => lines.map(l => ({ description: l.description || '', category_id: l.category_id || null, qty: toNum(l.qty) || 1, rate: toNum(l.rate), tax_code: l.tax_code }))
const linesTaxes = (lines, mode) => computeTaxes(lines.map(l => [lineAmount(l), l.tax_code]), mode)

export function PurchaseBills() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { vendors } = useRefs()
  const [rows, setRows] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('topay')
  const vendorId = params.get('vendor')
  useEffect(() => { api.get('/v1/purchases/bills').then(r => setRows(r.data)) }, [])

  const q = search.trim().toLowerCase()
  const shown = (rows || [])
    .filter(b => !vendorId || b.vendor_id === vendorId)
    .filter(b => filter === 'all' || (filter === 'topay' ? ['ouverte', 'partielle', 'en_retard'].includes(b.status) : b.status === filter))
    .filter(b => !q || [b.vendor_name, b.bill_number, b.notes, String(b.total)].some(x => (x || '').toLowerCase().includes(q)))
  const due = shown.reduce((s, b) => s + b.balance, 0)
  const vendorName = vendors.find(v => v.id === vendorId)?.name

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Factures fournisseurs{vendorName ? ` — ${vendorName}` : ''}</h1>
          <p className="page-sub">{shown.length} facture{shown.length > 1 ? 's' : ''} · {fmtMoney(due)} à payer
            {vendorId && <> · <span style={{ color: C.link, cursor: 'pointer' }} onClick={() => navigate('/purchases/bills')}>tous les fournisseurs</span></>}</p>
        </div>
        <button className="btn-primary" onClick={() => navigate(`/purchases/bills/new${vendorId ? `?vendor=${vendorId}` : ''}`)}>+ Nouvelle facture fournisseur</button>
      </div>
      <div className="page-toolbar" style={{ gap: 10 }}>
        <input className="search-input" placeholder="Rechercher (fournisseur, n°, montant)..." value={search} onChange={e => setSearch(e.target.value)} />
        <Filters value={filter} onChange={setFilter} options={[['topay', 'À payer'], ['en_retard', 'En retard'], ['payee', 'Payées'], ['brouillon', 'Brouillons'], ['all', 'Toutes']]} />
      </div>
      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 820, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={headRow}>
              <th style={th}>Date</th><th style={th}>N°</th><th style={th}>Fournisseur</th><th style={th}>Statut</th>
              <th style={th}>Échéance</th><th style={thR}>Montant</th><th style={thR}>Solde dû</th>
            </tr></thead>
            <tbody>
              {rows === null && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: C.muted }}>Chargement...</td></tr>}
              {shown.slice(0, 500).map(b => {
                const [sl, sc] = BILL_STATUS[b.status] || [b.status, C.muted]
                return (
                  <tr key={b.id} style={rowStyle} onClick={() => navigate(`/purchases/bills/${b.id}`)}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtD(b.bill_date)}</td>
                    <td style={{ ...td, fontSize: 12 }}>{b.bill_number || EMPTY}{b.recurring_id ? ' ↺' : ''}</td>
                    <td style={td}>{b.vendor_name}</td>
                    <td style={{ ...td, color: sc, fontWeight: 600, fontSize: 12 }}>{sl}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap', color: b.status === 'en_retard' ? C.red : undefined }}>{fmtD(b.due_date)}</td>
                    <td style={tdR}>{fmtMoney(b.total)}</td>
                    <td style={{ ...tdR, fontWeight: 600, color: b.balance > 0 ? '#111827' : C.faint }}>{fmtMoney(b.balance)}</td>
                  </tr>
                )
              })}
              {rows && !shown.length && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: C.faint, padding: 24 }}>Aucune facture.</td></tr>}
            </tbody>
          </table>
          {shown.length > 500 && <div style={{ fontSize: 12, color: C.muted, padding: 8 }}>500 premières affichées — utilisez la recherche.</div>}
        </div>
      </Card>
    </div>
  )
}

export function PurchaseBillDetail() {
  const { id } = useParams()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const refs = useRefs()
  const [bill, setBill] = useState(null)
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [paying, setPaying] = useState(false)

  async function load() {
    const r = await api.get(`/v1/purchases/bills/${id}`)
    setBill(r.data)
    setForm({ ...r.data, due_date: r.data.due_date || '', lines: r.data.lines.map(l => ({ ...l })) })
  }
  useEffect(() => {
    if (isNew) setForm({ vendor_id: params.get('vendor'), bill_number: '', bill_date: today(), due_date: '', tax_mode: 'exclusive', adjustment: 0, notes: '', lines: [newLine()] })
    else load()
  }, [id])

  if (!form) return <div className="page"><div className="loading">Chargement...</div></div>
  const t = linesTaxes(form.lines, form.tax_mode)
  const settled = bill ? bill.paid : 0

  async function save(asDraft = false) {
    setError('')
    if (!form.vendor_id) { setError('Choisissez le fournisseur'); return }
    setSaving(true)
    const body = { vendor_id: form.vendor_id, bill_number: form.bill_number || null, bill_date: form.bill_date, due_date: form.due_date || null,
      tax_mode: form.tax_mode, adjustment: toNum(form.adjustment), notes: form.notes || null, is_draft: asDraft, lines: linesPayload(form.lines) }
    try {
      const r = isNew ? await api.post('/v1/purchases/bills', body) : await api.put(`/v1/purchases/bills/${id}`, body)
      if (isNew) navigate(`/purchases/bills/${r.data.id}`, { replace: true })
      else { setBill(r.data); setForm({ ...r.data, due_date: r.data.due_date || '', lines: r.data.lines.map(l => ({ ...l })) }) }
    } catch (e) { setError(errText(e)) }
    setSaving(false)
  }
  async function remove() {
    if (!confirm('Supprimer cette facture fournisseur ?')) return
    try { await api.delete(`/v1/purchases/bills/${id}`); navigate('/purchases/bills') } catch (e) { alert(errText(e, 'Suppression impossible')) }
  }
  const [sl, sc] = bill ? (BILL_STATUS[bill.status] || [bill.status, C.muted]) : ['Nouvelle', C.muted]

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-secondary" onClick={() => navigate('/purchases/bills')} style={{ padding: '6px 12px' }}>← Retour</button>
          <div>
            <h1 className="page-title" style={{ marginBottom: 2 }}>{isNew ? 'Nouvelle facture fournisseur' : `Facture ${bill.bill_number || ''} — ${bill.vendor_name}`}</h1>
            {!isNew && <p className="page-sub" style={{ color: sc, fontWeight: 600 }}>{sl}{bill.balance > 0 ? ` · ${fmtMoney(bill.balance)} à payer` : ''}</p>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!isNew && bill.balance > 0 && <button className="btn-primary" onClick={() => setPaying(true)}>Enregistrer un paiement</button>}
          {!isNew && settled === 0 && <button className="btn-danger" onClick={remove}>Supprimer</button>}
        </div>
      </div>

      <Card style={{ padding: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <VendorPicker vendors={refs.vendors} value={form.vendor_id} onCreated={refs.reload} required
            onChange={vid => {
              const v = refs.vendors.find(x => x.id === vid)
              setForm({ ...form, vendor_id: vid, lines: form.lines.map(l => ({ ...l, category_id: l.category_id || v?.default_category_id || null })) })
            }} />
          <Field label="N° de facture"><input value={form.bill_number || ''} onChange={e => setForm({ ...form, bill_number: e.target.value })} /></Field>
          <Field label="Date *"><input type="date" value={form.bill_date} onChange={e => setForm({ ...form, bill_date: e.target.value })} /></Field>
          <Field label="Échéance"><input type="date" value={form.due_date || ''} onChange={e => setForm({ ...form, due_date: e.target.value })} /></Field>
          <Field label="Les prix sont"><Select value={form.tax_mode} onChange={v => setForm({ ...form, tax_mode: v })} options={TAX_MODES} /></Field>
        </div>
        <div style={{ marginTop: 16 }}>
          <LinesEditor lines={form.lines} setLines={lines => setForm({ ...form, lines })} categories={refs.categories} mode={form.tax_mode} />
        </div>
        <div style={{ display: 'flex', gap: 24, marginTop: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <Field label="Notes" style={{ flex: 1, minWidth: 240 }}><textarea rows={3} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
          <div>
            <TaxTotals t={t} adjustment={toNum(form.adjustment)} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12, color: C.muted }}>
              Ajustement d'arrondi
              <input type="number" step="0.01" value={form.adjustment} style={{ width: 80, textAlign: 'right' }} onChange={e => setForm({ ...form, adjustment: e.target.value })} />
            </div>
          </div>
        </div>
        {error && <div style={{ color: C.red, fontSize: 13, marginTop: 8 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          {(isNew || bill.status === 'brouillon') && <button className="btn-secondary" disabled={saving} onClick={() => save(true)}>Enregistrer en brouillon</button>}
          <button className="btn-primary" disabled={saving} onClick={() => save(false)}>{isNew || bill.status === 'brouillon' ? 'Enregistrer (à payer)' : 'Enregistrer'}</button>
        </div>
      </Card>

      {!isNew && (bill.payments.length > 0 || bill.credits.length > 0) && (
        <Card style={{ marginTop: 16, padding: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: C.faint, marginBottom: 8 }}>Paiements et avoirs</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {bill.payments.map(p => (
                <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={td}>{fmtD(p.date)}</td><td style={td}>Paiement{p.payee ? ` — ${p.payee}` : ''}{p.method ? ` · ${p.method}` : ''}{p.reference ? ` · ${p.reference}` : ''}</td>
                  <td style={{ ...tdR, fontWeight: 600 }}>{fmtMoney(p.amount)}</td>
                </tr>
              ))}
              {bill.credits.map(c => (
                <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={td}>{fmtD(c.date)}</td><td style={td}>Avoir {c.number || ''}</td><td style={{ ...tdR, fontWeight: 600 }}>{fmtMoney(c.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ textAlign: 'right', fontSize: 13, marginTop: 8 }}>Réglé : <strong>{fmtMoney(bill.paid)}</strong> · Solde : <strong style={{ color: bill.balance > 0 ? C.red : C.green }}>{fmtMoney(bill.balance)}</strong></div>
        </Card>
      )}

      {paying && <PaymentModal presetVendorId={bill.vendor_id} presetBillId={bill.id} onClose={() => setPaying(false)} onSaved={() => { setPaying(false); load() }} />}
    </div>
  )
}

export function PurchaseRecurringBills() {
  const navigate = useNavigate()
  const refs = useRefs()
  const [rows, setRows] = useState(null)
  const [edit, setEdit] = useState(null)
  const [error, setError] = useState('')
  const load = () => api.get('/v1/purchases/recurring-bills').then(r => setRows(r.data))
  useEffect(() => { load() }, [])

  async function generate(r, ev) {
    ev.stopPropagation()
    try { const res = await api.post(`/v1/purchases/recurring-bills/${r.id}/generate`); load(); navigate(`/purchases/bills/${res.data.id}`) } catch (e) { alert(errText(e)) }
  }
  async function save() {
    setError('')
    if (!edit.name?.trim() || !edit.vendor_id) { setError('Nom et fournisseur requis'); return }
    const body = { name: edit.name, vendor_id: edit.vendor_id, tax_mode: edit.tax_mode, frequency: edit.frequency, start_date: edit.start_date,
      end_date: edit.end_date || null, is_active: edit.is_active, notes: edit.notes || null, lines: linesPayload(edit.lines) }
    try {
      if (edit.id) await api.put(`/v1/purchases/recurring-bills/${edit.id}`, body)
      else await api.post('/v1/purchases/recurring-bills', body)
      setEdit(null); load()
    } catch (e) { setError(errText(e)) }
  }
  async function remove() {
    if (!confirm('Supprimer cette facture périodique ? Les factures déjà créées restent.')) return
    await api.delete(`/v1/purchases/recurring-bills/${edit.id}`)
    setEdit(null); load()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">Factures fournisseurs périodiques</h1><p className="page-sub">« Créer » ajoute la facture du prochain cycle (un cycle oublié n'est jamais perdu : on rattrape le plus ancien d'abord).</p></div>
        <button className="btn-primary" onClick={() => { setError(''); setEdit({ name: '', vendor_id: null, tax_mode: 'exclusive', frequency: 'mensuel', start_date: today(), end_date: '', is_active: true, notes: '', lines: [newLine()] }) }}>+ Nouvelle facture périodique</button>
      </div>
      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 920, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={headRow}>
              <th style={th}>Début</th><th style={th}>Fin</th><th style={th}>Nom</th><th style={th}>Fournisseur</th><th style={th}>Fréquence</th>
              <th style={th}>Dernière</th><th style={th}>Prochaine</th><th style={th}>Statut</th><th style={thR}>Montant</th><th style={th}></th>
            </tr></thead>
            <tbody>
              {rows === null && <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: C.muted }}>Chargement...</td></tr>}
              {(rows || []).map(r => {
                const [sl, sc] = recurringState(r)
                return (
                  <tr key={r.id} style={rowStyle} onClick={() => { setError(''); setEdit({ ...r, end_date: r.end_date || '', lines: r.lines.map(l => ({ ...l })) }) }}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtD(r.start_date)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{r.end_date ? fmtD(r.end_date) : 'Sans fin'}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{r.name}</td>
                    <td style={td}>{r.vendor_name}</td>
                    <td style={td}>{freqLabel(r.frequency)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtD(r.last_generated_date)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtD(r.next_date)}</td>
                    <td style={{ ...td, color: sc, fontWeight: 600, fontSize: 12 }}>{sl}</td>
                    <td style={{ ...tdR, fontWeight: 600 }}>{fmtMoney(r.total)}</td>
                    <td style={td}>{r.is_active && r.can_generate && <button className="btn-primary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={ev => generate(r, ev)}>Créer</button>}</td>
                  </tr>
                )
              })}
              {rows && !rows.length && <tr><td colSpan={10} style={{ ...td, textAlign: 'center', color: C.faint, padding: 24 }}>Aucune facture périodique.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {edit && (
        <Modal title={edit.id ? `Facture périodique — ${edit.name}` : 'Nouvelle facture périodique'} width={900} actions={<>
          {edit.id && <button className="btn-danger" style={{ marginRight: 'auto' }} onClick={remove}>Supprimer</button>}
          <button className="btn-secondary" onClick={() => setEdit(null)}>Annuler</button>
          <button className="btn-primary" onClick={save}>Enregistrer</button>
        </>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
            <Field label="Nom *"><input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field>
            <VendorPicker vendors={refs.vendors} value={edit.vendor_id} onCreated={refs.reload} required onChange={vid => setEdit({ ...edit, vendor_id: vid })} />
            <Field label="Fréquence"><Select value={edit.frequency} onChange={v => setEdit({ ...edit, frequency: v })} options={FREQS} /></Field>
            <Field label="Les prix sont"><Select value={edit.tax_mode} onChange={v => setEdit({ ...edit, tax_mode: v })} options={TAX_MODES} /></Field>
            <Field label="Date de début *"><input type="date" value={edit.start_date} onChange={e => setEdit({ ...edit, start_date: e.target.value })} /></Field>
            <Field label="Date de fin (optionnelle)"><input type="date" value={edit.end_date || ''} onChange={e => setEdit({ ...edit, end_date: e.target.value })} /></Field>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginTop: 22 }}>
              <input type="checkbox" checked={edit.is_active} onChange={e => setEdit({ ...edit, is_active: e.target.checked })} /> Active
            </label>
          </div>
          <LinesEditor lines={edit.lines} setLines={lines => setEdit({ ...edit, lines })} categories={refs.categories} mode={edit.tax_mode} />
          <TaxTotals t={linesTaxes(edit.lines, edit.tax_mode)} />
          {error && <div style={{ color: C.red, fontSize: 13 }}>{error}</div>}
        </Modal>
      )}
    </div>
  )
}
