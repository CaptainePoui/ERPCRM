import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../services/api'
import Autocomplete from '../components/Autocomplete'
import { IconBank, IconCalendar, IconSearch, IconSettings } from '../components/Icons'
import {
  ACCOUNT_TYPES, C, EMPTY, fmtDate, fmtMoney,
  Dropdown, MenuItem, Indicator, BankChart, AccountModal, StatementsModal,
} from './Bank'

// Fiche d'un compte de l'onglet Banque (TASK-042) -- interface et options.
// Aucune source de transactions n'est branchee : tableaux et montants vides.

const TABS = ['dashboard', 'unclassified', 'all']

const ALL_FILTERS = [
  { value: 'all',         label: 'Toutes les transactions' },
  { value: 'deposits',    label: 'Dépôts' },
  { value: 'withdrawals', label: 'Retraits' },
  { value: 'matched',     label: 'Mises en correspondance' },
  { value: 'classified',  label: 'Classées' },
  { value: 'manual',      label: 'Ajoutées manuellement' },
]

const PER_PAGE = [50, 100, 200]

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
        <div style={{ fontSize: 15, fontWeight: active ? 600 : 500, color: active ? '#111827' : C.muted }}>{title}</div>
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
      <span onClick={() => onChange(!checked)} style={{ width: 32, height: 18, borderRadius: 9, background: checked ? C.link : '#D1D5DB', position: 'relative', transition: 'background .15s' }}>
        <span style={{ position: 'absolute', top: 2, left: checked ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
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
function MatchModal({ tx, onClose, onDone }) {
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

  useEffect(() => {
    api.get(`/v1/bank/transactions/${tx.id}/suggestions`).then(r => { setSugg(r.data); setMethod(r.data.method_code) })
    api.get('/v1/payments/methods').then(r => setMethods(r.data.filter(m => m.is_active)))
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

  async function submit(body) {
    setSaving(true); setError(null)
    try {
      await api.post(`/v1/bank/transactions/${tx.id}/match`, { remember_payee: remember, ...body })
      await onDone()
    } catch (e) { setError(errText(e)) } finally { setSaving(false) }
  }

  const shown = invoices.filter(i => showPaid || i.balance > 0)
  const box = { border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 760, maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto' }}>
        <h3 className="modal-title">Associer le dépôt de {fmtMoney(tx.amount)} du {fmtD(tx.posted_date)}</h3>
        <div style={{ fontSize: 13, color: C.muted }}>{tx.description}{tx.payee ? ` — ${tx.payee}` : ''}{tx.reference ? ` · Réf. ${tx.reference}` : ''}</div>

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
              <div style={{ color: C.muted, fontSize: 12 }}>{p.status === 'pending' ? 'En attente de confirmation' : `Reçu le ${fmtD(p.received_at)}`} · Factures {p.invoice_numbers.join(', ') || EMPTY}</div>
            </div>
            <button className="btn-primary" disabled={saving} onClick={() => submit({ client_payment_id: p.id })}>{p.status === 'pending' ? 'Confirmer et lier' : 'Lier'}</button>
          </div>
        ))}
        {sugg?.invoices.map(i => (
          <div key={i.id} style={{ ...box, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 13 }}>
              <strong>{i.number}</strong> · {i.company_name}{i.site_label ? ` (${i.site_label})` : ''} · solde {fmtMoney(i.balance)} {i.exact && <span style={{ color: C.green, fontWeight: 600 }}>· montant exact</span>}
              <div style={{ color: C.muted, fontSize: 12 }}>Émise le {fmtD(i.issue_date)} · {STATUS_INV[i.status] || i.status}</div>
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
            <label style={{ fontSize: 12, color: C.muted, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <input type="checkbox" checked={showPaid} onChange={e => setShowPaid(e.target.checked)} /> Afficher aussi les factures payées
            </label>
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
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" disabled={saving || !Object.keys(alloc).length || remaining < 0}
            onClick={() => submit({ method_code: method, allocations: Object.entries(alloc).map(([invoice_id, v]) => ({ invoice_id, amount: parseFloat(v) || 0 })).filter(a => a.amount > 0) })}>
            {saving ? '...' : 'Associer'}
          </button>
        </div>
      </div>
    </div>
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
          style={{ border: `2px dashed ${over ? C.link : C.border}`, background: over ? '#EFF6FF' : '#FAFAFA', borderRadius: 10,
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
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, color: '#111827' }}>
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
        <div style={{ marginTop: 8, background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>
          {n(result.rows_new, 'transaction importée', 'transactions importées')} · {n(result.rows_auto_matched || 0, 'associée automatiquement (sûre)', 'associées automatiquement (sûres)')}
          {' '}· {n(result.rows_recognized || 0, 'reconnue', 'reconnues')}{result.rows_sent_to_ai ? ` · ${result.rows_sent_to_ai} confiée(s) à l'IA locale (propositions dans quelques minutes)` : ''}
        </div>
      )}
      {error && <div style={{ color: C.red, fontSize: 13, marginTop: 6 }}>{error}</div>}
    </div>
  )
}

function UnclassifiedTab({ transactions, onChanged, accountId }) {
  const [sub, setSub] = useState('all')            // all | recognized
  const [excluded, setExcluded] = useState(false)
  const [multi, setMulti] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [perPage, setPerPage] = useState(200)
  const [page, setPage] = useState(0)
  const [desc, setDesc] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [matching, setMatching] = useState(null)
  const [payeeTx, setPayeeTx] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const unclassified = transactions.filter(t => t.status === 'unclassified')
  const recognized = unclassified.filter(t => t.company_id)
  const base = excluded ? transactions.filter(t => t.status === 'excluded') : sub === 'recognized' ? recognized : unclassified
  const q = search.trim().toLowerCase()
  const rows = base
    .filter(t => !q || [t.description, t.payee, t.reference, t.company_name, String(Math.abs(t.amount))].some(v => (v || '').toLowerCase().includes(q)))
    .sort((a, b) => (desc ? -1 : 1) * a.posted_date.localeCompare(b.posted_date))
  const pageRows = rows.slice(page * perPage, (page + 1) * perPage)
  const allChecked = pageRows.length > 0 && pageRows.every(t => selected.has(t.id))
  const sel = [...selected].filter(id => base.some(t => t.id === id))
  function toggle(id) { setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function toggleAll() { setSelected(s => { const n = new Set(s); pageRows.forEach(t => allChecked ? n.delete(t.id) : n.add(t.id)); return n }) }

  async function bulk(action) {
    setBusy(true); setMsg(null)
    try {
      const r = await api.post('/v1/bank/transactions/bulk', { ids: sel, action })
      setMsg(`${r.data.done} traitée${r.data.done > 1 ? 's' : ''}${r.data.skipped ? ` · ${r.data.skipped} ignorée${r.data.skipped > 1 ? 's' : ''} (pas de suggestion sûre : ouvrez-les une à une)` : ''}`)
      setSelected(new Set()); await onChanged()
    } finally { setBusy(false) }
  }
  async function validateOne(t) {
    const s = t.suggestion
    await api.post(`/v1/bank/transactions/${t.id}/match`, s.kind === 'payment'
      ? { client_payment_id: s.id } : { allocations: [{ invoice_id: s.id, amount: s.balance }] })
    await onChanged()
  }
  const reset = () => { setPage(0); setSelected(new Set()); setMsg(null) }
  async function autoAssociate() {
    if (!confirm("Associer automatiquement les dépôts dont la correspondance est certaine (client reconnu et un seul paiement ou une seule facture au montant exact) ? Chaque association reste annulable.")) return
    setBusy(true); setMsg(null)
    try {
      const r = await api.post(`/v1/bank/accounts/${accountId}/auto-associate`)
      setMsg(`${r.data.auto_matched} associée(s) automatiquement${r.data.sent_to_ai ? ` · ${r.data.sent_to_ai} confiée(s) à l'IA locale` : ''}`)
      await onChanged()
    } finally { setBusy(false) }
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
          <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} disabled={busy} onClick={autoAssociate}>Associer ce qui est sûr</button>
          {msg && !(multi || sel.length > 0) && <span style={{ fontSize: 12, color: C.muted }}>{msg}</span>}
          <Switch checked={multi} onChange={setMulti} label="Correspondance & sélection multiple" />
          <button type="button" onClick={() => { setExcluded(e => !e); reset() }} style={{ background: 'none', border: 'none', padding: 0, fontSize: 13, color: excluded ? C.link : C.muted, cursor: 'pointer', fontWeight: excluded ? 600 : 400 }}>Exclu ({transactions.filter(t => t.status === 'excluded').length})</button>
        </div>
      </div>

      {(multi || sel.length > 0) && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#EFF6FF', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 13, flexWrap: 'wrap' }}>
          <span>{sel.length} sélectionnée{sel.length > 1 ? 's' : ''}</span>
          {!excluded && sub === 'recognized' && <button className="btn-primary" disabled={busy || !sel.length} onClick={() => bulk('validate')}>Valider la sélection</button>}
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
              <tr key={t.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '10px 8px' }}><input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} /></td>
                <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>{fmtD(t.posted_date)}</td>
                <td style={{ padding: '10px 8px' }}>
                  <div>Description : {t.description || EMPTY}</div>
                  {t.payee && (
                    <div style={{ fontSize: 12, color: C.muted }}>
                      Bénéficiaire :{' '}
                      <button type="button" title="Attribuer ce bénéficiaire à une compagnie" onClick={() => setPayeeTx(t)} style={{ background: 'none', border: 'none', padding: 0, color: C.link, cursor: 'pointer', fontSize: 12, textDecoration: 'underline dotted' }}>{t.payee}</button>
                      {t.reference ? ` · Réf. : ${t.reference}` : ''}
                    </div>
                  )}
                  {!t.payee && t.reference && <div style={{ fontSize: 12, color: C.muted }}>Réf. : {t.reference}</div>}
                  {!t.company_id && t.ai_status === 'pending' && <div style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>IA locale : analyse en cours…</div>}
                  {!t.company_id && t.ai_status === 'done' && (
                    <div style={{ fontSize: 12, marginTop: 2, color: '#6D28D9' }}>
                      {t.ai_company_id
                        ? <>IA propose : <strong>{t.ai_company_name}</strong> ({t.ai_confidence} %){t.ai_note ? ` — ${t.ai_note}` : ''}
                            <button className="btn-secondary" style={{ padding: '1px 8px', fontSize: 11, marginLeft: 6 }} onClick={() => acceptAi(t)}>Accepter</button></>
                        : <>IA : aucun client probable{t.ai_note ? ` — ${t.ai_note}` : ''}</>}
                    </div>
                  )}
                  {t.company_id && (
                    <div style={{ fontSize: 12, marginTop: 2 }}>
                      <span style={{ color: C.green, fontWeight: 600 }}>→ {t.company_name}</span>
                      <span style={{ color: C.faint }}>{t.company_source === 'rule' ? ' (reconnu)' : ''}</span>
                      {t.suggestion && <span style={{ color: C.muted }}> · {t.suggestion.kind === 'payment' ? `paiement ${SOURCE_LABEL[t.suggestion.source] || ''} (${t.suggestion.invoice_numbers.join(', ')})` : `facture ${t.suggestion.number}`}</span>}
                    </div>
                  )}
                </td>
                <td style={{ padding: '10px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>{t.amount > 0 ? fmtMoney(t.amount) : ''}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>{t.amount < 0 ? fmtMoney(-t.amount) : ''}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {t.status === 'unclassified' && t.amount > 0 && t.suggestion && <button className="btn-primary" style={{ padding: '3px 10px', fontSize: 12, marginRight: 6 }} onClick={() => validateOne(t)}>Valider</button>}
                  {t.status === 'unclassified' && t.amount > 0 && <button className="btn-secondary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => setMatching(t)}>Associer</button>}
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
      {matching && <MatchModal tx={matching} onClose={() => setMatching(null)} onDone={async () => { setMatching(null); await onChanged() }} />}
      {payeeTx && <PayeeModal tx={payeeTx} onClose={() => setPayeeTx(null)} onDone={async () => { setPayeeTx(null); await onChanged() }} />}
    </div>
  )
}

function AllTransactionsTab({ transactions, filter, onChanged }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [perPage, setPerPage] = useState(200)
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
    if (!confirm(`Annuler l'association du dépôt de ${fmtMoney(t.amount)} (${t.company_name}) ? ${t.payment_created ? "L'encaissement créé sera supprimé et les factures redeviendront à payer." : "Le paiement existant sera seulement délié."}`)) return
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
              <tr key={t.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>{fmtD(t.posted_date)}</td>
                <td style={{ padding: '10px 8px' }}>{t.reference || ''}</td>
                <td style={{ padding: '10px 8px' }}>Paiement de client<div style={{ fontSize: 12, color: C.muted }}>Client : {t.company_name}</div></td>
                <td style={{ padding: '10px 8px', color: C.red }}>Mis en correspondance{t.auto_matched && <div style={{ fontSize: 11, color: C.muted }}>automatiquement (sûre)</div>}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right' }}>{t.amount > 0 ? fmtMoney(t.amount) : ''}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right' }}>{t.amount < 0 ? fmtMoney(-t.amount) : ''}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right', fontSize: 12 }}>{(t.invoice_numbers || []).join(', ')}</td>
                <td style={{ padding: '10px 8px', textAlign: 'right' }}><button type="button" onClick={() => unmatch(t)} style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 12 }}>Annuler</button></td>
              </tr>
            ))}
            {pageRows.length === 0 && <EmptyRow colSpan={8}>Aucune transaction associée dans ERPCRM pour ce compte.</EmptyRow>}
          </tbody>
        </table>
      </div>
      <Pagination perPage={perPage} setPerPage={setPerPage} page={page} setPage={setPage} total={rows.length} />
    </div>
  )
}

function DashboardTab({ account, internal }) {
  // Depots / retraits de la plage affichee par le graphique
  const [totals, setTotals] = useState(null)
  return (
    <div>
      <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
        <Indicator icon={<IconBank color={C.bank} />} iconBg="#ECFDF5" title={internal ? 'Solde du compte' : 'Solde bancaire'} value={fmtMoney(account.bank_balance)} />
        <Indicator icon={<span style={{ color: C.green, fontWeight: 700 }}>+</span>} iconBg="#ECFDF5" title="Entrées de la période" value={totals ? fmtMoney(totals.deposits) : EMPTY} />
        <Indicator icon={<span style={{ color: C.red, fontWeight: 700 }}>−</span>} iconBg="#FEF2F2" title="Sorties de la période" value={totals ? fmtMoney(totals.withdrawals) : EMPTY} />
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
          <Dropdown label="Ajouter une transaction" align="right" buttonStyle={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', background: '#fff', fontSize: 13 }}>
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
          <button type="button" title="Réglages du compte" onClick={() => setEditing(true)} style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 9px', cursor: 'pointer', color: C.muted, display: 'flex' }}>
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
      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: '0 24px 20px' }}>
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
