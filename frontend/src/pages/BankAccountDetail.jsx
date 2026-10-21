import { useState, useEffect, useRef } from 'react'
import EntityLink, { InvoiceLinks } from '../components/EntityLink'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../services/api'
import Autocomplete from '../components/Autocomplete'
import PaymentModal from '../components/PaymentModal'
import { useRefs, VendorPicker, CategorySelect, AllocationTable, allocList, allocSum, computeTaxes, TAX_CODES, TAX_MODES } from './purchases/common'
import { LINE_CLASSES } from './purchases/Receipts'
import { IconBank, IconCalendar, IconSearch, IconSettings } from '../components/Icons'
import {
  ACCOUNT_TYPES, C, EMPTY, fmtDate, fmtMoney,
  Dropdown, MenuItem, Indicator, BankChart, AccountModal, StatementsModal,
} from './Bank'
import { askConfirm, askChoice } from '../components/Dialog'

// Fiche d'un compte de l'onglet Banque (TASK-042) -- interface et options.
// Aucune source de transactions n'est branchee : tableaux et montants vides.

const TABS = ['dashboard', 'unclassified', 'all']

const ALL_FILTERS = [
  { value: 'all',         label: 'Transactions classées' },
  { value: 'deposits',    label: 'Dépôts' },
  { value: 'withdrawals', label: 'Retraits' },
  { value: 'matched',     label: 'Mises en correspondance' },
  { value: 'classified',  label: 'Classées' },
  { value: 'manual',      label: 'Ajoutées manuellement' },
]

const PER_PAGE = [25, 50, 100, 200]   // 25 par défaut : on n'affiche (et ne calcule) que ce qu'on voit (2026-10-21)

const th = { padding: '10px 8px', fontWeight: 600, whiteSpace: 'nowrap' }

function InfoBox({ icon, title, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted }}>{icon}</div>
      <div>
        <div style={{ fontSize: 12, color: C.muted }}>{title}</div>
        <div style={{ fontSize: 17, fontWeight: 600 }}>{value}</div>
      </div>
    </div>
  )
}

function Tab({ active, title, sub, onClick, children }) {
  return (
    <div onClick={onClick} style={{ cursor: 'pointer', padding: '10px 16px 12px', borderBottom: `2px solid ${active ? C.link : 'transparent'}`, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', flexShrink: 0 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: active ? 600 : 500, color: active ? 'var(--c-text)' : C.muted }}>{title}</div>
        <div style={{ fontSize: 12, color: C.faint }}>{sub}</div>
      </div>
      {children}
    </div>
  )
}

function Pagination({ perPage, setPerPage, page = 0, setPage, total = 0 }) {
  const first = total ? page * perPage + 1 : 0
  const last = Math.min(total, (page + 1) * perPage)
  const navBtn = enabled => ({ background: 'none', border: 'none', color: enabled ? C.link : C.faint, cursor: enabled ? 'pointer' : 'default', fontSize: 16 })
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 12, fontSize: 13, color: C.muted }}>
      <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage?.(0) }} style={{ fontSize: 13, padding: '4px 6px', border: `1px solid ${C.border}`, borderRadius: 6 }}>
        {PER_PAGE.map(n => <option key={n} value={n}>{n} par page</option>)}
      </select>
      <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} style={navBtn(page > 0)}>‹</button>
      <span>{first} - {last}</span>
      <button type="button" disabled={last >= total} onClick={() => setPage(page + 1)} style={navBtn(last < total)}>›</button>
    </div>
  )
}

function SearchHeader({ open, setOpen, value, setValue }) {
  return (
    <th style={{ ...th, width: 40, textAlign: 'right' }}>
      {open && <input autoFocus className="search-input" placeholder="Rechercher..." value={value} onChange={e => setValue(e.target.value)} style={{ textTransform: 'none', fontSize: 13, width: 180, marginRight: 6 }} />}
      <button type="button" title="Rechercher" onClick={() => { setOpen(o => !o); setValue('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: 0, verticalAlign: 'middle' }}>
        <IconSearch width={16} height={16} />
      </button>
    </th>
  )
}

function EmptyRow({ colSpan, children }) {
  return <tr><td colSpan={colSpan} style={{ textAlign: 'center', color: C.faint, padding: 32 }}>{children}</td></tr>
}

function Switch({ checked, onChange, label }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.muted, cursor: 'pointer', fontStyle: 'italic' }}>
      {label}
      <span onClick={() => onChange(!checked)} style={{ width: 32, height: 18, borderRadius: 9, background: checked ? C.link : 'var(--c-border-strong)', position: 'relative', transition: 'background .15s' }}>
        <span style={{ position: 'absolute', top: 2, left: checked ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: 'var(--c-surface)', transition: 'left .15s' }} />
      </span>
    </label>
  )
}

const STATUS_INV = {
  envoyee: 'Envoyée', en_retard: 'En retard', partiellement_payee: 'Partielle', payee: 'Payée',
}
const fmtD = d => d ? fmtDate(d + 'T00:00:00') : EMPTY
const SOURCE_LABEL = { zoho_import: 'Paiement antérieur', portal: 'Déclaré au portail', manual: 'Encaissement manuel', bank_import: 'Banque' }

function useCompanies() {
  const [companies, setCompanies] = useState([])
  useEffect(() => { api.get('/v1/companies').then(r => setCompanies(r.data.map(c => ({ id: c.id, label: c.name })))) }, [])
  return companies
}

function errText(e) {
  const d = e.response?.data?.detail
  return Array.isArray(d) ? d.map(x => x.msg).join(' ; ') : (d || 'Erreur')
}

// Mode 3 : attribuer le beneficiaire (et les prochaines lignes du meme beneficiaire) a une compagnie
function PayeeModal({ tx, onClose, onDone }) {
  const companies = useCompanies()
  const [company, setCompany] = useState(tx.company_id ? { id: tx.company_id, label: tx.company_name } : null)
  const [remember, setRemember] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  async function save() {
    setSaving(true); setError(null)
    try {
      await api.put(`/v1/bank/transactions/${tx.id}/company`, { company_id: company?.id || null, remember })
      await onDone()
    } catch (e) { setError(errText(e)) } finally { setSaving(false) }
  }
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 460 }}>
        <h3 className="modal-title">Bénéficiaire « {tx.payee} »</h3>
        <Autocomplete label="Compagnie" items={companies} value={company} onSelect={setCompany} openOnFocus autoFocus placeholder="Rechercher une compagnie..." />
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
          Retenir : les autres lignes et les prochains relevés de ce bénéficiaire seront reconnus pour cette compagnie
        </label>
        {error && <div style={{ color: C.red, fontSize: 13 }}>{error}</div>}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? '...' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}

// Modes 1 et 2 : associer un depot a un paiement existant ou a des factures
// Fenetre seule, ou contenu integre a la fiche d'une transaction (embedded)
function Wrap({ embedded, width, children }) {
  if (embedded) return <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width, maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto' }}>{children}</div>
    </div>
  )
}

function MatchModal({ tx, onClose, onDone, embedded }) {
  const companies = useCompanies()
  const [sugg, setSugg] = useState(null)
  const [methods, setMethods] = useState([])
  const [method, setMethod] = useState('')
  const [company, setCompany] = useState(tx.company_id ? { id: tx.company_id, label: tx.company_name } : null)
  const [invoices, setInvoices] = useState([])
  const [alloc, setAlloc] = useState({})          // invoice_id -> montant (texte)
  const [remember, setRemember] = useState(true)
  const [showPaid, setShowPaid] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [lostNum, setLostNum] = useState('')      // TASK-005.24 : numero de la facture perdue (facultatif)

  useEffect(() => {
    api.get(`/v1/bank/transactions/${tx.id}/suggestions`).then(r => { setSugg(r.data); setMethod(r.data.method_code) })
    api.get('/v1/payments/methods').then(r => setMethods(r.data.filter(m => m.is_active && m.code !== 'troc')))   // un troc n'entre pas a la banque
  }, [tx.id])
  useEffect(() => {
    setAlloc({})
    if (!company) { setInvoices([]); return }
    api.get(`/v1/bank/companies/${company.id}/invoices`).then(r => setInvoices(r.data))
  }, [company?.id])

  const allocated = Object.values(alloc).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const remaining = Math.round((tx.amount - allocated) * 100) / 100

  function toggleInvoice(inv) {
    setAlloc(a => {
      const n = { ...a }
      if (n[inv.id] !== undefined) { delete n[inv.id]; return n }
      const left = Math.round((tx.amount - Object.values(n).reduce((s, v) => s + (parseFloat(v) || 0), 0)) * 100) / 100
      n[inv.id] = String(Math.max(0, Math.min(inv.balance, left)).toFixed(2))
      return n
    })
  }

  function pickInvoices(list) {
    const c = { id: list[0].company_id, label: list[0].company_name }
    setCompany(c)
    // les factures de la compagnie se chargent, puis on coche celles proposees
    api.get(`/v1/bank/companies/${c.id}/invoices`).then(r => {
      setInvoices(r.data)
      const n = {}; let left = tx.amount
      list.forEach(i => { const v = Math.min(i.balance, left); n[i.id] = v.toFixed(2); left -= v })
      setAlloc(n)
    })
  }

  // Regle de Philippe : le depot paie les plus vieilles factures ouvertes du client, dans l'ordre
  // (la derniere peut etre payee en partie). 2026-10-08 : d'abord les factures qui n'ont encore rien recu, puis
  // les plus vieux restes des factures deja payees en partie (« sa facture et 3 retards »), troc compris ; un depot
  // egal au reste d'une seule facture va sur ce reste. Meme ordre que l'association automatique (bank_matching.best_exact) :
  // les plus vieilles factures qui n'ont rien recu au complet, puis les restes, puis une partie de la facture suivante ;
  // ce qui depasse tout ce que le client doit reste en credit dans son dossier.
  function oldestFirst() {
    const cents = v => Math.round(v * 100)
    const byDate = (a, b) => a.issue_date.localeCompare(b.issue_date) || a.number.localeCompare(b.number)
    const fresh = invoices.filter(i => i.balance > 0 && !(i.paid > 0)).sort(byDate)
    const rests = invoices.filter(i => i.balance > 0 && i.paid > 0).sort(byDate)
    const exact = rests.filter(i => cents(i.balance) === cents(tx.amount))
    if (exact.length === 1 && !fresh.some(i => cents(i.balance) === cents(tx.amount))) { setAlloc({ [exact[0].id]: exact[0].balance.toFixed(2) }); return }
    const n = {}; let left = tx.amount
    const take = (i, v) => { n[i.id] = v.toFixed(2); left = Math.round((left - v) * 100) / 100 }
    const full = []
    for (const i of fresh) { if (cents(i.balance) > cents(left)) break; full.push(i) }
    if (!full.length && fresh.length) { take(fresh[0], left); setAlloc(n); return }   // ne couvre aucune facture au complet
    full.forEach(i => take(i, i.balance))
    rests.forEach(i => { if (left > 0.004) take(i, Math.min(i.balance, left)) })
    const next = fresh[full.length]
    if (left > 0.004 && next) take(next, Math.min(next.balance, left))
    setAlloc(n)
  }

  async function submit(body) {
    setSaving(true); setError(null)
    try {
      await api.post(`/v1/bank/transactions/${tx.id}/match`, { remember_payee: remember, ...body })
      await onDone()
    } catch (e) { setError(errText(e)) } finally { setSaving(false) }
  }

  // TASK-005.24 : le depot paie une facture de l'ancien logiciel dont le document est perdu (pas de credit)
  async function submitLost() {
    setSaving(true); setError(null)
    try {
      await api.post(`/v1/bank/transactions/${tx.id}/lost-invoice`, { company_id: company.id, invoice_number: lostNum.trim() || null })
      await onDone()
    } catch (e) { setError(errText(e)) } finally { setSaving(false) }
  }

  const shown = invoices.filter(i => showPaid || i.balance > 0)
  const box = { border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }

  return (
    <Wrap embedded={embedded} width={760}>
        {!embedded && <h3 className="modal-title">Associer le dépôt de {fmtMoney(tx.amount)} du {fmtD(tx.posted_date)}</h3>}
        {!embedded && <div style={{ fontSize: 13, color: C.muted }}>{tx.description}{tx.payee ? ` — ${tx.payee}` : ''}{tx.reference ? ` · Réf. ${tx.reference}` : ''}</div>}

        {/* Mode 1 : suggestions */}
        <div style={{ fontWeight: 600, fontSize: 14 }}>Suggestions</div>
        {!sugg && <div style={{ fontSize: 13, color: C.muted }}>Recherche...</div>}
        {sugg && !sugg.payments.length && !sugg.invoices.length && !sugg.combos.length && (
          <div style={{ fontSize: 13, color: C.faint }}>Aucune suggestion — choisissez une compagnie ci-dessous.</div>
        )}
        {sugg?.payments.map(p => (
          <div key={p.id} style={{ ...box, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 13 }}>
              <strong>Paiement déjà enregistré</strong> · {p.company_name} · {fmtMoney(p.amount)} · {SOURCE_LABEL[p.source] || p.source}{p.reference ? ` ${p.reference}` : ''}
              <div style={{ color: C.muted, fontSize: 12 }}>{p.status === 'pending' ? 'En attente de confirmation' : `Reçu le ${fmtD(p.received_at)}`} · Factures {p.invoice_numbers.join(', ') || EMPTY}{p.pct ? <strong style={{ color: C.text || 'var(--c-text)' }}> · pertinence {p.pct} %</strong> : null}</div>
            </div>
            <button className="btn-primary" disabled={saving} onClick={() => submit({ client_payment_id: p.id })}>{p.status === 'pending' ? 'Confirmer et lier' : 'Lier'}</button>
          </div>
        ))}
        {sugg?.invoices.map(i => (
          <div key={i.id} style={{ ...box, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 13 }}>
              <strong>{i.number}</strong> · {i.company_name}{i.site_label ? ` (${i.site_label})` : ''} · solde {fmtMoney(i.balance)} {i.exact && <span style={{ color: C.green, fontWeight: 600 }}>· montant exact</span>}
              <div style={{ color: C.muted, fontSize: 12 }}>Émise le {fmtD(i.issue_date)} · {STATUS_INV[i.status] || i.status}{i.pct ? <strong style={{ color: 'var(--c-text)' }}> · pertinence {i.pct} %</strong> : null}</div>
            </div>
            <button className="btn-secondary" onClick={() => pickInvoices([i])}>Choisir</button>
          </div>
        ))}
        {sugg?.combos.map((c, k) => (
          <div key={k} style={{ ...box, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 13 }}><strong>{c.length} factures</strong> · {c[0].company_name} · {c.map(i => `${i.number} (${fmtMoney(i.balance)})`).join(' + ')}</div>
            <button className="btn-secondary" onClick={() => pickInvoices(c)}>Choisir</button>
          </div>
        ))}

        {/* Mode 2 : compagnie puis factures */}
        <div style={{ fontWeight: 600, fontSize: 14, marginTop: 6 }}>Ou choisir la compagnie</div>
        <Autocomplete items={companies} value={company} onSelect={setCompany} openOnFocus placeholder="Rechercher une compagnie..." />
        {company && (
          <div style={box}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <label style={{ fontSize: 12, color: C.muted, display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={showPaid} onChange={e => setShowPaid(e.target.checked)} /> Afficher aussi les factures payées
              </label>
              <button type="button" className="btn-secondary" style={{ fontSize: 12, padding: '3px 10px' }} disabled={!invoices.some(i => i.balance > 0)} onClick={oldestFirst}>Appliquer aux plus vieilles factures d'abord</button>
            </div>
            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <tbody>
                  {shown.map(i => (
                    <tr key={i.id} style={{ borderTop: `1px solid ${C.border}`, color: i.balance > 0 ? undefined : C.faint }}>
                      <td style={{ padding: 4, width: 24 }}><input type="checkbox" disabled={i.balance <= 0} checked={alloc[i.id] !== undefined} onChange={() => toggleInvoice(i)} /></td>
                      <td style={{ padding: 4, whiteSpace: 'nowrap' }}>{i.number}</td>
                      <td style={{ padding: 4, whiteSpace: 'nowrap' }}>{fmtD(i.issue_date)}</td>
                      <td style={{ padding: 4 }}>{STATUS_INV[i.status] || i.status}{i.site_label ? ` · ${i.site_label}` : ''}</td>
                      <td style={{ padding: 4, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtMoney(i.total)}</td>
                      <td style={{ padding: 4, textAlign: 'right', whiteSpace: 'nowrap' }}>solde {fmtMoney(i.balance)}</td>
                      <td style={{ padding: 4, width: 100 }}>
                        {alloc[i.id] !== undefined && <input type="number" step="0.01" value={alloc[i.id]} onChange={e => setAlloc(a => ({ ...a, [i.id]: e.target.value }))} style={{ width: 90, textAlign: 'right' }} />}
                      </td>
                    </tr>
                  ))}
                  {shown.length === 0 && <tr><td colSpan={7} style={{ padding: 10, color: C.faint, textAlign: 'center' }}>Aucune facture {showPaid ? '' : 'avec un solde '}pour cette compagnie</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 8 }}>
              <span>Réparti : <strong>{fmtMoney(allocated)}</strong> sur {fmtMoney(tx.amount)}</span>
              <span style={{ color: remaining < 0 ? C.red : remaining > 0 ? '#D97706' : C.green }}>
                {remaining < 0 ? 'Dépasse le dépôt' : remaining > 0 ? `Reste ${fmtMoney(remaining)} non réparti (crédit du client)` : 'Montant exact'}
              </span>
            </div>
          </div>
        )}

        {company && allocated === 0 && (
          <div style={{ ...box, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, flex: '1 1 300px' }}>
              <strong>Facture perdue (ancien logiciel)</strong>
              <div style={{ color: C.muted, fontSize: 12 }}>Le dépôt paie une facture dont le document n'a pas été conservé : le client le voit au portail, rien en crédit, aucun effet sur les taxes.</div>
            </div>
            <input placeholder="N° de facture (si connu)" value={lostNum} onChange={e => setLostNum(e.target.value)} style={{ width: 170 }} />
            <button className="btn-secondary" disabled={saving} onClick={submitLost}>Facture perdue</button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
          <label>Mode de paiement{' '}
            <select value={method} onChange={e => setMethod(e.target.value)}>{methods.map(m => <option key={m.code} value={m.code}>{m.name}</option>)}</select>
          </label>
          {tx.payee && (
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
              Retenir « {tx.payee} » pour cette compagnie
            </label>
          )}
        </div>
        {error && <div style={{ color: C.red, fontSize: 13 }}>{error}</div>}
        <div className="modal-actions">
          {!embedded && <button className="btn-secondary" onClick={onClose}>Annuler</button>}
          <button className="btn-primary" disabled={saving || !company || remaining < 0}
            onClick={() => submit({ method_code: method, company_id: company.id, allocations: Object.entries(alloc).map(([invoice_id, v]) => ({ invoice_id, amount: parseFloat(v) || 0 })).filter(a => a.amount > 0) })}>
            {saving ? '...' : allocated > 0 ? 'Associer' : 'Mettre en crédit du client'}
          </button>
        </div>
    </Wrap>
  )
}

// Depot d'un releve dans la page (TASK-042.2) : apercu (nouvelles lignes, doublons exacts et probables),
// puis import ; le serveur associe ce qui est sur et confie le reste a l'IA locale (propositions seulement).
function DropImport({ accountId, onImported }) {
  const [over, setOver] = useState(false)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [includeProbable, setIncludeProbable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const inputRef = useRef()

  async function send(f, dryRun, incl = includeProbable) {
    const fd = new FormData()
    fd.append('file', f); fd.append('dry_run', dryRun ? 'true' : 'false'); fd.append('include_probable', incl ? 'true' : 'false')
    return (await api.post(`/v1/bank/accounts/${accountId}/statements`, fd)).data
  }
  async function pick(f) {
    if (!f) return
    setError(''); setResult(null); setPreview(null); setFile(f); setBusy(true)
    try { setPreview(await send(f, true)) } catch (e) { setError(errText(e)); setFile(null) }
    setBusy(false)
  }
  async function doImport() {
    setBusy(true); setError('')
    try { setResult(await send(file, false)); setPreview(null); setFile(null); await onImported() } catch (e) { setError(errText(e)) }
    setBusy(false)
  }
  const n = (v, one, many) => `${v} ${v > 1 ? many : one}`
  return (
    <div style={{ marginBottom: 14 }}>
      {!preview && (
        <div onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]) }}
          onClick={() => inputRef.current?.click()}
          style={{ border: `2px dashed ${over ? C.link : C.border}`, background: over ? 'var(--c-tint-blue)' : 'var(--c-surface-2)', borderRadius: 10,
            padding: '14px 16px', textAlign: 'center', cursor: 'pointer', fontSize: 13, color: C.muted }}>
          {busy ? 'Lecture du fichier…' : <>Glissez votre relevé ici (OFX, QFX, QBO ou CSV) ou <span style={{ color: C.link }}>choisissez un fichier</span> — les doublons sont écartés, ce qui est sûr est associé, l'IA locale propose le reste.</>}
          <input ref={inputRef} type="file" accept=".ofx,.qfx,.qbo,.csv,.txt" style={{ display: 'none' }} onChange={e => { pick(e.target.files[0]); e.target.value = '' }} />
        </div>
      )}
      {preview && (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px', fontSize: 13 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{file?.name} — {preview.file_format.toUpperCase()}{preview.period_start ? `, du ${fmtD(preview.period_start)} au ${fmtD(preview.period_end)}` : ''}</div>
          <div>{n(preview.rows_new, 'nouvelle transaction', 'nouvelles transactions')} · {n(preview.rows_duplicate, 'doublon exact écarté', 'doublons exacts écartés')}
            {preview.rows_probable_duplicate > 0 && <> · <strong>{n(preview.rows_probable_duplicate, 'doublon probable', 'doublons probables')}</strong> (même date et même montant qu'une ligne déjà importée d'un autre fichier)</>}
            {preview.rows_zero_skipped > 0 && <> · {preview.rows_zero_skipped} ligne(s) à 0,00 $ ignorée(s)</>}</div>
          {preview.account_mismatch && <div style={{ color: C.red, marginTop: 4 }}>Attention : le fichier semble venir d'un autre compte (se termine par {preview.file_account_last4}).</div>}
          {preview.rows_probable_duplicate > 0 && (
            <div style={{ marginTop: 6, color: C.muted }}>
              {preview.probable_duplicates.map((d, i) => <div key={i}>{fmtD(d.posted_date)} · {fmtMoney(d.amount)} · {d.description}</div>)}
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, color: 'var(--c-text)' }}>
                <input type="checkbox" checked={includeProbable} onChange={async e => { setIncludeProbable(e.target.checked); setPreview(await send(file, true, e.target.checked)) }} />
                Ce ne sont pas des doublons : les importer aussi
              </label>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="btn-secondary" onClick={() => { setPreview(null); setFile(null) }}>Annuler</button>
            <button className="btn-primary" disabled={busy || preview.rows_new === 0} onClick={doImport}>{busy ? 'Import…' : `Importer ${preview.rows_new} transaction${preview.rows_new > 1 ? 's' : ''}`}</button>
          </div>
        </div>
      )}
      {result && (
        <div style={{ marginTop: 8, background: 'var(--c-tint-green)', border: '1px solid #A7F3D0', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
          {n(result.rows_new, 'transaction importée', 'transactions importées')} · {n(result.rows_auto_matched || 0, 'associée automatiquement (sûre)', 'associées automatiquement (sûres)')}
          {' '}· {n(result.rows_recognized || 0, 'reconnue', 'reconnues')}{result.rows_sent_to_ai ? ` · ${result.rows_sent_to_ai} confiée(s) à l'IA locale (propositions dans quelques minutes)` : ''}
        </div>
      )}
      {error && <div style={{ color: C.red, fontSize: 13, marginTop: 6 }}>{error}</div>}
    </div>
  )
}

// Versement au gouvernement (TASK-043.1) : rattache le retrait a une periode (TPS/TVQ d'un trimestre,
// impot d'une annee, retenues d'un mois) ; au-dela du montant declare = penalites et interets.
const GOV_KINDS = [['tps_tvq', 'TPS/TVQ (trimestre)'], ['impot_societe', 'Impôt des sociétés (année)'], ['das', 'Retenues à la source (mois)'], ['autre', 'Autre versement']]
function guessKind(tx) {
  const t = `${tx.payee || ''} ${tx.description || ''}`.toUpperCase()
  if (t.includes('IMPOT')) return 'impot_societe'
  if (t.includes('DEDUCTION')) return 'das'
  return 'tps_tvq'
}
function GovernmentForm({ tx, onDone }) {
  const [kind, setKind] = useState(guessKind(tx))
  const [periods, setPeriods] = useState([])
  const [sel, setSel] = useState('')
  const [declared, setDeclared] = useState({ tps_due: '', tvq_due: '', amount_due: '' })
  const [pv, setPv] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const loadPeriods = async (keep) => {
    const r = await api.get('/v1/taxes/government/periods', { params: { kind } })
    setPeriods(r.data)
    // periode la plus probable : la derniere terminee avant le versement
    const guess = keep || r.data.find(p => p.end < tx.posted_date)?.start || r.data[0]?.start || ''
    setSel(guess)
  }
  useEffect(() => { loadPeriods() }, [kind])
  const period = periods.find(p => p.start === sel)
  useEffect(() => {
    if (!period) { setPv(null); return }
    setDeclared({ tps_due: period.tps_due ?? '', tvq_due: period.tvq_due ?? '', amount_due: period.declared && kind !== 'tps_tvq' ? period.due : '' })
    api.post(`/v1/bank/transactions/${tx.id}/government-preview`, { kind, period_start: period.start, period_end: period.end }).then(r => setPv(r.data)).catch(e => setError(errText(e)))
  }, [sel, periods])
  async function saveDeclared() {
    setError(null)
    try {
      await api.put('/v1/taxes/government/obligations', { kind, period_start: period.start, period_end: period.end,
        tps_due: parseFloat(declared.tps_due) || 0, tvq_due: parseFloat(declared.tvq_due) || 0, amount_due: parseFloat(declared.amount_due) || 0 })
      await loadPeriods(sel)
    } catch (e) { setError(errText(e)) }
  }
  async function link() {
    setSaving(true); setError(null)
    try { await api.post(`/v1/bank/transactions/${tx.id}/match-government`, { kind, period_start: period.start, period_end: period.end }); await onDone() }
    catch (e) { setError(errText(e)); setSaving(false) }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="form-grid">
        <div className="form-group"><label>Type de versement</label>
          <select value={kind} onChange={e => setKind(e.target.value)}>{GOV_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="form-group"><label>Période</label>
          <select value={sel} onChange={e => setSel(e.target.value)}>
            {periods.map(p => <option key={p.start} value={p.start}>{fmtD(p.start)} au {fmtD(p.end)}{p.declared ? ` — déclaré ${fmtMoney(p.due)}, reste ${fmtMoney(p.remaining)}` : p.paid ? ` — déjà payé ${fmtMoney(p.paid)}` : ''}</option>)}
          </select></div>
      </div>
      {period && (
        <div style={{ background: 'var(--c-surface-2)', borderRadius: 8, padding: 10, fontSize: 13 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Montant déclaré pour cette période {period.declared ? '' : <span style={{ color: 'var(--c-on-amber)', fontWeight: 400 }}>— pas encore saisi (depuis votre avis)</span>}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {kind === 'tps_tvq' ? <>
              <div className="form-group" style={{ marginBottom: 0 }}><label>TPS déclarée</label><input type="number" step="0.01" value={declared.tps_due} style={{ width: 120 }} onChange={e => setDeclared({ ...declared, tps_due: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label>TVQ déclarée</label><input type="number" step="0.01" value={declared.tvq_due} style={{ width: 120 }} onChange={e => setDeclared({ ...declared, tvq_due: e.target.value })} /></div>
            </> : <div className="form-group" style={{ marginBottom: 0 }}><label>Montant cotisé / dû</label><input type="number" step="0.01" value={declared.amount_due} style={{ width: 140 }} onChange={e => setDeclared({ ...declared, amount_due: e.target.value })} /></div>}
            <button className="btn-secondary" style={{ fontSize: 12 }} onClick={saveDeclared}>Enregistrer le déclaré</button>
          </div>
        </div>
      )}
      {pv && (
        <div style={{ fontSize: 13 }}>
          Ce versement de <strong>{fmtMoney(-tx.amount)}</strong> :
          {' '}paie le dû <strong>{fmtMoney(pv.applied)}</strong>{kind === 'tps_tvq' ? ` (TPS ${fmtMoney(pv.tps)}, TVQ ${fmtMoney(pv.tvq)})` : ''}
          {pv.penalty > 0 && <> · <strong style={{ color: C.red }}>pénalités et intérêts {fmtMoney(pv.penalty)}</strong> (non déductibles)</>}
          {!pv.declared && <div style={{ color: 'var(--c-on-amber)', fontSize: 12 }}>Sans montant déclaré, tout est compté comme paiement du dû ; saisissez le déclaré pour reconnaître les frais de retard.</div>}
        </div>
      )}
      {error && <div style={{ color: C.red, fontSize: 13 }}>{error}</div>}
      <div style={{ textAlign: 'right' }}><button className="btn-primary" disabled={!period || saving} onClick={link}>Rattacher le versement</button></div>
    </div>
  )
}

// Retraits (TASK-042.4) : lier une depense / un paiement deja enregistre (jamais recreer : double compte),
// payer des factures fournisseurs (les plus vieilles d'abord), ou enregistrer une nouvelle depense.
function WithdrawalModal({ tx, onClose, onDone, embedded }) {
  const refs = useRefs()
  const amount = -tx.amount
  const [sugg, setSugg] = useState(null)
  const [mode, setMode] = useState(/REVENU QUEBEC|ARC -/i.test(`${tx.payee || ''} ${tx.description || ''}`) ? 'gov' : 'bills')   // bills | expense | gov
  const [grouped, setGrouped] = useState(false)
  const [vendorId, setVendorId] = useState(tx.vendor_id)
  const [bills, setBills] = useState([])
  const [alloc, setAlloc] = useState({})
  const [exp, setExp] = useState({ category_id: null, description: tx.payee || tx.description || '', tax_mode: 'inclusive', tax_code: 'tps_tvq', line_class: '' })
  const [remember, setRemember] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { api.get(`/v1/bank/transactions/${tx.id}/withdrawal-suggestions`).then(r => setSugg(r.data)) }, [tx.id])
  useEffect(() => {
    setAlloc({})
    if (grouped) api.get('/v1/purchases/bills/open').then(r => setBills(r.data.map(b => ({ ...b, balance: b.balance }))))
    else if (vendorId) api.get(`/v1/bank/vendors/${vendorId}/open-bills`).then(r => setBills(r.data.map(b => ({ ...b, vendor_name: '' }))))
    else setBills([])
  }, [vendorId, grouped])
  useEffect(() => {
    const v = refs.vendors.find(x => x.id === vendorId)
    if (v?.default_category_id) setExp(e => ({ ...e, category_id: e.category_id || v.default_category_id }))
  }, [vendorId, refs.vendors])

  const allocated = allocSum(alloc)
  function oldestFirst() {
    const n = {}; let left = amount
    ;[...bills].sort((a, b) => a.bill_date.localeCompare(b.bill_date)).forEach(b => {
      if (left > 0.004) { const v = Math.min(b.balance, left); n[b.id] = v.toFixed(2); left = Math.round((left - v) * 100) / 100 }
    })
    setAlloc(n)
  }
  async function submit(body) {
    setSaving(true); setError(null)
    try { await api.post(`/v1/bank/transactions/${tx.id}/match-withdrawal`, { remember_payee: remember, ...body }); await onDone() }
    catch (e) { setError(errText(e)) } finally { setSaving(false) }
  }
  const box = { border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }
  const t = computeTaxes([[amount, exp.tax_code]], exp.tax_mode)

  return (
    <Wrap embedded={embedded} width={820}>
        {!embedded && <h3 className="modal-title">Associer le retrait de {fmtMoney(amount)} du {fmtD(tx.posted_date)}</h3>}
        {!embedded && <div style={{ fontSize: 13, color: C.muted }}>{tx.description}{tx.payee ? ` — ${tx.payee}` : ''}{tx.reference ? ` · Réf. ${tx.reference}` : ''}</div>}

        <div style={{ fontWeight: 600, fontSize: 14 }}>Déjà enregistré dans ERPCRM</div>
        {!sugg && <div style={{ fontSize: 13, color: C.muted }}>Recherche...</div>}
        {sugg && !sugg.expenses.length && !sugg.vendor_payments.length && <div style={{ fontSize: 13, color: C.faint }}>Aucune dépense ni aucun paiement du même montant à ±15 jours.</div>}
        {sugg?.expenses.map(e => (
          <div key={e.id} style={{ ...box, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 13 }}><strong>Dépense</strong> du {fmtD(e.date)} · {e.category_name || 'sans compte'}{e.vendor_name ? ` · ${e.vendor_name}` : ''} · {fmtMoney(e.amount)}
              <div style={{ color: C.muted, fontSize: 12 }}>{e.description || EMPTY} · écart {e.gap} j · <strong style={{ color: 'var(--c-text)' }}>pertinence {e.pct} %</strong></div></div>
            <button className="btn-primary" disabled={saving} onClick={() => submit({ expense_id: e.id })}>Lier</button>
          </div>
        ))}
        {sugg?.vendor_payments.map(p => (
          <div key={p.id} style={{ ...box, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 13 }}><strong>Paiement fournisseur</strong> du {fmtD(p.date)} · {p.payee || EMPTY} · {fmtMoney(p.amount)}
              <div style={{ color: C.muted, fontSize: 12 }}>Factures {p.bill_numbers.join(', ') || EMPTY} · écart {p.gap} j · <strong style={{ color: 'var(--c-text)' }}>pertinence {p.pct} %</strong></div></div>
            <button className="btn-primary" disabled={saving} onClick={() => submit({ vendor_payment_id: p.id })}>Lier</button>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button className={`filter-tab${mode === 'bills' ? ' active' : ''}`} onClick={() => setMode('bills')}>Payer des factures fournisseurs</button>
          <button className={`filter-tab${mode === 'expense' ? ' active' : ''}`} onClick={() => setMode('expense')}>Enregistrer une dépense</button>
          <button className={`filter-tab${mode === 'gov' ? ' active' : ''}`} onClick={() => setMode('gov')}>Versement au gouvernement</button>
        </div>

        {mode === 'bills' && (
          <div style={box}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              {!grouped && <div style={{ minWidth: 260, flex: 1 }}><VendorPicker vendors={refs.vendors} value={vendorId} onCreated={refs.reload} onChange={setVendorId} /></div>}
              <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12 }}>
                <input type="checkbox" checked={grouped} onChange={e => setGrouped(e.target.checked)} /> Paiement groupé (ex. carte de crédit : factures de plusieurs fournisseurs)
              </label>
            </div>
            {(grouped || vendorId) && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 8px' }}>
                  <span style={{ fontSize: 13 }}>Réparti : <strong>{fmtMoney(allocated)}</strong> sur {fmtMoney(amount)}</span>
                  <button className="btn-secondary" style={{ fontSize: 12, padding: '3px 10px' }} disabled={!bills.length} onClick={oldestFirst}>Appliquer aux plus vieilles factures d'abord</button>
                </div>
                <AllocationTable bills={bills} alloc={alloc} setAlloc={setAlloc} showVendor={grouped} />
                <div style={{ textAlign: 'right', marginTop: 8 }}>
                  <button className="btn-primary" disabled={saving || allocated <= 0 || allocated > amount + 0.005}
                    onClick={() => submit({ bill_allocations: allocList(alloc), payee_label: grouped ? (tx.payee || tx.description) : null })}>Enregistrer le paiement</button>
                </div>
              </>
            )}
          </div>
        )}

        {mode === 'gov' && <div style={box}><GovernmentForm tx={tx} onDone={onDone} /></div>}

        {mode === 'expense' && (
          <div style={box}>
            <div className="form-grid">
              <VendorPicker vendors={refs.vendors} value={vendorId} onCreated={refs.reload} onChange={setVendorId} />
              <div className="form-group"><label>Compte de dépense</label><CategorySelect categories={refs.categories} value={exp.category_id} onChange={v => setExp({ ...exp, category_id: v })} /></div>
              <div className="form-group"><label>Classe de l'article</label>
                <select value={exp.line_class} onChange={e => {
                  const c = e.target.value
                  const tax = ['materiel_taxable', 'service_taxable', 'repas_representation'].includes(c) ? 'tps_tvq'
                    : ['materiel_non_taxable', 'service_non_taxable', 'assurance', 'frais_bancaires', 'salaires_commissions', 'versement_gouvernement'].includes(c) ? 'aucune' : exp.tax_code
                  setExp({ ...exp, line_class: c, tax_code: tax })
                }}>
                  <option value="">— Aucune —</option>
                  {LINE_CLASSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Le montant du relevé est</label><select value={exp.tax_mode} onChange={e => setExp({ ...exp, tax_mode: e.target.value })}>{TAX_MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              <div className="form-group"><label>Taxes payées</label><select value={exp.tax_code} onChange={e => setExp({ ...exp, tax_code: e.target.value })}>{TAX_CODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            </div>
            <div className="form-group"><label>Description</label><input value={exp.description} onChange={e => setExp({ ...exp, description: e.target.value })} /></div>
            <div style={{ fontSize: 13, color: C.muted }}>Sous-total {fmtMoney(t.subtotal)} · TPS {fmtMoney(t.tps)} · TVQ {fmtMoney(t.tvq)} · Total {fmtMoney(t.total)}</div>
            <div style={{ textAlign: 'right', marginTop: 8 }}>
              <button className="btn-primary" disabled={saving || exp.tax_mode !== 'inclusive'}
                title={exp.tax_mode !== 'inclusive' ? 'Le montant du relevé contient déjà les taxes' : undefined}
                onClick={() => submit({ new_expense: { vendor_id: vendorId, ...exp, line_class: exp.line_class || null } })}>Enregistrer la dépense</button>
            </div>
          </div>
        )}

        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /> Retenir ce bénéficiaire pour ce fournisseur (prochains relevés)
        </label>
        {error && <div style={{ color: C.red, fontSize: 13 }}>{error}</div>}
        {!embedded && <div className="modal-actions"><button className="btn-secondary" onClick={onClose}>Fermer</button></div>}
    </Wrap>
  )
}

// Fiche d'une transaction (clic sur la ligne -- Philippe, 2026-10-07) : toutes ses infos, client ou
// fournisseur modifiable, ce qui est lie (annulable), suggestions avec pertinence, actions.
// Retirer le client attribué à un dépôt par erreur (Philippe, 2026-10-21 : « je n'ai pas l'option de désassocier ») ;
// au choix, oublier aussi la règle du bénéficiaire pour que les prochains dépôts ne reviennent pas à ce client.
async function removeClient(t) {
  // Bouton principal (Entrée) = le moins large : ce dépôt seulement
  const buttons = [['cancel', 'Annuler']]
  if (t.payee) buttons.push(['forget', `Tous les dépôts « ${t.payee} »`])
  buttons.push(['here', 'Ce dépôt seulement'])
  const who = t.company_name.replace(/\.$/, '')
  const choice = await askChoice(t.payee
    ? `Retirer ce dépôt de ${fmtMoney(t.amount)} de ${who} ?\n« Tous les dépôts » : les autres dépôts de ${t.payee} ne seront plus attribués à ${who} non plus.`
    : `Retirer ce dépôt de ${fmtMoney(t.amount)} de ${who} ?`, buttons)
  if (choice !== 'here' && choice !== 'forget') return false
  await api.put(`/v1/bank/transactions/${t.id}/company`, { company_id: null, remember: false, forget: choice === 'forget' })
  return true
}

function TransactionModal({ txId, onClose, onChanged }) {
  const companies = useCompanies()
  const refs = useRefs()
  const [d, setD] = useState(null)
  const [error, setError] = useState(null)
  const [pay, setPay] = useState(null)          // TASK-005.24 : fiche du paiement lie (cheques)
  const load = async () => setD((await api.get(`/v1/bank/transactions/${txId}/detail`)).data)
  useEffect(() => { load() }, [txId])
  async function run(fn) {
    setError(null)
    try { await fn(); await load(); await onChanged() } catch (e) { setError(errText(e)) }
  }
  if (!d) return <div className="modal-overlay"><div className="modal-box"><div className="loading">Chargement...</div></div></div>
  const deposit = d.amount > 0
  const row = (label, value) => value ? <div style={{ display: 'flex', gap: 12, fontSize: 13, padding: '3px 0' }}><span style={{ color: C.muted, minWidth: 150 }}>{label}</span><span>{value}</span></div> : null
  const statusLabel = d.status === 'matched' ? `Associée${d.auto_matched ? ' automatiquement (correspondance sûre)' : ''}` : d.status === 'excluded' ? 'Exclue' : 'Non classée'
  const box = { border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 880, maxWidth: '96vw', maxHeight: '94vh', overflowY: 'auto' }}>
        <h3 className="modal-title" style={{ margin: 0 }}>{deposit ? 'Dépôt' : 'Retrait'} de {fmtMoney(Math.abs(d.amount))} du {fmtD(d.posted_date)}</h3>
        <div style={box}>
          {row('Description', d.description)}
          {row('Bénéficiaire', d.payee)}
          {row('Référence', d.reference)}
          {row('Compte', d.account_name)}
          {row('Relevé', d.statement_file && `${d.statement_file}${d.statement_imported_at ? ` (importé le ${fmtDate(d.statement_imported_at)})` : ''}`)}
          {row('État', statusLabel)}
        </div>

        <div style={box}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{deposit ? 'Client' : 'Fournisseur'}</div>
          {deposit ? (
            <>
              {d.company_name && <div style={{ fontSize: 13, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span>→ <strong><EntityLink kind="company" id={d.company_id}>{d.company_name}</EntityLink></strong>{d.company_source === 'rule' ? ' (reconnu par une règle)' : ''}</span>
                {d.status !== 'matched' && <button className="btn-secondary" style={{ fontSize: 12, padding: '2px 10px', color: C.red }}
                  onClick={() => run(async () => { await removeClient(d) })}>Retirer ce dépôt du client</button>}
              </div>}
              {!d.company_id && d.ai_status === 'done' && d.ai_company_id && (
                <div style={{ fontSize: 13, color: '#6D28D9', marginBottom: 6 }}>IA propose : <strong><EntityLink kind="company" id={d.ai_company_id}>{d.ai_company_name}</EntityLink></strong> ({d.ai_confidence} %){d.ai_note ? ` — ${d.ai_note}` : ''}
                  <button className="btn-primary" style={{ padding: '2px 10px', fontSize: 12, marginLeft: 8 }} onClick={() => run(() => api.put(`/v1/bank/transactions/${d.id}/company`, { company_id: d.ai_company_id, remember: true }))}>Accepter</button></div>
              )}
              {d.status !== 'matched' && <Autocomplete items={companies} value={d.company_id ? { id: d.company_id, label: d.company_name } : null}
                onSelect={c => c && run(() => api.put(`/v1/bank/transactions/${d.id}/company`, { company_id: c.id, remember: true }))} openOnFocus placeholder="Changer le client (retenu pour ce bénéficiaire)..." />}
            </>
          ) : (
            <>
              {d.vendor_name && <div style={{ fontSize: 13, marginBottom: 6 }}>→ <strong>{d.vendor_name}</strong>{d.vendor_source === 'rule' ? ' (reconnu par une règle)' : d.vendor_source === 'name' ? ' (probable, d\'après le nom)' : ''}
                {d.status === 'unclassified' && d.vendor_source === 'name' && (
                  <button className="btn-primary" style={{ padding: '2px 10px', fontSize: 12, marginLeft: 8 }} title="Crée la règle « bénéficiaire → fournisseur » pour les prochains relevés et associe si c'est sûr"
                    onClick={() => run(() => api.put(`/v1/bank/transactions/${d.id}/vendor`, { vendor_id: d.vendor_id, remember: true }))}>Accepter</button>
                )}</div>}
              {d.status !== 'matched' && <VendorPicker label="Changer le fournisseur (retenu pour ce bénéficiaire)" vendors={refs.vendors} value={d.vendor_source === 'name' ? null : d.vendor_id} onCreated={refs.reload}
                onChange={vid => vid && run(() => api.put(`/v1/bank/transactions/${d.id}/vendor`, { vendor_id: vid, remember: true }))} />}
            </>
          )}
        </div>

        {d.linked && (
          <div style={box}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Lié à</div>
              <button className="btn-secondary" style={{ fontSize: 12, padding: '3px 10px', color: C.red }} onClick={async () => await askConfirm("Annuler cette association ?") && run(() => api.post(`/v1/bank/transactions/${d.id}/unmatch`))}>Annuler l'association</button>
            </div>
            <div style={{ fontSize: 13, marginTop: 6 }}>
              {d.linked.kind === 'client_payment' && <>Encaissement {d.linked.method} du {fmtD(d.linked.received_at)} · {fmtMoney(d.linked.amount)}{d.linked.created_by_link ? ' (créé par l\'association)' : ''}
                {d.linked.lost_invoice && <> · <strong>Facture perdue (ancien logiciel){d.linked.lost_invoice_number ? ` #${d.linked.lost_invoice_number}` : ''}</strong></>}
                <button className="btn-secondary" style={{ fontSize: 12, padding: '2px 10px', marginLeft: 8 }} onClick={() => setPay(d.linked.payment_id)}>Paiement et chèques</button></>}
              {d.linked.kind === 'expense' && <>Dépense du {fmtD(d.linked.date)} · {d.linked.category || 'sans compte'}{d.linked.vendor ? ` · ${d.linked.vendor}` : ''} · {fmtMoney(d.linked.amount)} (TPS {fmtMoney(d.linked.tps)}, TVQ {fmtMoney(d.linked.tvq)}){d.linked.created_by_link ? ' — créée par l\'association' : ''}</>}
              {d.linked.kind === 'vendor_payment' && <>Paiement fournisseur du {fmtD(d.linked.date)} · {d.linked.payee} · {fmtMoney(d.linked.amount)}</>}
              {d.linked.kind === 'government' && <>Versement — {d.linked.type}, période du {fmtD(d.linked.period_start)} au {fmtD(d.linked.period_end)} · paie le dû {fmtMoney(d.linked.applied)}{d.linked.tps || d.linked.tvq ? ` (TPS ${fmtMoney(d.linked.tps)}, TVQ ${fmtMoney(d.linked.tvq)})` : ''}{d.linked.penalty > 0 && <strong style={{ color: C.red }}> · pénalités et intérêts {fmtMoney(d.linked.penalty)}</strong>}</>}
              {(d.linked.items || []).map(i => <div key={i.id} style={{ color: C.muted }}>• {i.number || 'facture'} du {fmtD(i.date)}{i.vendor ? ` · ${i.vendor}` : ''} : {fmtMoney(i.amount)}{i.total != null && Math.abs(i.total - i.amount) > 0.004 ? ` payés ici, sur une facture de ${fmtMoney(i.total)}` : ''}</div>)}
            </div>
          </div>
        )}

        {d.status === 'unclassified' && (
          <div style={box}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Lier ou classer</div>
            {deposit
              ? <MatchModal key={d.company_id || 'none'} tx={d} embedded onClose={onClose} onDone={async () => { await load(); await onChanged() }} />
              : <WithdrawalModal key={d.vendor_id || 'none'} tx={d} embedded onClose={onClose} onDone={async () => { await load(); await onChanged() }} />}
          </div>
        )}

        {pay && <PaymentModal paymentId={pay} onClose={() => setPay(null)} onChanged={async () => { await load(); await onChanged() }} />}
        {error && <div style={{ color: C.red, fontSize: 13 }}>{error}</div>}
        <div className="modal-actions">
          {d.status === 'unclassified' && <button className="btn-secondary" onClick={() => run(() => api.post('/v1/bank/transactions/bulk', { ids: [d.id], action: 'exclude' }))}>Exclure (pas une transaction d'affaires)</button>}
          {d.status === 'excluded' && <button className="btn-secondary" onClick={() => run(() => api.post('/v1/bank/transactions/bulk', { ids: [d.id], action: 'restore' }))}>Restaurer</button>}
          <button className="btn-primary" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  )
}

function UnclassifiedTab({ transactions, onChanged, accountId }) {
  const [sub, setSub] = useState('all')            // all | recognized
  const [excluded, setExcluded] = useState(false)
  const [multi, setMulti] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [perPage, setPerPage] = useState(25)
  const [page, setPage] = useState(0)
  const [desc, setDesc] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [detail, setDetail] = useState(null)      // fiche de la transaction cliquee
  const [payeeTx, setPayeeTx] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const unclassified = transactions.filter(t => t.status === 'unclassified')
  const recognized = unclassified.filter(t => t.company_id || (t.vendor_id && t.vendor_source !== 'name'))
  const base = excluded ? transactions.filter(t => t.status === 'excluded') : sub === 'recognized' ? recognized : unclassified
  const q = search.trim().toLowerCase()
  const rows = base
    .filter(t => !q || [t.description, t.payee, t.reference, t.company_name, String(Math.abs(t.amount))].some(v => (v || '').toLowerCase().includes(q)))
    .sort((a, b) => (desc ? -1 : 1) * a.posted_date.localeCompare(b.posted_date))
  const pageRows = rows.slice(page * perPage, (page + 1) * perPage)
  // Suggestions sûres seulement pour les lignes affichées (la liste arrive sans elles, beaucoup plus vite)
  const [suggs, setSuggs] = useState({})
  useEffect(() => { setSuggs({}) }, [transactions])
  const pageKey = pageRows.map(t => t.id).join(',')
  useEffect(() => {
    const need = pageRows.filter(t => t.status === 'unclassified' && (t.amount < 0 || t.company_id) && !(t.id in suggs)).map(t => t.id)
    if (!need.length) return
    let live = true
    api.post('/v1/bank/transactions/suggestions', { ids: need })
      .then(r => live && setSuggs(s => ({ ...s, ...Object.fromEntries(need.map(id => [id, r.data[id] ?? null])) })))
      .catch(() => {})
    return () => { live = false }
  }, [pageKey, transactions])
  const sugOf = t => suggs[t.id] ?? t.suggestion
  const allChecked = pageRows.length > 0 && pageRows.every(t => selected.has(t.id))
  const sel = [...selected].filter(id => base.some(t => t.id === id))
  // TASK-046 : case, Ctrl+clic (une a la fois) ou Maj+clic (tout entre la derniere ligne ciblee et celle-ci)
  const anchor = useRef(null)
  function toggle(id, e) {
    const ids = pageRows.map(t => t.id), a = ids.indexOf(anchor.current), b = ids.indexOf(id)
    setSelected(s => {
      const n = new Set(s)
      if (e?.shiftKey && a >= 0 && b >= 0) ids.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(x => n.add(x))
      else n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
    anchor.current = id
  }
  function toggleAll() { setSelected(s => { const n = new Set(s); pageRows.forEach(t => allChecked ? n.delete(t.id) : n.add(t.id)); return n }) }

  async function bulk(action) {
    setBusy(true); setMsg(null)
    try {
      const r = await api.post('/v1/bank/transactions/bulk', { ids: sel, action })
      setMsg(`${r.data.done} traitée${r.data.done > 1 ? 's' : ''}${r.data.skipped ? ` · ${r.data.skipped} ignorée${r.data.skipped > 1 ? 's' : ''} (pas de suggestion sûre : ouvrez-les une à une)` : ''}`)
      setSelected(new Set()); await onChanged()
    } finally { setBusy(false) }
  }
  async function acceptVendor(t) {
    await api.put(`/v1/bank/transactions/${t.id}/vendor`, { vendor_id: t.vendor_id, remember: true })
    await onChanged()
  }
  async function acceptAi(t) {
    await api.put(`/v1/bank/transactions/${t.id}/company`, { company_id: t.ai_company_id, remember: true })
    await onChanged()
  }

  return (
    <div>
      <DropImport accountId={accountId} onImported={onChanged} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div className="filter-tabs">
          <button className={`filter-tab${sub === 'all' && !excluded ? ' active' : ''}`} onClick={() => { setSub('all'); setExcluded(false); reset() }}>Tout ({unclassified.length})</button>
          <button className={`filter-tab${sub === 'recognized' && !excluded ? ' active' : ''}`} onClick={() => { setSub('recognized'); setExcluded(false); reset() }}>Reconnu ({recognized.length})</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: C.faint }} title="À l'import, quand vous acceptez une proposition, et toutes les 10 minutes">Correspondances sûres associées automatiquement</span>
          {msg && !(multi || sel.length > 0) && <span style={{ fontSize: 12, color: C.muted }}>{msg}</span>}
          <Switch checked={multi} onChange={setMulti} label="Correspondance & sélection multiple" />
          <button type="button" onClick={() => { setExcluded(e => !e); reset() }} style={{ background: 'none', border: 'none', padding: 0, fontSize: 13, color: excluded ? C.link : C.muted, cursor: 'pointer', fontWeight: excluded ? 600 : 400 }}>Exclu ({transactions.filter(t => t.status === 'excluded').length})</button>
        </div>
      </div>

      {(multi || sel.length > 0) && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--c-tint-blue)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 13, flexWrap: 'wrap' }}>
          <span>{sel.length} sélectionnée{sel.length > 1 ? 's' : ''}</span>
          {!excluded && <button className="btn-secondary" disabled={busy || !sel.length} onClick={() => bulk('exclude')}>Exclure</button>}
          {excluded && <button className="btn-secondary" disabled={busy || !sel.length} onClick={() => bulk('restore')}>Restaurer</button>}
          {msg && <span style={{ color: C.muted }}>{msg}</span>}
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `1px solid ${C.border}` }}>
              <th style={{ ...th, width: 32 }}><input type="checkbox" checked={allChecked} disabled={!pageRows.length} onChange={toggleAll} /></th>
              <th style={{ ...th, cursor: 'pointer' }} onClick={() => setDesc(d => !d)}>Date {desc ? '↓' : '↑'}</th>
              <th style={th}>Détails du relevé</th>
              <th style={{ ...th, textAlign: 'right' }}>Dépôts</th>
              <th style={{ ...th, textAlign: 'right' }}>Retraits</th>
              <SearchHeader open={searchOpen} setOpen={setSearchOpen} value={search} setValue={v => { setSearch(v); setPage(0) }} />
            </tr>
          </thead>
          <tbody>
            {pageRows.map(t => (
              <tr key={t.id} style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer', background: selected.has(t.id) ? 'var(--c-tint-blue)' : undefined }}
                onClick={e => (e.ctrlKey || e.metaKey || e.shiftKey) ? toggle(t.id, e) : setDetail(t.id)}
                onMouseDown={e => { if (e.shiftKey || e.ctrlKey || e.metaKey) e.preventDefault() }}
                onMouseEnter={e => { if (!selected.has(t.id)) e.currentTarget.style.background = 'var(--c-surface-2)' }} onMouseLeave={e => { if (!selected.has(t.id)) e.currentTarget.style.background = '' }}>
                <td style={{ padding: '10px 8px' }} onClick={e => e.stopPropagation()}><input type="checkbox" checked={selected.has(t.id)} onChange={e => toggle(t.id, e.nativeEvent)} /></td>
                <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>{fmtD(t.posted_date)}</td>
                <td style={{ padding: '10px 8px' }}>
                  <div>Description : {t.description || EMPTY}</div>
                  {t.payee && (
                    <div style={{ fontSize: 12, color: C.muted }}>
                      Bénéficiaire :{' '}
                      <button type="button" title="Attribuer ce bénéficiaire à une compagnie" onClick={e => { e.stopPropagation(); setPayeeTx(t) }} style={{ background: 'none', border: 'none', padding: 0, color: C.link, cursor: 'pointer', fontSize: 12, textDecoration: 'underline dotted' }}>{t.payee}</button>
                      {t.reference ? ` · Réf. : ${t.reference}` : ''}
                    </div>
                  )}
                  {!t.payee && t.reference && <div style={{ fontSize: 12, color: C.muted }}>Réf. : {t.reference}</div>}
                  {t.amount < 0 && t.vendor_id && (
                    <div style={{ fontSize: 12, marginTop: 2 }}>
                      {t.vendor_source === 'name'
                        ? <span style={{ color: '#6D28D9' }}>Fournisseur probable : <strong>{t.vendor_name}</strong> (nom du bénéficiaire)</span>
                        : <span style={{ color: C.green, fontWeight: 600 }}>→ {t.vendor_name}<span style={{ color: C.faint, fontWeight: 400 }}>{t.vendor_source === 'rule' ? ' (reconnu)' : ''}</span></span>}
                    </div>
                  )}
                  {t.amount < 0 && sugOf(t) && (
                    <div style={{ fontSize: 12, color: C.muted }}>
                      {sugOf(t).kind === 'expense' ? `dépense déjà enregistrée du ${fmtD(sugOf(t).date)} (${sugOf(t).category_name || 'sans compte'})`
                        : sugOf(t).kind === 'vendor_payment' ? `paiement fournisseur déjà enregistré du ${fmtD(sugOf(t).date)}`
                        : `factures ${sugOf(t).bill_numbers.join(', ')} (la plus vieille d'abord)`}
                    </div>
                  )}
                  {!t.company_id && t.ai_status === 'pending' && (
                    <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>
                      IA locale : {t.ai_queue_position === 1 ? 'analyse en cours' : `en file d'attente (n° ${t.ai_queue_position})`}
                      {t.ai_eta_seconds ? ` — environ ${t.ai_eta_seconds < 60 ? `${t.ai_eta_seconds} s` : `${Math.ceil(t.ai_eta_seconds / 60)} min`}` : ''}
                    </div>
                  )}
                  {!t.company_id && t.ai_status === 'done' && (
                    <div style={{ fontSize: 12, marginTop: 2, color: '#6D28D9' }}>
                      {t.ai_company_id
                        ? <>IA propose : <strong><EntityLink kind="company" id={t.ai_company_id}>{t.ai_company_name}</EntityLink></strong> ({t.ai_confidence} %){t.ai_note ? ` — ${t.ai_note}` : ''}</>
                        : <>IA : aucun client probable{t.ai_note ? ` — ${t.ai_note}` : ''}</>}
                    </div>
                  )}
                  {t.company_id && (
                    <div style={{ fontSize: 12, marginTop: 2 }}>
                      <span style={{ color: C.green, fontWeight: 600 }}>→ <EntityLink kind="company" id={t.company_id}>{t.company_name}</EntityLink></span>
                      <span style={{ color: C.faint }}>{t.company_source === 'rule' ? ' (reconnu)' : ''}</span>

                      {sugOf(t) && <span style={{ color: C.muted }}> · {sugOf(t).kind === 'payment' ? `paiement ${SOURCE_LABEL[sugOf(t).source] || ''} (${sugOf(t).invoice_numbers.join(', ')})`
                        : sugOf(t).kind === 'credit' ? `aucune facture ouverte : ${fmtMoney(sugOf(t).credit)} en crédit du client`
                        : `${sugOf(t).allocations?.length > 1 ? 'factures' : 'facture'} ${sugOf(t).number}${sugOf(t).oldest_first ? ' (la plus vieille d\'abord)' : ''}${sugOf(t).credit > 0 ? ` + ${fmtMoney(sugOf(t).credit)} en crédit` : ''}`}</span>}
                    </div>
                  )}
                </td>
                <td style={{ padding: '10px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>{t.amount > 0 ? fmtMoney(t.amount) : ''}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>{t.amount < 0 ? fmtMoney(-t.amount) : ''}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {/* Un seul bouton, seulement quand il sert : « Accepter » la proposition (client de l'IA ou fournisseur
                      probable) -- les correspondances sures s'associent toutes seules ; le reste : clic sur la ligne */}
                  {t.status === 'unclassified' && (t.amount > 0 && !t.company_id && t.ai_status === 'done' && t.ai_company_id
                    ? <button className="btn-primary" style={{ padding: '3px 10px', fontSize: 12 }} title={`Confirmer ${t.ai_company_name} (et associer la facture si c'est sûr)`} onClick={e => { e.stopPropagation(); acceptAi(t) }}>Accepter</button>
                    : t.amount < 0 && t.vendor_source === 'name'
                      ? <button className="btn-primary" style={{ padding: '3px 10px', fontSize: 12 }} title={`Confirmer ${t.vendor_name} (et associer si c'est sûr)`} onClick={e => { e.stopPropagation(); acceptVendor(t) }}>Accepter</button>
                      : null)}
                </td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <EmptyRow colSpan={6}>
                {excluded ? 'Aucune transaction exclue.'
                  : q ? 'Aucune transaction ne correspond à la recherche.'
                  : sub === 'recognized' ? 'Aucune transaction reconnue. Cliquez sur un bénéficiaire pour l\'attribuer à une compagnie : ses lignes apparaîtront ici.'
                  : 'Aucune transaction non classée. Importez un relevé (bouton Relevés bancaires) : ses lignes apparaîtront ici.'}
              </EmptyRow>
            )}
          </tbody>
        </table>
      </div>
      <Pagination perPage={perPage} setPerPage={setPerPage} page={page} setPage={setPage} total={rows.length} />
      {detail && <TransactionModal txId={detail} onClose={() => setDetail(null)} onChanged={onChanged} />}
      {payeeTx && <PayeeModal tx={payeeTx} onClose={() => setPayeeTx(null)} onDone={async () => { setPayeeTx(null); await onChanged() }} />}
    </div>
  )
}

function AllTransactionsTab({ transactions, filter, onChanged }) {
  const [detail, setDetail] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [perPage, setPerPage] = useState(25)
  const [page, setPage] = useState(0)
  const q = search.trim().toLowerCase()
  // « Dans ERPCRM » : les lignes de banque associees a un paiement client
  const rows = transactions
    .filter(t => t.status === 'matched')
    .filter(t => filter === 'withdrawals' ? t.amount < 0 : filter === 'deposits' ? t.amount > 0 : (filter === 'classified' || filter === 'manual') ? false : true)
    .filter(t => !q || [t.description, t.payee, t.company_name, ...(t.invoice_numbers || []), String(Math.abs(t.amount))].some(v => (v || '').toLowerCase().includes(q)))
    .sort((a, b) => b.posted_date.localeCompare(a.posted_date))
  const pageRows = rows.slice(page * perPage, (page + 1) * perPage)
  async function unmatch(t) {
    const what = t.amount > 0 ? `du dépôt de ${fmtMoney(t.amount)} (${t.company_name})` : `du retrait de ${fmtMoney(-t.amount)}`
    if (!await askConfirm(`Annuler l'association ${what} ? ${t.payment_created ? "Ce qui a été créé par l'association (encaissement, dépense ou paiement fournisseur) sera supprimé." : "L'élément existant sera seulement délié."}`)) return
    await api.post(`/v1/bank/transactions/${t.id}/unmatch`)
    await onChanged()
  }
  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `1px solid ${C.border}` }}>
              <th style={th}>Date</th>
              <th style={th}>N° de référence</th>
              <th style={th}>Type</th>
              <th style={th}>Statut</th>
              <th style={{ ...th, textAlign: 'right' }}>Dépôts</th>
              <th style={{ ...th, textAlign: 'right' }}>Retraits</th>
              <th style={{ ...th, textAlign: 'right' }}>Factures</th>
              <SearchHeader open={searchOpen} setOpen={setSearchOpen} value={search} setValue={v => { setSearch(v); setPage(0) }} />
            </tr>
          </thead>
          <tbody>
            {pageRows.map(t => (
              <tr key={t.id} style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }} onClick={() => setDetail(t.id)}>
                <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>{fmtD(t.posted_date)}</td>
                <td style={{ padding: '10px 8px' }}>{t.reference || ''}</td>
                <td style={{ padding: '10px 8px' }}>{t.amount > 0
                  ? <>Paiement de client<div style={{ fontSize: 12, color: C.muted }}>Client : <EntityLink kind="company" id={t.company_id}>{t.company_name}</EntityLink></div></>
                  : <>{t.withdrawal_label || 'Retrait'}</>}</td>
                <td style={{ padding: '10px 8px', color: C.red }}>Mis en correspondance{t.auto_matched && <div style={{ fontSize: 11, color: C.muted }}>automatiquement (sûre)</div>}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right' }}>{t.amount > 0 ? fmtMoney(t.amount) : ''}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right' }}>{t.amount < 0 ? fmtMoney(-t.amount) : ''}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontSize: 12 }}>{t.lost_invoice ? `Facture perdue${t.lost_invoice_number ? ` #${t.lost_invoice_number}` : ''}` : <InvoiceLinks invoices={t.invoices} empty="" />}{t.credit_left > 0.004 && <div style={{ color: '#D97706' }}>{fmtMoney(t.credit_left)} en crédit du client</div>}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right' }}><button type="button" onClick={e => { e.stopPropagation(); unmatch(t) }} style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 12 }}>Annuler</button></td>
              </tr>
            ))}
            {pageRows.length === 0 && <EmptyRow colSpan={8}>Aucune transaction associée dans ERPCRM pour ce compte.</EmptyRow>}
          </tbody>
        </table>
      </div>
      <Pagination perPage={perPage} setPerPage={setPerPage} page={page} setPage={setPage} total={rows.length} />
      {detail && <TransactionModal txId={detail} onClose={() => setDetail(null)} onChanged={onChanged} />}
    </div>
  )
}

function DashboardTab({ account, internal }) {
  // Depots / retraits de la plage affichee par le graphique
  const [totals, setTotals] = useState(null)
  return (
    <div>
      <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
        <Indicator icon={<IconBank color={C.bank} />} iconBg="var(--c-tint-green)" title={internal ? 'Solde du compte' : 'Solde bancaire'} value={fmtMoney(account.bank_balance)} />
        <Indicator icon={<span style={{ color: C.green, fontWeight: 700 }}>+</span>} iconBg="var(--c-tint-green)" title="Entrées de la période" value={totals ? fmtMoney(totals.deposits) : EMPTY} />
        <Indicator icon={<span style={{ color: C.red, fontWeight: 700 }}>−</span>} iconBg="var(--c-tint-red)" title="Sorties de la période" value={totals ? fmtMoney(totals.withdrawals) : EMPTY} />
      </div>
      <BankChart accountId={account.id} onTotals={setTotals} />
    </div>
  )
}

export default function BankAccountDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [showStatements, setShowStatements] = useState(false)
  const [allFilter, setAllFilter] = useState('all')
  const [transactions, setTransactions] = useState([])

  async function load() {
    const [r, t] = await Promise.all([
      api.get('/v1/bank/accounts', { params: { include_inactive: true } }),
      api.get(`/v1/bank/accounts/${id}/transactions`, { params: { status_filter: 'all' } }).catch(() => ({ data: [] })),
    ])
    setAccounts(r.data)
    setTransactions(t.data)
    setLoading(false)
  }
  useEffect(() => { load() }, [id])
  // Tant que l'IA locale a des depots en file, la page se met a jour toute seule (decompte)
  const aiPending = transactions.some(t => t.ai_status === 'pending')
  useEffect(() => {
    if (!aiPending) return
    const h = setInterval(load, 20000)
    return () => clearInterval(h)
  }, [aiPending, id])

  if (loading) return <div className="page"><div className="loading">Chargement...</div></div>
  const account = accounts.find(a => a.id === id)
  if (!account) return <div className="page"><div className="loading">Compte introuvable.</div></div>

  const internal = account.account_type === 'petty_cash'
  const T = ACCOUNT_TYPES[account.account_type] || ACCOUNT_TYPES.bank
  // La petite caisse n'a pas de releves bancaires : pas d'onglet Non classees
  const tabs = internal ? TABS.filter(t => t !== 'unclassified') : TABS
  const requested = params.get('tab')
  const tab = tabs.includes(requested) ? requested : (internal ? 'all' : 'unclassified')
  const setTab = t => setParams({ tab: t }, { replace: true })
  const switchable = accounts.filter(a => a.is_active || a.id === id)

  return (
    <div className="page">
      {/* En-tete du compte */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Dropdown label={account.name} buttonStyle={{ fontSize: 22, fontWeight: 700 }}>
              {switchable.map(a => (
                <MenuItem key={a.id} active={a.id === id} onClick={() => navigate(`/bank/${a.id}`)}>{a.name}{a.is_active ? '' : ' (inactif)'}</MenuItem>
              ))}
            </Dropdown>
            {!internal && account.feed_connected && <span title="Connexion bancaire active" style={{ width: 8, height: 8, borderRadius: '50%', background: C.green, display: 'inline-block' }} />}
            {!account.is_active && <span style={{ fontSize: 12, color: C.muted }}>(inactif)</span>}
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
            {internal ? T.label : `Numéro de compte : ${account.account_last4 ? `xxxx${account.account_last4}` : EMPTY}${account.institution ? ` · ${account.institution}` : ''}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {!internal && <button className="btn-secondary" onClick={() => setShowStatements(true)}>Relevés bancaires</button>}
          {!internal && <button className="btn-primary" disabled title="Disponible quand des transactions seront reçues de la banque">Catégorisation rapide</button>}
          <Dropdown label="Ajouter une transaction" align="right" buttonStyle={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', background: 'var(--c-surface)', fontSize: 13 }}>
            <div style={{ padding: '6px 10px 2px', fontSize: 11, color: C.faint, textTransform: 'uppercase' }}>Dépôts</div>
            <MenuItem disabled>Paiement de client</MenuItem>
            <MenuItem disabled>Dépôt</MenuItem>
            <MenuItem disabled>Virement depuis un autre compte</MenuItem>
            <div style={{ padding: '6px 10px 2px', fontSize: 11, color: C.faint, textTransform: 'uppercase' }}>Retraits</div>
            <MenuItem disabled>Dépense</MenuItem>
            <MenuItem disabled>Paiement de fournisseur</MenuItem>
            <MenuItem disabled>Virement vers un autre compte</MenuItem>
          </Dropdown>
          <button className="btn-secondary" disabled title="Disponible à une prochaine étape">Enregistrer un dépôt</button>
          <button type="button" title="Réglages du compte" onClick={() => setEditing(true)} style={{ background: 'var(--c-surface)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 9px', cursor: 'pointer', color: C.muted, display: 'flex' }}>
            <IconSettings width={16} height={16} />
          </button>
          <button type="button" title="Retour à l'aperçu bancaire" onClick={() => navigate('/bank')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red, fontSize: 20, lineHeight: 1, padding: '4px 6px' }}>✕</button>
        </div>
      </div>

      {/* Montants + actualisation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <InfoBox icon={<T.Icon />} title="Montant dans ERPCRM" value={EMPTY} />
          {!internal && <InfoBox icon={<IconBank />} title="Montant en banque" value={fmtMoney(account.bank_balance)} />}
          {!internal && <InfoBox icon={<IconCalendar />} title="Dernière date de flux" value={account.last_feed_date ? fmtDate(account.last_feed_date + 'T00:00:00') : EMPTY} />}
        </div>
        {!internal && (
          <div style={{ textAlign: 'right', fontSize: 13, color: C.muted }}>
            <div>{account.last_synced_at ? `Dernière actualisation le ${fmtDate(account.last_synced_at)}` : 'Jamais actualisé'}</div>
            <span title="Aucune connexion bancaire" style={{ fontSize: 12, color: C.faint, cursor: 'not-allowed' }}>↻ Actualiser les flux</span>
          </div>
        )}
      </div>

      {/* Onglets */}
      <div style={{ background: 'var(--c-surface)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '0 24px 20px' }}>
        <div style={{ display: 'flex', gap: 8, borderBottom: `1px solid ${C.border}`, marginBottom: 16, overflowX: 'auto' }}>
          <Tab active={tab === 'dashboard'} title="Tableau de bord" sub="Résumé du compte" onClick={() => setTab('dashboard')} />
          {!internal && (
            <Tab active={tab === 'unclassified'} title={<span><span style={{ color: C.red }}>{account.unclassified_count}</span> Transactions non classées</span>} sub="À partir des relevés bancaires" onClick={() => setTab('unclassified')} />
          )}
          <Tab active={tab === 'all'} title={ALL_FILTERS.find(f => f.value === allFilter)?.label} sub="Dans ERPCRM" onClick={() => setTab('all')}>
            <span onClick={e => e.stopPropagation()}>
              <Dropdown label="" buttonStyle={{ color: C.muted }}>
                {ALL_FILTERS.map(f => <MenuItem key={f.value} active={f.value === allFilter} onClick={() => { setAllFilter(f.value); setTab('all') }}>{f.label}</MenuItem>)}
              </Dropdown>
            </span>
          </Tab>
        </div>
        {tab === 'dashboard' && <DashboardTab key={id} account={account} internal={internal} />}
        {tab === 'unclassified' && <UnclassifiedTab key={id} transactions={transactions} onChanged={load} accountId={id} />}
        {tab === 'all' && <AllTransactionsTab transactions={transactions} filter={allFilter} onChanged={load} />}
      </div>

      {editing && (
        <AccountModal initial={account} isNew={false} onClose={() => setEditing(false)} onSaved={async () => { setEditing(false); await load() }} />
      )}
      {showStatements && (
        <StatementsModal accounts={accounts.filter(a => a.is_active && a.account_type !== 'petty_cash')} initialAccountId={id} onClose={() => setShowStatements(false)} onImported={load} />
      )}
    </div>
  )
}
