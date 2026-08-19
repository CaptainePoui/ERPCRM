import { useState, useEffect, useRef, Fragment } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../services/api'
import NewTicketModal from '../components/NewTicketModal'
import NewInvoiceModal from '../components/NewInvoiceModal'
import NewTaskModal from '../components/NewTaskModal'
import JournalFeed from '../components/JournalFeed'
import Autocomplete from '../components/Autocomplete'
import QuickNewContact from '../components/QuickNewContact'
import QuickNewCompany from '../components/QuickNewCompany'
import PhoneOptionsEditor from '../components/PhoneOptionsEditor'
import { contrastText } from '../utils/color'
import './CompanyDetail.css'

// ── Inline field (same pattern as CompanyDetail) ──────────────────────────────
function InlineField({ label, value, onSave, type = 'text', multiline }) {
  const [active, setActive] = useState(false)
  const [val, setVal] = useState(value || '')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { setVal(value || '') }, [value])
  useEffect(() => { if (active && inputRef.current) inputRef.current.focus() }, [active])

  async function confirm() {
    setSaving(true)
    try { await onSave(val) } finally { setSaving(false); setActive(false) }
  }

  return (
    <div className="ifield">
      <div className="ifield-label">{label}</div>
      {active ? (
        <div className="ifield-edit">
          {multiline
            ? <textarea ref={inputRef} value={val} rows={3} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === 'Escape' && setActive(false)} />
            : <input ref={inputRef} type={type} value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') setActive(false) }} />
          }
          <button className="ifield-ok" onClick={confirm} disabled={saving}>✓</button>
          <button className="ifield-x" onClick={() => { setVal(value || ''); setActive(false) }}>✕</button>
        </div>
      ) : (
        <div className="ifield-view" onClick={() => setActive(true)}>
          {val ? <span className="ifield-value">{val}</span> : <span className="ifield-empty">Non indiqué</span>}
          <span className="ifield-pencil">✎</span>
        </div>
      )}
    </div>
  )
}

// ── Status selector (same as CompanyDetail) ───────────────────────────────────
function StatusSelector({ entityId, statuses: initialStatuses, allStatuses, apiPath }) {
  const [current, setCurrent] = useState(initialStatuses)
  const [saving, setSaving] = useState(null)

  useEffect(() => { setCurrent(initialStatuses) }, [entityId])

  async function toggle(status) {
    setSaving(status.id)
    const isActive = current.find(s => s.id === status.id)
    setCurrent(prev => isActive ? prev.filter(s => s.id !== status.id) : [...prev, status])
    try {
      if (isActive) await api.delete(`${apiPath}/${entityId}/statuses/${status.id}`)
      else await api.post(`${apiPath}/${entityId}/statuses/${status.id}`)
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
          >{saving === s.id ? '…' : s.name}</button>
        )
      })}
    </div>
  )
}

// ── New contact form ──────────────────────────────────────────────────────────
function NewContactForm() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', mobile: '', extension: '', email: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [companies, setCompanies] = useState([])
  const [company, setCompany] = useState(null) // { id, label }
  const [newCompanyName, setNewCompanyName] = useState(null)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => { api.get('/v1/companies').then(r => setCompanies(r.data)) }, [])
  const companyItems = companies.map(co => ({ id: co.id, label: co.name }))

  function afterCompanyCreated(co) {
    setCompanies(prev => [...prev, co])
    setCompany({ id: co.id, label: co.name })
    setNewCompanyName(null)
  }

  async function save() {
    if (!form.first_name.trim()) { setError('Le prénom est requis.'); return }
    if (!company?.id) { setError('La compagnie est requise.'); return }
    setSaving(true)
    try {
      const r = await api.post('/v1/contacts', form)
      await api.post(`/v1/companies/${company.id}/contacts`, { contact_id: r.data.id, is_primary: true })
      navigate(`/contacts/${r.data.id}`)
    } catch { setError('Erreur lors de la création.') } finally { setSaving(false) }
  }

  return (
    <div className="new-form">
      {error && <div className="form-error">{error}</div>}
      <div className="form-grid">
        <div className="form-group">
          <label>Prénom *</label>
          <input value={form.first_name} onChange={e => f('first_name', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Nom</label>
          <input value={form.last_name} onChange={e => f('last_name', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Téléphone</label>
          <input value={form.phone} onChange={e => f('phone', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Cellulaire</label>
          <input value={form.mobile} onChange={e => f('mobile', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Poste</label>
          <input value={form.extension} onChange={e => f('extension', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Courriel</label>
          <input type="email" value={form.email} onChange={e => f('email', e.target.value)} />
        </div>
        <Autocomplete
          label="Compagnie"
          required
          items={companyItems}
          value={company}
          onSelect={setCompany}
          onCreate={name => setNewCompanyName(name)}
          placeholder="Rechercher une compagnie..."
        />
      </div>
      {newCompanyName != null && (
        <QuickNewCompany initialName={newCompanyName} onCreated={afterCompanyCreated} onClose={() => setNewCompanyName(null)} />
      )}
      <div className="new-form-actions">
        <button className="btn-secondary" onClick={() => navigate('/contacts')}>Annuler</button>
        <button className="btn-primary" onClick={save} disabled={saving || !company?.id}>{saving ? 'Création...' : 'Créer le contact'}</button>
      </div>
    </div>
  )
}

// Détail complet d'un appel (TASK-032.2) -- même composant que CompanyDetail.jsx.
function CdrDetailRow({ c, colSpan }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: '8px 12px', background: '#F3F4F6', fontSize: 11 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6 }}>
          <div><span style={{ color: '#6B7280' }}>Réponse : </span>{c.answer_time ? new Date(c.answer_time).toLocaleString('fr-CA') : '—'}</div>
          <div><span style={{ color: '#6B7280' }}>Fin : </span>{c.end_time ? new Date(c.end_time).toLocaleString('fr-CA') : '—'}</div>
          <div><span style={{ color: '#6B7280' }}>Durée totale : </span>{c.duration != null ? `${c.duration}s` : '—'}</div>
          <div><span style={{ color: '#6B7280' }}>Nom afficheur : </span>{c.clid || '—'}</div>
          <div><span style={{ color: '#6B7280' }}>Coût : </span>{c.cost != null ? `${c.cost} $` : '—'}</div>
          <div><span style={{ color: '#6B7280' }}>Taux/min : </span>{c.rate_per_minute != null ? `${c.rate_per_minute} $` : '—'}</div>
          <div style={{ gridColumn: '1 / -1' }}><span style={{ color: '#6B7280' }}>ID appel : </span><code>{c.uniqueid || '—'}</code></div>
        </div>
      </td>
    </tr>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ContactDetail({ isNew }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fromCompanyId = searchParams.get('fromCompanyId')
  const fromCompanyName = searchParams.get('fromCompanyName')
  const fromTab = searchParams.get('fromTab')
  const [contact, setContact] = useState(null)
  const [loading, setLoading] = useState(!isNew)
  const [statuses, setStatuses] = useState([])
  const [showTicket, setShowTicket] = useState(false)
  const [showInvoice, setShowInvoice] = useState(false)
  const [showTask, setShowTask] = useState(false)
  const [showJournal, setShowJournal] = useState(false)
  const [sipExt, setSipExt] = useState(null)
  const [sipExtLoading, setSipExtLoading] = useState(false)
  const [connInfo, setConnInfo] = useState(null)
  const [connInfoLoading, setConnInfoLoading] = useState(false)
  const [phone, setPhone] = useState(null)
  const [phoneModels, setPhoneModels] = useState([])
  const [tenantModelTemplates, setTenantModelTemplates] = useState([])
  const [e911Addresses, setE911Addresses] = useState([])
  const [e911Assignment, setE911Assignment] = useState(null)
  const [e911Form, setE911Form] = useState({ e911_address_id: '', emergency_location: '', floor: '', office: '', alert_email: '' })
  const [companyDids, setCompanyDids] = useState([])
  const [showNewSuccursale, setShowNewSuccursale] = useState(false)
  const emptySuccursaleForm = { label: '', civic_number: '', street_name: '', unit: '', city: '', province: '', postal_code: '', country: 'CA', billing_contact_id: null, billing_contact_label: '', billing_email: '', notes: '' }
  const [newSuccursaleForm, setNewSuccursaleForm] = useState(emptySuccursaleForm)
  const [newSuccursaleSaving, setNewSuccursaleSaving] = useState(false)
  const [newSuccursaleError, setNewSuccursaleError] = useState('')
  const [allContactsForSite, setAllContactsForSite] = useState([])
  const [quickContactName, setQuickContactName] = useState(null)
  const [voicemailBox, setVoicemailBox] = useState(null)
  const [vmForm, setVmForm] = useState({ email: '', email_on_new: true, attach_message: true, skip_instructions: false, password: '' })
  const [uploadingGreeting, setUploadingGreeting] = useState(false)
  // Indice visuel de sauvegarde (meme demande/pattern que PhoneOptionsEditor,
  // 2026-08-04) -- Philippe a clique "Enregistrer" sans retour visuel et a cru
  // que ca ne partait pas au serveur (verifie : ca partait bien, juste aucun
  // indice). Chaque champ sauvegarde maintenant lui-meme des qu'on le quitte
  // (plus de bouton "Enregistrer" groupe, source de confusion), en bleu tant
  // que la sauvegarde est en cours.
  const [vmSavingFields, setVmSavingFields] = useState(new Set())
  const [ringsSaving, setRingsSaving] = useState(false)
  const [showAttribute, setShowAttribute] = useState(false)
  const [attributeForm, setAttributeForm] = useState({ brand: null, model: null, mac_address: '', serial_number: '' })
  const [showButtons, setShowButtons] = useState(false)
  const [buttons, setButtons] = useState([])
  const [buttonsLoading, setButtonsLoading] = useState(false)
  // TASK-033 : popup de confirmation "Synchroniser avec SIPV" -- parite avec
  // le popup "Tenant telephonique SIPV" de CompanyDetail.jsx (meme structure).
  const [confirmSipv, setConfirmSipv] = useState(false)
  const [sipvError, setSipvError] = useState('')
  const [sipvCreating, setSipvCreating] = useState(false)
  const [billingStartDate, setBillingStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [billingFrequency, setBillingFrequency] = useState('mensuel')
  const [extensionNumber, setExtensionNumber] = useState('')
  // TASK-032 : historique d'appels de ce poste seulement, meme zone que record_*.
  const [cdrItems, setCdrItems] = useState([])
  const [cdrTotal, setCdrTotal] = useState(0)
  const [cdrPage, setCdrPage] = useState(1)
  const [cdrLoading, setCdrLoading] = useState(false)
  const cdrPageSize = 10
  // Demande de Philippe (2026-08-19) : CDR dans son propre onglet, pas en
  // permanence affiche sur la meme page que le reste du poste SIP.
  const [showCdr, setShowCdr] = useState(false)
  const [expandedCdrId, setExpandedCdrId] = useState(null)

  const companyId = contact?.companies?.find(x => x.is_primary)?.company_id || contact?.companies?.[0]?.company_id

  useEffect(() => {
    api.get('/v1/ref/statuses').then(r => setStatuses(r.data))
    if (!isNew) load()
  }, [id, isNew])

  // Statut en direct (registered/call_state) pousse toutes les 5s -- pas de vrai
  // push serveur (WebSocket) en place, mais un poll cible sur ce seul endpoint
  // (silencieux, sans spinner) au lieu de recharger toute la fiche contact.
  useEffect(() => {
    if (isNew || !contact?.sipv_sync) return
    const timer = setInterval(() => loadSipExtension(true), 5000)
    return () => clearInterval(timer)
  }, [id, isNew, contact?.sipv_sync])

  // TASK-032 : historique d'appels de ce poste -- ne recharge que si le numero de
  // poste change reellement (pas a chaque poll de statut, qui renvoie un nouvel
  // objet sipExt toutes les 5s).
  useEffect(() => {
    if (!sipExt?.extension) { setCdrItems([]); setCdrTotal(0); return }
    setCdrLoading(true)
    api.get(`/v1/contacts/${id}/sip-extension/cdr`, { params: { page: cdrPage, page_size: cdrPageSize } })
      .then(r => { setCdrItems(r.data.items); setCdrTotal(r.data.total) })
      .finally(() => setCdrLoading(false))
  }, [id, sipExt?.extension, cdrPage])

  async function load() {
    setLoading(true)
    const r = await api.get(`/v1/contacts/${id}`)
    setContact(r.data)
    setLoading(false)
    if (r.data.sipv_sync) {
      const primary = r.data.companies?.find(x => x.is_primary) || r.data.companies?.[0]
      loadSipExtension(false, primary?.company_id)
    }
  }

  async function loadSipExtension(silent, companyIdOverride) {
    if (!silent) setSipExtLoading(true)
    try {
      const r = await api.get(`/v1/contacts/${id}/sip-extension`)
      setSipExt(r.data)
      if (r.data && !silent) {
        loadPhone()
        loadE911(r.data.extension, companyIdOverride || companyId)
        loadVoicemail()
      }
    } finally {
      if (!silent) setSipExtLoading(false)
    }
  }

  async function loadE911(extNumber, cIdOverride) {
    const [addrRes, assignRes] = await Promise.all([
      api.get(`/v1/contacts/${id}/sip-extension/911/addresses`),
      api.get(`/v1/contacts/${id}/sip-extension/911`),
    ])
    setE911Addresses(addrRes.data)
    if (assignRes.data) {
      setE911Assignment(assignRes.data)
      setE911Form({
        e911_address_id: assignRes.data.e911_address_id,
        emergency_location: assignRes.data.emergency_location || '',
        floor: assignRes.data.floor || '',
        office: assignRes.data.office || '',
        alert_email: assignRes.data.alert_email || '',
      })
    } else {
      // Aucune assignation propre a ce poste -- auto-assigne la succursale
      // principale de la compagnie par defaut (demande Philippe 2026-08-05,
      // pour ne pas avoir a le faire poste par poste). Reel enregistrement
      // (pas juste un defaut visuel) : le 911 doit avoir une vraie adresse
      // cote SIPV pour chaque poste actif, pas juste une valeur d'affichage.
      const primary = addrRes.data.find(a => a.is_primary)
      if (primary) {
        const r = await api.put(`/v1/contacts/${id}/sip-extension/911`, { e911_address_id: primary.id })
        setE911Assignment(r.data)
        setE911Form(p => ({ ...p, e911_address_id: r.data.e911_address_id }))
      }
    }
    const cid = cIdOverride || companyId
    if (cid) {
      const didsRes = await api.get(`/v1/telephony/company/${cid}/dids`)
      setCompanyDids(didsRes.data)
    }
  }

  // Choisir un DID en Caller ID (externe) suggere la succursale liee a ce DID
  // (site_id, gere dans Compagnie -- Téléphonie) si le poste n'a pas deja sa
  // propre assignation 911 (TASK-S010.5, remplace le lien DID/SIPV separe).
  function onCallerIdExternalChange(number) {
    saveSipExtField('caller_id_external_number', number)
    if (e911Assignment) return
    const did = companyDids.find(d => d.number === number)
    if (did?.site_id) {
      setE911Form(p => ({ ...p, e911_address_id: did.site_id }))
    }
  }

  async function saveE911() {
    if (!e911Form.e911_address_id) return
    const r = await api.put(`/v1/contacts/${id}/sip-extension/911`, e911Form)
    setE911Assignment(r.data)
  }

  async function removeE911() {
    if (!confirm('Retirer la localisation 911 de ce poste ?')) return
    await api.delete(`/v1/contacts/${id}/sip-extension/911`)
    setE911Assignment(null)
    setE911Form({ e911_address_id: '', emergency_location: '', floor: '', office: '', alert_email: '' })
  }

  function openNewSuccursale() {
    setNewSuccursaleForm(emptySuccursaleForm)
    setNewSuccursaleError('')
    setShowNewSuccursale(true)
    if (allContactsForSite.length === 0) api.get('/v1/contacts').then(r => setAllContactsForSite(r.data))
  }

  function afterSiteContactCreated(contact) {
    setAllContactsForSite(prev => [...prev, contact])
    setQuickContactName(null)
    setNewSuccursaleForm(p => ({ ...p, billing_contact_id: contact.id, billing_contact_label: `${contact.first_name} ${contact.last_name}`.trim() }))
  }

  async function createSuccursale() {
    const f = newSuccursaleForm
    const required = { label: 'Nom', civic_number: 'N° civique', street_name: 'Rue', city: 'Ville', province: 'Province', postal_code: 'Code postal' }
    const missing = Object.entries(required).filter(([k]) => !f[k]?.trim()).map(([, label]) => label)
    if (missing.length) { setNewSuccursaleError(`Champs requis manquants : ${missing.join(', ')}`); return }
    setNewSuccursaleError('')
    setNewSuccursaleSaving(true)
    try {
      const r = await api.post(`/v1/companies/${companyId}/sites`, f)
      setE911Addresses(prev => [...prev, r.data])
      setE911Form(p => ({ ...p, e911_address_id: r.data.id }))
      setShowNewSuccursale(false)
    } catch (e) {
      setNewSuccursaleError(e.response?.data?.detail || 'Erreur lors de la création')
    } finally {
      setNewSuccursaleSaving(false)
    }
  }

  async function loadVoicemail() {
    const r = await api.get(`/v1/contacts/${id}/sip-extension/voicemail`)
    setVoicemailBox(r.data)
    if (r.data) {
      setVmForm({
        email: r.data.email || '', email_on_new: r.data.email_on_new,
        attach_message: r.data.attach_message, skip_instructions: r.data.skip_instructions, password: r.data.password,
      })
    }
  }

  async function toggleVoicemail(enabled) {
    await saveSipExtField('voicemail_enabled', enabled)
    if (enabled && !voicemailBox) await saveVoicemail() // cree la boite tout de suite avec les valeurs par defaut du formulaire
  }

  async function saveVoicemail() {
    const r = await api.put(`/v1/contacts/${id}/sip-extension/voicemail`, vmForm)
    setVoicemailBox(r.data)
    setVmForm(p => ({ ...p, password: r.data.password }))
  }

  async function saveVmField(key, value) {
    const next = { ...vmForm, [key]: value }
    setVmForm(next)
    setVmSavingFields(p => new Set(p).add(key))
    const start = Date.now()
    try {
      const r = await api.put(`/v1/contacts/${id}/sip-extension/voicemail`, next)
      setVoicemailBox(r.data)
      setVmForm(p => ({ ...p, password: r.data.password }))
    } finally {
      // Reseau local = souvent <50ms -- l'indice bleu disparaissait avant meme
      // d'etre visible (signale par Philippe, 2026-08-04). Duree minimum garantie.
      const elapsed = Date.now() - start
      if (elapsed < 400) await new Promise(r => setTimeout(r, 400 - elapsed))
      setVmSavingFields(p => { const n = new Set(p); n.delete(key); return n })
    }
  }

  // "Le moindre changement doit faire apparaitre le save" (Philippe, 2026-08-04) :
  // onBlur ne suffit pas -- s'il ne quitte jamais le champ (change puis regarde
  // l'ecran sans cliquer ailleurs), rien ne se declenche. Sauvegarde 600ms apres
  // la derniere frappe (pas a chaque caractere -- eviterait de spammer le
  // serveur), mais sans jamais attendre un blur.
  const vmDebounceRef = useRef({})
  function saveVmFieldDebounced(key, value) {
    setVmForm(p => ({ ...p, [key]: value }))
    setVmSavingFields(p => new Set(p).add(key)) // bleu tout de suite, meme avant l'envoi reel
    clearTimeout(vmDebounceRef.current[key])
    vmDebounceRef.current[key] = setTimeout(() => saveVmField(key, value), 600)
  }

  // "Nombre de sonneries avant messagerie" -- Philippe pensait en sonneries,
  // pas en secondes. Conversion basee sur la cadence REELLE configuree sur ce
  // serveur (vars.xml, us-ring=%(2000,4000,...) = 2s son + 4s silence = 6s par
  // sonnerie), pas un chiffre invente. Champ existant (forward_no_answer_
  // delay_seconds, SIPExtension) -- son UI n'apparaissait qu'avec un renvoi
  // explicite configure, jamais dans la portion Boîte vocale ou il l'attendait.
  const RING_SECONDS = 6
  async function saveRings(rings) {
    setRingsSaving(true)
    const start = Date.now()
    try {
      await saveSipExtField('forward_no_answer_delay_seconds', Math.max(1, rings) * RING_SECONDS)
    } finally {
      const elapsed = Date.now() - start
      if (elapsed < 400) await new Promise(r => setTimeout(r, 400 - elapsed))
      setRingsSaving(false)
    }
  }
  const ringsDebounceRef = useRef(null)
  function saveRingsDebounced(rings) {
    setRingsSaving(true) // bleu tout de suite -- meme principe que saveVmFieldDebounced
    clearTimeout(ringsDebounceRef.current)
    ringsDebounceRef.current = setTimeout(() => saveRings(rings), 600)
  }

  async function uploadGreeting(file) {
    if (!file) return
    setUploadingGreeting(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const r = await api.post(`/v1/contacts/${id}/sip-extension/voicemail/greeting`, formData)
      setVoicemailBox(r.data)
    } finally {
      setUploadingGreeting(false)
    }
  }

  async function downloadGreeting() {
    const r = await api.get(`/v1/contacts/${id}/sip-extension/voicemail/greeting`, { responseType: 'blob' })
    const url = window.URL.createObjectURL(r.data)
    const a = document.createElement('a')
    a.href = url
    a.download = 'accueil.wav'
    a.click()
    window.URL.revokeObjectURL(url)
  }

  async function removeGreeting() {
    if (!confirm("Supprimer le message d'accueil ?")) return
    const r = await api.delete(`/v1/contacts/${id}/sip-extension/voicemail/greeting`)
    setVoicemailBox(r.data)
  }

  async function loadPhone() {
    const r = await api.get(`/v1/contacts/${id}/sip-extension/phone`)
    setPhone(r.data)
    if (r.data) {
      api.get(`/v1/contacts/${id}/sip-extension/phone/tenant-model-templates`).then(tr => setTenantModelTemplates(tr.data))
    }
  }

  async function loadPhoneModels() {
    if (phoneModels.length) return
    const r = await api.get('/v1/ref/phone-models')
    setPhoneModels(r.data)
  }

  async function attributePhone() {
    if (!attributeForm.model || !attributeForm.mac_address.trim()) return
    const r = await api.post(`/v1/contacts/${id}/sip-extension/phone`, {
      phone_model_id: attributeForm.model.id,
      mac_address: attributeForm.mac_address.trim(),
      serial_number: attributeForm.serial_number.trim() || null,
    })
    setPhone(r.data)
    setShowAttribute(false)
  }

  async function loadButtons() {
    if (!phone) return
    setButtonsLoading(true)
    try {
      const r = await api.get(`/v1/contacts/${id}/sip-extension/phone/${phone.id}/buttons`)
      setButtons(r.data)
    } finally {
      setButtonsLoading(false)
    }
  }

  async function addButton() {
    const position = (buttons.reduce((max, b) => Math.max(max, b.position), 0) || 0) + 1
    const r = await api.post(`/v1/contacts/${id}/sip-extension/phone/${phone.id}/buttons`, {
      position, button_type: 'line',
    })
    setButtons(prev => [...prev, r.data])
  }

  async function saveButton(buttonId, field, value) {
    const r = await api.put(`/v1/contacts/${id}/sip-extension/phone/buttons/${buttonId}`, { [field]: value })
    setButtons(prev => prev.map(b => b.id === buttonId ? r.data : b))
  }

  async function removeButton(buttonId) {
    await api.delete(`/v1/contacts/${id}/sip-extension/phone/buttons/${buttonId}`)
    setButtons(prev => prev.filter(b => b.id !== buttonId))
  }

  async function saveAsTemplate() {
    const name = prompt('Nom du template (réutilisable sur d\'autres postes depuis compagnie/téléphonie) :')
    if (!name || !name.trim()) return
    await api.post(`/v1/contacts/${id}/sip-extension/phone/${phone.id}/save-as-template`, { name: name.trim() })
    alert(`Template « ${name.trim()} » créé — gérable dans l'onglet Téléphonie de la compagnie.`)
  }

  async function toggleConnInfo() {
    if (connInfo) { setConnInfo(null); return }
    setConnInfoLoading(true)
    try {
      const r = await api.get(`/v1/contacts/${id}/sip-extension/connection-info`)
      setConnInfo(r.data)
    } finally {
      setConnInfoLoading(false)
    }
  }

  async function saveSipExtField(field, value) {
    await api.put(`/v1/contacts/${id}/sip-extension`, { [field]: value })
    setSipExt(prev => ({ ...prev, [field]: value }))
  }

  async function savePhoneField(field, value) {
    await api.put(`/v1/contacts/${id}/sip-extension/phone/${phone.id}`, { [field]: value })
    setPhone(prev => ({ ...prev, [field]: value }))
  }

  async function saveField(field, value) {
    await api.put(`/v1/contacts/${id}`, { [field]: value })
    setContact(prev => ({ ...prev, [field]: value }))
  }

  async function activateSipv() {
    setSipvError('')
    setSipvCreating(true)
    try {
      const r = await api.post(`/v1/contacts/${id}/sip-extension`, {
        billing_start_date: billingStartDate,
        billing_frequency: billingFrequency,
        extension_number: extensionNumber.trim() || null,
      })
      setContact(r.data)
      setConfirmSipv(false)
      loadSipExtension()
    } catch (e) {
      setSipvError(e.response?.data?.detail || 'Erreur de communication avec SIPV')
    } finally {
      setSipvCreating(false)
    }
  }

  async function deleteContact() {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer le contact « ${c.first_name} ${c.last_name} » ? Cette action est irréversible.`)) return
    try {
      await api.delete(`/v1/contacts/${id}`)
      navigate('/contacts')
    } catch (e) {
      alert(e.response?.data?.detail || 'Suppression impossible')
    }
  }

  async function savePhone(value) {
    const officeCompany = contact.companies?.find(x => x.is_primary) || contact.companies?.[0]
    if (officeCompany) {
      if (!confirm(`Attention, vous allez changer le téléphone bureau de « ${officeCompany.company_name} ». Êtes-vous sûr ?`)) return
      await api.put(`/v1/contacts/${id}/office-phone`, { value })
      await load()
    } else {
      await saveField('phone', value)
    }
  }

  // "|| (!isNew && !contact)" -- pas juste `loading` : ce composant n'est pas
  // remonte en passant de /contacts/new a /contacts/:id apres creation (React
  // reutilise la meme instance, `loading` reste bloque a sa valeur initiale
  // `!isNew` du tout premier montage) -- sans ce garde-fou, un rendu peut
  // arriver avec `contact` encore null avant que `load()` (async) ait fini,
  // provoquant un crash sur `c.first_name` plus bas.
  if (loading || (!isNew && !contact)) return <div className="detail-loading">Chargement...</div>

  const c = contact

  return (
    <div className="detail-page">
      <div className="detail-header">
        <div className="detail-breadcrumb">
          {(() => {
            // Priorite au fromCompanyId (arrivee depuis l'onglet Contacts d'une
            // compagnie -- garde le fromTab pour revenir au bon endroit), sinon
            // retombe sur la compagnie reellement liee au contact (toujours
            // affichee si elle existe, peu importe comment on est arrive ici --
            // demande explicite de l'utilisateur pour naviguer facilement vers
            // la config de la compagnie).
            const primary = !isNew && c ? (c.companies?.find(x => x.is_primary) || c.companies?.[0]) : null
            const companyId = fromCompanyId || primary?.company_id
            const companyName = fromCompanyName || primary?.company_name
            return companyId ? (
              <>
                <button className="back-btn" onClick={() => navigate(`/companies/${companyId}${fromTab ? `?tab=${fromTab}` : ''}`)}>← {companyName || 'Compagnie'}</button>
                <span className="breadcrumb-sep">›</span>
                <button className="back-btn" onClick={() => navigate(`/companies/${companyId}?tab=contacts`)}>Contact</button>
              </>
            ) : (
              <button className="back-btn" onClick={() => navigate('/contacts')}>← Contacts</button>
            )
          })()}
          <span className="breadcrumb-sep">›</span>
          <span className="breadcrumb-name">
            {isNew ? 'Nouveau contact' : `${c.first_name} ${c.last_name}`.trim()}
          </span>
        </div>
        {!isNew && c && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" onClick={() => setShowTicket(true)}>+ Ticket</button>
            <button className="btn-secondary" onClick={() => setShowInvoice(true)}>+ Facture</button>
            <button className="btn-secondary" onClick={() => setShowTask(true)}>+ Tâche</button>
            <button className="btn-secondary" onClick={() => setShowJournal(v => !v)}>Journal</button>
          </div>
        )}
      </div>
      {showTicket && c && (() => {
        const primary = c.companies?.find(x => x.is_primary) || c.companies?.[0]
        return (
          <NewTicketModal
            prefillContact={{ id: c.id, label: `${c.first_name} ${c.last_name}`.trim(), companies: c.companies || [] }}
            prefillCompany={primary ? { id: primary.company_id, label: primary.company_name } : null}
            onClose={() => setShowTicket(false)}
            onCreated={t => navigate(`/tickets/${t.id}`)}
          />
        )
      })()}
      {showInvoice && c && (() => {
        const primary = c.companies?.find(x => x.is_primary) || c.companies?.[0]
        return (
          <NewInvoiceModal
            prefillCompany={primary ? { id: primary.company_id, label: primary.company_name } : null}
            onClose={() => setShowInvoice(false)}
          />
        )
      })()}
      {showTask && c && (() => {
        const primary = c.companies?.find(x => x.is_primary) || c.companies?.[0]
        return (
          <NewTaskModal
            prefillContact={{ id: c.id, label: `${c.first_name} ${c.last_name}`.trim() }}
            prefillCompany={primary ? { id: primary.company_id, label: primary.company_name } : null}
            onClose={() => setShowTask(false)}
            onCreated={() => setShowTask(false)}
          />
        )
      })()}
      {showNewSuccursale && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ width: 640 }} onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Nouvelle succursale</h3>
            {newSuccursaleError && <div className="form-error">{newSuccursaleError}</div>}
            <div className="form-group"><label>Nom *</label><input value={newSuccursaleForm.label} onChange={e => setNewSuccursaleForm(p => ({ ...p, label: e.target.value }))} placeholder="Ex: Siège social, Succursale Laval" autoFocus /></div>
            <div className="ifields-grid">
              <div className="form-group"><label>N° civique *</label><input value={newSuccursaleForm.civic_number} onChange={e => setNewSuccursaleForm(p => ({ ...p, civic_number: e.target.value }))} /></div>
              <div className="form-group"><label>Rue *</label><input value={newSuccursaleForm.street_name} onChange={e => setNewSuccursaleForm(p => ({ ...p, street_name: e.target.value }))} /></div>
              <div className="form-group"><label>Unité / local</label><input value={newSuccursaleForm.unit || ''} onChange={e => setNewSuccursaleForm(p => ({ ...p, unit: e.target.value }))} /></div>
              <div className="form-group"><label>Ville *</label><input value={newSuccursaleForm.city} onChange={e => setNewSuccursaleForm(p => ({ ...p, city: e.target.value }))} /></div>
              <div className="form-group"><label>Province *</label><input value={newSuccursaleForm.province} onChange={e => setNewSuccursaleForm(p => ({ ...p, province: e.target.value.toUpperCase() }))} placeholder="QC" maxLength={2} /></div>
              <div className="form-group"><label>Code postal *</label><input value={newSuccursaleForm.postal_code} onChange={e => setNewSuccursaleForm(p => ({ ...p, postal_code: e.target.value }))} /></div>
              <Autocomplete
                label="Contact facturation"
                items={allContactsForSite.map(c => ({ id: c.id, label: `${c.first_name} ${c.last_name}`.trim() }))}
                value={newSuccursaleForm.billing_contact_id ? { id: newSuccursaleForm.billing_contact_id, label: newSuccursaleForm.billing_contact_label } : null}
                onSelect={item => setNewSuccursaleForm(p => ({
                  ...p, billing_contact_id: item?.id || null, billing_contact_label: item?.label || '',
                  billing_email: item ? (allContactsForSite.find(c => c.id === item.id)?.email || p.billing_email) : p.billing_email,
                }))}
                onCreate={name => setQuickContactName(name)}
                placeholder="Rechercher un contact..."
              />
              <div className="form-group"><label>Courriel facturation</label><input type="email" value={newSuccursaleForm.billing_email || ''} onChange={e => setNewSuccursaleForm(p => ({ ...p, billing_email: e.target.value }))} /></div>
            </div>
            <div className="form-group"><label>Notes</label><textarea rows={3} value={newSuccursaleForm.notes || ''} onChange={e => setNewSuccursaleForm(p => ({ ...p, notes: e.target.value }))} /></div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowNewSuccursale(false)}>Annuler</button>
              <button className="btn-primary" onClick={createSuccursale} disabled={newSuccursaleSaving}>{newSuccursaleSaving ? '...' : 'Créer'}</button>
            </div>
          </div>
        </div>
      )}
      {quickContactName != null && (
        <QuickNewContact initialName={quickContactName} onCreated={afterSiteContactCreated} onClose={() => setQuickContactName(null)} />
      )}
      {confirmSipv && c && (
        <div className="modal-overlay" onClick={() => { setConfirmSipv(false); setSipvError('') }}>
          <div className="modal-box" style={{ width: 460 }} onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Créer un poste SIP pour {c.first_name} {c.last_name} ?</h3>
            <p>
              Ceci va créer un vrai poste téléphonique dans SIPV pour ce contact.
              {!contact.companies?.length && ' ⚠️ Ce contact n\'est lié à aucune compagnie — l\'activation échouera.'}
            </p>
            <div className="form-group">
              <label>Numéro de poste (optionnel — auto-assigné au prochain disponible si vide)</label>
              <input value={extensionNumber} onChange={e => setExtensionNumber(e.target.value)} placeholder="ex: 104" />
            </div>
            <div className="form-group">
              <label>Date de départ de la facturation (ou date de portabilité si numéro porté)</label>
              <input type="date" value={billingStartDate} onChange={e => setBillingStartDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Fréquence (utilisée seulement si la compagnie n'a pas encore de facturation récurrente active)</label>
              <select value={billingFrequency} onChange={e => setBillingFrequency(e.target.value)}>
                <option value="mensuel">Mensuelle</option>
                <option value="bimestriel">Bimestrielle (2 mois)</option>
                <option value="trimestriel">Trimestrielle (3 mois)</option>
                <option value="biannuel">Biannuelle (6 mois)</option>
                <option value="annuel">Annuelle</option>
              </select>
            </div>
            <p style={{ fontSize: 12, color: '#6B7280' }}>
              Si la compagnie n'a pas encore de tenant SIPV actif, il sera activé automatiquement.
              La facturation récurrente ajoute la ligne de ce poste automatiquement (prorata si en cours de cycle).
            </p>
            {sipvError && <div className="adm-form-error">{sipvError}</div>}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => { setConfirmSipv(false); setSipvError('') }}>Annuler</button>
              <button className="btn-primary" onClick={activateSipv} disabled={sipvCreating}>{sipvCreating ? 'Création...' : 'Activer'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="detail-body">
        {isNew ? <NewContactForm /> : (
          <div>
            <div className="ifield-section-title">Statuts</div>
            <StatusSelector entityId={id} statuses={c.statuses} allStatuses={statuses} apiPath="/v1/contacts" />

            <div className="ifield-section-title" style={{ marginTop: 20 }}>Coordonnées</div>
            <div className="ifields-grid">
              <InlineField label="Prénom" value={c.first_name} onSave={v => saveField('first_name', v)} />
              <InlineField label="Nom" value={c.last_name} onSave={v => saveField('last_name', v)} />
              <InlineField label="Téléphone bureau" value={c.phone} onSave={v => savePhone(v)} />
              <InlineField label="Poste SIP" value={c.extension} onSave={v => saveField('extension', v)} />
              <InlineField label="Cellulaire" value={c.mobile} onSave={v => saveField('mobile', v)} />
              <InlineField label="Autre numéro" value={c.phone_other} onSave={v => saveField('phone_other', v)} />
              <InlineField label="Courriel" value={c.email} onSave={v => saveField('email', v)} />
              <div className="ifield-full">
                <InlineField label="Notes internes" value={c.notes_internal} multiline onSave={v => saveField('notes_internal', v)} />
              </div>
            </div>

            <div className="ifield-section-title" style={{ marginTop: 20 }}>Téléphonie</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>
              <input
                type="checkbox"
                id="sipv_sync"
                checked={c.sipv_sync || false}
                onChange={async e => {
                  const val = e.target.checked
                  if (val) { setConfirmSipv(true); return }
                  if (!confirm('Désactiver le poste SIP de ce contact dans SIPV ? (réversible — le poste n\'est pas supprimé)')) return
                  try {
                    const r = await api.put(`/v1/contacts/${id}/sip-extension/deactivate`)
                    setContact(r.data)
                    setSipExt(null)
                  } catch (e) {
                    alert(e.response?.data?.detail || 'Désactivation impossible')
                  }
                }}
                style={{ width: 16, height: 16, accentColor: 'var(--brand)', cursor: 'pointer' }}
              />
              <label htmlFor="sipv_sync" style={{ fontSize: 13, color: '#374151', cursor: 'pointer', userSelect: 'none' }}>
                Synchroniser avec SIPV
              </label>
              {c.sipv_sync && (
                <span style={{ fontSize: 11, background: 'var(--brand-bg)', color: 'var(--brand-hover)', borderRadius: 4, padding: '2px 8px', fontWeight: 600 }}>
                  SIP actif
                </span>
              )}
              {c.sipv_sync && (
                <button
                  className="btn-secondary"
                  style={{ fontSize: 11, padding: '3px 8px' }}
                  onClick={async () => {
                    const next = !showButtons
                    setShowButtons(next)
                    if (next) {
                      if (!phone) { await loadPhoneModels(); setShowAttribute(true) }
                      else loadButtons()
                    }
                  }}
                >
                  Bouton
                </button>
              )}
            </div>

            {c.sipv_sync && (
              <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: '12px 16px', marginBottom: 10 }}>
                {sipExtLoading && <div style={{ fontSize: 13, color: '#6B7280' }}>Chargement du poste SIP...</div>}
                {!sipExtLoading && !sipExt && (
                  <div style={{ fontSize: 13, color: '#6B7280' }}>
                    Aucun poste SIP lié à ce contact pour l'instant (sera lié automatiquement à la création d'un poste dans SIPV, ou hors ligne si SIPV est injoignable).
                  </div>
                )}
                {!sipExtLoading && sipExt && (
                  <>
                    <div className="ifields-grid">
                      <div className="ifield">
                        <div className="ifield-label">Statut en direct</div>
                        <div className="ifield-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span title={sipExt.registered ? 'En ligne (enregistré)' : 'Hors ligne'} style={{
                            display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                            background: sipExt.registered ? '#22C55E' : '#EF4444',
                          }} />
                          {sipExt.registered ? 'Enregistré' : 'Hors ligne'}
                          {sipExt.call_state === 'active' && <span title="Appel en cours" style={{ color: '#DC2626' }}>📞</span>}
                          {sipExt.call_state === 'ringing' && <span title="Sonne" style={{ color: '#D97706' }}>🔔</span>}
                        </div>
                      </div>
                      <div className="ifield"><div className="ifield-label">Poste</div><div className="ifield-value">{sipExt.extension}</div></div>
                      <div className="ifield"><div className="ifield-label">Nom SIP</div><div className="ifield-value">{sipExt.name}</div></div>
                      <div className="ifield"><div className="ifield-label">Username SIP</div><div className="ifield-value" style={{ fontSize: 16, fontWeight: 400 }}>{sipExt.username}</div></div>
                      <div className="ifield"><div className="ifield-label">Actif</div><div className="ifield-value">{sipExt.is_active ? 'Oui' : 'Non'}</div></div>
                      <div className="ifield" style={{ textAlign: 'center' }}>
                        <div className="ifield-label">Connexion serveur SIPV</div>
                        <div className="ifield-value">
                          <button className="btn-secondary" onClick={toggleConnInfo} disabled={connInfoLoading} style={{ fontSize: 11, padding: '3px 8px' }}>
                            {connInfoLoading ? 'Chargement...' : connInfo ? 'Masquer les infos de connexion' : 'Afficher les infos de connexion'}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      {connInfo && (
                        <div className="ifields-grid">
                          <div className="ifield"><div className="ifield-label">Serveur</div><div className="ifield-value"><code style={{ userSelect: 'all' }}>{connInfo.outbound_proxy}</code></div></div>
                          <div className="ifield"><div className="ifield-label">Port</div><div className="ifield-value"><code style={{ userSelect: 'all' }}>{connInfo.port}</code></div></div>
                          <div className="ifield"><div className="ifield-label">Transport</div><div className="ifield-value"><code style={{ userSelect: 'all' }}>{connInfo.transport.toUpperCase()}</code></div></div>
                          <div className="ifield"><div className="ifield-label">User / Auth ID</div><div className="ifield-value"><code style={{ userSelect: 'all' }}>{connInfo.username}</code></div></div>
                          <div className="ifield"><div className="ifield-label">Mot de passe</div><div className="ifield-value"><code style={{ userSelect: 'all' }}>{connInfo.password}</code></div></div>
                          <div className="ifield"><div className="ifield-label">Domaine (si champ séparé requis)</div><div className="ifield-value"><code style={{ userSelect: 'all' }}>{connInfo.sip_server}</code></div></div>
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: 16, borderTop: '1px solid #E5E7EB', paddingTop: 10 }}>
                      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: '#374151', fontWeight: 600, marginBottom: 6 }}>Caller ID — externe</div>
                          <InlineField label="Nom (externe)" value={sipExt.caller_id_external_name} onSave={v => saveSipExtField('caller_id_external_name', v)} />
                          <div className="form-group">
                            <label>Numéro (externe)</label>
                            <select value={sipExt.caller_id_external_number || ''} onChange={e => onCallerIdExternalChange(e.target.value)}>
                              <option value="">— Choisir —</option>
                              {companyDids.map(d => <option key={d.id} value={d.number}>{d.number}{d.label ? ` — ${d.label}` : ''}</option>)}
                            </select>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                            <input
                              type="checkbox"
                              id="hide_caller_id"
                              checked={sipExt.hide_caller_id || false}
                              onChange={e => saveSipExtField('hide_caller_id', e.target.checked)}
                              style={{ width: 16, height: 16, accentColor: 'var(--brand)', cursor: 'pointer' }}
                            />
                            <label htmlFor="hide_caller_id" style={{ fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                              Masquer le Caller ID (appels externes seulement)
                            </label>
                          </div>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: '#374151', fontWeight: 600, marginBottom: 6 }}>Caller ID — interne</div>
                          <InlineField label="Nom (interne)" value={sipExt.caller_id_internal_name} onSave={v => saveSipExtField('caller_id_internal_name', v)} />
                          <InlineField label="Numéro (interne)" value={sipExt.caller_id_internal_number} onSave={v => saveSipExtField('caller_id_internal_number', v)} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: '#374151', fontWeight: 600, marginBottom: 6 }}>911 — localisation d'urgence</div>
                          <div className="form-group">
                            <label>Succursale *</label>
                            <select value={e911Form.e911_address_id} onChange={e => setE911Form(p => ({ ...p, e911_address_id: e.target.value }))} disabled={e911Addresses.length === 0}>
                              <option value="">— Choisir —</option>
                              {e911Addresses.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                            </select>
                          </div>
                          <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px', marginBottom: 8 }} onClick={openNewSuccursale}>+ Nouvelle succursale</button>
                          {e911Addresses.length === 0 && (
                            <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 8 }}>Aucune succursale pour cette compagnie.</div>
                          )}
                          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={saveE911} disabled={!e911Form.e911_address_id}>
                              {e911Assignment ? 'Enregistrer' : 'Assigner'}
                            </button>
                            {e911Assignment && <button className="btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={removeE911}>Retirer</button>}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 16, borderTop: '1px solid #E5E7EB', paddingTop: 10 }}>
                      <div style={{ fontSize: 13, color: '#374151', fontWeight: 600, marginBottom: 6 }}>Renvois</div>
                      {[
                        { key: 'forward_immediate', label: 'Renvoi immédiat', live: true },
                        { key: 'forward_busy', label: 'Renvoi si occupé', live: false },
                        { key: 'forward_no_answer', label: 'Renvoi si non répondu', live: false },
                        { key: 'forward_offline', label: 'Renvoi si hors ligne', live: false },
                      ].map(({ key, label, live }) => (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                          <input
                            type="checkbox"
                            id={key}
                            checked={sipExt[`${key}_enabled`] || false}
                            onChange={e => saveSipExtField(`${key}_enabled`, e.target.checked)}
                            style={{ width: 16, height: 16, accentColor: 'var(--brand)', cursor: 'pointer' }}
                          />
                          <label htmlFor={key} style={{ fontSize: 13, color: '#374151', cursor: 'pointer', minWidth: 160 }}>
                            {label}{!live && sipExt[`${key}_enabled`] ? ' ⚠' : ''}
                          </label>
                          {sipExt[`${key}_enabled`] && (
                            <>
                              <select
                                defaultValue={sipExt[`${key}_destination_type`] || 'extension'}
                                onBlur={e => saveSipExtField(`${key}_destination_type`, e.target.value)}
                                onChange={e => saveSipExtField(`${key}_destination_type`, e.target.value)}
                                style={{ fontSize: 12, padding: '3px 6px' }}
                              >
                                <option value="extension">Poste</option>
                                <option value="voicemail">Boîte vocale</option>
                                <option value="external">Numéro externe</option>
                                <option value="ring_group">Groupe d'appel</option>
                                <option value="queue">File d'attente</option>
                                <option value="ivr">IVR</option>
                                <option value="message">Message enregistré</option>
                              </select>
                              <input
                                type="text"
                                placeholder="Destination (ex: poste ou numéro)"
                                defaultValue={sipExt[`${key}_destination`] || ''}
                                onBlur={e => saveSipExtField(`${key}_destination`, e.target.value)}
                                style={{ fontSize: 12, padding: '3px 6px', width: 140 }}
                              />
                            </>
                          )}
                          {key === 'forward_no_answer' && sipExt.forward_no_answer_enabled && (
                            <input
                              type="number"
                              defaultValue={sipExt.forward_no_answer_delay_seconds ?? 20}
                              onBlur={e => saveSipExtField('forward_no_answer_delay_seconds', parseInt(e.target.value, 10))}
                              style={{ fontSize: 12, padding: '3px 6px', width: 60 }}
                              title="Délai en secondes"
                            />
                          )}
                        </div>
                      ))}
                      <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                        ⚠ = configuré mais pas encore appliqué par le serveur (renvoi si occupé / non répondu / hors ligne — voir TASKSIPV S023.6). Seul le renvoi immédiat (poste/boîte vocale/groupe d'appel) agit réellement sur les appels pour l'instant.
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                        <input
                          type="checkbox"
                          id="dnd_enabled"
                          checked={sipExt.dnd_enabled || false}
                          onChange={e => saveSipExtField('dnd_enabled', e.target.checked)}
                          style={{ width: 16, height: 16, accentColor: 'var(--brand)', cursor: 'pointer' }}
                        />
                        <label htmlFor="dnd_enabled" style={{ fontSize: 13, color: '#374151', cursor: 'pointer' }}>Ne pas déranger (DND)</label>
                      </div>
                    </div>

                    <div style={{ marginTop: 16, borderTop: '1px solid #E5E7EB', paddingTop: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <input
                          type="checkbox"
                          id="voicemail_enabled"
                          checked={sipExt.voicemail_enabled || false}
                          onChange={e => toggleVoicemail(e.target.checked)}
                          style={{ width: 16, height: 16, accentColor: 'var(--brand)', cursor: 'pointer' }}
                        />
                        <label htmlFor="voicemail_enabled" style={{ fontSize: 13, color: '#374151', fontWeight: 600, cursor: 'pointer' }}>
                          Boîte vocale activée
                        </label>
                      </div>
                      {sipExt.voicemail_enabled && (
                        <>
                          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                              <div className="form-group" style={{ width: 64, flex: '0 0 auto' }}>
                                <label>Sonneries</label>
                                <input type="number" min="1" max="20"
                                  value={Math.round((sipExt.forward_no_answer_delay_seconds ?? 20) / RING_SECONDS)}
                                  onChange={e => {
                                    setSipExt(prev => ({ ...prev, forward_no_answer_delay_seconds: (parseInt(e.target.value, 10) || 3) * RING_SECONDS }))
                                    saveRingsDebounced(parseInt(e.target.value, 10) || 3)
                                  }}
                                  style={{ width: '100%', borderColor: ringsSaving ? '#3B82F6' : undefined, background: ringsSaving ? '#EFF6FF' : undefined }} />
                              </div>
                              <div className="form-group" style={{ width: 120, flex: '0 0 auto' }}>
                                <label>NIP</label>
                                <input value={vmForm.password} maxLength={20} onChange={e => saveVmFieldDebounced('password', e.target.value)}
                                  style={{ width: '100%', borderColor: vmSavingFields.has('password') ? '#3B82F6' : undefined, background: vmSavingFields.has('password') ? '#EFF6FF' : undefined }} />
                              </div>
                              <div className="form-group" style={{ width: '45ch', flex: '0 0 auto' }}>
                                <label>Courriel</label>
                                <input value={vmForm.email} onChange={e => saveVmFieldDebounced('email', e.target.value)}
                                  style={{ width: '100%', borderColor: vmSavingFields.has('email') ? '#3B82F6' : undefined, background: vmSavingFields.has('email') ? '#EFF6FF' : undefined }} />
                              </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 18 }}>
                              {[
                                { key: 'email_on_new', label: 'Envoyer un courriel à chaque nouveau message' },
                                { key: 'attach_message', label: 'Joindre le fichier audio au courriel' },
                                { key: 'skip_instructions', label: "Sauter les instructions parlées (aller direct au bip)" },
                              ].map(({ key, label }) => (
                                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, background: vmSavingFields.has(key) ? '#EFF6FF' : undefined, borderRadius: 6, padding: '2px 4px' }}>
                                  <input type="checkbox" id={`vm_${key}`} checked={vmForm[key]}
                                    onChange={e => saveVmField(key, e.target.checked)}
                                    style={{ width: 16, height: 16, accentColor: 'var(--brand)', cursor: 'pointer' }} />
                                  <label htmlFor={`vm_${key}`} style={{ fontSize: 13, color: '#374151', cursor: 'pointer' }}>{label}</label>
                                </div>
                              ))}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginLeft: 'auto', paddingTop: 18 }}>
                              <label className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px', cursor: 'pointer', textAlign: 'center' }}>
                                {uploadingGreeting ? 'Envoi...' : voicemailBox?.has_greeting_unavailable ? 'Remplacer' : 'Envoyer un fichier'}
                                <input type="file" accept="audio/*" style={{ display: 'none' }} disabled={uploadingGreeting || !voicemailBox}
                                  onChange={e => uploadGreeting(e.target.files[0])} />
                              </label>
                              {voicemailBox?.has_greeting_unavailable && (
                                <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={downloadGreeting}>Télécharger</button>
                              )}
                            </div>
                          </div>
                          <div style={{ marginTop: 10, fontSize: 12, color: '#374151' }}>
                            <span style={{ fontWeight: 600 }}>Message d'accueil : </span>
                            {voicemailBox?.has_greeting_unavailable ? (
                              <>
                                <span style={{ color: '#059669' }}>✓ Enregistré</span>
                                <button className="inv-del-btn" onClick={removeGreeting} style={{ marginLeft: 8 }}>✕</button>
                              </>
                            ) : (
                              <span style={{ color: '#9CA3AF' }}>Aucun (annonce générique par défaut)</span>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    <div style={{ marginTop: 16, borderTop: '1px solid #E5E7EB', paddingTop: 10 }}>
                      <div style={{ fontSize: 13, color: '#374151', fontWeight: 600, marginBottom: 6 }}>Enregistrement des appels</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <input
                          type="checkbox"
                          id="record_all"
                          checked={['record_internal_incoming', 'record_internal_outgoing', 'record_external_incoming', 'record_external_outgoing'].every(k => sipExt[k])}
                          onChange={async e => {
                            const val = e.target.checked
                            for (const k of ['record_internal_incoming', 'record_internal_outgoing', 'record_external_incoming', 'record_external_outgoing']) {
                              await saveSipExtField(k, val)
                            }
                          }}
                          style={{ width: 16, height: 16, accentColor: 'var(--brand)', cursor: 'pointer' }}
                        />
                        <label htmlFor="record_all" style={{ fontSize: 13, color: '#374151', cursor: 'pointer', fontWeight: 600 }}>Tout</label>
                      </div>
                      {[
                        { key: 'record_internal_incoming', label: 'Interne entrant' },
                        { key: 'record_internal_outgoing', label: 'Interne sortant' },
                        { key: 'record_external_incoming', label: 'Externe entrant' },
                        { key: 'record_external_outgoing', label: 'Externe sortant' },
                      ].map(({ key, label }) => (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, marginLeft: 20 }}>
                          <input
                            type="checkbox"
                            id={key}
                            checked={sipExt[key] || false}
                            onChange={e => saveSipExtField(key, e.target.checked)}
                            style={{ width: 16, height: 16, accentColor: 'var(--brand)', cursor: 'pointer' }}
                          />
                          <label htmlFor={key} style={{ fontSize: 13, color: '#374151', cursor: 'pointer' }}>{label}</label>
                        </div>
                      ))}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                        <input
                          type="checkbox"
                          id="record_calls"
                          checked={sipExt.record_calls || false}
                          onChange={e => saveSipExtField('record_calls', e.target.checked)}
                          style={{ width: 16, height: 16, accentColor: 'var(--brand)', cursor: 'pointer' }}
                        />
                        <label htmlFor="record_calls" style={{ fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                          Manuel (déclenché par l'agent — pas encore actif, en attente de configuration du bouton sur le téléphone)
                        </label>
                      </div>
                    </div>

                    <div style={{ marginTop: 16, borderTop: '1px solid #E5E7EB', paddingTop: 10 }}>
                      <div style={{ display: 'flex', gap: 4, marginBottom: showCdr ? 10 : 0 }}>
                        <button className={`tab-btn${!showCdr ? ' active' : ''}`} style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setShowCdr(false)}>Poste SIP</button>
                        <button className={`tab-btn${showCdr ? ' active' : ''}`} style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setShowCdr(true)}>Historique d'appels ({cdrTotal})</button>
                      </div>
                      {showCdr && (
                        <>
                          {!cdrLoading && cdrItems.length === 0 && (
                            <div style={{ fontSize: 12, color: '#6B7280' }}>Aucun appel enregistré.</div>
                          )}
                          {cdrItems.length > 0 && (
                            <>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                  <tr style={{ background: '#F9FAFB' }}>
                                    {['Date', 'De', 'Vers', 'Direction', 'Durée', 'Statut'].map(h => (
                                      <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #E5E7EB', fontSize: 11, fontWeight: 600, color: '#6B7280' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {cdrItems.map(c => (
                                    <Fragment key={c.id}>
                                      <tr style={{ borderBottom: '1px solid #F3F4F6', cursor: 'pointer' }} onClick={() => setExpandedCdrId(expandedCdrId === c.id ? null : c.id)}>
                                        <td style={{ padding: '6px 8px' }}>{c.start_time ? new Date(c.start_time).toLocaleString('fr-CA') : ''}</td>
                                        <td style={{ padding: '6px 8px' }}>{c.src || ''}</td>
                                        <td style={{ padding: '6px 8px' }}>{c.dst || ''}</td>
                                        <td style={{ padding: '6px 8px' }}>{c.direction === 'inbound' ? 'Entrant' : c.direction === 'outbound' ? 'Sortant' : (c.direction || '')}</td>
                                        <td style={{ padding: '6px 8px' }}>{c.billsec != null ? `${Math.floor(c.billsec / 60)}:${String(c.billsec % 60).padStart(2, '0')}` : ''}</td>
                                        <td style={{ padding: '6px 8px' }}>{c.disposition || ''}</td>
                                      </tr>
                                      {expandedCdrId === c.id && <CdrDetailRow c={c} colSpan={6} />}
                                    </Fragment>
                                  ))}
                                </tbody>
                              </table>
                              <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 8, alignItems: 'center' }}>
                                <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }} disabled={cdrPage <= 1} onClick={() => setCdrPage(p => p - 1)}>← Précédent</button>
                                <span style={{ fontSize: 11, color: '#6B7280' }}>Page {cdrPage} / {Math.max(1, Math.ceil(cdrTotal / cdrPageSize))}</span>
                                <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }} disabled={cdrPage >= Math.max(1, Math.ceil(cdrTotal / cdrPageSize))} onClick={() => setCdrPage(p => p + 1)}>Suivant →</button>
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </div>

                    {!showCdr && phone && (
                      <div style={{ marginTop: 16, borderTop: '1px solid #E5E7EB', paddingTop: 10 }}>
                        <div style={{ fontSize: 13, color: '#374151', fontWeight: 600, marginBottom: 4 }}>Options du poste</div>
                        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
                          Les templates par modèle se créent dans la fiche Compagnie (Téléphonie). On peut en cocher PLUSIEURS (ex. "défaut" + "oreillette" + "boutons de park") — ils se combinent et remplissent les options ci-dessous ("as template") ; cliquer une option la personnalise pour ce poste seulement.
                        </div>
                        {tenantModelTemplates.length > 0 && (
                          <div style={{ marginBottom: 10 }}>
                            {tenantModelTemplates.map(t => (
                              <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 2, cursor: 'pointer' }}>
                                <input type="checkbox" checked={(phone.selected_tenant_model_template_ids || []).includes(t.id)}
                                  onChange={() => {
                                    const current = phone.selected_tenant_model_template_ids || []
                                    const next = current.includes(t.id) ? current.filter(x => x !== t.id) : [...current, t.id]
                                    savePhoneField('selected_tenant_model_template_ids', next)
                                  }}
                                  style={{ width: 15, height: 15, accentColor: 'var(--brand)', cursor: 'pointer' }} />
                                {t.name}
                              </label>
                            ))}
                          </div>
                        )}
                        <PhoneOptionsEditor title="" value={phone.extra_config || {}} onChange={next => savePhoneField('extra_config', next)}
                          templateOptions={(() => {
                            let merged = {}
                            for (const id of (phone.selected_tenant_model_template_ids || [])) {
                              const t = tenantModelTemplates.find(x => x.id === id)
                              if (t) merged = { ...merged, ...t.options }
                            }
                            return merged
                          })()}
                          templateLabel={(phone.selected_tenant_model_template_ids || []).map(id => tenantModelTemplates.find(t => t.id === id)?.name).filter(Boolean).join(' + ')} />
                      </div>
                    )}

                    {!showCdr && (
                    <div style={{ marginTop: 16, borderTop: '1px solid #E5E7EB', paddingTop: 10 }}>
                      <div style={{ fontSize: 13, color: '#374151', fontWeight: 600, marginBottom: 6 }}>Plan d'appel</div>
                      {[
                        { key: 'allow_canada', label: 'Canada' },
                        { key: 'allow_us', label: 'États-Unis' },
                        { key: 'allow_international', label: 'International' },
                        { key: 'allow_premium', label: 'Numéros payants (900)' },
                      ].map(({ key, label }) => (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <input
                            type="checkbox"
                            id={key}
                            checked={!!sipExt[key]}
                            ref={el => { if (el) el.indeterminate = sipExt[key] === null || sipExt[key] === undefined }}
                            onChange={e => saveSipExtField(key, e.target.checked)}
                            style={{ width: 16, height: 16, accentColor: 'var(--brand)', cursor: 'pointer' }}
                          />
                          <label htmlFor={key} style={{ fontSize: 13, color: '#374151', cursor: 'pointer', minWidth: 160 }}>{label}</label>
                          <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                            {(sipExt[key] === null || sipExt[key] === undefined) ? '(hérite du défaut compagnie)' : ''}
                          </span>
                        </div>
                      ))}
                      <div className="ifields-grid" style={{ marginTop: 6 }}>
                        <InlineField label="Pays bloqués (indicatifs, séparés par virgule)" value={sipExt.blocked_countries} onSave={v => saveSipExtField('blocked_countries', v)} />
                        <InlineField label="Préfixes bloqués (séparés par virgule)" value={sipExt.blocked_prefixes} onSave={v => saveSipExtField('blocked_prefixes', v)} />
                        <InlineField label="Limite mensuelle ($)" value={sipExt.ld_monthly_limit ?? ''} onSave={v => saveSipExtField('ld_monthly_limit', v === '' ? null : parseFloat(v))} />
                        <InlineField label={`NIP d'autorisation *80<NIP><numéro> — laisser vide pour ne pas changer${sipExt.has_ld_pin ? ' (déjà configuré)' : ''}`} value="" onSave={v => saveSipExtField('ld_pin', v)} />
                      </div>
                    </div>
                    )}
                  </>
                )}
              </div>
            )}

            {c.sipv_sync && showButtons && (
              <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: '12px 16px', marginBottom: 10 }}>
                {!phone && (
                  <>
                    <div style={{ fontSize: 13, color: '#374151', fontWeight: 600, marginBottom: 8 }}>Attribuer un appareil</div>
                    <div className="ifields-grid">
                      <Autocomplete
                        label="Marque"
                        items={[...new Set(phoneModels.map(m => m.brand))].map(b => ({ id: b, label: b }))}
                        value={attributeForm.brand ? { id: attributeForm.brand, label: attributeForm.brand } : null}
                        onSelect={item => setAttributeForm(p => ({ ...p, brand: item?.id || null, model: null }))}
                        openOnFocus
                      />
                      <Autocomplete
                        label="Modèle"
                        items={phoneModels.filter(m => !attributeForm.brand || m.brand === attributeForm.brand).map(m => ({ id: m.id, label: m.model, sub: m.device_type }))}
                        value={attributeForm.model ? { id: attributeForm.model.id, label: attributeForm.model.model } : null}
                        onSelect={item => {
                          const m = phoneModels.find(x => x.id === item?.id) || null
                          setAttributeForm(p => ({ ...p, model: m, brand: m ? m.brand : p.brand }))
                        }}
                        openOnFocus
                      />
                      <div className="form-group">
                        <label>Adresse MAC</label>
                        <input value={attributeForm.mac_address} onChange={e => setAttributeForm(p => ({ ...p, mac_address: e.target.value }))} placeholder="AA:BB:CC:DD:EE:FF" />
                      </div>
                      <div className="form-group">
                        <label>Numéro de série</label>
                        <input value={attributeForm.serial_number} onChange={e => setAttributeForm(p => ({ ...p, serial_number: e.target.value }))} />
                      </div>
                    </div>
                    <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px', marginTop: 8 }} onClick={attributePhone}>Attribuer</button>
                  </>
                )}

                {phone && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>
                        Appareil : {phone.mac_address} {phoneModels.length > 0 && phoneModels.find(m => m.id === phone.phone_model_id) && `(${phoneModels.find(m => m.id === phone.phone_model_id).brand} ${phoneModels.find(m => m.id === phone.phone_model_id).model})`}
                      </div>
                      <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={loadButtons}>↻ Boutons</button>
                    </div>

                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Réseau</div>
                      <div className="form-group" style={{ maxWidth: 220 }}>
                        <label>Protocole de provisioning</label>
                        <select value={phone.provisioning_protocol || 'https'} onChange={e => savePhoneField('provisioning_protocol', e.target.value)}>
                          {['tftp', 'http', 'https', 'ftp', 'ftps'].map(p => (
                            <option key={p} value={p}>{p.toUpperCase()}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {buttonsLoading && <div style={{ fontSize: 13, color: '#6B7280' }}>Chargement...</div>}
                    {!buttonsLoading && (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: '#F3F4F6' }}>
                            {['Pos.', 'Page', 'Type', 'Libellé', 'Valeur', 'Destination', 'Compte', 'Client', 'Verrouillé', ''].map(h => (
                              <th key={h} style={{ textAlign: 'left', padding: '4px 6px', fontSize: 11, fontWeight: 600, color: '#6B7280' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {buttons.map(b => (
                            <tr key={b.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                              <td style={{ padding: '3px 6px' }}><input type="number" defaultValue={b.position} onBlur={e => saveButton(b.id, 'position', parseInt(e.target.value, 10))} style={{ width: 40, fontSize: 12 }} /></td>
                              <td style={{ padding: '3px 6px' }}><input type="number" defaultValue={b.page} onBlur={e => saveButton(b.id, 'page', parseInt(e.target.value, 10))} style={{ width: 40, fontSize: 12 }} /></td>
                              <td style={{ padding: '3px 6px' }}>
                                <select defaultValue={b.button_type} onChange={e => saveButton(b.id, 'button_type', e.target.value)} style={{ fontSize: 12 }}>
                                  {['line', 'blf', 'speed_dial', 'park', 'park_retrieve', 'voicemail', 'transfer', 'intercom', 'paging', 'dnd', 'forward', 'queue', 'agent_login', 'agent_logout', 'agent_pause', 'pickup_group', 'feature_code', 'door', 'directory'].map(t => (
                                    <option key={t} value={t}>{t}</option>
                                  ))}
                                </select>
                              </td>
                              <td style={{ padding: '3px 6px' }}><input defaultValue={b.label || ''} onBlur={e => saveButton(b.id, 'label', e.target.value)} style={{ width: 90, fontSize: 12 }} /></td>
                              <td style={{ padding: '3px 6px' }}><input defaultValue={b.value || ''} onBlur={e => saveButton(b.id, 'value', e.target.value)} style={{ width: 70, fontSize: 12 }} /></td>
                              <td style={{ padding: '3px 6px' }}><input defaultValue={b.destination || ''} onBlur={e => saveButton(b.id, 'destination', e.target.value)} style={{ width: 80, fontSize: 12 }} /></td>
                              <td style={{ padding: '3px 6px' }}><input type="number" defaultValue={b.sip_account_index} onBlur={e => saveButton(b.id, 'sip_account_index', parseInt(e.target.value, 10))} style={{ width: 40, fontSize: 12 }} /></td>
                              <td style={{ padding: '3px 6px', textAlign: 'center' }}><input type="checkbox" defaultChecked={b.client_editable} onChange={e => saveButton(b.id, 'client_editable', e.target.checked)} /></td>
                              <td style={{ padding: '3px 6px', textAlign: 'center' }}><input type="checkbox" defaultChecked={b.locked_by_simpleip} onChange={e => saveButton(b.id, 'locked_by_simpleip', e.target.checked)} /></td>
                              <td style={{ padding: '3px 6px' }}><button className="inv-del-btn" onClick={() => removeButton(b.id)}>✕</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <button className="btn-secondary" style={{ fontSize: 12, padding: '5px 12px', marginTop: 8 }} onClick={addButton}>+ Ajouter un bouton</button>
                    <button className="btn-secondary" style={{ fontSize: 12, padding: '5px 12px', marginTop: 8, marginLeft: 8 }} onClick={saveAsTemplate}>Sauvegarder comme template</button>
                  </>
                )}
              </div>
            )}

            {c.companies.length > 0 && (
              <>
                <div className="ifield-section-title" style={{ marginTop: 20 }}>Compagnies</div>
                {c.companies.map(co => (
                  <div key={co.contact_company_id} className="comm-row">
                    <button className="contact-name-link" onClick={() => navigate(`/companies/${co.company_id}`)}>{co.company_name}</button>
                    {co.functions.length > 0 && <span className="comm-label">{co.functions.join(', ')}</span>}
                    {co.is_primary && <span className="primary-badge">Principal</span>}
                  </div>
                ))}
              </>
            )}

            <PortalAccessSection contact={c} />

            <div className="record-meta">
              Créé le {new Date(c.created_at).toLocaleString('fr-CA')}
              {c.updated_at !== c.created_at && <> · Modifié le {new Date(c.updated_at).toLocaleString('fr-CA')}</>}
            </div>

            <ContactTachesSection contactId={id} onNewTask={() => setShowTask(true)} />

            {showJournal && (
              <>
                <div className="ifield-section-title" style={{ marginTop: 24 }}>Journal</div>
                <JournalFeed entityId={id} />
              </>
            )}

            <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid #E5E7EB' }}>
              <button className="inv-del-btn" onClick={deleteContact}>Supprimer le contact</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ContactTachesSection({ contactId, onNewTask }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCompleted, setShowCompleted] = useState(false)

  useEffect(() => {
    api.get(`/v1/tasks?contact_id=${contactId}`).then(r => { setTasks(r.data); setLoading(false) })
  }, [contactId])

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
  if (loading) return null

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="ifield-section-title" style={{ margin: 0 }}>Tâches & Suivi</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#6B7280', cursor: 'pointer' }}>
            <input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} style={{ accentColor: 'var(--brand)' }} />
            Complétées
          </label>
          <button className="btn-secondary" onClick={onNewTask} style={{ fontSize: 12, padding: '4px 10px' }}>+ Tâche</button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <div style={{ fontSize: 13, color: '#9CA3AF', padding: '12px 0' }}>Aucune tâche en cours.</div>
      ) : filtered.map(t => {
        const overdue = t.due_date && !t.completed && new Date(t.due_date) < new Date(new Date().toDateString())
        return (
          <div key={t.id} style={{ display: 'flex', gap: 8, padding: '10px 12px', borderRadius: 8, border: '1px solid #E5E7EB', marginBottom: 6, background: t.completed ? '#F9FAFB' : '#fff', alignItems: 'flex-start' }}>
            <input type="checkbox" checked={t.completed} onChange={() => toggleComplete(t)} style={{ width: 14, height: 14, accentColor: 'var(--brand)', marginTop: 2, cursor: 'pointer', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.completed ? '#9CA3AF' : '#111827', textDecoration: t.completed ? 'line-through' : 'none' }}>{t.title}</div>
              <div style={{ fontSize: 11, color: overdue ? '#DC2626' : '#9CA3AF', marginTop: 2 }}>
                {t.due_date && <span>{overdue ? '⚠ ' : ''}{new Date(t.due_date + 'T12:00:00').toLocaleDateString('fr-CA')}{t.due_time ? ` ${t.due_time}` : ''}</span>}
                {t.assigned_name && <span style={{ marginLeft: 8 }}>· {t.assigned_name}</span>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Accès portail client ───────────────────────────────────────────────────────

function generatePassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%'
  let pw = ''
  for (let i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)]
  return pw
}

const PORTAL_PERM_GROUPS = [
  {
    title: 'ACCÈS GÉNÉRAL',
    fields: [
      ['can_view_invoices', 'Voir les factures'],
      ['can_view_tickets', 'Voir les tickets'],
      ['can_create_tickets', 'Créer des tickets'],
      ['can_view_equipment', "Voir l'inventaire"],
    ],
  },
  {
    title: 'TÉLÉPHONIE — MON POSTE',
    fields: [
      ['can_view_own_extension', 'Voir son propre poste (statut, extension)'],
      ['can_edit_extension_name', 'Modifier le nom affiché de son poste'],
      ['can_edit_call_forward', "Gérer ses renvois d'appel"],
      ['can_edit_dnd', 'Activer/désactiver Ne pas déranger'],
      ['can_edit_voicemail', 'Gérer ses options de messagerie vocale'],
      ['can_view_own_cdr', "Voir son historique d'appels personnel"],
      ['can_view_voicemail_messages', 'Écouter ses messages vocaux'],
      ['can_receive_alerts', 'Recevoir les alertes (poste hors ligne, etc.)'],
    ],
  },
  {
    title: 'TÉLÉPHONIE — GESTIONNAIRE (toute la compagnie)',
    warn: true,
    fields: [
      ['can_manage_telephony', 'Gérer les postes de la compagnie (nom, voicemail, renvois)'],
      ['can_manage_ivr', 'Gérer les menus IVR'],
      ['can_manage_groups', "Gérer les groupes d'appel / ring groups"],
      ['can_manage_audio_prompts', "Gérer les messages audio / musique d'attente"],
      ['can_view_company_cdr', "Voir l'historique d'appels de toute la compagnie"],
    ],
  },
]

function portalPermLabel(u) {
  return [
    u.can_view_invoices && 'Factures', u.can_view_tickets && 'Tickets',
    u.can_create_tickets && 'Créer tickets', u.can_view_equipment && 'Équipements',
    u.can_view_own_extension && 'Mon poste', u.can_manage_telephony && 'Gestionnaire téléphonie',
  ].filter(Boolean).join(', ') || 'Aucune'
}

function PortalAccessSection({ contact }) {
  const [portalUser, setPortalUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    api.get(`/v1/portal/users?contact_id=${contact.id}`).then(r => {
      setPortalUser(r.data[0] || null)
      setLoading(false)
    })
  }, [contact.id])

  async function toggleActive() {
    const r = await api.put(`/v1/portal/users/${portalUser.id}`, { is_active: !portalUser.is_active })
    setPortalUser(r.data)
  }

  async function del() {
    if (!confirm(`Supprimer l'accès portail de ${contact.first_name} ${contact.last_name} ?`)) return
    await api.delete(`/v1/portal/users/${portalUser.id}`)
    setPortalUser(null)
  }

  if (loading) return null

  return (
    <div style={{ marginTop: 20 }}>
      <div className="ifield-section-title" style={{ marginBottom: 8 }}>Portail client</div>
      {!portalUser ? (
        <button className="btn-secondary" style={{ fontSize: 13 }} onClick={() => setShowModal(true)}>+ Créer un accès portail</button>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: '10px 14px' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{portalUser.email}</span>
          <span style={{ fontSize: 12, color: '#6B7280' }}>{portalPermLabel(portalUser)}</span>
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>Dernière connexion : {portalUser.last_login ? new Date(portalUser.last_login).toLocaleString('fr-CA') : 'jamais'}</span>
          <button
            onClick={toggleActive}
            style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 10, border: 'none', cursor: 'pointer', background: portalUser.is_active ? '#D1FAE5' : '#FEE2E2', color: portalUser.is_active ? '#059669' : '#DC2626' }}
          >
            {portalUser.is_active ? 'Actif' : 'Inactif'}
          </button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setShowModal(true)}>Modifier</button>
            <button onClick={del} style={{ fontSize: 12, padding: '4px 10px', background: 'none', border: '1px solid #FCA5A5', color: '#DC2626', borderRadius: 6, cursor: 'pointer' }}>Supprimer</button>
          </div>
        </div>
      )}
      {showModal && (
        <PortalAccessModal
          contact={contact}
          existing={portalUser}
          onClose={() => setShowModal(false)}
          onSaved={u => { setPortalUser(u); setShowModal(false) }}
        />
      )}
    </div>
  )
}

function PortalAccessModal({ contact, existing, onClose, onSaved }) {
  const isEdit = !!existing
  const primaryCompany = contact.companies?.find(x => x.is_primary) || contact.companies?.[0]
  const [companyId, setCompanyId] = useState(existing?.company_id || primaryCompany?.company_id || '')
  const [fullName, setFullName] = useState(existing?.full_name || `${contact.first_name} ${contact.last_name}`.trim())
  const [email, setEmail] = useState(existing?.email || contact.email || '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState(() => {
    const base = {}
    PORTAL_PERM_GROUPS.forEach(g => g.fields.forEach(([k]) => { base[k] = existing ? existing[k] : (k === 'can_view_invoices' || k === 'can_view_tickets') }))
    return base
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  function genPassword() {
    const pw = generatePassword()
    setPassword(pw)
    setShowPassword(true)
  }

  async function save() {
    if (!companyId || !fullName.trim() || !email.trim() || (!isEdit && !password)) {
      setError('Compagnie, nom, courriel et mot de passe sont requis')
      return
    }
    setSaving(true)
    setError('')
    try {
      let r
      if (isEdit) {
        const payload = { full_name: fullName, email, ...form }
        if (password) payload.password = password
        r = await api.put(`/v1/portal/users/${existing.id}`, payload)
      } else {
        r = await api.post('/v1/portal/users', {
          contact_id: contact.id, company_id: companyId,
          full_name: fullName, email, password, ...form,
        })
      }
      onSaved(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Erreur')
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 460, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">{isEdit ? "Modifier l'accès portail" : 'Nouvel accès portail'}</h3>
        {error && <div className="form-error">{error}</div>}
        <div className="form-group">
          <label>Compagnie *</label>
          <select value={companyId} onChange={e => setCompanyId(e.target.value)} disabled={isEdit}>
            <option value="">— Sélectionner —</option>
            {(contact.companies || []).map(co => <option key={co.company_id} value={co.company_id}>{co.company_name}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Nom complet *</label><input value={fullName} onChange={e => setFullName(e.target.value)} /></div>
        <div className="form-group"><label>Courriel *</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div className="form-group">
          <label>{isEdit ? 'Nouveau mot de passe (laisser vide pour ne pas changer)' : 'Mot de passe *'}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} style={{ flex: 1 }} />
            <button type="button" className="btn-secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }} onClick={genPassword}>Générer</button>
          </div>
          {showPassword && password && <div style={{ fontSize: 12, color: '#059669', marginTop: 4 }}>Copie ce mot de passe pour le transmettre au client — il ne sera plus affiché après.</div>}
        </div>
        {PORTAL_PERM_GROUPS.map(g => (
          <div key={g.title} style={{ background: g.warn ? '#FFFBEB' : '#F9FAFB', border: `1px solid ${g.warn ? '#FDE68A' : '#E5E7EB'}`, borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: g.warn ? '#92400E' : '#6B7280', marginBottom: 8 }}>{g.title}</div>
            {g.fields.map(([key, label]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={form[key]} onChange={e => f(key, e.target.checked)} />
                {label}
              </label>
            ))}
          </div>
        ))}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? '...' : isEdit ? 'Enregistrer' : 'Créer'}</button>
        </div>
      </div>
    </div>
  )
}
