import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import Autocomplete from './Autocomplete'
import { askConfirm } from './Dialog'

// Vendeurs (Employes -> Vendeurs, TASK-007.2, 2026-10-22) : chaque vendeur a son module de commission -- ses reglages,
// ses clients (champ « Vendeur » de la fiche client), ses commissions calculees quand le client paie, ses factures
// de commission et ce qui lui reste du. Le virement Interac s'associe dans Banque, comme pour tout fournisseur.
const C = { border: 'var(--c-border)', muted: 'var(--c-muted)', faint: 'var(--c-faint)', red: '#DC2626', green: '#059669' }
const money = n => new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(n || 0)
const card = { background: 'var(--c-surface)', border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }
const h3 = { fontSize: 14, fontWeight: 700, margin: '0 0 12px', color: 'var(--c-text)' }
const th = { padding: '8px 10px', textAlign: 'left', fontSize: 12, color: C.muted, fontWeight: 600, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }
const td = { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid var(--c-surface-3)', verticalAlign: 'top' }
const STATUS = { payee: 'Payée', partielle: 'Partielle', ouverte: 'À payer', en_retard: 'À payer', brouillon: 'Brouillon', annulee: 'Annulée' }

function usePhone() {
  const [phone, setPhone] = useState(() => window.matchMedia('(max-width: 900px)').matches)
  useEffect(() => {
    const m = window.matchMedia('(max-width: 900px)'); const f = e => setPhone(e.matches)
    m.addEventListener('change', f); return () => m.removeEventListener('change', f)
  }, [])
  return phone
}

export default function SalesRepsPanel() {
  const [data, setData] = useState(null)
  const [sel, setSel] = useState(null)
  const [adding, setAdding] = useState(false)
  async function load(keep) {
    const d = (await api.get('/v1/sales-reps')).data
    setData(d)
    setSel(s => keep || s || d.reps[0]?.id || null)
  }
  useEffect(() => { load() }, [])
  if (!data) return <div style={{ color: C.faint }}>Chargement…</div>
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 18 }}>
        <div className="filter-tabs" style={{ flexWrap: 'wrap', marginBottom: 0 }}>
          {data.reps.map(r => (
            <button key={r.id} className={`filter-tab${sel === r.id ? ' active' : ''}`} onClick={() => setSel(r.id)}>
              {r.name}{r.due > 0 ? ` · ${money(r.due)}` : ''}{r.is_active ? '' : ' (inactif)'}
            </button>
          ))}
        </div>
        <button className="btn-primary" onClick={() => setAdding(true)}>+ Ajouter un vendeur</button>
      </div>
      {data.reps.length === 0 && <div style={{ ...card, color: C.faint }}>Aucun vendeur.</div>}
      {sel && <RepView key={sel} id={sel} onChanged={() => load(sel)} />}
      {adding && <AddRep defaultRate={data.default_rate} onClose={() => setAdding(false)} onSaved={r => { setAdding(false); load(r.id); setSel(r.id) }} />}
    </div>
  )
}

function RepView({ id, onChanged }) {
  const phone = usePhone()
  const [rep, setRep] = useState(null)
  const [form, setForm] = useState(null)
  const [msg, setMsg] = useState(null)
  const [adjusting, setAdjusting] = useState(false)
  function take(d) {
    setRep(d)
    setForm({ rate: String(d.rate), before_taxes: d.before_taxes, recurring_only: d.recurring_only, start_date: d.start_date, is_active: d.is_active, notes: d.notes || '' })
  }
  useEffect(() => { api.get(`/v1/sales-reps/${id}`).then(r => take(r.data)) }, [id])
  if (!rep) return <div style={{ color: C.faint }}>Chargement…</div>
  async function save() {
    setMsg(null)
    try {
      const r = await api.put(`/v1/sales-reps/${id}`, { contact_id: rep.contact_id, vendor_id: rep.vendor_id, rate: parseFloat(form.rate),
        before_taxes: form.before_taxes, recurring_only: form.recurring_only, start_date: form.start_date, is_active: form.is_active, notes: form.notes || null })
      take(r.data); setMsg({ ok: true, t: 'Enregistré' }); onChanged()
    } catch (e) { setMsg({ ok: false, t: e.response?.data?.detail || 'Erreur' }) }
  }
  async function removeAdj(e) {
    if (!await askConfirm(`Retirer l'ajustement de ${money(e.amount)} (« ${e.note} ») ?`)) return
    try { await api.delete(`/v1/sales-reps/${id}/entries/${e.id}`); take((await api.get(`/v1/sales-reps/${id}`)).data); onChanged() }
    catch (err) { setMsg({ ok: false, t: err.response?.data?.detail || 'Erreur' }) }
  }
  const dirty = form && (form.rate !== String(rep.rate) || form.before_taxes !== rep.before_taxes || form.recurring_only !== rep.recurring_only
    || form.start_date !== rep.start_date || form.is_active !== rep.is_active || (form.notes || '') !== (rep.notes || ''))
  const field = { minWidth: 0, flex: '1 1 160px', marginBottom: 0 }

  return (
    <div>
      <div style={{ ...card, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{rep.name}</div>
          <div style={{ fontSize: 13, color: C.muted }}>Payé à : {rep.vendor_name}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: C.muted }}>Reste à lui payer</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: rep.due > 0 ? '#B45309' : C.green }}>{money(rep.due)}</div>
          <div style={{ fontSize: 12, color: C.faint }}>Le virement Interac s'associe dans Banque</div>
        </div>
      </div>

      <div style={card}>
        <h3 style={h3}>Réglages de commission</h3>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <div className="form-group" style={field}><label>Taux (%)</label>
            <input type="number" step="0.1" min="0" max="100" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} /></div>
          <div className="form-group" style={field}><label>Calculé sur</label>
            <select value={form.before_taxes ? 'avant' : 'apres'} onChange={e => setForm(f => ({ ...f, before_taxes: e.target.value === 'avant' }))}>
              <option value="avant">Le montant avant taxes</option><option value="apres">Le montant taxes incluses</option></select></div>
          <div className="form-group" style={field}><label>Factures</label>
            <select value={form.recurring_only ? 'per' : 'tout'} onChange={e => setForm(f => ({ ...f, recurring_only: e.target.value === 'per' }))}>
              <option value="per">Périodiques seulement</option><option value="tout">Toutes ses factures</option></select></div>
          <div className="form-group" style={field}><label>Factures émises à partir du</label>
            <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} /></div>
        </div>
        <div className="form-group" style={{ ...field, marginTop: 12 }}><label>Notes</label>
          <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} /> Actif</label>
          <button className="btn-primary" disabled={!dirty} onClick={save}>Enregistrer</button>
          {msg && <span style={{ fontSize: 13, color: msg.ok ? C.green : C.red }}>{msg.t}</span>}
        </div>
        <div style={{ fontSize: 12, color: C.faint, marginTop: 8 }}>Un nouveau taux s'applique aux prochains paiements ; les commissions déjà calculées gardent le leur.</div>
      </div>

      <div style={card}>
        <h3 style={h3}>Ses clients ({rep.clients.length})</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {rep.clients.map(c => <Link key={c.id} to={`/companies/${c.id}`} className="filter-tab" style={{ textDecoration: 'none' }}>{c.name}</Link>)}
          {rep.clients.length === 0 && <span style={{ color: C.faint, fontSize: 13 }}>Aucun client.</span>}
        </div>
        <div style={{ fontSize: 12, color: C.faint, marginTop: 8 }}>Pour lui ajouter un client : dans la fiche du client, choisis {rep.name} comme « Vendeur ».</div>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <h3 style={{ ...h3, margin: 0 }}>Commissions (gagné : {money(rep.earned)})</h3>
          <button className="btn-secondary" onClick={() => setAdjusting(true)}>Ajuster</button>
        </div>
        {rep.entries.length === 0 && <div style={{ color: C.faint, fontSize: 13 }}>Aucune commission encore : elles arrivent quand ses clients paient.</div>}
        {rep.entries.length > 0 && (phone
          ? rep.entries.map(e => (
            <div key={e.id} style={{ borderBottom: '1px solid var(--c-surface-3)', padding: '10px 0', fontSize: 13, opacity: e.kind === 'annulee' ? 0.5 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>{e.kind === 'ajustement' ? 'Ajustement' : e.client}</span>
                <span style={{ fontWeight: 700 }}>{money(e.amount)}</span>
              </div>
              <div style={{ color: C.muted, overflowWrap: 'anywhere' }}>{e.date} · {e.kind === 'ajustement' ? e.note : <>{e.invoice_id ? <Link to={`/invoices/${e.invoice_id}`}>{e.invoice}</Link> : e.invoice} — payé {money(e.paid_amount)}, {e.rate} % de {money(e.base)}</>}</div>
              <div style={{ color: C.faint, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {e.bill_id && <Link to={`/purchases/bills/${e.bill_id}`}>{e.bill_number}</Link>}
                {e.kind === 'annulee' && <span>Paiement retiré</span>}
                {e.kind === 'ajustement' && <button className="btn-secondary" style={{ fontSize: 12, padding: '2px 8px' }} onClick={() => removeAdj(e)}>Retirer</button>}
              </div>
            </div>))
          : <div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Payé le', 'Client', 'Facture', 'Payé', 'Base', 'Taux', 'Commission', 'Facture de commission', ''].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>{rep.entries.map(e => (
                <tr key={e.id} style={{ opacity: e.kind === 'annulee' ? 0.5 : 1 }}>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{e.date}</td>
                  {e.kind === 'ajustement'
                    ? <td style={td} colSpan={5}><b>Ajustement</b> — {e.note}</td>
                    : <>
                      <td style={td}>{e.company_id ? <Link to={`/companies/${e.company_id}`}>{e.client}</Link> : e.client}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{e.invoice_id ? <Link to={`/invoices/${e.invoice_id}`}>{e.invoice}</Link> : e.invoice}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{money(e.paid_amount)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{money(e.base)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{e.rate} %</td>
                    </>}
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{money(e.amount)}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{e.bill_id ? <Link to={`/purchases/bills/${e.bill_id}`}>{e.bill_number}</Link> : ''}{e.kind === 'annulee' ? ' (paiement retiré)' : ''}</td>
                  <td style={td}>{e.kind === 'ajustement' && <button className="btn-secondary" style={{ fontSize: 12, padding: '2px 8px' }} onClick={() => removeAdj(e)}>Retirer</button>}</td>
                </tr>))}</tbody>
            </table></div>)}
      </div>

      <div style={card}>
        <h3 style={h3}>Ses factures et paiements</h3>
        {rep.bills.length === 0 && <div style={{ color: C.faint, fontSize: 13 }}>Aucune facture.</div>}
        {rep.bills.slice(0, 24).map(b => (
          <div key={b.id} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline', padding: '7px 0', borderBottom: '1px solid var(--c-surface-3)', fontSize: 13 }}>
            <Link to={`/purchases/bills/${b.id}`} style={{ minWidth: 110 }}>{b.number || 'Facture'}</Link>
            <span style={{ color: C.muted, minWidth: 90 }}>{b.date}</span>
            <span style={{ flex: 1, minWidth: 0, color: C.faint }}>{b.auto ? 'Calculée par ERPCRM' : 'Ancienne facture'}</span>
            <span style={{ fontWeight: 600 }}>{money(b.total)}</span>
            <span style={{ color: b.balance > 0 ? '#B45309' : C.green, minWidth: 90, textAlign: 'right' }}>{b.balance > 0 ? `Reste ${money(b.balance)}` : STATUS[b.status] || b.status}</span>
          </div>))}
        {rep.payments.length > 0 && <>
          <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, margin: '16px 0 6px' }}>Paiements faits</div>
          {rep.payments.slice(0, 24).map(p => (
            <div key={p.id} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '5px 0', fontSize: 13, borderBottom: '1px solid var(--c-surface-3)' }}>
              <span style={{ minWidth: 90, color: C.muted }}>{p.date}</span>
              <span style={{ flex: 1, minWidth: 0, color: C.faint, overflowWrap: 'anywhere' }}>{p.method || ''}{p.reference ? ` · ${p.reference}` : ''}</span>
              <span style={{ fontWeight: 600 }}>{money(p.amount)}</span>
            </div>))}
        </>}
      </div>

      {adjusting && <AdjustModal rep={rep} onClose={() => setAdjusting(false)} onSaved={d => { setAdjusting(false); take(d); onChanged() }} />}
    </div>
  )
}

function AdjustModal({ rep, onClose, onSaved }) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10))
  const [error, setError] = useState(null)
  async function save() {
    setError(null)
    try { onSaved((await api.post(`/v1/sales-reps/${rep.id}/adjust`, { amount: parseFloat(amount), note, entry_date: day })).data) }
    catch (e) { setError(e.response?.data?.detail || 'Erreur') }
  }
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 440, width: '100%' }}>
        <h3 className="modal-title">Ajuster — {rep.name}</h3>
        <div className="form-group"><label>Montant ($) — négatif pour retirer</label>
          <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} autoFocus /></div>
        <div className="form-group"><label>Raison *</label><input value={note} onChange={e => setNote(e.target.value)} placeholder="ex. Commission oubliée sur…" /></div>
        <div className="form-group"><label>Date</label><input type="date" value={day} onChange={e => setDay(e.target.value)} /></div>
        {error && <div style={{ color: C.red, fontSize: 13 }}>{error}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" disabled={!parseFloat(amount) || !note.trim()} onClick={save}>Enregistrer</button>
        </div>
      </div>
    </div>
  )
}

function AddRep({ defaultRate, onClose, onSaved }) {
  const [contacts, setContacts] = useState([])
  const [vendors, setVendors] = useState([])
  const [contact, setContact] = useState(null)
  const [vendor, setVendor] = useState(null)
  const [rate, setRate] = useState(String(defaultRate))
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10))
  const [error, setError] = useState(null)
  useEffect(() => {
    api.get('/v1/contacts').then(r => setContacts(r.data.map(c => ({ id: c.id, label: `${c.first_name} ${c.last_name}`.trim(), sub: c.email || '' }))))
    api.get('/v1/purchases/vendors').then(r => setVendors(r.data.map(v => ({ id: v.id, label: v.name }))))
  }, [])
  async function save() {
    setError(null)
    try {
      onSaved((await api.post('/v1/sales-reps', { contact_id: contact.id, vendor_id: vendor.id, rate: parseFloat(rate), start_date: start,
        before_taxes: true, recurring_only: true })).data)
    } catch (e) { setError(e.response?.data?.detail || 'Erreur') }
  }
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 480, width: '100%' }}>
        <h3 className="modal-title">Ajouter un vendeur</h3>
        <Autocomplete label="Vendeur (contact)" items={contacts} value={contact} onSelect={setContact} placeholder="Rechercher un contact..." autoFocus />
        <Autocomplete label="Payé à (fournisseur)" items={vendors} value={vendor} onSelect={setVendor} placeholder="Rechercher un fournisseur..." openOnFocus />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '1 1 120px' }}><label>Taux (%)</label>
            <input type="number" step="0.1" value={rate} onChange={e => setRate(e.target.value)} /></div>
          <div className="form-group" style={{ flex: '1 1 160px' }}><label>Factures émises à partir du</label>
            <input type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
        </div>
        <div style={{ fontSize: 12, color: C.faint }}>Par défaut : avant taxes, factures périodiques seulement — modifiable ensuite.</div>
        {error && <div style={{ color: C.red, fontSize: 13, marginTop: 8 }}>{error}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" disabled={!contact || !vendor || !(parseFloat(rate) >= 0)} onClick={save}>Ajouter</button>
        </div>
      </div>
    </div>
  )
}
