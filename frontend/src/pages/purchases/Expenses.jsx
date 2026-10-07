import { useState, useEffect } from 'react'
import api from '../../services/api'
import AutoRecurringToggle from '../../components/AutoRecurringToggle'
import { ReceiptDrop, openReceipt, LINE_CLASSES } from './Receipts'
import {
  C, EMPTY, fmtMoney, fmtD, today, th, thR, td, tdR, headRow, rowStyle, Card, Modal, Field, Select, VendorPicker,
  CategorySelect, TaxTotals, Filters, TAX_CODES, TAX_MODES, FREQS, freqLabel, computeTaxes, useRefs, errText,
} from './common'

const PAID_THROUGH = ["Compte de l'entreprise", 'Carte de crédit', "Remboursement d'employé", 'Petite caisse']

// Champs communs a une depense et a une depense periodique
function ExpenseFields({ f, set, refs }) {
  const t = computeTaxes([[parseFloat(f.amount) || 0, f.tax_code]], f.tax_mode)
  return (
    <>
      <div className="form-grid">
        <VendorPicker vendors={refs.vendors} value={f.vendor_id} onCreated={refs.reload}
          onChange={id => {
            const v = refs.vendors.find(x => x.id === id)
            set({ ...f, vendor_id: id, category_id: f.category_id || v?.default_category_id || null })
          }} />
        <Field label="Compte de dépense"><CategorySelect categories={refs.categories} value={f.category_id} onChange={v => set({ ...f, category_id: v })} /></Field>
      </div>
      <Field label="Description"><input value={f.description || ''} onChange={e => set({ ...f, description: e.target.value })} /></Field>
      <div className="form-grid">
        <Field label="Montant *"><input type="number" step="0.01" value={f.amount} onChange={e => set({ ...f, amount: e.target.value })} /></Field>
        <Field label="Le montant est"><Select value={f.tax_mode} onChange={v => set({ ...f, tax_mode: v })} options={TAX_MODES} /></Field>
        <Field label="Taxes"><Select value={f.tax_code} onChange={v => set({ ...f, tax_code: v })} options={TAX_CODES} /></Field>
        <Field label="Payé par">
          <input list="paid-through" value={f.paid_through || ''} onChange={e => set({ ...f, paid_through: e.target.value })} />
          <datalist id="paid-through">{PAID_THROUGH.map(p => <option key={p} value={p} />)}</datalist>
        </Field>
      </div>
      <TaxTotals t={t} />
    </>
  )
}

const num = v => parseFloat(v)

export function PurchaseExpenses() {
  const refs = useRefs()
  const [rows, setRows] = useState(null)
  const [search, setSearch] = useState('')
  const [cat, setCat] = useState('')
  const [year, setYear] = useState('')
  const [edit, setEdit] = useState(null)
  const [error, setError] = useState('')
  const load = () => api.get('/v1/purchases/expenses').then(r => setRows(r.data))
  useEffect(() => { load() }, [])

  const years = [...new Set((rows || []).map(e => e.expense_date.slice(0, 4)))].sort().reverse()
  const q = search.trim().toLowerCase()
  const shown = (rows || [])
    .filter(e => !cat || e.category_id === cat)
    .filter(e => !year || e.expense_date.startsWith(year))
    .filter(e => !q || [e.vendor_name, e.category_name, e.description, e.reference, e.paid_through, String(e.total)].some(x => (x || '').toLowerCase().includes(q)))
  const total = shown.reduce((s, e) => s + e.total, 0)

  function open(e) {
    setError('')
    setEdit(e ? { ...e } : { expense_date: today(), vendor_id: null, category_id: null, description: '', tax_mode: 'exclusive', tax_code: 'tps_tvq', amount: '', paid_through: "Compte de l'entreprise", reference: '', notes: '' })
  }
  async function save() {
    setError('')
    const body = { expense_date: edit.expense_date, vendor_id: edit.vendor_id, category_id: edit.category_id, description: edit.description || null,
      tax_mode: edit.tax_mode, tax_code: edit.tax_code, amount: num(edit.amount), paid_through: edit.paid_through || null,
      bank_account_id: edit.bank_account_id || null, reference: edit.reference || null, notes: edit.notes || null,
      lines: edit.lines?.length ? edit.lines.map(l => ({ line_class: l.line_class, description: l.description || null, amount: num(l.amount), tax_code: l.tax_code, category_id: l.category_id || null })) : null }
    if (!body.amount && !body.lines) { setError('Montant requis'); return }
    try {
      if (edit.id) await api.put(`/v1/purchases/expenses/${edit.id}`, body)
      else await api.post('/v1/purchases/expenses', body)
      setEdit(null); load()
    } catch (e) { setError(errText(e)) }
  }
  async function remove() {
    if (!confirm('Supprimer cette dépense ?')) return
    await api.delete(`/v1/purchases/expenses/${edit.id}`)
    setEdit(null); load()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">Dépenses</h1><p className="page-sub">{shown.length} dépense{shown.length > 1 ? 's' : ''} · {fmtMoney(total)}</p></div>
        <button className="btn-primary" onClick={() => open(null)}>+ Nouvelle dépense</button>
      </div>
      <ReceiptDrop onExpenseCreated={load} />
      <div className="page-toolbar" style={{ gap: 10, flexWrap: 'wrap' }}>
        <input className="search-input" placeholder="Rechercher (fournisseur, description, montant)..." value={search} onChange={e => setSearch(e.target.value)} />
        <select value={cat} onChange={e => setCat(e.target.value)} style={{ maxWidth: 260 }}>
          <option value="">Tous les comptes de dépense</option>
          {refs.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={year} onChange={e => setYear(e.target.value)}>
          <option value="">Toutes les années</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={headRow}>
              <th style={th}>Date</th><th style={th}>Compte de dépense</th><th style={th}>Fournisseur</th><th style={th}>Description</th>
              <th style={th}>Payé par</th><th style={thR}>Montant</th>
            </tr></thead>
            <tbody>
              {rows === null && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: C.muted }}>Chargement...</td></tr>}
              {shown.slice(0, 500).map(e => (
                <tr key={e.id} style={rowStyle} onClick={() => open(e)}>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtD(e.expense_date)}</td>
                  <td style={td}>{e.category_name || EMPTY}</td>
                  <td style={td}>{e.vendor_name || EMPTY}</td>
                  <td style={{ ...td, color: C.muted, maxWidth: 280 }}>{e.receipt_id ? '📎 ' : ''}{e.description || EMPTY}{e.recurring_id ? ' ↺' : ''}{e.lines?.length > 1 ? ` (${e.lines.length} lignes)` : ''}</td>
                  <td style={{ ...td, fontSize: 12, color: C.muted }}>{e.paid_through || EMPTY}</td>
                  <td style={{ ...tdR, fontWeight: 600 }}>{fmtMoney(e.total)}</td>
                </tr>
              ))}
              {rows && !shown.length && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: C.faint, padding: 24 }}>Aucune dépense.</td></tr>}
            </tbody>
          </table>
          {shown.length > 500 && <div style={{ fontSize: 12, color: C.muted, padding: 8 }}>500 premières affichées — filtrez par année ou recherchez.</div>}
        </div>
      </Card>

      {edit && (
        <Modal title={edit.id ? 'Dépense' : 'Nouvelle dépense'} width={640} actions={<>
          {edit.id && <button className="btn-danger" style={{ marginRight: 'auto' }} onClick={remove}>Supprimer</button>}
          <button className="btn-secondary" onClick={() => setEdit(null)}>Annuler</button>
          <button className="btn-primary" onClick={save}>Enregistrer</button>
        </>}>
          <div className="form-grid">
            <Field label="Date *"><input type="date" value={edit.expense_date} onChange={e => setEdit({ ...edit, expense_date: e.target.value })} /></Field>
            <Field label="Référence"><input value={edit.reference || ''} onChange={e => setEdit({ ...edit, reference: e.target.value })} /></Field>
          </div>
          {edit.lines?.length ? <ExpenseLinesFields f={edit} set={setEdit} refs={refs} /> : <ExpenseFields f={edit} set={setEdit} refs={refs} />}
          {edit.receipt_id && <button type="button" className="btn-secondary" style={{ alignSelf: 'flex-start', fontSize: 12 }} onClick={() => openReceipt(edit.receipt_id)}>📎 Voir le reçu</button>}
          <Field label="Notes"><textarea rows={2} value={edit.notes || ''} onChange={e => setEdit({ ...edit, notes: e.target.value })} /></Field>
          {error && <div style={{ color: C.red, fontSize: 13 }}>{error}</div>}
        </Modal>
      )}
    </div>
  )
}

// Depense a plusieurs lignes (6 classes, nom de l'article en note) -- creee depuis un recu, modifiable
function ExpenseLinesFields({ f, set, refs }) {
  const setLine = (i, k, v) => set({ ...f, lines: f.lines.map((l, j) => j === i ? { ...l, [k]: v } : l) })
  return (
    <>
      <div className="form-grid">
        <VendorPicker vendors={refs.vendors} value={f.vendor_id} onCreated={refs.reload} onChange={id => set({ ...f, vendor_id: id })} />
        <Field label="Compte de dépense"><CategorySelect categories={refs.categories} value={f.category_id} onChange={v => set({ ...f, category_id: v })} /></Field>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={headRow}><th style={th}>Classe</th><th style={th}>Article (note)</th><th style={thR}>Montant</th><th style={th}>Taxes</th></tr></thead>
        <tbody>
          {f.lines.map((l, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={td}><select value={l.line_class} onChange={e => setLine(i, 'line_class', e.target.value)}>{LINE_CLASSES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></td>
              <td style={td}><input value={l.description || ''} style={{ width: '100%' }} onChange={e => setLine(i, 'description', e.target.value)} /></td>
              <td style={tdR}><input type="number" step="0.01" value={l.amount} style={{ width: 90, textAlign: 'right' }} onChange={e => setLine(i, 'amount', e.target.value)} /></td>
              <td style={td}><Select value={l.tax_code} onChange={v => setLine(i, 'tax_code', v)} options={TAX_CODES} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 13, textAlign: 'right' }}>Sous-total {fmtMoney(f.subtotal)} · TPS {fmtMoney(f.tps_amount)} · TVQ {fmtMoney(f.tvq_amount)} · <strong>Total {fmtMoney(f.total)}</strong>
        <div style={{ fontSize: 11, color: C.muted }}>Taxes lues sur le reçu ; recalculées seulement si vous changez un montant ou une taxe.</div></div>
    </>
  )
}

export function recurringState(r) {
  if (!r.is_active) return ['Inactive', C.faint]
  if (r.end_date && r.current_cycle_start > r.end_date) return ['Terminée', C.faint]
  return r.can_generate ? ['À enregistrer', '#D97706'] : ['Active', C.green]
}

export function PurchaseRecurringExpenses() {
  const refs = useRefs()
  const [rows, setRows] = useState(null)
  const [edit, setEdit] = useState(null)
  const [error, setError] = useState('')
  const load = () => api.get('/v1/purchases/recurring-expenses').then(r => setRows(r.data))
  useEffect(() => { load() }, [])

  async function generate(r, ev) {
    ev.stopPropagation()
    try { await api.post(`/v1/purchases/recurring-expenses/${r.id}/generate`); load() } catch (e) { alert(errText(e)) }
  }
  async function save() {
    setError('')
    const body = { name: edit.name, vendor_id: edit.vendor_id, category_id: edit.category_id, description: edit.description || null,
      tax_mode: edit.tax_mode, tax_code: edit.tax_code, amount: num(edit.amount), paid_through: edit.paid_through || null,
      frequency: edit.frequency, start_date: edit.start_date, end_date: edit.end_date || null, is_active: edit.is_active }
    if (!body.name?.trim() || !body.amount) { setError('Nom et montant requis'); return }
    try {
      if (edit.id) await api.put(`/v1/purchases/recurring-expenses/${edit.id}`, body)
      else await api.post('/v1/purchases/recurring-expenses', body)
      setEdit(null); load()
    } catch (e) { setError(errText(e)) }
  }
  async function remove() {
    if (!confirm('Supprimer cette dépense périodique ? Les dépenses déjà enregistrées restent.')) return
    await api.delete(`/v1/purchases/recurring-expenses/${edit.id}`)
    setEdit(null); load()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">Dépenses périodiques</h1><p className="page-sub">Une dépense qui revient (abonnement, assurance…) : « Enregistrer » crée la dépense du prochain cycle.</p></div>
        <button className="btn-primary" onClick={() => { setError(''); setEdit({ name: '', vendor_id: null, category_id: null, description: '', tax_mode: 'exclusive', tax_code: 'tps_tvq', amount: '', paid_through: "Compte de l'entreprise", frequency: 'mensuel', start_date: today(), end_date: '', is_active: true }) }}>+ Nouvelle dépense périodique</button>
      </div>
      <AutoRecurringToggle settingKey="recurring_auto_purchases" onText="Chaque cycle dû est créé tout seul (vérifié toutes les 30 minutes), le plus ancien d'abord." offText="Cliquez « Créer » / « Enregistrer » pour chaque cycle." />
      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 880, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={headRow}>
              <th style={th}>Début</th><th style={th}>Fin</th><th style={th}>Nom</th><th style={th}>Fournisseur</th><th style={th}>Fréquence</th>
              <th style={th}>Prochaine</th><th style={th}>Statut</th><th style={thR}>Montant</th><th style={th}></th>
            </tr></thead>
            <tbody>
              {rows === null && <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: C.muted }}>Chargement...</td></tr>}
              {(rows || []).map(r => {
                const [sl, sc] = recurringState(r)
                return (
                  <tr key={r.id} style={rowStyle} onClick={() => { setError(''); setEdit({ ...r, end_date: r.end_date || '' }) }}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtD(r.start_date)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{r.end_date ? fmtD(r.end_date) : 'Sans fin'}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{r.name}</td>
                    <td style={td}>{r.vendor_name || EMPTY}</td>
                    <td style={td}>{freqLabel(r.frequency)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtD(r.next_date)}</td>
                    <td style={{ ...td, color: sc, fontWeight: 600, fontSize: 12 }}>{sl}</td>
                    <td style={{ ...tdR, fontWeight: 600 }}>{fmtMoney(r.total)}</td>
                    <td style={td}>{r.is_active && r.can_generate && <button className="btn-primary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={ev => generate(r, ev)}>Enregistrer</button>}</td>
                  </tr>
                )
              })}
              {rows && !rows.length && <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: C.faint, padding: 24 }}>Aucune dépense périodique.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {edit && (
        <Modal title={edit.id ? `Dépense périodique — ${edit.name}` : 'Nouvelle dépense périodique'} width={640} actions={<>
          {edit.id && <button className="btn-danger" style={{ marginRight: 'auto' }} onClick={remove}>Supprimer</button>}
          <button className="btn-secondary" onClick={() => setEdit(null)}>Annuler</button>
          <button className="btn-primary" onClick={save}>Enregistrer</button>
        </>}>
          <Field label="Nom *"><input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field>
          <div className="form-grid">
            <Field label="Date de début *"><input type="date" value={edit.start_date} onChange={e => setEdit({ ...edit, start_date: e.target.value })} /></Field>
            <Field label="Date de fin (optionnelle)"><input type="date" value={edit.end_date || ''} onChange={e => setEdit({ ...edit, end_date: e.target.value })} /></Field>
            <Field label="Fréquence"><Select value={edit.frequency} onChange={v => setEdit({ ...edit, frequency: v })} options={FREQS} /></Field>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginTop: 22 }}>
              <input type="checkbox" checked={edit.is_active} onChange={e => setEdit({ ...edit, is_active: e.target.checked })} /> Active
            </label>
          </div>
          <ExpenseFields f={edit} set={setEdit} refs={refs} />
          {error && <div style={{ color: C.red, fontSize: 13 }}>{error}</div>}
        </Modal>
      )}
    </div>
  )
}
