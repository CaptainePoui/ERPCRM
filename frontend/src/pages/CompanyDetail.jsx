import { useState, useEffect, useRef, Fragment } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import api, { getToken } from '../services/api'
import Autocomplete from '../components/Autocomplete'
import NewTicketModal from '../components/NewTicketModal'
import NewInvoiceModal from '../components/NewInvoiceModal'
import NewTaskModal from '../components/NewTaskModal'
import QuickNewContact from '../components/QuickNewContact'
import JournalFeed from '../components/JournalFeed'
import PhoneOptionsEditor from '../components/PhoneOptionsEditor'
import { contrastText } from '../utils/color'
import './CompanyDetail.css'

const TABS = ['Général', 'Contacts', 'Tickets', 'Inventaire', 'Téléphonie', 'Tâches', 'Photos', 'Journal']
const TAB_SLUGS = ['general', 'contacts', 'tickets', 'inventaire', 'telephonie', 'taches', 'photos', 'journal']

// ── Inline field ──────────────────────────────────────────────────────────────
function InlineField({ label, value, display, onSave, type = 'text', options, multiline }) {
  const [active, setActive] = useState(false)
  const [val, setVal] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef()

  useEffect(() => { setVal(value ?? '') }, [value])
  useEffect(() => { if (active && inputRef.current) inputRef.current.focus() }, [active])

  async function confirm() {
    setSaving(true)
    try { await onSave(val === '' ? null : val) } finally { setSaving(false); setActive(false) }
  }
  function cancel() { setVal(value ?? ''); setActive(false) }

  const rendered = display ?? value
  return (
    <div className={`ifield${active ? ' ifield-active' : ''}`}>
      <div className="ifield-label">{label}</div>
      {active ? (
        <div className="ifield-edit">
          {options ? (
            <select ref={inputRef} value={val ?? ''} onChange={e => setVal(e.target.value)}>
              {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : multiline ? (
            <textarea ref={inputRef} value={val ?? ''} onChange={e => setVal(e.target.value)} rows={3} />
          ) : (
            <input ref={inputRef} type={type} value={val ?? ''} onChange={e => setVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !multiline) confirm(); if (e.key === 'Escape') cancel() }} />
          )}
          <button className="ifield-ok" onClick={confirm} disabled={saving} title="Confirmer">✓</button>
          <button className="ifield-x" onClick={cancel} title="Annuler">✕</button>
        </div>
      ) : (
        <div className="ifield-view" onClick={() => setActive(true)} title="Cliquer pour modifier">
          {rendered ? <span className="ifield-value">{rendered}</span> : <span className="ifield-empty">Non indiqué</span>}
          <span className="ifield-pencil">✎</span>
        </div>
      )}
    </div>
  )
}

// ── Vendor autocomplete field ─────────────────────────────────────────────────
function VendorField({ company, contacts, onSave }) {
  const [editing, setEditing] = useState(false)
  const items = contacts.map(c => ({ id: c.id, label: `${c.first_name} ${c.last_name}`.trim(), sub: c.email || '' }))
  const vendorName = company.vendor ? `${company.vendor.first_name} ${company.vendor.last_name}`.trim() : null

  if (!editing) {
    return (
      <div className="ifield">
        <div className="ifield-label">Vendeur</div>
        <div className="ifield-view" onClick={() => setEditing(true)}>
          {vendorName ? <span className="ifield-value">{vendorName}</span> : <span className="ifield-empty">Non indiqué</span>}
          <span className="ifield-pencil">✎</span>
        </div>
      </div>
    )
  }

  return (
    <div className="ifield ifield-active">
      <div className="ifield-label">Vendeur</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Autocomplete
          items={items}
          value={company.vendor ? { id: company.vendor.contact_id, label: vendorName } : null}
          onSelect={async contact => { if (contact) { await onSave(contact.id); setEditing(false) } }}
          placeholder="Rechercher un contact..."
          autoFocus
        />
        <div style={{ display: 'flex', gap: 8 }}>
          {company.vendor_id && (
            <button onClick={async () => { await onSave(null); setEditing(false) }}
              style={{ fontSize: 12, color: '#DC2626', background: 'none', border: '1px solid #FCA5A5', borderRadius: 5, cursor: 'pointer', padding: '3px 8px' }}>
              Retirer
            </button>
          )}
          <button className="ifield-x" onClick={() => setEditing(false)}>✕</button>
        </div>
      </div>
    </div>
  )
}

// ── Status selector (inline) ──────────────────────────────────────────────────
function StatusSelector({ entityId, statuses: initialStatuses, allStatuses, apiPath }) {
  const [current, setCurrent] = useState(initialStatuses)
  const [saving, setSaving] = useState(null)

  useEffect(() => { setCurrent(initialStatuses) }, [entityId])

  async function toggle(status) {
    setSaving(status.id)
    const isActive = current.find(s => s.id === status.id)
    setCurrent(prev => isActive ? prev.filter(s => s.id !== status.id) : [...prev, status])
    try {
      if (isActive) {
        await api.delete(`${apiPath}/${entityId}/statuses/${status.id}`)
      } else {
        await api.post(`${apiPath}/${entityId}/statuses/${status.id}`)
      }
    } catch {
      setCurrent(prev => isActive ? [...prev, status] : prev.filter(s => s.id !== status.id))
    } finally { setSaving(null) }
  }

  return (
    <div className="status-selector">
      {allStatuses.map(s => {
        const active = !!current.find(x => x.id === s.id)
        return (
          <button key={s.id} type="button"
            className={`status-option${active ? ' selected' : ''}`}
            style={{ '--sc': s.color, '--sc-text': contrastText(s.color) }}
            onClick={() => toggle(s)}
            disabled={saving === s.id}
          >
            {saving === s.id ? '…' : s.name}
          </button>
        )
      })}
    </div>
  )
}

// ── New company form (full form, used only for creation) ──────────────────────
const EMPTY = {
  name: '', legal_name: '', account_number: '', neq: '', website: '',
  industry: '', shareholder_type: '', employee_count: '', annual_revenue: '',
  notes_internal: '', internal_manager_id: '',
  currency: 'CAD', exchange_rate: 1,
  is_taxable: true, tax_country: 'CA', tax_province: 'QC',
  tps_rate: 5.0, tvq_rate: 9.975,
  status_ids: [],
}

function NewCompanyForm({ managers, statuses, onCreated }) {
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  function f(k, v) { setForm(p => ({ ...p, [k]: v })) }
  function toggleStatus(sid) {
    setForm(p => ({
      ...p,
      status_ids: p.status_ids.includes(sid) ? p.status_ids.filter(x => x !== sid) : [...p.status_ids, sid]
    }))
  }

  async function save() {
    if (!form.name.trim()) { setError('Le nom est requis'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        ...form,
        employee_count: form.employee_count === '' ? null : Number(form.employee_count),
        annual_revenue: form.annual_revenue === '' ? null : Number(form.annual_revenue),
        internal_manager_id: form.internal_manager_id || null,
        exchange_rate: Number(form.exchange_rate),
        tps_rate: Number(form.tps_rate),
        tvq_rate: Number(form.tvq_rate),
      }
      const r = await api.post('/v1/companies', payload)
      navigate(`/companies/${r.data.id}`, { replace: true })
    } catch (e) {
      setError(e.response?.data?.detail || 'Erreur')
    } finally { setSaving(false) }
  }

  const combinedTax = (Number(form.tps_rate) + Number(form.tvq_rate)).toFixed(3)

  return (
    <div className="new-form">
      {error && <div className="form-error">{error}</div>}
      <div className="form-grid">
        <div className="form-group full">
          <label>Statuts</label>
          <div className="status-selector">
            {statuses.map(s => (
              <button key={s.id} type="button"
                className={`status-option${form.status_ids.includes(s.id) ? ' selected' : ''}`}
                style={{ '--sc': s.color, '--sc-text': contrastText(s.color) }}
                onClick={() => toggleStatus(s.id)}>
                {s.name}
              </button>
            ))}
          </div>
        </div>
        <div className="form-group"><label>Nom *</label><input value={form.name} onChange={e => f('name', e.target.value)} /></div>
        <div className="form-group"><label>Nom légal</label><input value={form.legal_name} onChange={e => f('legal_name', e.target.value)} /></div>
        <div className="form-group"><label>No compte (tenant)</label><input value={form.account_number} onChange={e => f('account_number', e.target.value)} placeholder="ex: t1001" /></div>
        <div className="form-group"><label>NEQ</label><input value={form.neq} onChange={e => f('neq', e.target.value)} /></div>
        <div className="form-group">
          <label>Gestionnaire</label>
          <select value={form.internal_manager_id} onChange={e => f('internal_manager_id', e.target.value)}>
            <option value="">— Aucun —</option>
            {managers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Secteur</label><input value={form.industry} onChange={e => f('industry', e.target.value)} /></div>
        <div className="form-group"><label>Type d'actionnariat</label><input value={form.shareholder_type} onChange={e => f('shareholder_type', e.target.value)} /></div>
        <div className="form-group"><label>Employés</label><input type="number" value={form.employee_count} onChange={e => f('employee_count', e.target.value)} /></div>
        <div className="form-group"><label>Chiffre d'affaires ($)</label><input type="number" value={form.annual_revenue} onChange={e => f('annual_revenue', e.target.value)} /></div>
        <div className="form-group"><label>Site web</label><input value={form.website} onChange={e => f('website', e.target.value)} /></div>
        <div className="form-group full"><label>Notes internes</label><textarea rows={3} value={form.notes_internal} onChange={e => f('notes_internal', e.target.value)} /></div>
        <div className="form-section-title full">Profil fiscal</div>
        <div className="form-group">
          <label>Devise</label>
          <select value={form.currency} onChange={e => f('currency', e.target.value)}>
            <option value="CAD">CAD — Dollar canadien</option>
            <option value="USD">USD — Dollar américain</option>
          </select>
        </div>
        <div className="form-group"><label>Taux de change</label><input type="number" step="0.0001" value={form.exchange_rate} onChange={e => f('exchange_rate', e.target.value)} /></div>
        <div className="form-group">
          <label>Pays fiscal</label>
          <select value={form.tax_country} onChange={e => f('tax_country', e.target.value)}>
            <option value="CA">Canada</option><option value="US">États-Unis</option>
          </select>
        </div>
        <div className="form-group">
          <label>Province fiscale</label>
          <select value={form.tax_province} onChange={e => f('tax_province', e.target.value)}>
            <option value="QC">Québec</option><option value="ON">Ontario</option>
            <option value="BC">Colombie-Britannique</option><option value="AB">Alberta</option>
          </select>
        </div>
        <div className="form-group"><label>TPS (%)</label><input type="number" step="0.001" value={form.tps_rate} onChange={e => f('tps_rate', e.target.value)} /></div>
        <div className="form-group"><label>TVQ (%)</label><input type="number" step="0.001" value={form.tvq_rate} onChange={e => f('tvq_rate', e.target.value)} /></div>
        <div className="form-group">
          <label>Client taxable</label>
          <select value={form.is_taxable ? 'true' : 'false'} onChange={e => f('is_taxable', e.target.value === 'true')}>
            <option value="true">Oui</option><option value="false">Non</option>
          </select>
        </div>
        <div className="form-group"><label>Taux combiné</label><div className="computed-field">{combinedTax} %</div></div>
      </div>
      <div className="new-form-actions">
        <button className="btn-secondary" onClick={() => navigate('/companies')}>Annuler</button>
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Création...' : 'Créer la compagnie'}</button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CompanyDetail({ isNew }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = Math.max(0, TAB_SLUGS.indexOf(searchParams.get('tab')))
  const [tab, setTabState] = useState(initialTab)
  function setTab(i) {
    setTabState(i)
    setSearchParams(prev => { const next = new URLSearchParams(prev); next.set('tab', TAB_SLUGS[i]); return next }, { replace: true })
  }
  const [company, setCompany] = useState(null)
  const [loading, setLoading] = useState(!isNew)
  const [statuses, setStatuses] = useState([])
  const [functions, setFunctions] = useState([])
  const [managers, setManagers] = useState([])
  const [showTicket, setShowTicket] = useState(false)
  const [showInvoice, setShowInvoice] = useState(false)
  const [showTask, setShowTask] = useState(false)
  const [allContacts, setAllContacts] = useState([])

  useEffect(() => {
    api.get('/v1/ref/statuses').then(r => setStatuses(r.data))
    api.get('/v1/ref/functions').then(r => setFunctions(r.data))
    api.get('/v1/ref/users/managers').then(r => setManagers(r.data))
    api.get('/v1/contacts').then(r => setAllContacts(r.data))
    if (!isNew) load()
  }, [id, isNew])

  async function load() {
    setLoading(true)
    const r = await api.get(`/v1/companies/${id}`)
    setCompany(r.data)
    setLoading(false)
  }

  async function saveField(fieldName, value) {
    await api.put(`/v1/companies/${id}`, { [fieldName]: value })
    setCompany(prev => ({ ...prev, [fieldName]: value }))
  }

  async function saveVendor(contactId) {
    await api.put(`/v1/companies/${id}`, { vendor_id: contactId })
    await load()
  }

  const [confirmSipv, setConfirmSipv] = useState(null) // null | true | false — valeur ciblee en attente de confirmation
  const [sipvError, setSipvError] = useState('')
  // TASK-021/S032 : facturation récurrente obligatoire à l'activation -- date
  // du jour par défaut (modifiable), fréquence mensuelle par défaut.
  const [billingStartDate, setBillingStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [billingFrequency, setBillingFrequency] = useState('mensuel')

  async function toggleSipvTenant() {
    if (confirmSipv === null) return
    setSipvError('')
    try {
      const r = await api.post(`/v1/companies/${id}/sipv-tenant`, {
        enabled: confirmSipv,
        billing_start_date: confirmSipv ? billingStartDate : undefined,
        billing_frequency: confirmSipv ? billingFrequency : undefined,
      })
      setCompany(r.data)
      setConfirmSipv(null)
    } catch (e) {
      setSipvError(e.response?.data?.detail || 'Erreur de communication avec SIPV')
    }
  }

  if (loading) return <div className="detail-loading">Chargement...</div>

  const c = company

  return (
    <div className="detail-page">
      <div className="detail-header">
        <div className="detail-breadcrumb">
          <button className="back-btn" onClick={() => navigate('/companies')}>← Compagnies</button>
          {!isNew && <><span className="breadcrumb-sep">›</span><span className="breadcrumb-name">{c?.name || ''}</span></>}
          {isNew && <><span className="breadcrumb-sep">›</span><span className="breadcrumb-name">Nouvelle compagnie</span></>}
        </div>
        {!isNew && c && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" onClick={() => setShowTicket(true)}>+ Ticket</button>
            <button className="btn-secondary" onClick={() => setShowInvoice(true)}>+ Facture</button>
            <button className="btn-secondary" onClick={() => setShowTask(true)}>+ Tâche</button>
          </div>
        )}
      </div>
      {showTicket && c && (
        <NewTicketModal
          prefillCompany={{ id: c.id, label: c.name }}
          onClose={() => setShowTicket(false)}
          onCreated={t => navigate(`/tickets/${t.id}`)}
        />
      )}
      {showInvoice && c && (
        <NewInvoiceModal
          prefillCompany={{ id: c.id, label: c.name }}
          onClose={() => setShowInvoice(false)}
        />
      )}
      {showTask && c && (
        <NewTaskModal
          prefillCompany={{ id: c.id, label: c.name }}
          onClose={() => setShowTask(false)}
          onCreated={() => setShowTask(false)}
        />
      )}

      {confirmSipv !== null && c && (
        <div className="modal-overlay" onClick={() => { setConfirmSipv(null); setSipvError('') }}>
          <div className="modal-box" style={{ width: 460 }} onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">
              {confirmSipv ? 'Créer/activer le tenant SIPV ?' : 'Désactiver le tenant SIPV ?'}
            </h3>
            {confirmSipv ? (
              <p>
                Ceci va créer (ou réactiver) un vrai tenant téléphonique dans SIPV pour
                <strong> {c.name}</strong> {c.account_number
                  ? <>(compte <code>{c.account_number}</code>)</>
                  : <>(un numéro de compte sera assigné automatiquement)</>}.
                Assure-toi que cette compagnie a vraiment besoin de service téléphonique
                avant de continuer — ne coche pas ça par erreur.
              </p>
            ) : null}
            {confirmSipv ? (
              <>
                <div className="form-group">
                  <label>Date de départ de la facturation</label>
                  <input type="date" value={billingStartDate} onChange={e => setBillingStartDate(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Fréquence</label>
                  <select value={billingFrequency} onChange={e => setBillingFrequency(e.target.value)}>
                    <option value="mensuel">Mensuelle</option>
                    <option value="bimestriel">Bimestrielle (2 mois)</option>
                    <option value="trimestriel">Trimestrielle (3 mois)</option>
                    <option value="biannuel">Biannuelle (6 mois)</option>
                    <option value="annuel">Annuelle</option>
                  </select>
                </div>
                <p style={{ fontSize: 12, color: '#6B7280' }}>
                  La facturation récurrente est automatique et obligatoire — chaque poste/DID
                  ajouté ou retiré dans SIPV met à jour cette récurrence, avec prorata au retrait.
                </p>
              </>
            ) : (
              <p>
                Ceci va désactiver le tenant téléphonique de <strong>{c.name}</strong> côté
                SIPV. Les postes existants ne pourront plus s'enregistrer tant que ce n'est
                pas réactivé. Le tenant n'est pas supprimé — réversible en recochant.
              </p>
            )}
            {sipvError && <div className="adm-form-error">{sipvError}</div>}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => { setConfirmSipv(null); setSipvError('') }}>Annuler</button>
              <button className="btn-primary" onClick={toggleSipvTenant}>
                {confirmSipv ? 'Activer' : 'Désactiver'}
              </button>
            </div>
          </div>
        </div>
      )}

      {!isNew && (
        <div className="detail-tabs">
          {TABS.map((t, i) => (
            <button key={t} className={`tab-btn${tab === i ? ' active' : ''}`} onClick={() => setTab(i)}>{t}</button>
          ))}
        </div>
      )}

      <div className="detail-body">
        {isNew ? (
          <NewCompanyForm managers={managers} statuses={statuses} />
        ) : (
          <>
            {tab === 0 && (
              <div>
                <div className="ifield-section-title">Identification</div>
                <div className="ifields-grid">
                  <div className="ifield-full">
                    <div className="ifield-label">Statuts</div>
                    <StatusSelector entityId={id} statuses={c.statuses} allStatuses={statuses}
                      apiPath="/v1/companies" />
                  </div>
                  <InlineField label="Nom de compagnie" value={c.name} onSave={v => saveField('name', v)} />
                  <InlineField label="No compte (tenant SIPV)" value={c.account_number} onSave={v => saveField('account_number', v)} />
                  <InlineField label="Téléphone bureau" value={c.office_phone} onSave={v => saveField('office_phone', v)} />
                  <div className="ifield">
                    <div className="ifield-label">Tenant téléphonique SIPV</div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={c.sipv_enabled}
                        onChange={e => setConfirmSipv(e.target.checked)}
                      />
                      {c.sipv_enabled
                        ? <span style={{ color: '#059669', fontWeight: 600 }}>Actif</span>
                        : <span style={{ color: '#9CA3AF' }}>Inactif</span>}
                    </label>
                  </div>
                  <InlineField label="NEQ" value={c.neq} onSave={v => saveField('neq', v)} />
                  <InlineField label="Gestionnaire interne"
                    value={c.internal_manager_id || ''}
                    display={c.internal_manager?.full_name || null}
                    options={[{ value: '', label: '— Aucun —' }, ...managers.map(m => ({ value: m.id, label: m.full_name }))]}
                    onSave={v => saveField('internal_manager_id', v || null)} />
                  <InlineField label="Secteur d'activité" value={c.industry} onSave={v => saveField('industry', v)} />
                  <InlineField label="Type d'actionnariat" value={c.shareholder_type} onSave={v => saveField('shareholder_type', v)} />
                  <InlineField label="Nombre d'employés" value={c.employee_count != null ? String(c.employee_count) : ''} type="number" onSave={v => saveField('employee_count', v ? Number(v) : null)} />
                  <InlineField label="Chiffre d'affaires ($)" value={c.annual_revenue != null ? String(c.annual_revenue) : ''} type="number" onSave={v => saveField('annual_revenue', v ? Number(v) : null)} />
                  <InlineField label="Site web" value={c.website} onSave={v => saveField('website', v)} />
                  <InlineField label="Notes internes" value={c.notes_internal} multiline onSave={v => saveField('notes_internal', v)} />
                  <VendorField company={c} contacts={allContacts} onSave={saveVendor} />
                </div>
                <div className="ifield-section-title" style={{ marginTop: 24 }}>Taxes</div>
                <div className="tax-checks">
                  <label className="tax-check">
                    <input type="checkbox" checked={c.is_taxable} onChange={e => saveField('is_taxable', e.target.checked)} />
                    <span>TPS <em>5% — Canada</em></span>
                  </label>
                  <label className="tax-check">
                    <input type="checkbox" checked={c.tvq_applicable} onChange={e => saveField('tvq_applicable', e.target.checked)} />
                    <span>TVQ <em>9,975% — Québec</em></span>
                  </label>
                </div>
                <div className="ifield-section-title" style={{ marginTop: 24 }}>Adresses</div>
                <AddressesSection entityId={id} company={c} onRefresh={load} />
                <div className="ifield-section-title" style={{ marginTop: 24 }}>Coordonnées</div>
                <CommunicationsSection entityId={id} company={c} onRefresh={load} />
                <E911AddressesSection companyId={id} />
                <div className="record-meta">
                  Créé le {new Date(c.created_at).toLocaleString('fr-CA')}
                  {c.updated_at !== c.created_at && <> · Modifié le {new Date(c.updated_at).toLocaleString('fr-CA')}</>}
                </div>
              </div>
            )}

            {tab === 1 && <ContactsTab companyId={id} companyName={c.name} contacts={c.contacts} functions={functions} onRefresh={load} />}
            {tab === 2 && <TicketsTab companyId={id} />}
            {tab === 3 && <InventaireTab companyId={id} />}
            {tab === 4 && <TelephonyTab companyId={id} companyName={c.name} sipvEnabled={c.sipv_enabled} />}
            {tab === 5 && <TachesTab companyId={id} companyName={c.name} onShowTask={() => setShowTask(true)} />}
            {tab === 6 && <PhotosTab companyId={id} />}
            {tab === 7 && <JournalFeed entityId={id} />}
          </>
        )}
      </div>
    </div>
  )
}

// ── Addresses ─────────────────────────────────────────────────────────────────
function AddressesSection({ entityId, company, onRefresh }) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ address_type: 'billing', street_1: '', street_2: '', city: '', province: 'QC', postal_code: '', country: 'CA', is_primary: false })
  const [saving, setSaving] = useState(false)
  const addresses = company?.addresses?.filter(a => a.is_active) || []
  const TYPE_LABELS = { billing: 'Facturation', service: 'Service / Livraison', mailing: 'Courrier', '911': '911' }

  async function save() {
    setSaving(true)
    try {
      await api.post(`/v1/companies/${entityId}/addresses`, form)
      await onRefresh()
      setAdding(false)
      setForm({ address_type: 'billing', street_1: '', street_2: '', city: '', province: 'QC', postal_code: '', country: 'CA', is_primary: false })
    } finally { setSaving(false) }
  }

  return (
    <div>
      {addresses.length === 0 && !adding && <div className="empty-tab">Aucune adresse enregistrée.</div>}
      {addresses.map(a => (
        <div key={a.id} className="addr-card">
          <div className="addr-type">{TYPE_LABELS[a.address_type] || a.address_type}</div>
          <div className="addr-line">{a.street_1}</div>
          {a.street_2 && <div className="addr-line">{a.street_2}</div>}
          <div className="addr-line">{a.city}, {a.province}  {a.postal_code}</div>
          <div className="addr-line">{a.country === 'CA' ? 'Canada' : a.country}</div>
        </div>
      ))}
      {!adding && <button className="btn-secondary" onClick={() => setAdding(true)}>+ Ajouter une adresse</button>}
      {adding && (
        <div className="inline-form">
          <select value={form.address_type} onChange={e => setForm(p => ({ ...p, address_type: e.target.value }))}>
            <option value="billing">Facturation</option>
            <option value="service">Service / Livraison</option>
            <option value="mailing">Courrier</option>
            <option value="911">911</option>
          </select>
          <input placeholder="Adresse ligne 1 *" value={form.street_1} onChange={e => setForm(p => ({ ...p, street_1: e.target.value }))} />
          <input placeholder="Adresse ligne 2" value={form.street_2} onChange={e => setForm(p => ({ ...p, street_2: e.target.value }))} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input placeholder="Ville *" value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} style={{ flex: 2 }} />
            <input placeholder="Province" value={form.province} onChange={e => setForm(p => ({ ...p, province: e.target.value }))} style={{ flex: 1 }} />
            <input placeholder="Code postal" value={form.postal_code} onChange={e => setForm(p => ({ ...p, postal_code: e.target.value }))} style={{ flex: 1 }} />
          </div>
          <div className="inline-form-actions">
            <button className="btn-secondary" onClick={() => setAdding(false)}>Annuler</button>
            <button className="btn-primary" onClick={save} disabled={saving}>{saving ? '...' : 'Ajouter'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Communications ────────────────────────────────────────────────────────────
function CommunicationsSection({ entityId, company, onRefresh }) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ channel_type: 'phone', value: '', label: '', is_primary: false })
  const [saving, setSaving] = useState(false)
  const comms = company?.communications?.filter(c => c.is_active) || []
  const TYPE_LABELS = { email: 'Courriel', phone: 'Téléphone', mobile: 'Mobile', fax: 'Télécopieur' }

  async function save() {
    setSaving(true)
    try {
      await api.post(`/v1/companies/${entityId}/communications`, form)
      await onRefresh()
      setAdding(false)
      setForm({ channel_type: 'phone', value: '', label: '', is_primary: false })
    } finally { setSaving(false) }
  }

  async function remove(commId) {
    if (!confirm('Retirer cette coordonnée ?')) return
    await api.delete(`/v1/companies/${entityId}/communications/${commId}`)
    await onRefresh()
  }

  async function setOfficePhone(commId) {
    await api.post(`/v1/companies/${entityId}/communications/${commId}/set-office-phone`)
    await onRefresh()
  }

  return (
    <div>
      {comms.length === 0 && !adding && <div className="empty-tab">Aucune coordonnée enregistrée.</div>}
      {comms.map(c => (
        <div key={c.id} className="comm-row">
          <span className="comm-type-badge">{TYPE_LABELS[c.channel_type] || c.channel_type}</span>
          <span className="comm-value">{c.value}</span>
          {c.label && <span className="comm-label">{c.label}</span>}
          {c.is_primary && <span className="primary-badge">Principal</span>}
          {c.channel_type === 'phone' && !c.is_primary && (
            <button
              onClick={() => setOfficePhone(c.id)}
              style={{ fontSize: 11, color: 'var(--brand)', background: 'none', border: '1px solid #CBD5E1', borderRadius: 5, padding: '2px 8px', cursor: 'pointer' }}
            >
              Définir comme principal
            </button>
          )}
          <button
            onClick={() => remove(c.id)}
            style={{ fontSize: 11, color: '#DC2626', background: 'none', border: '1px solid #FCA5A5', borderRadius: 5, padding: '2px 8px', cursor: 'pointer' }}
          >
            Retirer
          </button>
        </div>
      ))}
      {!adding && <button className="btn-secondary" onClick={() => setAdding(true)}>+ Ajouter</button>}
      {adding && (
        <div className="inline-form">
          <select value={form.channel_type} onChange={e => setForm(p => ({ ...p, channel_type: e.target.value }))}>
            <option value="phone">Téléphone</option>
            <option value="mobile">Mobile</option>
            <option value="email">Courriel</option>
            <option value="fax">Télécopieur</option>
          </select>
          <input placeholder="Valeur *" value={form.value} onChange={e => setForm(p => ({ ...p, value: e.target.value }))} />
          <input placeholder="Étiquette ex: Bureau principal" value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} />
          <label className="checkbox-label">
            <input type="checkbox" checked={form.is_primary} onChange={e => setForm(p => ({ ...p, is_primary: e.target.checked }))} />
            Numéro principal
          </label>
          <div className="inline-form-actions">
            <button className="btn-secondary" onClick={() => setAdding(false)}>Annuler</button>
            <button className="btn-primary" onClick={save} disabled={saving}>{saving ? '...' : 'Ajouter'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Contacts ──────────────────────────────────────────────────────────────────
function ContactsTab({ companyId, companyName, contacts, functions, onRefresh }) {
  const [linking, setLinking] = useState(false)
  const [creatingNew, setCreatingNew] = useState(false)
  const [allContacts, setAllContacts] = useState([])
  const [form, setForm] = useState({ contact_id: '', email: '', function_ids: [], is_primary: false })
  const [saving, setSaving] = useState(false)
  const [editingEmail, setEditingEmail] = useState(null) // contact_id being edited
  const [emailDraft, setEmailDraft] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    if (linking) api.get('/v1/contacts').then(r => setAllContacts(r.data))
  }, [linking])

  function afterContactCreated(contact) {
    setAllContacts(prev => [...prev, contact])
    setForm(p => ({ ...p, contact_id: contact.id }))
    setCreatingNew(false)
    setLinking(true)
  }

  async function link() {
    if (!form.contact_id) return
    setSaving(true)
    try {
      await api.post(`/v1/companies/${companyId}/contacts`, {
        contact_id: form.contact_id,
        email: form.email || null,
        function_ids: form.function_ids,
        is_primary: form.is_primary,
      })
      await onRefresh()
      setLinking(false)
      setForm({ contact_id: '', email: '', function_ids: [], is_primary: false })
    } catch (e) { alert(e.response?.data?.detail || 'Erreur') } finally { setSaving(false) }
  }

  async function unlink(contactId) {
    if (!confirm('Retirer ce contact de la compagnie ?')) return
    await api.delete(`/v1/companies/${companyId}/contacts/${contactId}`)
    await onRefresh()
  }

  async function saveEmail(contactId) {
    await api.patch(`/v1/companies/${companyId}/contacts/${contactId}`, { email: emailDraft || null })
    setEditingEmail(null)
    await onRefresh()
  }

  return (
    <div>
      {contacts.length === 0 && !linking && <div className="empty-tab">Aucun contact lié.</div>}
      {contacts.map(c => (
        <div key={c.contact_company_id} className="contact-card">
          <div className="contact-card-info">
            <button className="contact-name-link" onClick={() => navigate(`/contacts/${c.contact_id}?fromCompanyId=${companyId}&fromCompanyName=${encodeURIComponent(companyName || '')}&fromTab=contacts`)}>
              {c.first_name} {c.last_name}
            </button>
            {c.is_primary && <span className="primary-badge">Principal</span>}
            {c.functions.length > 0 && <div className="contact-fns">{c.functions.join(' · ')}</div>}
            <div className="contact-email-row">
              {editingEmail === c.contact_id ? (
                <>
                  <input
                    type="email"
                    value={emailDraft}
                    onChange={e => setEmailDraft(e.target.value)}
                    placeholder="courriel@entreprise.com"
                    style={{ fontSize: 13, padding: '3px 7px', border: '1px solid #CBD5E1', borderRadius: 5, width: 230 }}
                    onKeyDown={e => { if (e.key === 'Enter') saveEmail(c.contact_id); if (e.key === 'Escape') setEditingEmail(null) }}
                    autoFocus
                  />
                  <button className="ifield-ok" onClick={() => saveEmail(c.contact_id)} title="Confirmer" style={{ fontSize: 12 }}>✓</button>
                  <button className="ifield-x" onClick={() => setEditingEmail(null)} title="Annuler" style={{ fontSize: 12 }}>✕</button>
                </>
              ) : (
                <span
                  className="contact-email-val"
                  onClick={() => { setEditingEmail(c.contact_id); setEmailDraft(c.email || '') }}
                  title="Cliquer pour modifier le courriel professionnel"
                >
                  {c.email ? <><span style={{ color: '#6B7280', fontSize: 12 }}>✉ </span>{c.email}</> : <span style={{ color: '#CBD5E1', fontSize: 12 }}>✉ Ajouter courriel</span>}
                  <span className="ifield-pencil" style={{ fontSize: 11 }}>✎</span>
                </span>
              )}
            </div>
            {c.communications.map(ch => (
              <div key={ch.id} className="contact-comm">{ch.channel_type}: {ch.value}</div>
            ))}
          </div>
          <button className="unlink-btn" onClick={() => unlink(c.contact_id)}>Retirer</button>
        </div>
      ))}
      {!linking && !creatingNew && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={() => setLinking(true)}>+ Lier un contact existant</button>
          <button className="btn-primary" onClick={() => setCreatingNew(true)}>+ Créer un nouveau contact</button>
        </div>
      )}
      {creatingNew && (
        <QuickNewContact initialName="" onCreated={afterContactCreated} onClose={() => setCreatingNew(false)} />
      )}
      {linking && (
        <div className="inline-form">
          <select value={form.contact_id} onChange={e => setForm(p => ({ ...p, contact_id: e.target.value }))}>
            <option value="">— Sélectionner un contact —</option>
            {allContacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
          </select>
          <input
            type="email"
            placeholder="Courriel professionnel (optionnel)"
            value={form.email}
            onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
          />
          <div className="form-group">
            <label>Fonctions (Ctrl/Cmd+clic pour en choisir plusieurs)</label>
            <select
              multiple
              size={6}
              value={form.function_ids}
              onChange={e => setForm(p => ({ ...p, function_ids: Array.from(e.target.selectedOptions, o => o.value) }))}
            >
              {functions.map(fn => <option key={fn.id} value={fn.id}>{fn.name}</option>)}
            </select>
          </div>
          <label className="checkbox-label">
            <input type="checkbox" checked={form.is_primary} onChange={e => setForm(p => ({ ...p, is_primary: e.target.checked }))} />
            Contact principal
          </label>
          <div className="inline-form-actions">
            <button className="btn-secondary" onClick={() => setLinking(false)}>Annuler</button>
            <button className="btn-primary" onClick={link} disabled={saving || !form.contact_id}>{saving ? '...' : 'Enregistrer'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tickets Tab (remplace Maintenance -- filtre tous les tickets de la compagnie,
// peu importe le contact qui les a ouverts, plus recent en premier) ──────────
const TKT_PRIORITY_LABELS = {
  faible:   { label: 'Faible',    color: '#6B7280' },
  normal:   { label: 'Normal',    color: 'var(--brand)' },
  urgent:   { label: 'Urgent',    color: '#D97706' },
  critique: { label: 'Critique',  color: '#DC2626' },
}

const TKT_STATUS_LABELS = {
  ouvert:              { label: 'Ouvert',       color: 'var(--brand)' },
  en_cours:            { label: 'En cours',     color: '#059669' },
  en_attente:          { label: 'En attente',   color: '#D97706' },
  fermer_a_facturer:   { label: 'À facturer',   color: '#7C3AED' },
  facture:             { label: 'Facturé',      color: '#0891B2' },
  ferme:               { label: 'Fermé',        color: '#6B7280' },
  annule:              { label: 'Annulé',       color: '#9CA3AF' },
}

function TicketsTab({ companyId }) {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    setLoading(true)
    api.get(`/v1/tickets?company_id=${companyId}`).then(r => setTickets(r.data)).finally(() => setLoading(false))
  }, [companyId])

  if (loading) return <div className="loading">Chargement...</div>

  return (
    <div>
      {tickets.length === 0 ? <div className="empty-tab">Aucun ticket pour cette compagnie.</div> : (
        <table className="data-table">
          <thead>
            <tr>
              {['Titre', 'Contact', 'Assigné', 'Priorité', 'Statut', 'Créé le'].map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickets.map(t => {
              const pr = TKT_PRIORITY_LABELS[t.priority] || TKT_PRIORITY_LABELS.normal
              const st = TKT_STATUS_LABELS[t.status] || TKT_STATUS_LABELS.ouvert
              return (
                <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/tickets/${t.id}`)}>
                  <td style={{ fontWeight: 600 }}>{t.title}</td>
                  <td>{t.contact_name || '—'}</td>
                  <td>{t.assigned_name || '—'}</td>
                  <td><span style={{ background: pr.color, color: contrastText(pr.color), fontSize: 11, fontWeight: 700, borderRadius: 10, padding: '2px 8px' }}>{pr.label}</span></td>
                  <td><span style={{ background: st.color, color: contrastText(st.color), fontSize: 11, fontWeight: 700, borderRadius: 10, padding: '2px 8px' }}>{st.label}</span></td>
                  <td>{new Date(t.created_at).toLocaleDateString('fr-CA')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── Maintenance Tab (plus utilise dans les onglets -- remplace par Tickets ci-dessus,
// garde ici car non demande a supprimer) ──────────────────────────────────────
const TYPE_LABELS_MAP = {
  anydesk: 'AnyDesk', vpn_l2tp: 'VPN L2TP', vpn_openvpn: 'VPN OpenVPN',
  rdp: 'Bureau à distance', ssh: 'SSH', web: 'Interface web', autre: 'Autre',
}

function MaintenanceTab({ companyId }) {
  const [accesses, setAccesses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [revealed, setRevealed] = useState({})

  useEffect(() => {
    api.get(`/v1/maintenance/company/${companyId}`).then(r => setAccesses(r.data)).finally(() => setLoading(false))
  }, [companyId])

  async function reveal(id) {
    if (revealed[id]) { setRevealed(p => { const n = { ...p }; delete n[id]; return n }); return }
    const r = await api.get(`/v1/maintenance/${id}/reveal`)
    setRevealed(p => ({ ...p, [id]: r.data.password || '' }))
  }

  async function remove(id) {
    if (!confirm('Supprimer cet accès ?')) return
    await api.delete(`/v1/maintenance/${id}`)
    setAccesses(p => p.filter(a => a.id !== id))
  }

  if (loading) return <div className="loading">Chargement...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn-primary" onClick={() => setShowNew(true)}>+ Ajouter un accès</button>
      </div>
      {accesses.length === 0 && <div className="empty-tab">Aucun accès enregistré.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {accesses.map(a => (
          <div key={a.id} className="maint-card">
            <div className="maint-header">
              <span className="maint-type">{TYPE_LABELS_MAP[a.access_type] || a.access_type}</span>
              <span className="maint-name">{a.name}</span>
              <button className="inv-del-btn" onClick={() => remove(a.id)} style={{ marginLeft: 'auto' }}>✕</button>
            </div>
            <div className="maint-fields">
              {a.host && <div className="maint-row"><span>Hôte / ID</span><code>{a.host}</code></div>}
              {a.username && <div className="maint-row"><span>Utilisateur</span><code>{a.username}</code></div>}
              {a.has_password && (
                <div className="maint-row">
                  <span>Mot de passe</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {revealed[a.id] !== undefined
                      ? <code style={{ userSelect: 'all' }}>{revealed[a.id] || '(vide)'}</code>
                      : <code>••••••••</code>}
                    <button className="btn-secondary" onClick={() => reveal(a.id)} style={{ fontSize: 11, padding: '3px 8px' }}>
                      {revealed[a.id] !== undefined ? 'Masquer' : 'Révéler'}
                    </button>
                  </div>
                </div>
              )}
              {a.notes && <div className="maint-row maint-notes"><span>Notes</span><span>{a.notes}</span></div>}
            </div>
          </div>
        ))}
      </div>

      {showNew && (
        <NewAccessModal companyId={companyId} onClose={() => setShowNew(false)}
          onCreated={a => { setAccesses(p => [...p, a]); setShowNew(false) }} />
      )}
    </div>
  )
}

function NewAccessModal({ companyId, onClose, onCreated }) {
  const [form, setForm] = useState({ access_type: 'anydesk', name: '', host: '', username: '', password: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const payload = { ...form, host: form.host || null, username: form.username || null, password: form.password || null, notes: form.notes || null }
      const r = await api.post(`/v1/maintenance/company/${companyId}`, payload)
      onCreated(r.data)
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Nouvel accès</h3>
        <div className="form-group">
          <label>Type</label>
          <select value={form.access_type} onChange={e => f('access_type', e.target.value)} autoFocus>
            {Object.entries(TYPE_LABELS_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Nom / Étiquette *</label><input value={form.name} onChange={e => f('name', e.target.value)} placeholder="Ex: Serveur principal" /></div>
        <div className="form-group"><label>Hôte / ID</label><input value={form.host} onChange={e => f('host', e.target.value)} placeholder="Ex: 123456789 ou 192.168.1.10" /></div>
        <div className="form-group"><label>Utilisateur</label><input value={form.username} onChange={e => f('username', e.target.value)} /></div>
        <div className="form-group"><label>Mot de passe</label><input type="password" value={form.password} onChange={e => f('password', e.target.value)} /></div>
        <div className="form-group"><label>Notes</label><textarea value={form.notes} onChange={e => f('notes', e.target.value)} rows={2} /></div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving || !form.name.trim()}>{saving ? '...' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Inventaire Tab ────────────────────────────────────────────────────────────
const EQ_CATS = ['ordinateur','serveur','imprimante','telephone','switch','routeur','autre']
const EQ_LABELS = { ordinateur:'Ordinateur', serveur:'Serveur', imprimante:'Imprimante', telephone:'Téléphone', switch:'Switch', routeur:'Routeur', autre:'Autre' }
const EQ_STATUS = { actif:{label:'Actif',color:'#059669'}, inactif:{label:'Inactif',color:'#6B7280'}, hors_service:{label:'Hors service',color:'#DC2626'} }

function InventaireTab({ companyId }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  useEffect(() => {
    api.get(`/v1/equipment/company/${companyId}`).then(r => setItems(r.data)).finally(() => setLoading(false))
  }, [companyId])

  async function remove(id) {
    if (!confirm('Supprimer cet équipement ?')) return
    await api.delete(`/v1/equipment/${id}`)
    setItems(p => p.filter(e => e.id !== id))
  }

  if (loading) return <div className="loading">Chargement...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn-primary" onClick={() => setShowNew(true)}>+ Ajouter un équipement</button>
      </div>
      {items.length === 0 && <div className="empty-tab">Aucun équipement enregistré.</div>}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ background: '#F9FAFB' }}>
            {['Catégorie','Nom','Marque / Modèle','SN / Asset','IP / MAC','Statut',''].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '9px 12px', borderBottom: '1px solid #E5E7EB', fontSize: 12, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(e => {
            const st = EQ_STATUS[e.status] || EQ_STATUS.actif
            return (
              <tr key={e.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                <td style={{ padding: '10px 12px' }}><span style={{ background: 'var(--brand-bg)', color: 'var(--brand)', fontSize: 11, fontWeight: 700, borderRadius: 10, padding: '2px 7px', textTransform: 'uppercase' }}>{EQ_LABELS[e.category] || e.category}</span></td>
                <td style={{ padding: '10px 12px', fontWeight: 600 }}>{e.name}</td>
                <td style={{ padding: '10px 12px', color: '#6B7280' }}>{[e.brand, e.model].filter(Boolean).join(' ') || '—'}</td>
                <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12 }}>{e.serial_number || e.asset_tag || '—'}</td>
                <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12, color: '#6B7280' }}>{e.ip_address || e.mac_address || '—'}</td>
                <td style={{ padding: '10px 12px' }}><span style={{ background: st.color, color: '#fff', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>{st.label}</span></td>
                <td style={{ padding: '10px 12px' }}><button className="inv-del-btn" onClick={() => remove(e.id)}>✕</button></td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {showNew && (
        <NewEquipmentModal companyId={companyId} onClose={() => setShowNew(false)}
          onCreated={e => { setItems(p => [...p, e]); setShowNew(false) }} />
      )}
    </div>
  )
}

function NewEquipmentModal({ companyId, onClose, onCreated }) {
  const [form, setForm] = useState({ category: 'ordinateur', name: '', brand: '', model: '', serial_number: '', asset_tag: '', mac_address: '', ip_address: '', status: 'actif', notes: '' })
  const [saving, setSaving] = useState(false)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const nullIfEmpty = v => v.trim() || null

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const r = await api.post(`/v1/equipment/company/${companyId}`, {
        ...form, brand: nullIfEmpty(form.brand), model: nullIfEmpty(form.model),
        serial_number: nullIfEmpty(form.serial_number), asset_tag: nullIfEmpty(form.asset_tag),
        mac_address: nullIfEmpty(form.mac_address), ip_address: nullIfEmpty(form.ip_address),
        notes: nullIfEmpty(form.notes),
      })
      onCreated(r.data)
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 480 }} onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Nouvel équipement</h3>
        <div className="form-group">
          <label>Catégorie</label>
          <select value={form.category} onChange={e => f('category', e.target.value)} autoFocus>
            {EQ_CATS.map(c => <option key={c} value={c}>{EQ_LABELS[c]}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Nom *</label><input value={form.name} onChange={e => f('name', e.target.value)} /></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="form-group" style={{ flex: 1 }}><label>Marque</label><input value={form.brand} onChange={e => f('brand', e.target.value)} /></div>
          <div className="form-group" style={{ flex: 1 }}><label>Modèle</label><input value={form.model} onChange={e => f('model', e.target.value)} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="form-group" style={{ flex: 1 }}><label>No série</label><input value={form.serial_number} onChange={e => f('serial_number', e.target.value)} /></div>
          <div className="form-group" style={{ flex: 1 }}><label>Asset tag</label><input value={form.asset_tag} onChange={e => f('asset_tag', e.target.value)} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="form-group" style={{ flex: 1 }}><label>IP</label><input value={form.ip_address} onChange={e => f('ip_address', e.target.value)} /></div>
          <div className="form-group" style={{ flex: 1 }}><label>MAC</label><input value={form.mac_address} onChange={e => f('mac_address', e.target.value)} /></div>
        </div>
        <div className="form-group">
          <label>Statut</label>
          <select value={form.status} onChange={e => f('status', e.target.value)}>
            <option value="actif">Actif</option>
            <option value="inactif">Inactif</option>
            <option value="hors_service">Hors service</option>
          </select>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving || !form.name.trim()}>{saving ? '...' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Téléphonie Tab ────────────────────────────────────────────────────────────
const DID_DESTINATION_TYPES = [
  { value: '', label: '— Aucune —' },
  { value: 'extension', label: 'Poste' },
  { value: 'ring_group', label: 'Groupe d\'appel' },
  { value: 'ivr', label: 'IVR' },
  { value: 'queue', label: 'File d\'attente' },
  { value: 'voicemail', label: 'Messagerie' },
  { value: 'hangup', label: 'Raccrocher' },
  { value: 'fax', label: 'Fax virtuel' },
  { value: 'conference', label: 'Conférence' },
  { value: 'transfer', label: 'Transfert d\'appel' },
  { value: 'message', label: 'Message enregistré' },
]

// Menu filtre par type de destination -- reutilise partout ou une destination
// se choisit (DID, plage d'horaire) : poste/groupe d'appel/IVR/file d'attente
// listent les vraies fiches du tenant, les autres types restent en texte libre.
function destinationSelectOptions(type, { mergedExtensions, ringGroups, ivrs, queues }) {
  if (type === 'extension') return mergedExtensions.map(e => ({ value: e.extension, label: `${e.extension} — ${e.name}` }))
  if (type === 'ring_group') return ringGroups.map(g => ({ value: g.name, label: g.name }))
  if (type === 'ivr') return ivrs.map(v => ({ value: v.name, label: v.name }))
  if (type === 'queue') return queues.map(q => ({ value: q.name, label: q.name }))
  return null
}

// Chaine de menus deroulants a choix unique pour une selection multiple sans
// checkboxes : un menu par id deja choisi + un menu vide en fin de liste pour
// en ajouter un nouveau. Un template deja choisi disparait des autres menus.
function TemplateDropdownChain({ options, selectedIds, onChange }) {
  const slots = [...selectedIds, '']

  function handleChange(idx, value) {
    const next = [...selectedIds]
    if (value === '') next.splice(idx, 1)
    else next[idx] = value
    onChange(next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {slots.map((val, idx) => {
        const available = options.filter(o => !selectedIds.includes(o.id) || o.id === val)
        return (
          <select key={idx} value={val} onChange={e => handleChange(idx, e.target.value)}
            style={{ fontSize: 13, padding: '4px 6px', maxWidth: 280 }}>
            <option value="">{idx === slots.length - 1 ? '+ Ajouter un template' : '— Retirer —'}</option>
            {available.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )
      })}
    </div>
  )
}

function TelephonyTab({ companyId, companyName, sipvEnabled }) {
  const navigate = useNavigate()
  const [dids, setDids] = useState([])
  const [exts, setExts] = useState([])
  const [sipExts, setSipExts] = useState([])
  const [sipExtsLoading, setSipExtsLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [showNewDid, setShowNewDid] = useState(false)
  const [showNewExt, setShowNewExt] = useState(false)
  const [ringGroups, setRingGroups] = useState([])
  const [ringGroupsLoading, setRingGroupsLoading] = useState(true)
  const [ivrs, setIvrs] = useState([])
  const [queues, setQueues] = useState([])
  const [pagingGroups, setPagingGroups] = useState([])
  const [pagingGroupsLoading, setPagingGroupsLoading] = useState(true)
  const [buttonTemplates, setButtonTemplates] = useState([])
  const [buttonTemplatesLoading, setButtonTemplatesLoading] = useState(true)
  const [phoneOptions, setPhoneOptions] = useState({})
  const [selectedTenantTemplateIds, setSelectedTenantTemplateIds] = useState([])
  const [selectedGlobalTemplateIds, setSelectedGlobalTemplateIds] = useState([])
  const [globalTemplates, setGlobalTemplates] = useState([])
  const [tenantTemplates, setTenantTemplates] = useState([])
  const [tenantTemplatesLoading, setTenantTemplatesLoading] = useState(true)
  const [tenantModelTemplates, setTenantModelTemplates] = useState([])
  const [tenantModelTemplatesLoading, setTenantModelTemplatesLoading] = useState(true)
  const [phoneModels, setPhoneModels] = useState([])
  const [e911Addresses, setE911Addresses] = useState([])
  const [e911AddressesLoading, setE911AddressesLoading] = useState(true)
  const [schedules, setSchedules] = useState([])
  const [showNewSchedule, setShowNewSchedule] = useState(false)
  const [prompts, setPrompts] = useState([])

  useEffect(() => {
    Promise.all([
      api.get(`/v1/telephony/company/${companyId}/dids`),
      api.get(`/v1/telephony/company/${companyId}/extensions`),
    ]).then(([d, e]) => { setDids(d.data); setExts(e.data) }).finally(() => setLoading(false))
    loadSipExtensions()
    loadRingGroups()
    loadIvrsAndQueues()
    loadPagingGroups()
    loadButtonTemplates()
    loadPhoneOptions()
    loadTenantTemplates()
    loadTenantModelTemplates()
    loadE911Addresses()
    loadSchedules()
    loadPrompts()
    api.get('/v1/ref/phone-models').then(r => setPhoneModels(r.data))
  }, [companyId])

  function loadSchedules() {
    api.get(`/v1/telephony/company/${companyId}/schedules`).then(r => setSchedules(r.data))
  }

  function loadPrompts() {
    api.get(`/v1/telephony/company/${companyId}/prompts`).then(r => setPrompts(r.data))
  }

  function loadE911Addresses() {
    setE911AddressesLoading(true)
    api.get(`/v1/companies/${companyId}/sites`)
      .then(r => setE911Addresses(r.data))
      .finally(() => setE911AddressesLoading(false))
  }

  function loadTenantTemplates() {
    // Bibliothèque disponible pour le serveur de cette compagnie (créée/gérée
    // dans "Serveur", TASK-S044.1) -- ici seulement pour le picker.
    setTenantTemplatesLoading(true)
    api.get(`/v1/companies/${companyId}/tenant-templates`)
      .then(r => setTenantTemplates(r.data))
      .finally(() => setTenantTemplatesLoading(false))
    api.get(`/v1/companies/${companyId}/global-templates`).then(r => setGlobalTemplates(r.data))
  }

  function loadTenantModelTemplates() {
    setTenantModelTemplatesLoading(true)
    api.get(`/v1/companies/${companyId}/tenant-model-templates`)
      .then(r => setTenantModelTemplates(r.data))
      .finally(() => setTenantModelTemplatesLoading(false))
  }

  function loadPhoneOptions() {
    api.get(`/v1/companies/${companyId}/phone-options`).then(r => {
      setPhoneOptions(r.data.phone_option_defaults || {})
      setSelectedTenantTemplateIds(r.data.selected_tenant_template_ids || [])
      setSelectedGlobalTemplateIds(r.data.selected_global_template_ids || [])
    })
  }

  async function savePhoneOptions(next) {
    setPhoneOptions(next)
    await api.put(`/v1/companies/${companyId}/phone-options`, { phone_option_defaults: next })
  }

  async function setTemplateSelection(kind, next) {
    // kind: 'tenant' ou 'global' -- remplace la liste complete, sauvegarde.
    const setter = kind === 'tenant' ? setSelectedTenantTemplateIds : setSelectedGlobalTemplateIds
    setter(next)
    const field = kind === 'tenant' ? 'selected_tenant_template_ids' : 'selected_global_template_ids'
    await api.put(`/v1/companies/${companyId}/phone-options`, { [field]: next })
  }

  // Options effectives de tout ce qui est "au-dessus" de phone_option_defaults
  // dans la chaine (TASK-S044.2) : le Global Template is_default (automatique)
  // + les Global Templates choisis en plus + les Templates de tenant choisis,
  // fusionnes dans cet ordre -- exactement ce que PhoneOptionsEditor doit
  // afficher comme "(as template)".
  const effectiveTemplateOptions = (() => {
    let merged = {}
    const defaultGlobal = globalTemplates.find(t => t.is_default)
    if (defaultGlobal) merged = { ...merged, ...defaultGlobal.options }
    for (const id of selectedGlobalTemplateIds) {
      const t = globalTemplates.find(x => x.id === id)
      if (t) merged = { ...merged, ...t.options }
    }
    for (const id of selectedTenantTemplateIds) {
      const t = tenantTemplates.find(x => x.id === id)
      if (t) merged = { ...merged, ...t.options }
    }
    return merged
  })()
  const effectiveTemplateLabel = [
    globalTemplates.find(t => t.is_default)?.name,
    ...selectedGlobalTemplateIds.map(id => globalTemplates.find(t => t.id === id)?.name),
    ...selectedTenantTemplateIds.map(id => tenantTemplates.find(t => t.id === id)?.name),
  ].filter(Boolean).join(' + ')

  // Statut en direct (registered/call_state) pousse toutes les 5s -- poll cible
  // sur ce seul endpoint (silencieux, sans spinner), pas de rechargement de toute
  // la page pour ce petit indicateur.
  useEffect(() => {
    const timer = setInterval(() => loadSipExtensions(true), 5000)
    return () => clearInterval(timer)
  }, [companyId])

  function loadPagingGroups() {
    setPagingGroupsLoading(true)
    api.get(`/v1/companies/${companyId}/paging-groups`)
      .then(r => setPagingGroups(r.data))
      .finally(() => setPagingGroupsLoading(false))
  }

  function loadButtonTemplates() {
    setButtonTemplatesLoading(true)
    api.get(`/v1/companies/${companyId}/button-templates`)
      .then(r => setButtonTemplates(r.data))
      .finally(() => setButtonTemplatesLoading(false))
  }

  function loadSipExtensions(silent) {
    if (!silent) setSipExtsLoading(true)
    api.get(`/v1/companies/${companyId}/sip-extensions`)
      .then(r => setSipExts(r.data))
      .finally(() => { if (!silent) setSipExtsLoading(false) })
  }

  function loadRingGroups() {
    setRingGroupsLoading(true)
    api.get(`/v1/companies/${companyId}/ring-groups`)
      .then(r => setRingGroups(r.data))
      .finally(() => setRingGroupsLoading(false))
  }

  function loadIvrsAndQueues() {
    api.get(`/v1/companies/${companyId}/ivrs`).then(r => setIvrs(r.data))
    api.get(`/v1/companies/${companyId}/queues`).then(r => setQueues(r.data))
  }

  async function removeDid(id) { if (!confirm('Supprimer ce DID ?')) return; await api.delete(`/v1/telephony/dids/${id}`); setDids(p => p.filter(d => d.id !== id)) }
  async function updateDidFields(id, fields) {
    const r = await api.put(`/v1/telephony/dids/${id}`, fields)
    setDids(p => p.map(d => d.id === id ? r.data : d))
  }
  const updateDidField = (id, field, value) => updateDidFields(id, { [field]: value })

  const [draggingDidId, setDraggingDidId] = useState(null)
  const [dragOverGroupKey, setDragOverGroupKey] = useState(null)

  function joinDidGroup(destination_type, destination) {
    if (!draggingDidId) return
    updateDidFields(draggingDidId, { destination_type, destination: destination || null })
  }
  function leaveDidGroup() {
    if (!draggingDidId) return
    updateDidFields(draggingDidId, { destination_type: null, destination: null })
  }
  async function removeExt(id) { if (!confirm('Supprimer cette extension ?')) return; await api.delete(`/v1/telephony/extensions/${id}`); setExts(p => p.filter(e => e.id !== id)) }

  // Active/desactive le poste reel (SIPV) quand il existe, sinon la fiche
  // ERPCRM seule -- meme principe que la case a cocher Actif d'un DID.
  async function toggleExtActive(e, checked) {
    if (e.sip) {
      await api.put(`/v1/companies/${companyId}/extensions/${e.sip.id}/active`, { is_active: checked })
      loadSipExtensions()
    } else {
      await api.put(`/v1/telephony/extensions/${e.id}`, { is_active: checked })
      setExts(p => p.map(x => x.id === e.id ? { ...x, is_active: checked } : x))
    }
  }

  // Succursale = TOUJOURS la compagnie primaire par defaut sur un DID -- Philippe
  // choisit ensuite s'il veut changer, mais un DID ne doit jamais rester sans
  // succursale assignee (sauvegarde reelle, pas juste un defaut visuel).
  const autoAssignedSiteRef = useRef(new Set())
  const primarySite = e911Addresses.find(a => a.is_primary)
  useEffect(() => {
    if (!primarySite) return
    for (const d of dids) {
      if (!d.site_id && !autoAssignedSiteRef.current.has(d.id)) {
        autoAssignedSiteRef.current.add(d.id)
        updateDidFields(d.id, { site_id: primarySite.id })
      }
    }
  }, [dids, primarySite])

  if (loading) return <div className="loading">Chargement...</div>

  // Fusionne les extensions ERPCRM (fiches DID/messagerie) et les postes SIPV reels
  // (statut/IP en direct), matches par numero de poste. La plupart des postes n'ont
  // pas de fiche ERPCRM correspondante (jamais creee) — SIPV est la source de verite
  // pour l'existence du poste, ERPCRM ajoute juste le DID/messagerie/suppression si presents.
  const mergedExtensions = (() => {
    const byExt = new Map()
    for (const e of exts) byExt.set(e.extension, { ...e, erpcrm: true, sip: sipExts.find(se => se.extension === e.extension) })
    for (const se of sipExts) {
      if (!byExt.has(se.extension)) byExt.set(se.extension, { id: `sip-${se.id}`, extension: se.extension, name: se.name, is_active: se.is_active, did_number: null, voicemail_email: null, erpcrm: false, sip: se })
    }
    return [...byExt.values()].sort((a, b) => a.extension.localeCompare(b.extension, undefined, { numeric: true }))
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* DIDs */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Numéros DID ({dids.length})</div>
          <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setShowNewDid(true)}>+ Ajouter</button>
        </div>
        {dids.length === 0 ? <div className="empty-tab">Aucun DID enregistré.</div> : (() => {
          // Groupe = DID qui partagent Destination/Horaire/Succursale. Ces 3
          // colonnes ne s'affichent qu'une fois par groupe (rowSpan, centre),
          // avec les valeurs de celui qui recoit -- pas dupliquees par DID.
          const groupMap = new Map()
          for (const d of dids) {
            const key = d.destination_type && d.destination ? `${d.destination_type}|${d.destination}` : `solo:${d.id}`
            if (!groupMap.has(key)) groupMap.set(key, [])
            groupMap.get(key).push(d)
          }
          const groups = [...groupMap.values()]

          function updateGroupFields(groupDids, fields) {
            for (const d of groupDids) updateDidFields(d.id, fields)
          }

          const destinationOptions = type => destinationSelectOptions(type, { mergedExtensions, ringGroups, ivrs, queues })

          function onDropOnRow(targetGroupDids) {
            if (!draggingDidId) return
            if (targetGroupDids.some(d => d.id === draggingDidId)) return
            const head = targetGroupDids[0]
            // Meme si le DID receveur n'a pas encore de destination, on en cree
            // une par defaut pour que le groupe se forme visuellement tout de
            // suite -- sinon glisser sur un DID vide ne fait "rien voir".
            const destination_type = head.destination_type || 'extension'
            const destination = head.destination || null
            updateDidFields(draggingDidId, { destination_type, destination })
            if (!head.destination_type) updateDidFields(head.id, { destination_type, destination })
          }

          return (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#F9FAFB' }}>
                  {['','Numéro','Note','Destination','Horaire','Succursale','Actif',''].map((h, i) => (
                    <th key={i} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid #E5E7EB', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map(groupDids => {
                  const head = groupDids[0]
                  const n = groupDids.length
                  return groupDids.map((d, i) => (
                    <tr key={d.id}
                      onDragOver={e => { if (draggingDidId && !groupDids.some(x => x.id === draggingDidId)) { e.preventDefault(); setDragOverGroupKey(head.id) } }}
                      onDragLeave={() => setDragOverGroupKey(k => k === head.id ? null : k)}
                      onDrop={e => { e.preventDefault(); onDropOnRow(groupDids); setDragOverGroupKey(null) }}
                      style={{
                        borderBottom: i === n - 1 ? '1px solid #E5E7EB' : 'none',
                        opacity: draggingDidId === d.id ? 0.4 : 1,
                        background: dragOverGroupKey === head.id ? '#DBEAFE' : undefined,
                      }}>
                      <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                        <span draggable title="Glisser sur un autre DID pour le grouper"
                          onDragStart={e => {
                            e.dataTransfer.effectAllowed = 'move'
                            e.dataTransfer.setData('text/plain', d.id)
                            setDraggingDidId(d.id)
                          }}
                          onDragEnd={() => { setDraggingDidId(null); setDragOverGroupKey(null) }}
                          style={{ cursor: 'grab', color: '#9CA3AF', fontSize: 14, userSelect: 'none' }}>⠿</span>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <input type="text" defaultValue={d.number} style={{ fontSize: 12, padding: '3px 6px', width: 100, fontWeight: 700, fontFamily: 'monospace' }}
                          onBlur={e => e.target.value.trim() && updateDidField(d.id, 'number', e.target.value.trim())} />
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <input type="text" defaultValue={d.notes || ''} placeholder="Principal, fax, # privé..."
                          style={{ fontSize: 12, padding: '3px 6px', width: 110 }}
                          onBlur={e => updateDidField(d.id, 'notes', e.target.value || null)} />
                      </td>
                      {i === 0 && (
                        <td rowSpan={n} style={{ padding: '8px 12px', verticalAlign: 'middle', borderLeft: n > 1 ? '2px solid #DBEAFE' : undefined }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <select value={head.destination_type || ''} style={{ fontSize: 12, padding: '3px 4px' }}
                                onChange={e => updateGroupFields(groupDids, { destination_type: e.target.value || null, destination: null, after_message_destination_type: null, after_message_destination: null })}>
                                {DID_DESTINATION_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                              {head.destination_type === 'message' ? (
                                <select value={head.destination || ''} style={{ fontSize: 12, padding: '3px 4px', width: 130 }}
                                  onChange={e => updateGroupFields(groupDids, { destination: e.target.value || null })}>
                                  <option value="">— Choisir une phrase —</option>
                                  {prompts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                              ) : head.destination_type && (() => {
                                const opts = destinationOptions(head.destination_type)
                                return opts ? (
                                  <select value={head.destination || ''} style={{ fontSize: 12, padding: '3px 4px', width: 130 }}
                                    onChange={e => updateGroupFields(groupDids, { destination: e.target.value || null })}>
                                    <option value="">— Choisir —</option>
                                    {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                  </select>
                                ) : (
                                  <input type="text" defaultValue={head.destination || ''} placeholder="valeur"
                                    style={{ fontSize: 12, padding: '3px 6px', width: 90 }}
                                    onBlur={e => updateGroupFields(groupDids, { destination: e.target.value || null })} />
                                )
                              })()}
                            </div>
                            {head.destination_type === 'message' && (
                              head.after_message_destination_type ? (
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                  <span style={{ fontSize: 10, color: '#6B7280' }}>puis</span>
                                  <select value={head.after_message_destination_type} style={{ fontSize: 12, padding: '3px 4px' }}
                                    onChange={e => updateGroupFields(groupDids, { after_message_destination_type: e.target.value || null, after_message_destination: null })}>
                                    {DID_DESTINATION_TYPES.filter(o => o.value && o.value !== 'message').map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                  </select>
                                  {(() => {
                                    const opts = destinationOptions(head.after_message_destination_type)
                                    return opts ? (
                                      <select value={head.after_message_destination || ''} style={{ fontSize: 12, padding: '3px 4px', width: 110 }}
                                        onChange={e => updateGroupFields(groupDids, { after_message_destination: e.target.value || null })}>
                                        <option value="">— Choisir —</option>
                                        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                      </select>
                                    ) : (
                                      <input type="text" defaultValue={head.after_message_destination || ''} placeholder="valeur"
                                        style={{ fontSize: 12, padding: '3px 6px', width: 80 }}
                                        onBlur={e => updateGroupFields(groupDids, { after_message_destination: e.target.value || null })} />
                                    )
                                  })()}
                                  <button type="button" title="Retirer la 2e destination (raccrocher après le message)"
                                    onClick={() => updateGroupFields(groupDids, { after_message_destination_type: null, after_message_destination: null })}
                                    style={{ fontSize: 11, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                                </div>
                              ) : (
                                <button type="button"
                                  onClick={() => updateGroupFields(groupDids, { after_message_destination_type: 'extension' })}
                                  style={{ fontSize: 11, color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                                  + Ajouter une destination
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      )}
                      {i === 0 && (
                        <td rowSpan={n} style={{ padding: '8px 12px', verticalAlign: 'middle' }}>
                          <select value={head.schedule_id || ''} style={{ fontSize: 12, padding: '3px 4px' }}
                            onChange={e => e.target.value === '__new__' ? setShowNewSchedule(true) : updateGroupFields(groupDids, { schedule_id: e.target.value || null })}>
                            <option value="">— Aucun —</option>
                            {schedules.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            <option value="__new__">+ Nouvel horaire...</option>
                          </select>
                        </td>
                      )}
                      {i === 0 && (
                        <td rowSpan={n} style={{ padding: '8px 12px', verticalAlign: 'middle' }}>
                          <select value={head.site_id || primarySite?.id || ''} style={{ fontSize: 12, padding: '3px 4px' }}
                            onChange={e => updateGroupFields(groupDids, { site_id: e.target.value || null })}>
                            {!primarySite && <option value="">— Aucune —</option>}
                            {e911Addresses.filter(a => a.is_active).map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                          </select>
                        </td>
                      )}
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <input type="checkbox" checked={d.is_active} onChange={e => updateDidField(d.id, 'is_active', e.target.checked)}
                          style={{ width: 15, height: 15, accentColor: 'var(--brand)', cursor: 'pointer' }} />
                      </td>
                      <td style={{ padding: '8px 12px' }}><button className="inv-del-btn" onClick={() => removeDid(d.id)}>✕</button></td>
                    </tr>
                  ))
                })}
                {draggingDidId && (
                  <tr
                    onDragOver={e => { e.preventDefault(); setDragOverGroupKey('__leave__') }}
                    onDragLeave={() => setDragOverGroupKey(k => k === '__leave__' ? null : k)}
                    onDrop={e => { e.preventDefault(); leaveDidGroup(); setDragOverGroupKey(null) }}
                    style={{ background: dragOverGroupKey === '__leave__' ? '#FEF2F2' : '#FAFAFA' }}>
                    <td colSpan={8} style={{
                      padding: '8px 12px', textAlign: 'center', fontSize: 11,
                      color: dragOverGroupKey === '__leave__' ? '#DC2626' : '#9CA3AF',
                    }}>
                      Déposer ici pour retirer ce DID de son groupe
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )
        })()}
      </div>

      <SchedulesSection companyId={companyId} schedules={schedules} onRefresh={loadSchedules}
        mergedExtensions={mergedExtensions} ringGroups={ringGroups} ivrs={ivrs} queues={queues} />

      <MohSelectionSection companyId={companyId} sipvEnabled={sipvEnabled} sipExts={sipExts} />

      <PromptsSection companyId={companyId} prompts={prompts} sipExts={sipExts} onRefresh={loadPrompts} />

      {/* Extensions */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Extensions ({mergedExtensions.length})
            {sipExtsLoading && <span style={{ fontSize: 11, fontWeight: 400, color: '#9CA3AF', marginLeft: 8 }}>chargement statut SIP...</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={loadSipExtensions}>↻ Statut SIP</button>
            <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setShowNewExt(true)}>+ Ajouter</button>
          </div>
        </div>
        {mergedExtensions.length === 0 ? <div className="empty-tab">Aucune extension enregistrée.</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#F9FAFB' }}>
                {['','Ext.','Nom','DID associé','Messagerie','Renvoi/DND','IP publique','IP privée','Actif',''].map((h, i) => (
                  <th key={i} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid #E5E7EB', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mergedExtensions.map(e => {
                const sip = e.sip
                const contactId = sip?.erpcrm_contact_id
                return (
                  <tr key={e.id} onClick={() => contactId && navigate(`/contacts/${contactId}?fromCompanyId=${companyId}&fromCompanyName=${encodeURIComponent(companyName || '')}&fromTab=telephonie`)}
                    title={contactId ? 'Ouvrir la fiche contact' : 'Aucun contact lié à ce poste'}
                    style={{ borderBottom: '1px solid #F3F4F6', cursor: contactId ? 'pointer' : 'default' }}>
                    <td style={{ padding: '10px 12px' }}>
                      {sip ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span title={sip.registered ? 'En ligne (enregistré)' : 'Hors ligne'} style={{
                            display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                            background: sip.registered ? '#22C55E' : '#EF4444',
                          }} />
                          {sip.call_state === 'active' && <span title="En ligne (appel en cours)" style={{ color: '#DC2626' }}>📞</span>}
                          {sip.call_state === 'ringing' && <span title="Sonne" style={{ color: '#D97706' }}>🔔</span>}
                        </span>
                      ) : (
                        <span title="Pas de poste SIPV" style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#D1D5DB' }} />
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 700, fontFamily: 'monospace' }}>{e.extension}</td>
                    <td style={{ padding: '10px 12px' }}>{e.name}</td>
                    <td style={{ padding: '10px 12px', color: '#6B7280', fontFamily: 'monospace', fontSize: 12 }}>{e.did_number || '—'}</td>
                    <td style={{ padding: '10px 12px', color: '#6B7280', fontSize: 12 }}>{e.voicemail_email || '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: 11 }}>
                      {sip?.dnd_enabled && <span style={{ background: '#FEE2E2', color: '#B91C1C', borderRadius: 4, padding: '2px 6px', fontWeight: 600, marginRight: 4 }}>DND</span>}
                      {sip && ['forward_immediate_enabled', 'forward_busy_enabled', 'forward_no_answer_enabled', 'forward_offline_enabled'].some(k => sip[k]) && (
                        <span style={{ background: '#FEF3C7', color: '#92400E', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>Renvoi</span>
                      )}
                      {!sip?.dnd_enabled && !(sip && ['forward_immediate_enabled', 'forward_busy_enabled', 'forward_no_answer_enabled', 'forward_offline_enabled'].some(k => sip[k])) && '—'}
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12 }}>{sip?.public_ip || '—'}</td>
                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12 }}>
                      {sip?.private_ip || '—'}
                      {sip?.registered && sip.public_ip && sip.private_ip && sip.public_ip === sip.private_ip && (
                        <span title="IP publique = IP privée : SIP ALG actif ou double NAT chez le client" style={{ marginLeft: 6, color: '#D97706', fontWeight: 700 }}>⚠</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }} onClick={ev => ev.stopPropagation()}>
                      <input type="checkbox" checked={sip ? sip.is_active : e.is_active}
                        onChange={ev => toggleExtActive(e, ev.target.checked)}
                        style={{ width: 15, height: 15, accentColor: 'var(--brand)', cursor: 'pointer' }} />
                    </td>
                    <td style={{ padding: '10px 12px' }}>{e.erpcrm && <button className="inv-del-btn" onClick={(ev) => { ev.stopPropagation(); removeExt(e.id) }}>✕</button>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <ButtonTemplatesSection companyId={companyId} templates={buttonTemplates} templatesLoading={buttonTemplatesLoading}
        sipExts={sipExts} onRefresh={loadButtonTemplates} />

      <RingGroupsSection companyId={companyId} ringGroups={ringGroups} ringGroupsLoading={ringGroupsLoading}
        sipExts={sipExts} onRefresh={loadRingGroups} />

      <PickupGroupSection companyId={companyId} sipExts={sipExts} onRefresh={loadSipExtensions} />

      <PagingGroupsSection companyId={companyId} pagingGroups={pagingGroups} pagingGroupsLoading={pagingGroupsLoading}
        sipExts={sipExts} onRefresh={loadPagingGroups} />

      <div style={{ marginTop: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
          Options téléphonie (défaut compagnie)
        </div>
        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
          La bibliothèque de templates se gère dans "Serveur". On peut en choisir PLUSIEURS en même temps (ex. un "défaut" + un "oreillette" + un "boutons de park") — ils se combinent. Ceux cochés remplissent les options ci-dessous ("as template") ; cliquer une option la personnalise pour cette compagnie seulement.
        </div>
        {globalTemplates.filter(t => !t.is_default).length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
              Global Templates supplémentaires
              {globalTemplates.find(t => t.is_default) && (
                <span style={{ fontWeight: 400, color: '#6B7280' }}> — "{globalTemplates.find(t => t.is_default).name}" déjà appliqué automatiquement (Défaut)</span>
              )}
            </div>
            <TemplateDropdownChain options={globalTemplates.filter(t => !t.is_default)}
              selectedIds={selectedGlobalTemplateIds} onChange={next => setTemplateSelection('global', next)} />
          </div>
        )}
        {tenantTemplates.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Templates de tenant</div>
            <TemplateDropdownChain options={tenantTemplates}
              selectedIds={selectedTenantTemplateIds} onChange={next => setTemplateSelection('tenant', next)} />
          </div>
        )}
        <PhoneOptionsEditor title="" value={phoneOptions} onChange={savePhoneOptions}
          templateOptions={effectiveTemplateOptions}
          templateLabel={effectiveTemplateLabel} />
      </div>

      <TenantModelTemplatesSection companyId={companyId} templates={tenantModelTemplates} loading={tenantModelTemplatesLoading}
        phoneModels={phoneModels} onRefresh={loadTenantModelTemplates} />

      <CdrSection companyId={companyId} sipExts={sipExts} />

      <TrunkSection companyId={companyId} />

      {showNewDid && (
        <NewDIDModal companyId={companyId} onClose={() => setShowNewDid(false)}
          onCreated={d => { setDids(p => [...p, d]); setShowNewDid(false) }} />
      )}
      {showNewExt && (
        <NewExtModal companyId={companyId} dids={dids} onClose={() => setShowNewExt(false)}
          onCreated={e => { setExts(p => [...p, e]); setShowNewExt(false) }} />
      )}
      {showNewSchedule && (
        <NewScheduleModal companyId={companyId} mergedExtensions={mergedExtensions} ringGroups={ringGroups} ivrs={ivrs} queues={queues}
          onClose={() => setShowNewSchedule(false)}
          onCreated={s => { setSchedules(p => [...p, s]); setShowNewSchedule(false) }} />
      )}
    </div>
  )
}

// ── CDR (TASK-032) -- historique d'appels de toute la compagnie, filtre optionnel par poste.
function CdrSection({ companyId, sipExts }) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [extFilter, setExtFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const pageSize = 25

  useEffect(() => { load() }, [companyId, page, extFilter])

  function load() {
    setLoading(true)
    api.get(`/v1/telephony/company/${companyId}/cdr`, { params: { page, page_size: pageSize, extension: extFilter || undefined } })
      .then(r => { setItems(r.data.items); setTotal(r.data.total) })
      .finally(() => setLoading(false))
  }

  function fmtDuration(s) {
    if (s === null || s === undefined) return ''
    const m = Math.floor(s / 60), sec = s % 60
    return `${m}:${String(sec).padStart(2, '0')}`
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Historique d'appels ({total})
        </div>
        <select value={extFilter} onChange={e => { setPage(1); setExtFilter(e.target.value) }} style={{ fontSize: 12, padding: '4px 8px' }}>
          <option value="">Tous les postes</option>
          {sipExts.map(e => <option key={e.id} value={e.extension}>{e.extension} — {e.name}</option>)}
        </select>
      </div>
      {!loading && items.length === 0 ? (
        <div className="empty-tab">Aucun appel enregistré.</div>
      ) : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#F9FAFB' }}>
                {['Date', 'De', 'Vers', 'Direction', 'Durée', 'Statut'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid #E5E7EB', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '8px 12px' }}>{c.start_time ? new Date(c.start_time).toLocaleString('fr-CA') : ''}</td>
                  <td style={{ padding: '8px 12px' }}>{c.src || ''}</td>
                  <td style={{ padding: '8px 12px' }}>{c.dst || ''}</td>
                  <td style={{ padding: '8px 12px' }}>{c.direction === 'inbound' ? 'Entrant' : c.direction === 'outbound' ? 'Sortant' : (c.direction || '')}</td>
                  <td style={{ padding: '8px 12px' }}>{fmtDuration(c.billsec)}</td>
                  <td style={{ padding: '8px 12px' }}>{c.disposition || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 10, alignItems: 'center' }}>
            <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Précédent</button>
            <span style={{ fontSize: 12, color: '#6B7280' }}>Page {page} / {totalPages}</span>
            <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Suivant →</button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Trunk (TASK-S018.2, fiche trunk unifiée) -- carrier, credentials, failover,
// statut live (ESL), routes utilisant ce trunk. Le fichier gateway FreeSWITCH
// lui-même reste écrit à la main sur le serveur (pas généré depuis cette table,
// voir TASK-023.27) -- freeswitch_synced=false est affiché comme un avertissement
// honnête plutôt que caché, pour ne pas laisser croire qu'une modification ici
// prend effet automatiquement sur le trunk réel.
const emptyTrunkForm = { name: '', carrier_name: '', host: '', username: '', password: '', from_domain: '', caller_id: '', failover_trunk_id: '' }

function TrunkSection({ companyId }) {
  const [trunks, setTrunks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState(emptyTrunkForm)
  const [expanded, setExpanded] = useState(null)
  const [status, setStatus] = useState({})
  const [routes, setRoutes] = useState({})

  function load() {
    setLoading(true)
    api.get(`/v1/telephony/company/${companyId}/trunks`).then(r => setTrunks(r.data)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [companyId])

  async function createTrunk() {
    if (!newForm.name.trim() || !newForm.carrier_name.trim() || !newForm.host.trim()) return
    const payload = { ...newForm }
    if (!payload.password) delete payload.password
    if (!payload.failover_trunk_id) delete payload.failover_trunk_id
    await api.post(`/v1/telephony/company/${companyId}/trunks`, payload)
    setNewForm(emptyTrunkForm); setShowNew(false); load()
  }
  async function updateTrunk(id, patch) {
    await api.put(`/v1/telephony/trunks/${id}`, patch)
    load()
  }
  async function removeTrunk(id) {
    if (!confirm('Supprimer ce trunk ? Les routes qui l\'utilisent devront être réassignées.')) return
    await api.delete(`/v1/telephony/trunks/${id}`)
    load()
  }
  function toggleExpand(id) {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    if (!status[id]) {
      api.get(`/v1/telephony/trunks/${id}/status`).then(r => setStatus(p => ({ ...p, [id]: r.data })))
    }
    if (!routes[id]) {
      api.get(`/v1/telephony/trunks/${id}/routes`).then(r => setRoutes(p => ({ ...p, [id]: r.data })))
    }
  }

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Trunks ({trunks.length})
        </div>
        <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setShowNew(v => !v)}>+ Ajouter</button>
      </div>
      {showNew && (
        <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: 12, marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
          <div className="form-group"><label>Nom</label><input value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} autoFocus /></div>
          <div className="form-group"><label>Carrier</label><input value={newForm.carrier_name} onChange={e => setNewForm(f => ({ ...f, carrier_name: e.target.value }))} /></div>
          <div className="form-group"><label>Host</label><input value={newForm.host} onChange={e => setNewForm(f => ({ ...f, host: e.target.value }))} placeholder="ex: vgw1.provider.com" /></div>
          <div className="form-group"><label>Username</label><input value={newForm.username} onChange={e => setNewForm(f => ({ ...f, username: e.target.value }))} /></div>
          <div className="form-group"><label>Password</label><input type="password" value={newForm.password} onChange={e => setNewForm(f => ({ ...f, password: e.target.value }))} /></div>
          <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={createTrunk}>Créer</button>
        </div>
      )}
      {loading ? <div style={{ fontSize: 13, color: '#6B7280' }}>Chargement...</div> : trunks.length === 0 ? (
        <div className="empty-tab">Aucun trunk configuré.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#F9FAFB' }}>
              {['Nom', 'Carrier', 'Host', 'Synchronisé', 'Actif', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid #E5E7EB', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trunks.map(t => (
              <Fragment key={t.id}>
                <tr style={{ borderBottom: '1px solid #F3F4F6', cursor: 'pointer' }} onClick={() => toggleExpand(t.id)}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{t.name}</td>
                  <td style={{ padding: '10px 12px' }}>{t.carrier_name}</td>
                  <td style={{ padding: '10px 12px' }}>{t.host}</td>
                  <td style={{ padding: '10px 12px' }}>
                    {t.freeswitch_synced ? (
                      <span style={{ fontSize: 11, color: '#166534' }}>✓ synchronisé</span>
                    ) : (
                      <span title="Modifié dans SIPV mais pas encore redéployé sur le gateway FreeSWITCH réel (fichier serveur, manuel)" style={{ fontSize: 11, color: '#B45309' }}>⚠ non synchronisé</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <input type="checkbox" checked={t.is_active} onClick={e => e.stopPropagation()} onChange={e => updateTrunk(t.id, { is_active: e.target.checked })} />
                  </td>
                  <td style={{ padding: '10px 12px' }}><button className="inv-del-btn" onClick={e => { e.stopPropagation(); removeTrunk(t.id) }}>✕</button></td>
                </tr>
                {expanded === t.id && (
                  <tr>
                    <td colSpan={6} style={{ padding: '10px 20px', background: '#F9FAFB' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Statut live (gateway FreeSWITCH)</div>
                      {!status[t.id] ? (
                        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 14 }}>Chargement...</div>
                      ) : !status[t.id].configured ? (
                        <div style={{ fontSize: 12, color: '#B45309', marginBottom: 14 }}>Gateway pas encore déployé sur FreeSWITCH ({status[t.id].error})</div>
                      ) : (
                        <div style={{ fontSize: 12, marginBottom: 14 }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                            background: status[t.id].status === 'UP' ? '#DCFCE7' : '#FEE2E2',
                            color: status[t.id].status === 'UP' ? '#166534' : '#991B1B',
                          }}>{status[t.id].status || '?'}</span>
                          <span style={{ marginLeft: 8, color: '#6B7280' }}>État : {status[t.id].state || '?'} — {status[t.id].gateway_name}</span>
                        </div>
                      )}

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                        <div className="form-group" style={{ maxWidth: 220 }}>
                          <label>Nom</label>
                          <input defaultValue={t.name} onBlur={e => { const v = e.target.value.trim(); if (v && v !== t.name) updateTrunk(t.id, { name: v }) }} />
                        </div>
                        <div className="form-group" style={{ maxWidth: 220 }}>
                          <label>Carrier</label>
                          <input defaultValue={t.carrier_name} onBlur={e => { const v = e.target.value.trim(); if (v && v !== t.carrier_name) updateTrunk(t.id, { carrier_name: v }) }} />
                        </div>
                        <div className="form-group" style={{ maxWidth: 260 }}>
                          <label>Host</label>
                          <input defaultValue={t.host} onBlur={e => { const v = e.target.value.trim(); if (v && v !== t.host) updateTrunk(t.id, { host: v }) }} />
                        </div>
                        <div className="form-group" style={{ maxWidth: 200 }}>
                          <label>Username</label>
                          <input defaultValue={t.username || ''} onBlur={e => { const v = e.target.value.trim(); if (v !== (t.username || '')) updateTrunk(t.id, { username: v || null }) }} />
                        </div>
                        <div className="form-group" style={{ maxWidth: 200 }}>
                          <label>Password {t.has_password && <span style={{ color: '#6B7280', fontWeight: 400 }}>(déjà défini)</span>}</label>
                          <input type="password" placeholder="Laisser vide pour ne pas changer" onBlur={e => { const v = e.target.value; if (v) updateTrunk(t.id, { password: v }) }} />
                        </div>
                        <div className="form-group" style={{ maxWidth: 200 }}>
                          <label>Caller ID sortant</label>
                          <input defaultValue={t.caller_id || ''} onBlur={e => { const v = e.target.value.trim(); if (v !== (t.caller_id || '')) updateTrunk(t.id, { caller_id: v || null }) }} />
                        </div>
                        <div className="form-group" style={{ maxWidth: 220 }}>
                          <label>Trunk de failover</label>
                          <select value={t.failover_trunk_id || ''} onChange={e => updateTrunk(t.id, { failover_trunk_id: e.target.value || null })}>
                            <option value="">— Aucun —</option>
                            {trunks.filter(o => o.id !== t.id).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                          </select>
                        </div>
                      </div>

                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Routes sortantes utilisant ce trunk</div>
                      {!routes[t.id] ? (
                        <div style={{ fontSize: 12, color: '#6B7280' }}>Chargement...</div>
                      ) : routes[t.id].length === 0 ? (
                        <div style={{ fontSize: 12, color: '#6B7280' }}>Aucune route n'utilise ce trunk.</div>
                      ) : (
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                          {routes[t.id].map(r => (
                            <li key={r.id}>{r.name} — <code>{r.dial_patterns}</code>{!r.is_active && ' (inactif)'}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── Horaires (Schedule, Time Condition UCM-style) -- un DID peut pointer vers
// un horaire au lieu de dupliquer le DID par plage horaire (TASK-S016/S010.7).
// Chaque plage a sa propre destination (matin -> IVR, diner -> ring group
// cafeteria, etc., demande Philippe 2026-08-07) -- meme catalogue que la
// Destination d'un DID (DID_DESTINATION_TYPES / destinationSelectOptions).
const PLAGE_DAYS = [{ v: 0, l: 'Lu' }, { v: 1, l: 'Ma' }, { v: 2, l: 'Me' }, { v: 3, l: 'Je' }, { v: 4, l: 'Ve' }, { v: 5, l: 'Sa' }, { v: 6, l: 'Di' }]

function PlageFields({ rule, onPatch, onRemove, destCtx }) {
  const opts = destinationSelectOptions(rule.destination_type, destCtx)
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 6, padding: '6px 8px' }}>
      <div style={{ display: 'flex', gap: 2 }}>
        {PLAGE_DAYS.map(d => {
          const on = rule.days_of_week.includes(d.v)
          return (
            <button key={d.v} type="button"
              onClick={() => onPatch({ days_of_week: on ? rule.days_of_week.filter(x => x !== d.v) : [...rule.days_of_week, d.v].sort() })}
              style={{
                fontSize: 10, padding: '2px 5px', borderRadius: 4, border: '1px solid ' + (on ? 'var(--brand)' : '#D1D5DB'),
                background: on ? 'var(--brand)' : '#fff', color: on ? '#fff' : '#6B7280', cursor: 'pointer',
              }}>{d.l}</button>
          )
        })}
      </div>
      <input type="time" value={rule.open_time} onChange={e => onPatch({ open_time: e.target.value })} style={{ fontSize: 12, padding: '3px 4px', width: 90 }} />
      <span style={{ fontSize: 11, color: '#9CA3AF' }}>à</span>
      <input type="time" value={rule.close_time} onChange={e => onPatch({ close_time: e.target.value })} style={{ fontSize: 12, padding: '3px 4px', width: 90 }} />
      <select value={rule.destination_type || ''} onChange={e => onPatch({ destination_type: e.target.value || null, destination: null })} style={{ fontSize: 12, padding: '3px 4px' }}>
        {DID_DESTINATION_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {rule.destination_type && (opts ? (
        <select value={rule.destination || ''} onChange={e => onPatch({ destination: e.target.value || null })} style={{ fontSize: 12, padding: '3px 4px', width: 130 }}>
          <option value="">— Choisir —</option>
          {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input value={rule.destination || ''} onChange={e => onPatch({ destination: e.target.value || null })} placeholder="valeur" style={{ fontSize: 12, padding: '3px 6px', width: 90 }} />
      ))}
      {onRemove && <button type="button" className="inv-del-btn" onClick={onRemove}>✕</button>}
    </div>
  )
}

function emptyPlage() {
  return { days_of_week: [0, 1, 2, 3, 4], open_time: '09:00', close_time: '17:00', destination_type: null, destination: null }
}

function NewScheduleModal({ companyId, onClose, onCreated, mergedExtensions, ringGroups, ivrs, queues }) {
  const destCtx = { mergedExtensions, ringGroups, ivrs, queues }
  const [form, setForm] = useState({
    name: '', closed_destination_type: 'voicemail', closed_destination: '', rules: [emptyPlage()],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function patchPlage(idx, patch) {
    setForm(p => ({ ...p, rules: p.rules.map((r, i) => i === idx ? { ...r, ...patch } : r) }))
  }

  async function save() {
    if (!form.name.trim()) { setError('Nom requis'); return }
    if (form.rules.some(r => r.days_of_week.length === 0)) { setError('Chaque plage doit avoir au moins un jour'); return }
    setError('')
    setSaving(true)
    try {
      const r = await api.post(`/v1/telephony/company/${companyId}/schedules`, {
        name: form.name,
        closed_destination_type: form.closed_destination_type || null,
        closed_destination: form.closed_destination_type && form.closed_destination_type !== 'hangup' ? (form.closed_destination || null) : null,
        rules: form.rules,
      })
      onCreated(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Erreur lors de la création')
    } finally { setSaving(false) }
  }

  const closedOpts = destinationSelectOptions(form.closed_destination_type, destCtx)

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 640 }} onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Nouvel horaire</h3>
        {error && <div className="form-error">{error}</div>}
        <div className="form-group"><label>Nom *</label><input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Heures d'ouverture" autoFocus /></div>

        <div className="form-group">
          <label>Plages horaires</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {form.rules.map((r, idx) => (
              <PlageFields key={idx} rule={r} destCtx={destCtx}
                onPatch={patch => patchPlage(idx, patch)}
                onRemove={() => setForm(p => ({ ...p, rules: p.rules.filter((_, i) => i !== idx) }))} />
            ))}
          </div>
          <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px', marginTop: 6 }}
            onClick={() => setForm(p => ({ ...p, rules: [...p.rules, emptyPlage()] }))}>+ Ajouter une plage</button>
        </div>

        <div className="form-group"><label>Si aucune plage ne s'applique, envoyer vers</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={form.closed_destination_type || ''} onChange={e => setForm(p => ({ ...p, closed_destination_type: e.target.value || null, closed_destination: '' }))}>
              {DID_DESTINATION_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {form.closed_destination_type && form.closed_destination_type !== 'hangup' && (closedOpts ? (
              <select value={form.closed_destination} onChange={e => setForm(p => ({ ...p, closed_destination: e.target.value }))}>
                <option value="">— Choisir —</option>
                {closedOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input value={form.closed_destination} onChange={e => setForm(p => ({ ...p, closed_destination: e.target.value }))} placeholder="poste ou numéro" />
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? '...' : 'Créer'}</button>
        </div>
      </div>
    </div>
  )
}

// Liste/gestion des horaires deja crees -- toujours re-editable (jamais
// create-only) : ajouter/retirer une plage, changer sa destination, le
// fallback "ferme", ou desactiver/supprimer l'horaire au complet.
// TASK-S033 : MOH dédiée à cette compagnie -- choix PARMI la bibliothèque
// (globaux gérés dans "Serveur" + fichiers assignés spécifiquement à ce
// tenant), sélection multiple et ordonnée (mod_local_stream lit dans l'ordre
// choisi ici, shuffle côté FreeSWITCH). Upload direct possible ici aussi
// (TASK-S033.1) -- associé automatiquement au tenant de cette compagnie, pas
// besoin de choisir la compagnie dans un menu comme dans "Serveur".
function MohSelectionSection({ companyId, sipvEnabled, sipExts }) {
  const [available, setAvailable] = useState([])
  const [selection, setSelection] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadForm, setUploadForm] = useState({ name: '', file: null })
  const [uploading, setUploading] = useState(false)
  const [uploadOk, setUploadOk] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [fileInputKey, setFileInputKey] = useState(0)
  const [callFor, setCallFor] = useState(null)
  const [callExtId, setCallExtId] = useState('')
  const [calling, setCalling] = useState(false)
  const [callMsgOk, setCallMsgOk] = useState('')
  const [callMsgError, setCallMsgError] = useState('')
  const [shuffle, setShuffle] = useState(true)
  const [shuffleSaving, setShuffleSaving] = useState(false)
  const availableExts = (sipExts || []).filter(e => e.is_active && e.registered)

  function load() {
    if (!sipvEnabled) { setLoading(false); return }
    setLoading(true)
    Promise.all([
      api.get(`/v1/companies/${companyId}/moh/available`),
      api.get(`/v1/companies/${companyId}/moh/selection`),
      api.get(`/v1/companies/${companyId}/phone-options`),
    ]).then(([a, s, o]) => { setAvailable(a.data); setSelection(s.data); setShuffle(o.data.moh_shuffle !== false) }).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [companyId, sipvEnabled])

  async function setShuffleMode(next) {
    setShuffle(next)
    setShuffleSaving(true)
    try {
      await api.put(`/v1/companies/${companyId}/phone-options`, { moh_shuffle: next })
    } finally {
      setShuffleSaving(false)
    }
  }

  async function uploadFile() {
    if (!uploadForm.name.trim() || !uploadForm.file) return
    setUploading(true)
    setUploadOk(false)
    setUploadError('')
    try {
      const fd = new FormData()
      fd.append('name', uploadForm.name.trim())
      fd.append('file', uploadForm.file)
      await api.post(`/v1/companies/${companyId}/moh`, fd)
      setUploadForm({ name: '', file: null })
      setFileInputKey(k => k + 1)
      setUploadOk(true)
      setTimeout(() => setUploadOk(false), 4000)
      load()
    } catch (e) {
      setUploadError(e.response?.data?.detail || "Échec de l'envoi")
    } finally {
      setUploading(false)
    }
  }

  async function downloadFile(f) {
    const r = await api.get(`/v1/server/moh/${f.id}/file`, { responseType: 'blob' })
    const url = window.URL.createObjectURL(r.data)
    const a = document.createElement('a')
    a.href = url
    a.download = `${f.name}.wav`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  async function deleteFile(f) {
    if (!confirm(`Supprimer définitivement le fichier MOH "${f.name}" ? Cette action est irréversible.`)) return
    await api.delete(`/v1/server/moh/${f.id}`)
    load()
  }

  async function toggleActive(f) {
    await api.put(`/v1/server/moh/${f.id}`, { is_active: !f.is_active })
    load()
  }

  async function callToListen(f) {
    if (!callExtId) return
    setCalling(true)
    try {
      await api.post(`/v1/server/moh/${f.id}/call`, { extension_id: callExtId })
      setCallMsgOk('✓ Appel lancé — décrochez le poste')
      setCallMsgError('')
      setTimeout(() => setCallMsgOk(''), 4000)
      setCallFor(null)
      setCallExtId('')
    } catch (e) {
      setCallMsgError(e.response?.data?.detail || "Échec de l'appel")
      setCallMsgOk('')
    } finally {
      setCalling(false)
    }
  }

  async function persist(next) {
    setSelection(next)
    setSaving(true)
    try {
      await api.put(`/v1/companies/${companyId}/moh/selection`,
        next.map((s, i) => ({ moh_file_id: s.moh_file_id, sort_order: i })))
    } finally {
      setSaving(false)
    }
  }

  function toggle(file) {
    const isSelected = selection.some(s => s.moh_file_id === file.id)
    if (isSelected) {
      persist(selection.filter(s => s.moh_file_id !== file.id))
    } else {
      persist([...selection, { moh_file_id: file.id, name: file.name, sort_order: selection.length }])
    }
  }

  function move(index, dir) {
    const next = [...selection]
    const j = index + dir
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j], next[index]]
    persist(next)
  }

  if (!sipvEnabled) return null

  return (
    <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
        Musique d'attente (MOH) {saving && <span style={{ fontSize: 11, fontWeight: 400, color: '#3B82F6' }}> enregistrement...</span>}
      </div>
      <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
        Fichiers disponibles pour cette compagnie (globaux + dédiés). Cocher pour sélectionner — plusieurs possibles, jouées dans l'ordre ci-dessous. La bibliothèque globale se gère dans "Serveur".
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12, fontSize: 12 }}>
        <span style={{ fontWeight: 600, color: '#374151' }}>Ordre de lecture :</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input type="radio" checked={!shuffle} onChange={() => setShuffleMode(false)} /> Liste (ordre choisi)
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input type="radio" checked={shuffle} onChange={() => setShuffleMode(true)} /> Aléatoire
        </label>
        {shuffleSaving && <span style={{ color: '#3B82F6' }}>enregistrement...</span>}
      </div>
      {loading ? <div style={{ fontSize: 13, color: '#6B7280' }}>Chargement...</div> : available.length === 0 ? (
        <div className="empty-tab">Aucun fichier MOH disponible (globaux ou dédiés à cette compagnie).</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {available.map(f => {
            const idx = selection.findIndex(s => s.moh_file_id === f.id)
            const isSelected = idx !== -1
            return (
              <div key={f.id} style={{
                display: 'grid',
                gridTemplateColumns: '20px minmax(160px, 1fr) 64px 44px 200px 130px 90px 70px 90px',
                alignItems: 'center', columnGap: 8,
                background: isSelected ? '#EFF6FF' : '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 6, padding: '6px 10px',
              }}>
                <input type="checkbox" checked={isSelected} onChange={() => toggle(f)} />
                <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                <span>{!f.tenant_id && <span style={{ background: '#DBEAFE', color: '#1D4ED8', fontSize: 11, fontWeight: 700, borderRadius: 10, padding: '2px 8px' }}>Global</span>}</span>
                <span style={{ fontSize: 12, color: '#9CA3AF' }}>{f.duration_seconds ? `${f.duration_seconds}s` : ''}</span>
                <audio controls src={`/api/v1/server/moh/${f.id}/file?token=${encodeURIComponent(getToken())}`} style={{ height: 26, width: '100%' }} />
                <button className="btn-secondary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => { setCallFor(callFor === f.id ? null : f.id); setCallExtId('') }}>
                  📞 Écouter par poste
                </button>
                <button className="btn-secondary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => downloadFile(f)}>Télécharger</button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {isSelected && (<>
                    <span style={{ fontSize: 11, color: '#6B7280' }}>#{idx + 1}</span>
                    <button className="btn-secondary" style={{ fontSize: 11, padding: '2px 6px' }} disabled={idx === 0} onClick={() => move(idx, -1)}>↑</button>
                    <button className="btn-secondary" style={{ fontSize: 11, padding: '2px 6px' }} disabled={idx === selection.length - 1} onClick={() => move(idx, 1)}>↓</button>
                  </>)}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  {f.tenant_id ? (
                    <button title="Supprimer ce fichier MOH" style={{ fontSize: 13, fontWeight: 700, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }} onClick={() => deleteFile(f)}>✕</button>
                  ) : (
                    <button
                      title={f.is_active ? 'Désactiver ce fichier MOH de base (le retire de partout, sans le supprimer)' : 'Réactiver ce fichier MOH de base'}
                      className="btn-secondary"
                      style={{ fontSize: 11, padding: '2px 8px', color: f.is_active ? '#DC2626' : '#059669', width: '100%' }}
                      onClick={() => toggleActive(f)}
                    >
                      {f.is_active ? 'Désactiver' : 'Activer'}
                    </button>
                  )}
                </div>
                {callFor === f.id && (
                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center', paddingTop: 6, marginTop: 4, borderTop: '1px solid #E5E7EB' }}>
                    <select value={callExtId} onChange={e => setCallExtId(e.target.value)} style={{ fontSize: 12 }}>
                      <option value="">Choisir un poste (actif et connecté)...</option>
                      {availableExts.map(e => <option key={e.id} value={e.id}>{e.extension} — {e.name}</option>)}
                    </select>
                    <button className="btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} disabled={!callExtId || calling} onClick={() => callToListen(f)}>
                      {calling ? 'Appel...' : 'Appeler'}
                    </button>
                    {availableExts.length === 0 && <span style={{ fontSize: 12, color: '#9CA3AF' }}>Aucun poste actif/connecté en ce moment.</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {callMsgOk && <div style={{ fontSize: 12, color: '#059669', fontWeight: 600, marginBottom: 8 }}>{callMsgOk}</div>}
      {callMsgError && <div style={{ fontSize: 12, color: '#DC2626', fontWeight: 600, marginBottom: 8 }}>{callMsgError}</div>}

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: 12 }}>
        <div className="form-group" style={{ width: 200, marginBottom: 0 }}>
          <label>Nom</label>
          <input value={uploadForm.name} onChange={e => setUploadForm(p => ({ ...p, name: e.target.value }))} placeholder="ex: Musique classique" />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Fichier audio</label>
          <input key={fileInputKey} type="file" accept="audio/*" onChange={e => setUploadForm(p => ({ ...p, file: e.target.files?.[0] || null }))} />
        </div>
        <button className="btn-primary" style={{ fontSize: 12, padding: '7px 14px' }} disabled={uploading || !uploadForm.name.trim() || !uploadForm.file} onClick={uploadFile}>
          {uploading ? 'Envoi...' : '+ Téléverser'}
        </button>
        {uploadOk && <span style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>✓ Téléversé</span>}
        {uploadError && <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 600 }}>{uploadError}</span>}
      </div>
    </div>
  )
}

// TASK-029 : Phrases (annonces/IVR) -- upload direct, génération par voix
// (Voicebox), écoute navigateur ou par appel à un poste de cette compagnie.
function PromptsSection({ companyId, prompts, sipExts, onRefresh }) {
  const [uploadForm, setUploadForm] = useState({ name: '', file: null })
  const [uploading, setUploading] = useState(false)
  const [fileInputKey, setFileInputKey] = useState(0)
  const [genForm, setGenForm] = useState({ name: '', text: '', voiceId: '' })
  const [voices, setVoices] = useState([])
  const [langFilter, setLangFilter] = useState('fr')
  const [genderFilter, setGenderFilter] = useState('all')
  const [generating, setGenerating] = useState(false)
  const [msgOk, setMsgOk] = useState('')
  const [msgError, setMsgError] = useState('')
  const [callFor, setCallFor] = useState(null)
  const [callExtId, setCallExtId] = useState('')
  const [calling, setCalling] = useState(false)

  useEffect(() => {
    api.get('/v1/telephony/voicebox/voices').then(r => setVoices(r.data)).catch(() => setVoices([]))
  }, [])

  function flashOk(msg) { setMsgOk(msg); setMsgError(''); setTimeout(() => setMsgOk(''), 4000) }
  function flashError(msg) { setMsgError(msg); setMsgOk('') }

  async function uploadFile() {
    if (!uploadForm.name.trim() || !uploadForm.file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('name', uploadForm.name.trim())
      fd.append('file', uploadForm.file)
      await api.post(`/v1/telephony/company/${companyId}/prompts`, fd)
      setUploadForm({ name: '', file: null })
      setFileInputKey(k => k + 1)
      flashOk('✓ Phrase ajoutée')
      onRefresh()
    } catch (e) {
      flashError(e.response?.data?.detail || "Échec de l'envoi")
    } finally {
      setUploading(false)
    }
  }

  const languages = [...new Set(voices.map(v => v.language))].sort()
  const filteredVoices = voices.filter(v =>
    v.language === langFilter && (genderFilter === 'all' || v.gender === genderFilter))
  const selectedVoice = voices.find(v => v.voice_id === genForm.voiceId)

  function selectLanguage(lang) {
    setLangFilter(lang)
    setGenForm(p => ({ ...p, voiceId: '' }))
  }
  function selectGender(g) {
    setGenderFilter(g)
    setGenForm(p => ({ ...p, voiceId: '' }))
  }

  async function generatePrompt() {
    if (!genForm.name.trim() || !genForm.text.trim() || !genForm.voiceId) return
    setGenerating(true)
    try {
      await api.post(`/v1/telephony/company/${companyId}/prompts/generate`, {
        name: genForm.name.trim(), text: genForm.text.trim(), voice_id: genForm.voiceId,
        language: langFilter,
      })
      setGenForm({ name: '', text: '', voiceId: genForm.voiceId })
      flashOk('✓ Phrase générée')
      onRefresh()
    } catch (e) {
      flashError(e.response?.data?.detail || 'Échec de la génération')
    } finally {
      setGenerating(false)
    }
  }

  async function removePrompt(p) {
    if (!confirm(`Supprimer la phrase "${p.name}" ?`)) return
    try {
      await api.delete(`/v1/telephony/prompts/${p.id}`)
      onRefresh()
    } catch (e) {
      alert(e.response?.data?.detail || 'Suppression impossible')
    }
  }

  async function renamePrompt(p) {
    const name = prompt('Nouveau nom de la phrase :', p.name)
    if (!name || !name.trim() || name.trim() === p.name) return
    try {
      await api.put(`/v1/telephony/prompts/${p.id}`, { name: name.trim() })
      onRefresh()
    } catch (e) {
      alert(e.response?.data?.detail || 'Renommage impossible')
    }
  }

  async function downloadPrompt(p) {
    const r = await api.get(`/v1/telephony/prompts/${p.id}/file`, { responseType: 'blob' })
    const url = window.URL.createObjectURL(r.data)
    const a = document.createElement('a')
    a.href = url
    a.download = `${p.name}.wav`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  async function callToListen(p) {
    if (!callExtId) return
    setCalling(true)
    try {
      await api.post(`/v1/telephony/prompts/${p.id}/call`, { extension_id: callExtId })
      flashOk('✓ Appel lancé — décrochez le poste')
      setCallFor(null)
      setCallExtId('')
    } catch (e) {
      flashError(e.response?.data?.detail || "Échec de l'appel")
    } finally {
      setCalling(false)
    }
  }

  const availableExts = sipExts.filter(e => e.is_active && e.registered)

  return (
    <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
        Phrases (annonces IVR)
      </div>
      <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
        Utilisées comme destination "Message enregistré" sur un DID, ou greeting d'un IVR.
      </div>

      {prompts.length === 0 ? (
        <div className="empty-tab">Aucune phrase.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {prompts.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 6, padding: '6px 10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</span>
              {p.duration_seconds && <span style={{ fontSize: 12, color: '#9CA3AF' }}>{p.duration_seconds}s</span>}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <audio controls src={`/api/v1/telephony/prompts/${p.id}/file?token=${encodeURIComponent(getToken())}`} style={{ height: 26, maxWidth: 190 }} />
                <button className="btn-secondary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => { setCallFor(callFor === p.id ? null : p.id); setCallExtId('') }}>
                  📞 Écouter par poste
                </button>
                <button className="btn-secondary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => downloadPrompt(p)}>Télécharger</button>
                <button className="btn-secondary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => renamePrompt(p)}>Renommer</button>
                <button className="inv-del-btn" onClick={() => removePrompt(p)}>✕</button>
              </div>
              {callFor === p.id && (
                <div style={{ width: '100%', display: 'flex', gap: 8, alignItems: 'center', paddingTop: 6, borderTop: '1px solid #E5E7EB' }}>
                  <select value={callExtId} onChange={e => setCallExtId(e.target.value)} style={{ fontSize: 12 }}>
                    <option value="">Choisir un poste (actif et connecté)...</option>
                    {availableExts.map(e => <option key={e.id} value={e.id}>{e.extension} — {e.name}</option>)}
                  </select>
                  <button className="btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} disabled={!callExtId || calling} onClick={() => callToListen(p)}>
                    {calling ? 'Appel...' : 'Appeler'}
                  </button>
                  {availableExts.length === 0 && <span style={{ fontSize: 12, color: '#9CA3AF' }}>Aucun poste actif/connecté en ce moment.</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {msgOk && <div style={{ fontSize: 12, color: '#059669', fontWeight: 600, marginBottom: 8 }}>{msgOk}</div>}
      {msgError && <div style={{ fontSize: 12, color: '#DC2626', fontWeight: 600, marginBottom: 8 }}>{msgError}</div>}

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: 12 }}>
        <div className="form-group" style={{ width: 200, marginBottom: 0 }}>
          <label>Nom</label>
          <input value={uploadForm.name} onChange={e => setUploadForm(p => ({ ...p, name: e.target.value }))} placeholder="ex: Accueil général" />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Fichier audio</label>
          <input key={fileInputKey} type="file" accept="audio/*" onChange={e => setUploadForm(p => ({ ...p, file: e.target.files?.[0] || null }))} />
        </div>
        <button className="btn-primary" style={{ fontSize: 12, padding: '7px 14px' }} disabled={uploading || !uploadForm.name.trim() || !uploadForm.file} onClick={uploadFile}>
          {uploading ? 'Envoi...' : '+ Téléverser'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>Générer par voix (synthèse vocale)</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ width: 200, marginBottom: 0 }}>
            <label>Nom</label>
            <input value={genForm.name} onChange={e => setGenForm(p => ({ ...p, name: e.target.value }))} placeholder="ex: Accueil général" />
          </div>
          <div className="form-group" style={{ width: 130, marginBottom: 0 }}>
            <label>Langue</label>
            <select value={langFilter} onChange={e => selectLanguage(e.target.value)}>
              {languages.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Genre</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 6 }}>
              {[['all', 'Tout'], ['female', 'Femme'], ['male', 'Homme']].map(([val, label]) => (
                <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={genderFilter === val} onChange={() => selectGender(val)} />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div className="form-group" style={{ width: 200, marginBottom: 0 }}>
            <label>Voix</label>
            <select value={genForm.voiceId} onChange={e => setGenForm(p => ({ ...p, voiceId: e.target.value }))}>
              <option value="">Choisir une voix...</option>
              {filteredVoices.map(v => (
                <option key={v.voice_id} value={v.voice_id}>{v.name}</option>
              ))}
            </select>
            {filteredVoices.length === 0 && voices.length > 0 && (
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>Aucune voix pour ce filtre.</div>
            )}
          </div>
          {selectedVoice && (
            <audio controls preload="none" style={{ height: 32 }} src={`/api/v1/telephony/voicebox/preview?${new URLSearchParams({
              text: `Bonjour, je suis ${selectedVoice.name}, je suis une des voix de Simple IP, avec cette voix, je peux lire votre texte.`,
              voice_id: genForm.voiceId, language: langFilter, token: getToken(),
            }).toString()}`} />
          )}
          <button className="btn-primary" style={{ fontSize: 12, padding: '7px 14px' }} disabled={generating || !genForm.name.trim() || !genForm.text.trim() || !genForm.voiceId} onClick={generatePrompt}>
            {generating ? 'Génération...' : 'Créer la phrase'}
          </button>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Texte</label>
          <textarea rows={3} value={genForm.text} onChange={e => setGenForm(p => ({ ...p, text: e.target.value }))} placeholder="Le texte de la phrase à créer (pas lié au bouton Tester)" />
        </div>
        {voices.length === 0 && <div style={{ fontSize: 12, color: '#9CA3AF' }}>Aucune voix disponible (service Voicebox pas encore prêt, ou injoignable).</div>}
        {voices.length > 0 && (
          <div style={{ fontSize: 12, color: '#9CA3AF' }}>Une seule voix française disponible pour l'instant (Arianne, femme) — les autres voix françaises ou masculines nécessiteraient du clonage de voix (audio de référence), pas encore branché.</div>
        )}
      </div>
    </div>
  )
}

function SchedulesSection({ companyId, schedules, onRefresh, mergedExtensions, ringGroups, ivrs, queues }) {
  const destCtx = { mergedExtensions, ringGroups, ivrs, queues }
  const [showNew, setShowNew] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [newRule, setNewRule] = useState(null)

  async function updateSchedule(id, patch) { await api.put(`/v1/telephony/schedules/${id}`, patch); onRefresh() }
  async function removeSchedule(id) {
    if (!confirm('Supprimer cet horaire ? Les DID qui l\'utilisent perdront leur horaire.')) return
    await api.delete(`/v1/telephony/schedules/${id}`); onRefresh()
  }
  async function updateRule(ruleId, patch) { await api.put(`/v1/telephony/schedules/rules/${ruleId}`, patch); onRefresh() }
  async function removeRule(ruleId) { await api.delete(`/v1/telephony/schedules/rules/${ruleId}`); onRefresh() }
  async function saveNewRule() {
    if (!newRule || newRule.draft.days_of_week.length === 0) return
    await api.post(`/v1/telephony/schedules/${newRule.schedId}/rules`, newRule.draft)
    setNewRule(null); onRefresh()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Horaires ({schedules.length})
        </div>
        <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setShowNew(true)}>+ Ajouter</button>
      </div>
      {schedules.length === 0 ? <div className="empty-tab">Aucun horaire configuré.</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#F9FAFB' }}>
              {['Nom', 'Plages', 'Actif', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid #E5E7EB', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {schedules.map(s => (
              <Fragment key={s.id}>
                <tr style={{ borderBottom: '1px solid #F3F4F6', cursor: 'pointer' }} onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{s.name}</td>
                  <td style={{ padding: '10px 12px' }}>{s.rules.length}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <input type="checkbox" checked={s.is_active} onClick={e => e.stopPropagation()} onChange={e => updateSchedule(s.id, { is_active: e.target.checked })} />
                  </td>
                  <td style={{ padding: '10px 12px' }}><button className="inv-del-btn" onClick={e => { e.stopPropagation(); removeSchedule(s.id) }}>✕</button></td>
                </tr>
                {expanded === s.id && (
                  <tr>
                    <td colSpan={4} style={{ padding: '10px 20px', background: '#F9FAFB' }}>
                      <div className="form-group" style={{ maxWidth: 300 }}>
                        <label>Nom</label>
                        <input defaultValue={s.name} onBlur={e => e.target.value.trim() && updateSchedule(s.id, { name: e.target.value.trim() })} />
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '10px 0 6px' }}>Plages horaires</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {s.rules.map(r => (
                          <PlageFields key={r.id} rule={r} destCtx={destCtx}
                            onPatch={patch => updateRule(r.id, patch)} onRemove={() => removeRule(r.id)} />
                        ))}
                        {newRule?.schedId === s.id && (
                          <PlageFields rule={newRule.draft} destCtx={destCtx}
                            onPatch={patch => setNewRule(p => ({ ...p, draft: { ...p.draft, ...patch } }))}
                            onRemove={() => setNewRule(null)} />
                        )}
                      </div>
                      {newRule?.schedId === s.id ? (
                        <button className="btn-primary" style={{ fontSize: 11, padding: '3px 8px', marginTop: 6 }} onClick={saveNewRule}>Ajouter cette plage</button>
                      ) : (
                        <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px', marginTop: 6 }}
                          onClick={() => setNewRule({ schedId: s.id, draft: emptyPlage() })}>+ Ajouter une plage</button>
                      )}
                      <div className="form-group" style={{ maxWidth: 400, marginTop: 14 }}>
                        <label>Si aucune plage ne s'applique, envoyer vers</label>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <select value={s.closed_destination_type || ''} onChange={e => updateSchedule(s.id, { closed_destination_type: e.target.value || null, closed_destination: null })}>
                            {DID_DESTINATION_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          {s.closed_destination_type && s.closed_destination_type !== 'hangup' && (() => {
                            const opts = destinationSelectOptions(s.closed_destination_type, destCtx)
                            return opts ? (
                              <select value={s.closed_destination || ''} onChange={e => updateSchedule(s.id, { closed_destination: e.target.value || null })}>
                                <option value="">— Choisir —</option>
                                {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                            ) : (
                              <input defaultValue={s.closed_destination || ''} onBlur={e => updateSchedule(s.id, { closed_destination: e.target.value || null })} placeholder="poste ou numéro" />
                            )
                          })()}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
      {showNew && (
        <NewScheduleModal companyId={companyId} mergedExtensions={mergedExtensions} ringGroups={ringGroups} ivrs={ivrs} queues={queues}
          onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); onRefresh() }} />
      )}
    </div>
  )
}

// ── Groupes d'appel (ring groups) — TASK-023.21, section separee du pickup/paging ──
const RING_GROUP_FAILOVER_TYPES = [
  { value: 'extension', label: 'Poste' },
  { value: 'ivr', label: 'IVR (nom)' },
  { value: 'queue', label: 'File d\'attente (nom)' },
  { value: 'voicemail', label: 'Messagerie (poste)' },
  { value: 'hangup', label: 'Raccrocher' },
]

function RingGroupsSection({ companyId, ringGroups, ringGroupsLoading, sipExts, onRefresh }) {
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ name: '', extension: '', ring_strategy: 'simultaneous', ring_time: 20 })
  const [expanded, setExpanded] = useState(null)
  const [newMemberExt, setNewMemberExt] = useState('')
  const [newStep, setNewStep] = useState({ destination_type: 'extension', destination: '', ring_seconds: 20 })

  async function createGroup() {
    if (!form.name.trim() || !form.extension.trim()) return
    await api.post(`/v1/companies/${companyId}/ring-groups`, form)
    setForm({ name: '', extension: '', ring_strategy: 'simultaneous', ring_time: 20 })
    setShowNew(false)
    onRefresh()
  }

  async function updateGroup(rgId, field, value) {
    await api.put(`/v1/companies/${companyId}/ring-groups/${rgId}`, { [field]: value })
    onRefresh()
  }

  async function removeGroup(rgId) {
    if (!confirm('Supprimer ce groupe d\'appel ?')) return
    await api.delete(`/v1/companies/${companyId}/ring-groups/${rgId}`)
    onRefresh()
  }

  async function addMember(rgId) {
    const ext = sipExts.find(e => e.extension === newMemberExt)
    if (!ext) return
    await api.post(`/v1/companies/${companyId}/ring-groups/${rgId}/members`, { extension_id: ext.id })
    setNewMemberExt('')
    onRefresh()
  }

  async function updateMember(memberId, field, value) {
    await api.put(`/v1/companies/${companyId}/ring-groups/members/${memberId}`, { [field]: value })
    onRefresh()
  }

  async function removeMember(memberId) {
    await api.delete(`/v1/companies/${companyId}/ring-groups/members/${memberId}`)
    onRefresh()
  }

  async function addStep(rgId) {
    if (!newStep.destination.trim() && newStep.destination_type !== 'hangup') return
    await api.post(`/v1/companies/${companyId}/ring-groups/${rgId}/failover-steps`, {
      destination_type: newStep.destination_type,
      destination: newStep.destination_type === 'hangup' ? '-' : newStep.destination.trim(),
      ring_seconds: newStep.destination_type === 'extension' ? newStep.ring_seconds : null,
    })
    setNewStep({ destination_type: 'extension', destination: '', ring_seconds: 20 })
    onRefresh()
  }

  async function updateStep(stepId, field, value) {
    await api.put(`/v1/companies/${companyId}/ring-groups/failover-steps/${stepId}`, { [field]: value })
    onRefresh()
  }

  async function removeStep(stepId) {
    await api.delete(`/v1/companies/${companyId}/ring-groups/failover-steps/${stepId}`)
    onRefresh()
  }

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Groupes d'appel ({ringGroups.length})
        </div>
        <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setShowNew(v => !v)}>+ Ajouter</button>
      </div>
      {showNew && (
        <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: 12, marginBottom: 10, display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group"><label>Nom</label><input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
          <div className="form-group"><label>Extension</label><input value={form.extension} onChange={e => setForm(p => ({ ...p, extension: e.target.value }))} style={{ width: 80 }} /></div>
          <div className="form-group">
            <label>Stratégie</label>
            <select value={form.ring_strategy} onChange={e => setForm(p => ({ ...p, ring_strategy: e.target.value }))}>
              <option value="simultaneous">Simultanée</option>
              <option value="hunt">Séquentielle</option>
            </select>
          </div>
          <div className="form-group"><label>Temps (s)</label><input type="number" value={form.ring_time} onChange={e => setForm(p => ({ ...p, ring_time: parseInt(e.target.value, 10) }))} style={{ width: 60 }} /></div>
          <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={createGroup}>Créer</button>
        </div>
      )}
      {ringGroupsLoading ? <div style={{ fontSize: 13, color: '#6B7280' }}>Chargement...</div> : ringGroups.length === 0 ? (
        <div className="empty-tab">Aucun groupe d'appel.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#F9FAFB' }}>
              {['Nom', 'Ext.', 'Stratégie', 'Temps', 'Confirmer', 'Membres', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid #E5E7EB', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ringGroups.map(rg => (
              <Fragment key={rg.id}>
                <tr key={rg.id} style={{ borderBottom: '1px solid #F3F4F6', cursor: 'pointer' }} onClick={() => setExpanded(expanded === rg.id ? null : rg.id)}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{rg.name}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>{rg.extension}</td>
                  <td style={{ padding: '10px 12px' }}>{rg.ring_strategy === 'hunt' ? 'Séquentielle' : 'Simultanée'}</td>
                  <td style={{ padding: '10px 12px' }}>{rg.ring_time}s</td>
                  <td style={{ padding: '10px 12px' }}>
                    <input type="checkbox" checked={rg.confirm_before_answer} onClick={e => e.stopPropagation()}
                      onChange={e => updateGroup(rg.id, 'confirm_before_answer', e.target.checked)} />
                  </td>
                  <td style={{ padding: '10px 12px' }}>{rg.ring_members.length}</td>
                  <td style={{ padding: '10px 12px' }}><button className="inv-del-btn" onClick={e => { e.stopPropagation(); removeGroup(rg.id) }}>✕</button></td>
                </tr>
                {expanded === rg.id && (
                  <tr key={`${rg.id}-detail`}>
                    <td colSpan={7} style={{ padding: '10px 20px', background: '#F9FAFB' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Membres</div>
                      {rg.ring_members.map(m => (
                        <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ minWidth: 100, fontFamily: 'monospace' }}>{m.extension_username}</span>
                          <span style={{ fontSize: 11, color: '#6B7280' }}>Priorité</span>
                          <input type="number" defaultValue={m.priority} onBlur={e => updateMember(m.id, 'priority', parseInt(e.target.value, 10))} style={{ width: 50, fontSize: 12 }} />
                          <span style={{ fontSize: 11, color: '#6B7280' }}>Ordre</span>
                          <input type="number" defaultValue={m.ring_order} onBlur={e => updateMember(m.id, 'ring_order', parseInt(e.target.value, 10))} style={{ width: 50, fontSize: 12 }} />
                          <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="checkbox" defaultChecked={m.temporarily_excluded} onChange={e => updateMember(m.id, 'temporarily_excluded', e.target.checked)} />
                            Exclu temporairement
                          </label>
                          <button className="inv-del-btn" onClick={() => removeMember(m.id)}>✕</button>
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                        <input placeholder="Numéro de poste" value={newMemberExt} onChange={e => setNewMemberExt(e.target.value)} style={{ fontSize: 12, width: 100 }} />
                        <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => addMember(rg.id)}>+ Ajouter un membre</button>
                      </div>

                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginTop: 16, marginBottom: 6 }}>
                        Si personne ne répond après {rg.ring_time}s — destinations essayées dans l'ordre
                      </div>
                      {rg.failover_steps.length === 0 && (
                        <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 6 }}>
                          Aucune — l'appel raccroche après {rg.ring_time}s si personne ne répond.
                        </div>
                      )}
                      {rg.failover_steps.map((s, idx) => (
                        <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ minWidth: 18, fontSize: 11, color: '#9CA3AF', fontWeight: 700 }}>{idx + 1}.</span>
                          <select value={s.destination_type} style={{ fontSize: 12 }}
                            onChange={e => updateStep(s.id, 'destination_type', e.target.value)}>
                            {RING_GROUP_FAILOVER_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          {s.destination_type !== 'hangup' && (
                            <input defaultValue={s.destination} placeholder="valeur" style={{ fontSize: 12, width: 100 }}
                              onBlur={e => e.target.value.trim() && updateStep(s.id, 'destination', e.target.value.trim())} />
                          )}
                          {s.destination_type === 'extension' && (
                            <>
                              <input type="number" defaultValue={s.ring_seconds || 20} style={{ fontSize: 12, width: 50 }}
                                onBlur={e => updateStep(s.id, 'ring_seconds', parseInt(e.target.value, 10))} />
                              <span style={{ fontSize: 11, color: '#6B7280' }}>sec</span>
                            </>
                          )}
                          <button className="inv-del-btn" onClick={() => removeStep(s.id)}>✕</button>
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                        <select value={newStep.destination_type} style={{ fontSize: 12 }}
                          onChange={e => setNewStep(p => ({ ...p, destination_type: e.target.value }))}>
                          {RING_GROUP_FAILOVER_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        {newStep.destination_type !== 'hangup' && (
                          <input placeholder="valeur" value={newStep.destination} style={{ fontSize: 12, width: 100 }}
                            onChange={e => setNewStep(p => ({ ...p, destination: e.target.value }))} />
                        )}
                        {newStep.destination_type === 'extension' && (
                          <>
                            <input type="number" value={newStep.ring_seconds} style={{ fontSize: 12, width: 50 }}
                              onChange={e => setNewStep(p => ({ ...p, ring_seconds: parseInt(e.target.value, 10) }))} />
                            <span style={{ fontSize: 11, color: '#6B7280' }}>sec</span>
                          </>
                        )}
                        <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => addStep(rg.id)}>+ Ajouter une destination</button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── Groupe de pickup (interception) — TASK-023.22, section separee du ring group ──
// ── Groupe de pickup (interception) — TASK-023.15.1 : "+Ajouter" cree le
// groupe (vide), on assigne ensuite les postes dedans, meme principe que les
// groupes d'appel -- plus un nom de groupe tape en texte libre par poste.
function PickupGroupSection({ companyId, sipExts, onRefresh }) {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [expanded, setExpanded] = useState(null)

  function load() {
    setLoading(true)
    api.get(`/v1/companies/${companyId}/pickup-groups`).then(r => setGroups(r.data)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [companyId])

  async function createGroup() {
    if (!newName.trim()) return
    await api.post(`/v1/companies/${companyId}/pickup-groups`, { name: newName.trim() })
    setNewName(''); setShowNew(false); load()
  }
  async function updateGroup(id, patch) {
    await api.put(`/v1/companies/${companyId}/pickup-groups/${id}`, patch)
    load()
  }
  async function removeGroup(id) {
    if (!confirm('Supprimer ce groupe de pickup ? Les postes membres seront retirés du groupe.')) return
    await api.delete(`/v1/companies/${companyId}/pickup-groups/${id}`)
    load()
  }
  async function assignMember(groupName, extId) {
    await api.put(`/v1/companies/${companyId}/extensions/${extId}/pickup-group`, { pickup_group: groupName })
    onRefresh(); load()
  }
  async function removeMember(extId) {
    await api.put(`/v1/companies/${companyId}/extensions/${extId}/pickup-group`, { pickup_group: null })
    onRefresh(); load()
  }
  async function toggleCanIntercept(extId, checked) {
    await api.put(`/v1/companies/${companyId}/extensions/${extId}/pickup-group`, { can_intercept_calls: checked })
    onRefresh()
  }

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Groupes de pickup (interception) ({groups.length})
        </div>
        <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setShowNew(v => !v)}>+ Ajouter</button>
      </div>
      <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
        Composer <code>*8</code> depuis un poste décroche l'appel qui sonne pour un autre poste du même groupe.
      </div>
      {showNew && (
        <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: 12, marginBottom: 10, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div className="form-group"><label>Nom du groupe</label><input value={newName} onChange={e => setNewName(e.target.value)} autoFocus /></div>
          <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={createGroup}>Créer</button>
        </div>
      )}
      {loading ? <div style={{ fontSize: 13, color: '#6B7280' }}>Chargement...</div> : groups.length === 0 ? (
        <div className="empty-tab">Aucun groupe de pickup.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#F9FAFB' }}>
              {['Nom', 'Membres', 'Actif', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid #E5E7EB', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(g => {
              const members = sipExts.filter(e => e.pickup_group === g.name)
              const available = sipExts.filter(e => e.pickup_group !== g.name)
              return (
                <Fragment key={g.id}>
                  <tr style={{ borderBottom: '1px solid #F3F4F6', cursor: 'pointer' }} onClick={() => setExpanded(expanded === g.id ? null : g.id)}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{g.name}</td>
                    <td style={{ padding: '10px 12px' }}>{g.member_count}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <input type="checkbox" checked={g.is_active} onClick={e => e.stopPropagation()} onChange={e => updateGroup(g.id, { is_active: e.target.checked })} />
                    </td>
                    <td style={{ padding: '10px 12px' }}><button className="inv-del-btn" onClick={e => { e.stopPropagation(); removeGroup(g.id) }}>✕</button></td>
                  </tr>
                  {expanded === g.id && (
                    <tr>
                      <td colSpan={4} style={{ padding: '10px 20px', background: '#F9FAFB' }}>
                        <div className="form-group" style={{ maxWidth: 250 }}>
                          <label>Nom</label>
                          <input defaultValue={g.name} onBlur={e => { const v = e.target.value.trim(); if (v && v !== g.name) updateGroup(g.id, { name: v }) }} />
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '10px 0 6px' }}>Postes membres</div>
                        {members.length === 0 && <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 6 }}>Aucun poste assigné.</div>}
                        {members.map(m => (
                          <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ minWidth: 140, fontFamily: 'monospace' }}>{m.extension} — {m.name}</span>
                            <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <input type="checkbox" defaultChecked={m.can_intercept_calls} onChange={e => toggleCanIntercept(m.id, e.target.checked)} />
                              Peut intercepter
                            </label>
                            <button className="inv-del-btn" onClick={() => removeMember(m.id)}>✕</button>
                          </div>
                        ))}
                        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                          <select value="" onChange={e => e.target.value && assignMember(g.name, e.target.value)} style={{ fontSize: 12 }}>
                            <option value="">+ Ajouter un poste...</option>
                            {available.map(e => <option key={e.id} value={e.id}>{e.extension} — {e.name}</option>)}
                          </select>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── Groupe de paging — TASK-023.24, 3e section separee ────────────────────────
function PagingGroupsSection({ companyId, pagingGroups, pagingGroupsLoading, sipExts, onRefresh }) {
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ name: '', extension: '', mode: 'unidirectional', multicast_address: '', multicast_port: '' })
  const [expanded, setExpanded] = useState(null)
  const [newMemberExt, setNewMemberExt] = useState('')

  async function createGroup() {
    if (!form.name.trim() || !form.extension.trim()) return
    await api.post(`/v1/companies/${companyId}/paging-groups`, {
      ...form,
      multicast_port: form.multicast_port ? parseInt(form.multicast_port, 10) : null,
      multicast_address: form.multicast_address || null,
    })
    setForm({ name: '', extension: '', mode: 'unidirectional', multicast_address: '', multicast_port: '' })
    setShowNew(false)
    onRefresh()
  }

  async function updateGroup(pgId, field, value) {
    await api.put(`/v1/companies/${companyId}/paging-groups/${pgId}`, { [field]: value })
    onRefresh()
  }

  async function removeGroup(pgId) {
    if (!confirm('Supprimer ce groupe de paging ?')) return
    await api.delete(`/v1/companies/${companyId}/paging-groups/${pgId}`)
    onRefresh()
  }

  async function addMember(pgId) {
    const ext = sipExts.find(e => e.extension === newMemberExt)
    if (!ext) return
    await api.post(`/v1/companies/${companyId}/paging-groups/${pgId}/members`, { extension_id: ext.id })
    setNewMemberExt('')
    onRefresh()
  }

  async function updateMember(memberId, field, value) {
    await api.put(`/v1/companies/${companyId}/paging-groups/members/${memberId}`, { [field]: value })
    onRefresh()
  }

  async function removeMember(memberId) {
    await api.delete(`/v1/companies/${companyId}/paging-groups/members/${memberId}`)
    onRefresh()
  }

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Groupe de paging ({pagingGroups.length})
        </div>
        <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setShowNew(v => !v)}>+ Ajouter</button>
      </div>
      <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
        Unidirectionnelle = annonce (le récepteur écoute seulement) ; bidirectionnelle = intercom (les deux entendent). ⚠ le mode unidirectionnel ne coupe pas encore réellement l'audio du récepteur — voir TASKSIPV.
      </div>
      {showNew && (
        <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: 12, marginBottom: 10, display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group"><label>Nom</label><input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
          <div className="form-group"><label>Extension</label><input value={form.extension} onChange={e => setForm(p => ({ ...p, extension: e.target.value }))} style={{ width: 80 }} /></div>
          <div className="form-group">
            <label>Mode</label>
            <select value={form.mode} onChange={e => setForm(p => ({ ...p, mode: e.target.value }))}>
              <option value="unidirectional">Unidirectionnelle</option>
              <option value="bidirectional">Bidirectionnelle</option>
            </select>
          </div>
          <div className="form-group"><label>Adresse multicast</label><input value={form.multicast_address} onChange={e => setForm(p => ({ ...p, multicast_address: e.target.value }))} placeholder="239.1.1.1" style={{ width: 110 }} /></div>
          <div className="form-group"><label>Port multicast</label><input value={form.multicast_port} onChange={e => setForm(p => ({ ...p, multicast_port: e.target.value }))} style={{ width: 70 }} /></div>
          <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={createGroup}>Créer</button>
        </div>
      )}
      {pagingGroupsLoading ? <div style={{ fontSize: 13, color: '#6B7280' }}>Chargement...</div> : pagingGroups.length === 0 ? (
        <div className="empty-tab">Aucun groupe de paging.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#F9FAFB' }}>
              {['Nom', 'Ext.', 'Mode', 'Multicast', 'Membres', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid #E5E7EB', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagingGroups.map(pg => (
              <Fragment key={pg.id}>
                <tr style={{ borderBottom: '1px solid #F3F4F6', cursor: 'pointer' }} onClick={() => setExpanded(expanded === pg.id ? null : pg.id)}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{pg.name}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>{pg.extension}</td>
                  <td style={{ padding: '10px 12px' }}>{pg.mode === 'bidirectional' ? 'Bidirectionnelle' : 'Unidirectionnelle'}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12 }}>{pg.multicast_address ? `${pg.multicast_address}:${pg.multicast_port || ''}` : '—'}</td>
                  <td style={{ padding: '10px 12px' }}>{pg.paging_members.length}</td>
                  <td style={{ padding: '10px 12px' }}><button className="inv-del-btn" onClick={e => { e.stopPropagation(); removeGroup(pg.id) }}>✕</button></td>
                </tr>
                {expanded === pg.id && (
                  <tr>
                    <td colSpan={6} style={{ padding: '10px 20px', background: '#F9FAFB' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Membres</div>
                      {pg.paging_members.map(m => (
                        <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ minWidth: 100, fontFamily: 'monospace' }}>{m.extension_username}</span>
                          <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="checkbox" defaultChecked={m.can_send} onChange={e => updateMember(m.id, 'can_send', e.target.checked)} /> Émission
                          </label>
                          <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="checkbox" defaultChecked={m.can_receive} onChange={e => updateMember(m.id, 'can_receive', e.target.checked)} /> Réception
                          </label>
                          <button className="inv-del-btn" onClick={() => removeMember(m.id)}>✕</button>
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                        <input placeholder="Numéro de poste" value={newMemberExt} onChange={e => setNewMemberExt(e.target.value)} style={{ fontSize: 12, width: 100 }} />
                        <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => addMember(pg.id)}>+ Ajouter un membre</button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── Templates de boutons — TASK-023.26, en bas des postes (demande explicite) ──
function ButtonTemplatesSection({ companyId, templates, templatesLoading, sipExts, onRefresh }) {
  const [applyExt, setApplyExt] = useState({})

  async function removeTemplate(templateId) {
    if (!confirm('Supprimer ce template ?')) return
    await api.delete(`/v1/companies/${companyId}/button-templates/${templateId}`)
    onRefresh()
  }

  async function applyTemplate(templateId) {
    const extNum = applyExt[templateId]
    const ext = sipExts.find(e => e.extension === extNum)
    if (!ext) { alert('Poste introuvable.'); return }
    const phoneResp = await api.get(`/v1/companies/${companyId}/extensions/${ext.id}/phone`)
    if (!phoneResp.data) { alert('Ce poste n\'a pas d\'appareil attribué.'); return }
    await api.post(`/v1/companies/${companyId}/button-templates/${templateId}/apply/${phoneResp.data.id}`)
    alert(`Template appliqué au poste ${extNum}.`)
  }

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
        Templates de boutons ({templates.length})
      </div>
      <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
        Créés depuis la fiche contact d'un poste ("Sauvegarder comme template"), applicables ici à n'importe quel autre poste ayant un appareil attribué.
      </div>
      {templatesLoading ? <div style={{ fontSize: 13, color: '#6B7280' }}>Chargement...</div> : templates.length === 0 ? (
        <div className="empty-tab">Aucun template.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#F9FAFB' }}>
              {['Nom', 'Boutons', 'Appliquer à', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid #E5E7EB', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {templates.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                <td style={{ padding: '10px 12px', fontWeight: 600 }}>{t.name}</td>
                <td style={{ padding: '10px 12px' }}>{t.items.length}</td>
                <td style={{ padding: '10px 12px' }}>
                  <input placeholder="Numéro de poste" value={applyExt[t.id] || ''} onChange={e => setApplyExt(p => ({ ...p, [t.id]: e.target.value }))} style={{ fontSize: 12, width: 100, marginRight: 6 }} />
                  <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => applyTemplate(t.id)}>Appliquer</button>
                </td>
                <td style={{ padding: '10px 12px' }}><button className="inv-del-btn" onClick={() => removeTemplate(t.id)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── Templates de tenant scopés a un modele -- niveau le plus specifique avant
// le poste individuel (TASK-S044). Meme structure que TenantTemplatesSection,
// avec un selecteur marque/modele (memes donnees que ContactDetail.jsx).
function TenantModelTemplatesSection({ companyId, templates, loading, phoneModels, onRefresh }) {
  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', description: '' })
  const [newModel, setNewModel] = useState(null)
  const [expanded, setExpanded] = useState(null)

  function openNew() { setForm({ name: '', description: '' }); setNewModel(null); setShowNew(true) }
  function openEdit(t) { setForm({ name: t.name, description: t.description || '' }); setEditing(t) }
  function closeForm() { setShowNew(false); setEditing(null) }

  async function createTemplate() {
    if (!form.name.trim() || !newModel) return
    await api.post(`/v1/companies/${companyId}/tenant-model-templates`, { ...form, phone_model_id: newModel.id })
    closeForm()
    onRefresh()
  }
  async function saveEdit() {
    if (!form.name.trim()) return
    await api.put(`/v1/companies/${companyId}/tenant-model-templates/${editing.id}`, form)
    closeForm()
    onRefresh()
  }
  async function removeTemplate(id) {
    if (!confirm('Supprimer ce template ?')) return
    await api.delete(`/v1/companies/${companyId}/tenant-model-templates/${id}`)
    onRefresh()
  }
  async function toggleDefault(t) {
    await api.put(`/v1/companies/${companyId}/tenant-model-templates/${t.id}`, { is_default: !t.is_default })
    onRefresh()
  }
  async function saveOptions(t, options) {
    await api.put(`/v1/companies/${companyId}/tenant-model-templates/${t.id}`, { options })
    onRefresh()
  }
  function modelLabel(id) {
    const m = phoneModels.find(x => x.id === id)
    return m ? `${m.brand} ${m.model}` : '—'
  }

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Templates par modèle ({templates.length})
        </div>
        <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={openNew}>+ Nouveau template</button>
      </div>
      <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
        Le niveau le plus spécifique avant le poste lui-même — se superpose aux Templates de tenant ci-dessus, uniquement pour les postes du modèle choisi.
      </div>
      {loading ? <div style={{ fontSize: 13, color: '#6B7280' }}>Chargement...</div> : templates.length === 0 ? (
        <div className="empty-tab">Aucun template.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {templates.map(t => (
            <div key={t.id} style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 600, fontSize: 13, cursor: 'pointer' }} onClick={() => setExpanded(p => p === t.id ? null : t.id)}>
                  {expanded === t.id ? '▾' : '▸'} {t.name}
                </span>
                <span style={{ fontSize: 12, color: '#6B7280' }}>{modelLabel(t.phone_model_id)}</span>
                {t.is_default && <span style={{ background: '#DBEAFE', color: '#1D4ED8', fontSize: 11, fontWeight: 700, borderRadius: 10, padding: '2px 8px' }}>Défaut</span>}
                <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px', marginLeft: 'auto' }} onClick={() => openEdit(t)}>✎ Modifier</button>
                <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => toggleDefault(t)}>
                  {t.is_default ? 'Retirer défaut' : 'Définir défaut'}
                </button>
                <button className="inv-del-btn" onClick={() => removeTemplate(t.id)}>✕</button>
              </div>
              {t.description && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>{t.description}</div>}
              {expanded === t.id && (
                <PhoneOptionsEditor title="Options du template" value={t.options} onChange={next => saveOptions(t, next)} />
              )}
            </div>
          ))}
        </div>
      )}
      {(showNew || editing) && (
        <div className="modal-overlay" onClick={closeForm}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">{editing ? 'Modifier le template' : 'Nouveau template par modèle'}</h3>
            <div className="form-group"><label>Nom *</label><input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} autoFocus /></div>
            <div className="form-group"><label>Description</label><input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
            {!editing && (
              <div className="ifields-grid">
                <Autocomplete
                  label="Marque"
                  items={[...new Set(phoneModels.map(m => m.brand))].map(b => ({ id: b, label: b }))}
                  value={newModel ? { id: newModel.brand, label: newModel.brand } : null}
                  onSelect={item => setNewModel(item ? { brand: item.id, id: null, model: null } : null)}
                  openOnFocus
                />
                <Autocomplete
                  label="Modèle *"
                  items={phoneModels.filter(m => !newModel?.brand || m.brand === newModel.brand).map(m => ({ id: m.id, label: m.model, sub: m.device_type }))}
                  value={newModel?.id ? { id: newModel.id, label: newModel.model } : null}
                  onSelect={item => {
                    const m = phoneModels.find(x => x.id === item?.id) || null
                    setNewModel(m)
                  }}
                  openOnFocus
                />
              </div>
            )}
            {editing && <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>Modèle : {modelLabel(editing.phone_model_id)} (fixe après création)</div>}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={closeForm}>Annuler</button>
              <button className="btn-primary" onClick={editing ? saveEdit : createTemplate} disabled={!form.name.trim() || (!editing && !newModel)}>{editing ? 'Enregistrer' : 'Créer'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Succursales (company_sites) -- TASK-S010/S010.4, plusieurs sites par
// compagnie, chacun avec sa propre adresse 911 ET sa propre facturation.
// ERPCRM est maitre ici (synchronise vers SIPV pour le 911, voir sync_site).
function E911AddressesSection({ companyId }) {
  const [addresses, setAddresses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState(null)
  const emptyForm = { label: '', civic_number: '', street_name: '', unit: '', city: '', province: '', postal_code: '', country: 'CA', billing_contact_id: null, billing_contact_label: '', billing_email: '', notes: '' }
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [contacts, setContacts] = useState([])
  const [quickContactName, setQuickContactName] = useState(null)

  function onRefresh() {
    setLoading(true)
    api.get(`/v1/companies/${companyId}/sites`).then(r => setAddresses(r.data)).finally(() => setLoading(false))
  }
  useEffect(() => { onRefresh() }, [companyId])
  useEffect(() => { api.get('/v1/contacts').then(r => setContacts(r.data)) }, [])

  const contactItems = contacts.map(c => ({ id: c.id, label: `${c.first_name} ${c.last_name}`.trim() }))

  function openNew() { setForm(emptyForm); setFormError(''); setShowNew(true) }
  function openEdit(a) { setForm({ ...emptyForm, ...a }); setFormError(''); setEditing(a) }
  function closeForm() { setShowNew(false); setEditing(null) }

  function afterContactCreated(contact) {
    setContacts(prev => [...prev, contact])
    setQuickContactName(null)
    setForm(p => ({ ...p, billing_contact_id: contact.id, billing_contact_label: `${contact.first_name} ${contact.last_name}`.trim() }))
  }

  function missingFields() {
    const required = { label: 'Nom', civic_number: 'N° civique', street_name: 'Rue', city: 'Ville', province: 'Province', postal_code: 'Code postal' }
    return Object.entries(required).filter(([k]) => !form[k]?.trim()).map(([, label]) => label)
  }

  async function createAddress() {
    const missing = missingFields()
    if (missing.length) { setFormError(`Champs requis manquants : ${missing.join(', ')}`); return }
    setFormError('')
    setSaving(true)
    try {
      await api.post(`/v1/companies/${companyId}/sites`, form)
      closeForm()
      onRefresh()
    } catch (e) {
      setFormError(e.response?.data?.detail || 'Erreur lors de la création')
    } finally { setSaving(false) }
  }
  async function saveEdit() {
    const missing = missingFields()
    if (missing.length) { setFormError(`Champs requis manquants : ${missing.join(', ')}`); return }
    setFormError('')
    setSaving(true)
    try {
      await api.put(`/v1/companies/${companyId}/sites/${editing.id}`, form)
      closeForm()
      onRefresh()
    } catch (e) {
      setFormError(e.response?.data?.detail || 'Erreur lors de la sauvegarde')
    } finally { setSaving(false) }
  }
  async function deactivate(id) {
    if (!confirm('Désactiver cette succursale ? Les postes qui y sont assignés perdront leur localisation 911. Réactivable en tout temps.')) return
    await api.delete(`/v1/companies/${companyId}/sites/${id}`)
    onRefresh()
  }
  async function reactivate(a) {
    await api.put(`/v1/companies/${companyId}/sites/${a.id}`, { is_active: true })
    onRefresh()
  }
  async function makePrimary(a) {
    await api.put(`/v1/companies/${companyId}/sites/${a.id}`, { is_primary: true })
    onRefresh()
  }

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Succursales ({addresses.length})
        </div>
        <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={openNew}>+ Nouvelle succursale</button>
      </div>
      <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
        Une compagnie peut avoir plusieurs sites — chacun a sa propre adresse 911 (assignée ensuite par poste, fiche Contact) et peut être facturé séparément.
      </div>
      {loading ? <div style={{ fontSize: 13, color: '#6B7280' }}>Chargement...</div> : addresses.length === 0 ? (
        <div className="empty-tab">Aucune succursale.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#F9FAFB' }}>
              {['', 'Nom', 'Adresse', 'Contact facturation', 'Statut', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid #E5E7EB', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {addresses.map(a => (
              <tr key={a.id} style={{ borderBottom: '1px solid #F3F4F6', cursor: 'pointer', opacity: a.is_active ? 1 : 0.55 }} onClick={() => openEdit(a)}>
                <td style={{ padding: '10px 12px' }}>
                  {a.is_primary
                    ? <span title="Succursale principale (défaut pour le 911 des postes)" style={{ color: '#D97706' }}>★</span>
                    : a.is_active && <button title="Définir comme succursale principale" onClick={e => { e.stopPropagation(); makePrimary(a) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D1D5DB', fontSize: 15 }}>☆</button>}
                </td>
                <td style={{ padding: '10px 12px', fontWeight: 600 }}>{a.label}</td>
                <td style={{ padding: '10px 12px', color: '#6B7280' }}>{a.civic_number} {a.street_name}{a.unit ? `, ${a.unit}` : ''}, {a.city} {a.province} {a.postal_code}</td>
                <td style={{ padding: '10px 12px', color: '#6B7280', fontSize: 12 }}>{a.billing_contact_label || a.billing_email || '—'}</td>
                <td style={{ padding: '10px 12px' }}>{a.is_active ? <span style={{ color: '#059669', fontWeight: 600 }}>Active</span> : <span style={{ color: '#9CA3AF' }}>Désactivée</span>}</td>
                <td style={{ padding: '10px 12px' }}>
                  {a.is_active
                    ? <button className="inv-del-btn" onClick={e => { e.stopPropagation(); deactivate(a.id) }}>✕</button>
                    : <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={e => { e.stopPropagation(); reactivate(a) }}>Réactiver</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {(showNew || editing) && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ width: 640 }} onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">{editing ? 'Modifier la succursale' : 'Nouvelle succursale'}</h3>
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-group"><label>Nom *</label><input value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} placeholder="Ex: Siège social, Succursale Laval" autoFocus /></div>
            <div className="ifields-grid">
              <div className="form-group"><label>N° civique *</label><input value={form.civic_number} onChange={e => setForm(p => ({ ...p, civic_number: e.target.value }))} /></div>
              <div className="form-group"><label>Rue *</label><input value={form.street_name} onChange={e => setForm(p => ({ ...p, street_name: e.target.value }))} /></div>
              <div className="form-group"><label>Unité / local</label><input value={form.unit || ''} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))} /></div>
              <div className="form-group"><label>Ville *</label><input value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} /></div>
              <div className="form-group"><label>Province *</label><input value={form.province} onChange={e => setForm(p => ({ ...p, province: e.target.value.toUpperCase() }))} placeholder="QC" maxLength={2} /></div>
              <div className="form-group"><label>Code postal *</label><input value={form.postal_code} onChange={e => setForm(p => ({ ...p, postal_code: e.target.value }))} /></div>
              <Autocomplete
                label="Contact facturation"
                items={contactItems}
                value={form.billing_contact_id ? { id: form.billing_contact_id, label: form.billing_contact_label } : null}
                onSelect={item => setForm(p => ({
                  ...p, billing_contact_id: item?.id || null, billing_contact_label: item?.label || '',
                  billing_email: item ? (contacts.find(c => c.id === item.id)?.email || p.billing_email) : p.billing_email,
                }))}
                onCreate={name => setQuickContactName(name)}
                placeholder="Rechercher un contact..."
              />
              <div className="form-group"><label>Courriel facturation</label><input type="email" value={form.billing_email || ''} onChange={e => setForm(p => ({ ...p, billing_email: e.target.value }))} /></div>
            </div>
            <div className="form-group"><label>Notes</label><textarea rows={3} value={form.notes || ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={closeForm}>Annuler</button>
              <button className="btn-primary" onClick={editing ? saveEdit : createAddress} disabled={saving}>{saving ? '...' : editing ? 'Enregistrer' : 'Créer'}</button>
            </div>
          </div>
        </div>
      )}
      {quickContactName != null && (
        <QuickNewContact initialName={quickContactName} onCreated={afterContactCreated} onClose={() => setQuickContactName(null)} />
      )}
    </div>
  )
}

function NewDIDModal({ companyId, onClose, onCreated }) {
  const [form, setForm] = useState({ number: '', is_active: true })
  const [saving, setSaving] = useState(false)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  async function save() {
    if (!form.number.trim()) return
    setSaving(true)
    try {
      const r = await api.post(`/v1/telephony/company/${companyId}/dids`, form)
      onCreated(r.data)
    } finally { setSaving(false) }
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Nouveau DID</h3>
        <div className="form-group"><label>Numéro *</label><input value={form.number} onChange={e => f('number', e.target.value)} placeholder="Ex: 5149998888" autoFocus /></div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.is_active} onChange={e => f('is_active', e.target.checked)} style={{ width: 15, height: 15, accentColor: 'var(--brand)', cursor: 'pointer' }} />
          Actif
        </label>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving || !form.number.trim()}>{saving ? '...' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}

function NewExtModal({ companyId, dids, onClose, onCreated }) {
  const [form, setForm] = useState({ extension: '', name: '', did_id: '', voicemail_email: '' })
  const [saving, setSaving] = useState(false)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  async function save() {
    if (!form.extension.trim() || !form.name.trim()) return
    setSaving(true)
    try {
      const r = await api.post(`/v1/telephony/company/${companyId}/extensions`, {
        extension: form.extension, name: form.name,
        did_id: form.did_id || null, voicemail_email: form.voicemail_email || null,
      })
      onCreated(r.data)
    } finally { setSaving(false) }
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Nouvelle extension</h3>
        <div className="form-group"><label>Extension *</label><input value={form.extension} onChange={e => f('extension', e.target.value)} placeholder="Ex: 100" autoFocus /></div>
        <div className="form-group"><label>Nom *</label><input value={form.name} onChange={e => f('name', e.target.value)} /></div>
        <div className="form-group"><label>DID associé</label>
          <select value={form.did_id} onChange={e => f('did_id', e.target.value)}>
            <option value="">— Aucun —</option>
            {dids.filter(d => d.is_active).map(d => <option key={d.id} value={d.id}>{d.number}{d.notes ? ` — ${d.notes}` : ''}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Courriel messagerie</label><input type="email" value={form.voicemail_email} onChange={e => f('voicemail_email', e.target.value)} /></div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving || !form.extension.trim() || !form.name.trim()}>{saving ? '...' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Tâches Tab ────────────────────────────────────────────────────────────────
const PRIORITY_COLORS = { basse: '#6B7280', normale: 'var(--brand)', haute: '#D97706', urgente: '#DC2626' }
const PRIORITY_LABELS = { basse: 'Basse', normale: 'Normale', haute: 'Haute', urgente: 'Urgente' }
const STATUS_LABELS_T = { en_cours: 'En cours', attente_info_client: 'Attente client', attente_info_sip: 'Attente SIP', complete: 'Complété', annule: 'Annulé' }
const STATUS_COLORS_T = { en_cours: 'var(--brand)', attente_info_client: '#D97706', attente_info_sip: '#7C3AED', complete: '#16A34A', annule: '#9CA3AF' }

// ── Photos d'installation (TASK-024) ────────────────────────────────────────────
function PhotosTab({ companyId }) {
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef(null)

  const load = () => api.get(`/v1/companies/${companyId}/photos`).then(r => { setPhotos(r.data); setLoading(false) })
  useEffect(() => { load() }, [companyId])

  async function upload(file) {
    const caption = prompt('Légende (optionnel) :') || ''
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (caption) fd.append('caption', caption)
      await api.post(`/v1/companies/${companyId}/photos`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      await load()
    } finally {
      setUploading(false)
    }
  }

  async function remove(photoId) {
    if (!confirm('Retirer cette photo ?')) return
    await api.delete(`/v1/companies/${companyId}/photos/${photoId}`)
    load()
  }

  if (loading) return <div className="empty-tab">Chargement...</div>

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <input ref={fileInput} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => e.target.files[0] && upload(e.target.files[0])} />
        <button className="btn-secondary" disabled={uploading} onClick={() => fileInput.current.click()}>
          {uploading ? 'Envoi...' : '+ Ajouter une photo'}
        </button>
      </div>
      {photos.length === 0 && <div className="empty-tab">Aucune photo d'installation.</div>}
      {photos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          {photos.map(p => (
            <div key={p.id} style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
              <a href={`${api.defaults.baseURL}${p.url}`} target="_blank" rel="noreferrer">
                <img src={`${api.defaults.baseURL}${p.url}`} alt={p.caption || 'Photo installation'}
                  style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }} />
              </a>
              <div style={{ padding: '8px 10px' }}>
                <div style={{ fontSize: 13, color: '#374151' }}>{p.caption || <span style={{ color: '#9CA3AF' }}>Sans légende</span>}</div>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{p.uploaded_by || '—'} · {new Date(p.created_at).toLocaleDateString('fr-CA')}</span>
                  <button onClick={() => remove(p.id)} style={{ color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11 }}>Retirer</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TachesTab({ companyId, companyName, onShowTask }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCompleted, setShowCompleted] = useState(false)

  useEffect(() => {
    api.get(`/v1/tasks?company_id=${companyId}`).then(r => { setTasks(r.data); setLoading(false) })
  }, [companyId])

  async function toggleComplete(task) {
    if (task.completed) {
      const r = await api.put(`/v1/tasks/${task.id}`, { completed: false, status: 'en_cours' })
      setTasks(prev => prev.map(t => t.id === r.data.id ? r.data : t))
    } else {
      const r = await api.post(`/v1/tasks/${task.id}/complete`)
      setTasks(prev => prev.map(t => t.id === r.data.id ? r.data : t))
    }
  }

  const filtered = tasks.filter(t => showCompleted || !t.completed)

  if (loading) return <div className="empty-tab">Chargement...</div>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6B7280', cursor: 'pointer' }}>
          <input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} style={{ accentColor: 'var(--brand)' }} />
          Afficher complétées
        </label>
        <button className="btn-secondary" onClick={onShowTask} style={{ fontSize: 13 }}>+ Nouvelle tâche</button>
      </div>
      {filtered.length === 0 ? (
        <div className="empty-tab">Aucune tâche en cours pour ce client.</div>
      ) : (
        filtered.map(t => {
          const overdue = t.due_date && !t.completed && new Date(t.due_date) < new Date(new Date().toDateString())
          return (
            <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 8, border: '1px solid #E5E7EB', marginBottom: 8, background: t.completed ? '#F9FAFB' : '#fff' }}>
              <input type="checkbox" checked={t.completed} onChange={() => toggleComplete(t)} style={{ width: 15, height: 15, accentColor: 'var(--brand)', marginTop: 2, cursor: 'pointer', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: t.completed ? '#9CA3AF' : '#111827', textDecoration: t.completed ? 'line-through' : 'none' }}>{t.title}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: PRIORITY_COLORS[t.priority], background: '#F3F4F6', padding: '1px 6px', borderRadius: 8 }}>{PRIORITY_LABELS[t.priority]}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLORS_T[t.status], background: '#F3F4F6', padding: '1px 6px', borderRadius: 8 }}>{STATUS_LABELS_T[t.status]}</span>
                </div>
                {t.description && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 3 }}>{t.description}</div>}
                <div style={{ fontSize: 12, color: overdue ? '#DC2626' : '#9CA3AF', marginTop: 4, display: 'flex', gap: 12 }}>
                  {t.due_date && <span>{overdue ? '⚠ ' : ''}Prévu : {new Date(t.due_date + 'T12:00:00').toLocaleDateString('fr-CA')}{t.due_time ? ` ${t.due_time}` : ''}</span>}
                  {t.assigned_name && <span>👤 {t.assigned_name}</span>}
                  {t.contact_name && <span>· {t.contact_name}</span>}
                  {t.ticket_title && <span>🎫 {t.ticket_title}</span>}
                </div>
                {t.checklist_items?.length > 0 && (
                  <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                    Checklist : {t.checklist_items.filter(c => c.completed).length}/{t.checklist_items.length}
                    {' '}{'▓'.repeat(t.checklist_items.filter(c => c.completed).length)}{'░'.repeat(t.checklist_items.length - t.checklist_items.filter(c => c.completed).length)}
                  </div>
                )}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
