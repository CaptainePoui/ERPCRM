import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import Autocomplete from '../components/Autocomplete'
import NewTicketModal from '../components/NewTicketModal'
import NewInvoiceModal from '../components/NewInvoiceModal'
import NewTaskModal from '../components/NewTaskModal'
import './CompanyDetail.css'

const TABS = ['Général', 'Contacts', 'Maintenance', 'Inventaire', 'Téléphonie', 'Tâches', 'Journal']

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
            style={{ '--sc': s.color }}
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
                style={{ '--sc': s.color }}
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
  const [tab, setTab] = useState(0)
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

  async function toggleSipvTenant() {
    if (confirmSipv === null) return
    setSipvError('')
    try {
      const r = await api.post(`/v1/companies/${id}/sipv-tenant`, { enabled: confirmSipv })
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
                <strong> {c.name}</strong> (compte <code>{c.account_number}</code>).
                Assure-toi que cette compagnie a vraiment besoin de service téléphonique
                avant de continuer — ne coche pas ça par erreur.
              </p>
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
                <div className="record-meta">
                  Créé le {new Date(c.created_at).toLocaleString('fr-CA')}
                  {c.updated_at !== c.created_at && <> · Modifié le {new Date(c.updated_at).toLocaleString('fr-CA')}</>}
                </div>
              </div>
            )}

            {tab === 1 && <ContactsTab companyId={id} contacts={c.contacts} functions={functions} onRefresh={load} />}
            {tab === 2 && <MaintenanceTab companyId={id} />}
            {tab === 3 && <InventaireTab companyId={id} />}
            {tab === 4 && <TelephonyTab companyId={id} />}
            {tab === 5 && <TachesTab companyId={id} companyName={c.name} onShowTask={() => setShowTask(true)} />}
            {tab === 6 && <JournalTab entityId={id} />}
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

  return (
    <div>
      {comms.length === 0 && !adding && <div className="empty-tab">Aucune coordonnée enregistrée.</div>}
      {comms.map(c => (
        <div key={c.id} className="comm-row">
          <span className="comm-type-badge">{TYPE_LABELS[c.channel_type] || c.channel_type}</span>
          <span className="comm-value">{c.value}</span>
          {c.label && <span className="comm-label">{c.label}</span>}
          {c.is_primary && <span className="primary-badge">Principal</span>}
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
function ContactsTab({ companyId, contacts, functions, onRefresh }) {
  const [linking, setLinking] = useState(false)
  const [allContacts, setAllContacts] = useState([])
  const [form, setForm] = useState({ contact_id: '', email: '', function_ids: [], is_primary: false })
  const [saving, setSaving] = useState(false)
  const [editingEmail, setEditingEmail] = useState(null) // contact_id being edited
  const [emailDraft, setEmailDraft] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    if (linking) api.get('/v1/contacts').then(r => setAllContacts(r.data))
  }, [linking])

  function toggleFn(fid) {
    setForm(p => ({
      ...p,
      function_ids: p.function_ids.includes(fid) ? p.function_ids.filter(x => x !== fid) : [...p.function_ids, fid]
    }))
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
            <button className="contact-name-link" onClick={() => navigate(`/contacts/${c.contact_id}`)}>
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
      {!linking && <button className="btn-secondary" onClick={() => setLinking(true)}>+ Lier un contact</button>}
      {linking && (
        <div className="inline-form">
          <select value={form.contact_id} onChange={e => setForm(p => ({ ...p, contact_id: e.target.value }))}>
            <option value="">— Sélectionner un contact —</option>
            {allContacts.map(c => <option key={c.id} value={c.id}>{c.last_name}, {c.first_name}</option>)}
          </select>
          <input
            type="email"
            placeholder="Courriel professionnel (optionnel)"
            value={form.email}
            onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
          />
          <div className="fn-selector">
            <label>Fonctions :</label>
            <div className="fn-options">
              {functions.map(fn => (
                <label key={fn.id} className="fn-option">
                  <input type="checkbox" checked={form.function_ids.includes(fn.id)} onChange={() => toggleFn(fn.id)} />
                  {fn.name}
                </label>
              ))}
            </div>
          </div>
          <label className="checkbox-label">
            <input type="checkbox" checked={form.is_primary} onChange={e => setForm(p => ({ ...p, is_primary: e.target.checked }))} />
            Contact principal
          </label>
          <div className="inline-form-actions">
            <button className="btn-secondary" onClick={() => setLinking(false)}>Annuler</button>
            <button className="btn-primary" onClick={link} disabled={saving || !form.contact_id}>{saving ? '...' : 'Lier'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Journal ───────────────────────────────────────────────────────────────────
function JournalTab({ entityId }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/v1/entities/${entityId}/logs`)
      .then(r => setLogs(r.data))
      .finally(() => setLoading(false))
  }, [entityId])

  if (loading) return <div className="empty-tab">Chargement...</div>
  if (!logs.length) return <div className="empty-tab">Aucune entrée dans le journal.</div>

  return (
    <div className="journal-feed">
      {logs.map(l => (
        <div key={l.id} className="journal-entry">
          <div className="journal-dot" />
          <div className="journal-body">
            <div className="journal-meta">
              <span className="journal-user">{l.user_name}</span>
              <span className="journal-time">{new Date(l.created_at).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </div>
            <div className="journal-action">
              <span className="journal-action-label">{l.action_label}</span>
              {l.field_label && <span className="journal-field"> — {l.field_label}</span>}
            </div>
            {l.old_value !== null && l.new_value !== null && (
              <div className="journal-change">
                <span className="journal-old">{l.old_value || '—'}</span>
                <span className="journal-arrow">→</span>
                <span className="journal-new">{l.new_value || '—'}</span>
              </div>
            )}
            {l.description && !l.field_label && (
              <div className="journal-desc">{l.description}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Maintenance Tab ───────────────────────────────────────────────────────────
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
                <td style={{ padding: '10px 12px' }}><span style={{ background: '#EFF6FF', color: '#184FA0', fontSize: 11, fontWeight: 700, borderRadius: 10, padding: '2px 7px', textTransform: 'uppercase' }}>{EQ_LABELS[e.category] || e.category}</span></td>
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
const DID_STATUS_STYLES = { actif:{color:'#059669',bg:'#F0FDF4'}, inactif:{color:'#6B7280',bg:'#F3F4F6'}, en_transit:{color:'#D97706',bg:'#FFFBEB'} }

function TelephonyTab({ companyId }) {
  const [dids, setDids] = useState([])
  const [exts, setExts] = useState([])
  const [sipExts, setSipExts] = useState([])
  const [sipExtsLoading, setSipExtsLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [showNewDid, setShowNewDid] = useState(false)
  const [showNewExt, setShowNewExt] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get(`/v1/telephony/company/${companyId}/dids`),
      api.get(`/v1/telephony/company/${companyId}/extensions`),
    ]).then(([d, e]) => { setDids(d.data); setExts(e.data) }).finally(() => setLoading(false))
    loadSipExtensions()
  }, [companyId])

  function loadSipExtensions() {
    setSipExtsLoading(true)
    api.get(`/v1/companies/${companyId}/sip-extensions`)
      .then(r => setSipExts(r.data))
      .finally(() => setSipExtsLoading(false))
  }

  async function removeDid(id) { if (!confirm('Supprimer ce DID ?')) return; await api.delete(`/v1/telephony/dids/${id}`); setDids(p => p.filter(d => d.id !== id)) }
  async function removeExt(id) { if (!confirm('Supprimer cette extension ?')) return; await api.delete(`/v1/telephony/extensions/${id}`); setExts(p => p.filter(e => e.id !== id)) }

  if (loading) return <div className="loading">Chargement...</div>

  const renderStatus = (status) => {
    const st = DID_STATUS_STYLES[status] || DID_STATUS_STYLES.actif
    return <span style={{ background: st.bg, color: st.color, fontSize: 11, fontWeight: 700, borderRadius: 10, padding: '2px 8px' }}>{status === 'en_transit' ? 'En transit' : status.charAt(0).toUpperCase() + status.slice(1)}</span>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Postes SIP reels (SIPV) */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Postes SIP ({sipExts.length})</div>
          <button className="btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={loadSipExtensions}>↻ Actualiser</button>
        </div>
        {sipExtsLoading ? <div className="empty-tab">Chargement...</div> : sipExts.length === 0 ? (
          <div className="empty-tab">Aucun poste SIP (tenant SIPV inactif ou aucune extension créée — voir la case "Tenant téléphonique SIPV" dans l'onglet Général).</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#F9FAFB' }}>
                {['Poste','Nom','Username SIP','Statut connexion','Actif'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid #E5E7EB', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sipExts.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, fontFamily: 'monospace' }}>{e.extension}</td>
                  <td style={{ padding: '10px 12px' }}>{e.name}</td>
                  <td style={{ padding: '10px 12px', color: '#6B7280' }}><code>{e.username}</code></td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      background: e.registered ? '#F0FDF4' : '#F3F4F6',
                      color: e.registered ? '#059669' : '#6B7280',
                      fontSize: 11, fontWeight: 700, borderRadius: 10, padding: '2px 8px',
                    }}>
                      {e.registered ? 'Enregistré' : 'Hors ligne'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#6B7280', fontSize: 12 }}>{e.is_active ? 'Oui' : 'Non'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* DIDs */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Numéros DID ({dids.length})</div>
          <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setShowNewDid(true)}>+ Ajouter</button>
        </div>
        {dids.length === 0 ? <div className="empty-tab">Aucun DID enregistré.</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#F9FAFB' }}>
                {['Numéro','Type','Étiquette','Transporteur','Statut',''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid #E5E7EB', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dids.map(d => (
                <tr key={d.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, fontFamily: 'monospace' }}>{d.number}</td>
                  <td style={{ padding: '10px 12px', color: '#6B7280', fontSize: 12 }}>{d.type_label}</td>
                  <td style={{ padding: '10px 12px' }}>{d.label || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#6B7280' }}>{d.carrier || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>{renderStatus(d.status)}</td>
                  <td style={{ padding: '10px 12px' }}><button className="inv-del-btn" onClick={() => removeDid(d.id)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Extensions */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Extensions ({exts.length})</div>
          <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setShowNewExt(true)}>+ Ajouter</button>
        </div>
        {exts.length === 0 ? <div className="empty-tab">Aucune extension enregistrée.</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#F9FAFB' }}>
                {['Ext.','Nom','DID associé','Messagerie','Actif',''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid #E5E7EB', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {exts.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, fontFamily: 'monospace' }}>{e.extension}</td>
                  <td style={{ padding: '10px 12px' }}>{e.name}</td>
                  <td style={{ padding: '10px 12px', color: '#6B7280', fontFamily: 'monospace', fontSize: 12 }}>{e.did_number || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#6B7280', fontSize: 12 }}>{e.voicemail_email || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>{e.is_active ? <span style={{ color: '#059669', fontWeight: 600 }}>Oui</span> : <span style={{ color: '#9CA3AF' }}>Non</span>}</td>
                  <td style={{ padding: '10px 12px' }}><button className="inv-del-btn" onClick={() => removeExt(e.id)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNewDid && (
        <NewDIDModal companyId={companyId} onClose={() => setShowNewDid(false)}
          onCreated={d => { setDids(p => [...p, d]); setShowNewDid(false) }} />
      )}
      {showNewExt && (
        <NewExtModal companyId={companyId} dids={dids} onClose={() => setShowNewExt(false)}
          onCreated={e => { setExts(p => [...p, e]); setShowNewExt(false) }} />
      )}
    </div>
  )
}

function NewDIDModal({ companyId, onClose, onCreated }) {
  const [form, setForm] = useState({ number: '', label: '', carrier: '', did_type: 'did', status: 'actif' })
  const [saving, setSaving] = useState(false)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  async function save() {
    if (!form.number.trim()) return
    setSaving(true)
    try {
      const r = await api.post(`/v1/telephony/company/${companyId}/dids`, { ...form, label: form.label || null, carrier: form.carrier || null })
      onCreated(r.data)
    } finally { setSaving(false) }
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Nouveau DID</h3>
        <div className="form-group"><label>Numéro *</label><input value={form.number} onChange={e => f('number', e.target.value)} placeholder="Ex: 5149998888" autoFocus /></div>
        <div className="form-group"><label>Type</label>
          <select value={form.did_type} onChange={e => f('did_type', e.target.value)}>
            <option value="did">DID</option><option value="sip_trunk">Trunk SIP</option><option value="toll_free">Sans frais</option>
          </select>
        </div>
        <div className="form-group"><label>Étiquette</label><input value={form.label} onChange={e => f('label', e.target.value)} /></div>
        <div className="form-group"><label>Transporteur</label><input value={form.carrier} onChange={e => f('carrier', e.target.value)} /></div>
        <div className="form-group"><label>Statut</label>
          <select value={form.status} onChange={e => f('status', e.target.value)}>
            <option value="actif">Actif</option><option value="inactif">Inactif</option><option value="en_transit">En transit (portage)</option>
          </select>
        </div>
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
            {dids.filter(d => d.status === 'actif').map(d => <option key={d.id} value={d.id}>{d.number}{d.label ? ` — ${d.label}` : ''}</option>)}
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
const PRIORITY_COLORS = { basse: '#6B7280', normale: '#2563EB', haute: '#D97706', urgente: '#DC2626' }
const PRIORITY_LABELS = { basse: 'Basse', normale: 'Normale', haute: 'Haute', urgente: 'Urgente' }
const STATUS_LABELS_T = { en_cours: 'En cours', attente_info_client: 'Attente client', attente_info_sip: 'Attente SIP', complete: 'Complété', annule: 'Annulé' }
const STATUS_COLORS_T = { en_cours: '#2563EB', attente_info_client: '#D97706', attente_info_sip: '#7C3AED', complete: '#16A34A', annule: '#9CA3AF' }

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
          <input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} style={{ accentColor: '#184FA0' }} />
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
              <input type="checkbox" checked={t.completed} onChange={() => toggleComplete(t)} style={{ width: 15, height: 15, accentColor: '#184FA0', marginTop: 2, cursor: 'pointer', flexShrink: 0 }} />
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
