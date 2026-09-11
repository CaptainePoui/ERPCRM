import { useState, useEffect } from 'react'
import api from '../services/api'
import './Portal.css'

const PORTAL_KEY = 'portal_session'

function getSession() {
  try { return JSON.parse(localStorage.getItem(PORTAL_KEY)) } catch { return null }
}

export default function Portal() {
  const [session, setSession] = useState(() => getSession())

  function handleLogin(sess) {
    localStorage.setItem(PORTAL_KEY, JSON.stringify(sess))
    // Store portal token separately from internal token
    localStorage.setItem('portal_token', sess.access_token)
    setSession(sess)
  }

  function handleLogout() {
    localStorage.removeItem(PORTAL_KEY)
    localStorage.removeItem('portal_token')
    setSession(null)
  }

  if (!session) return <PortalLogin onLogin={handleLogin} />
  return <PortalDashboard session={session} onLogout={handleLogout} />
}

// ── Login ─────────────────────────────────────────────────────────────────────

function PortalLogin({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const r = await api.post('/v1/portal/login', { email, password })
      onLogin(r.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Identifiants invalides')
    } finally { setLoading(false) }
  }

  return (
    <div className="portal-login-wrap">
      <div className="portal-login-card">
        <div className="portal-logo">Simple IP</div>
        <h2 className="portal-login-title">Portail client</h2>
        <form onSubmit={submit}>
          {error && <div className="portal-error">{error}</div>}
          <div className="form-group"><label>Courriel</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus required /></div>
          <div className="form-group"><label>Mot de passe</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
          <button type="submit" className="portal-login-btn" disabled={loading}>{loading ? 'Connexion...' : 'Se connecter'}</button>
        </form>
      </div>
    </div>
  )
}

// ── Dashboard ────────────────────────────────────────────────────────────────

const portalApi = {
  async get(path) {
    const token = localStorage.getItem('portal_token')
    return api.get(path, { headers: { Authorization: `Bearer ${token}` } })
  },
  async post(path, data) {
    const token = localStorage.getItem('portal_token')
    return api.post(path, data, { headers: { Authorization: `Bearer ${token}` } })
  },
  async patch(path, data) {
    const token = localStorage.getItem('portal_token')
    return api.patch(path, data, { headers: { Authorization: `Bearer ${token}` } })
  },
  async put(path, data) {
    const token = localStorage.getItem('portal_token')
    return api.put(path, data, { headers: { Authorization: `Bearer ${token}` } })
  },
  async delete(path) {
    const token = localStorage.getItem('portal_token')
    return api.delete(path, { headers: { Authorization: `Bearer ${token}` } })
  },
  async postForm(path, formData) {
    const token = localStorage.getItem('portal_token')
    return api.post(path, formData, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } })
  },
}

const TABS_MAP = {
  can_view_invoices: { label: 'Factures', key: 'invoices' },
  can_view_tickets: { label: 'Tickets', key: 'tickets' },
  can_view_equipment: { label: 'Équipements', key: 'equipment' },
  can_view_own_extension: { label: 'Mon poste', key: 'extension' },
}

// L'onglet "Gestion téléphonique" ne dépend PAS d'une seule case -- chaque
// capacité (postes/IVR/groupes/prompts/CDR) est une permission totalement
// indépendante (voir ContactDetail.jsx, groupe "TÉLÉPHONIE — GESTIONNAIRE").
// L'onglet apparaît si AU MOINS UNE est cochée ; à l'intérieur, chaque
// sous-onglet ne s'affiche que si SA permission précise est cochée -- jamais
// besoin de can_manage_telephony pour voir seulement le CDR, par exemple.
const TELEPHONY_MANAGER_PERMS = ['can_manage_telephony', 'can_manage_ivr', 'can_manage_groups', 'can_manage_audio_prompts', 'can_view_company_cdr']

// TASK-S056 : mêmes 4 champs granulaires que ContactDetail.jsx (admin), même
// comportement tri-état (coché/décoché/indéterminé = hérite du défaut compagnie)
// -- ne pas réintroduire le menu Local/National/International retiré (TASK-S052),
// lui n'était jamais réellement appliqué au routage des appels.
const CALL_PLAN_ITEMS = [
  { key: 'allow_canada', label: 'Canada' },
  { key: 'allow_us', label: 'États-Unis' },
  { key: 'allow_international', label: 'International' },
  { key: 'allow_premium', label: 'Numéros payants (900)' },
]

const FORWARD_DEST_TYPES = [
  { value: 'extension', label: 'Poste' },
  { value: 'voicemail', label: 'Messagerie' },
  { value: 'ring_group', label: 'Groupe d\'appel' },
]

// Section repliable (TASK-S053) : "un scroll down avec l'arbre d'option, si je
// choisis le maître il me sort toutes les options de cette branche" — même
// principe de divulgation progressive que PermissionBranch (Admin.jsx), mais ici
// pour de vrais champs de configuration plutôt que des cases de permission.
function OptionSection({ title, defaultOpen, children }) {
  const [open, setOpen] = useState(!!defaultOpen)
  return (
    <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
      <button type="button" onClick={() => setOpen(v => !v)}
        style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: '#F9FAFB', border: 'none',
                 cursor: 'pointer', fontSize: 14, fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
        {title}<span style={{ color: '#9CA3AF' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && <div style={{ padding: '12px 14px' }}>{children}</div>}
    </div>
  )
}

const STATUS_FR = {
  // invoices
  brouillon: 'Brouillon', envoyee: 'Envoyée', payee: 'Payée', en_retard: 'En retard', annulee: 'Annulée',
  // tickets
  ouvert: 'Ouvert', en_cours: 'En cours', en_attente: 'En attente', resolu: 'Résolu', ferme: 'Fermé',
  // equipment
  actif: 'Actif', inactif: 'Inactif', hors_service: 'Hors service',
}
const STATUS_COLOR = {
  payee: '#059669', en_retard: '#DC2626', envoyee: 'var(--brand)', brouillon: '#6B7280', annulee: '#9CA3AF',
  ouvert: 'var(--brand)', en_cours: '#D97706', resolu: '#059669', ferme: '#9CA3AF', en_attente: '#7C3AED',
  actif: '#059669', inactif: '#9CA3AF', hors_service: '#DC2626',
}

function PortalDashboard({ session, onLogout }) {
  const perms = session.permissions || {}
  const tabs = Object.entries(TABS_MAP).filter(([key]) => perms[key]).map(([, v]) => v)
  if (TELEPHONY_MANAGER_PERMS.some(k => perms[k])) {
    tabs.push({ label: 'Gestion téléphonique', key: 'telephony' })
  }
  const [tab, setTab] = useState(tabs[0]?.key || '')
  const [data, setData] = useState({})
  const [loading, setLoading] = useState(false)
  const [showNewTicket, setShowNewTicket] = useState(false)

  useEffect(() => {
    if (!tab || tab === 'telephony') return // Gestion téléphonique gère ses propres sous-onglets/fetch
    setLoading(true)
    portalApi.get(`/v1/portal/${tab}`)
      .then(r => setData(p => ({ ...p, [tab]: r.data })))
      .finally(() => setLoading(false))
  }, [tab])

  const fmt = n => `${parseFloat(n || 0).toFixed(2)} $`
  const fmtDate = s => s ? new Date(s).toLocaleDateString('fr-CA') : '—'

  return (
    <div className="portal-page">
      <div className="portal-topbar">
        <div className="portal-brand">Simple IP — Portail client</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/rdv" target="_blank" rel="noopener noreferrer" className="portal-tab" style={{ textDecoration: 'none' }}>📅 Prendre rendez-vous</a>
          <span style={{ color: '#9CA3AF', fontSize: 13 }}>{session.full_name}</span>
          <button className="portal-logout" onClick={onLogout}>Déconnexion</button>
        </div>
      </div>

      <div className="portal-body">
        <div className="portal-tabs">
          {tabs.map(t => (
            <button key={t.key} className={`portal-tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>

        {loading && <div className="loading" style={{ padding: '24px 0' }}>Chargement...</div>}

        {!loading && tab === 'invoices' && (
          <div>
            <table className="portal-table">
              <thead><tr><th>Numéro</th><th>Statut</th><th>Total</th><th>Échéance</th></tr></thead>
              <tbody>
                {(data.invoices || []).map(inv => (
                  <tr key={inv.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{inv.invoice_number}</td>
                    <td><span style={{ color: STATUS_COLOR[inv.status] || '#6B7280', fontWeight: 600, fontSize: 12 }}>{STATUS_FR[inv.status] || inv.status}</span></td>
                    <td style={{ fontFamily: 'monospace' }}>{fmt(inv.total_ttc)}</td>
                    <td style={{ color: '#6B7280', fontSize: 13 }}>{fmtDate(inv.due_date)}</td>
                  </tr>
                ))}
                {(data.invoices || []).length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9CA3AF', padding: '24px 0' }}>Aucune facture.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {!loading && tab === 'tickets' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              {perms.can_create_tickets && (
                <button className="btn-primary" style={{ fontSize: 13 }} onClick={() => setShowNewTicket(true)}>+ Nouveau ticket</button>
              )}
            </div>
            <table className="portal-table">
              <thead><tr><th>Titre</th><th>Priorité</th><th>Statut</th><th>Date</th></tr></thead>
              <tbody>
                {(data.tickets || []).map(t => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.title}</td>
                    <td style={{ color: '#6B7280', fontSize: 13 }}>{t.priority}</td>
                    <td><span style={{ color: STATUS_COLOR[t.status] || '#6B7280', fontWeight: 600, fontSize: 12 }}>{STATUS_FR[t.status] || t.status}</span></td>
                    <td style={{ color: '#6B7280', fontSize: 13 }}>{fmtDate(t.created_at)}</td>
                  </tr>
                ))}
                {(data.tickets || []).length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9CA3AF', padding: '24px 0' }}>Aucun ticket.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {!loading && tab === 'extension' && data.extension && (
          <ExtensionTab ext={data.extension} perms={perms}
            onSaved={updated => setData(p => ({ ...p, extension: updated }))} />
        )}

        {tab === 'telephony' && <TelephonyManagementTab perms={perms} />}

        {!loading && tab === 'equipment' && (
          <table className="portal-table">
            <thead><tr><th>Nom</th><th>Catégorie</th><th>Marque/Modèle</th><th>IP</th><th>Statut</th></tr></thead>
            <tbody>
              {(data.equipment || []).map(e => (
                <tr key={e.id}>
                  <td style={{ fontWeight: 600 }}>{e.name}</td>
                  <td style={{ color: '#6B7280', fontSize: 13 }}>{e.category}</td>
                  <td style={{ color: '#6B7280', fontSize: 13 }}>{[e.brand, e.model].filter(Boolean).join(' ')}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{e.ip_address || '—'}</td>
                  <td><span style={{ color: STATUS_COLOR[e.status] || '#6B7280', fontWeight: 600, fontSize: 12 }}>{STATUS_FR[e.status] || e.status}</span></td>
                </tr>
              ))}
              {(data.equipment || []).length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9CA3AF', padding: '24px 0' }}>Aucun équipement.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showNewTicket && (
        <NewTicketModal onClose={() => setShowNewTicket(false)}
          onCreated={t => {
            setData(p => ({ ...p, tickets: [t, ...(p.tickets || [])] }))
            setShowNewTicket(false)
          }} />
      )}
    </div>
  )
}

// TASK-S053 : page "Mon poste" — champs limités à ce qui est réellement câblé
// dans le dialplan SIPV (voir TASKSIPV.md TASK-S018.3/023.6/023.30/S023.31/S052) :
// nom, les 4 renvois, DND, messagerie. Rien de décoratif exposé ici.
function ForwardGroup({ title, ext, prefix, extraFields, form, setForm }) {
  const enabledKey = `${prefix}_enabled`
  const typeKey = `${prefix}_destination_type`
  const destKey = `${prefix}_destination`
  return (
    <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid #F3F4F6' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
        <input type="checkbox" checked={!!form[enabledKey]}
          onChange={e => setForm(p => ({ ...p, [enabledKey]: e.target.checked }))} />
        {title}
      </label>
      {form[enabledKey] && (
        <div style={{ display: 'flex', gap: 8, marginTop: 6, marginLeft: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={form[typeKey] || 'extension'} style={{ fontSize: 13 }}
            onChange={e => setForm(p => ({ ...p, [typeKey]: e.target.value }))}>
            {FORWARD_DEST_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input placeholder={form[typeKey] === 'voicemail' ? 'Numéro de poste (vide = le vôtre)' : 'Destination'}
            value={form[destKey] || ''} style={{ fontSize: 13, width: 160 }}
            onChange={e => setForm(p => ({ ...p, [destKey]: e.target.value }))} />
          {extraFields}
        </div>
      )}
    </div>
  )
}

function ExtensionTab({ ext, perms, onSaved }) {
  const [form, setForm] = useState(ext)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [cdr, setCdr] = useState(null)
  const [cdrLoading, setCdrLoading] = useState(false)

  useEffect(() => {
    // TASK-S055 : si le poste n'a pas encore de courriel de messagerie, on
    // pré-remplit avec celui du contact lié (l'utilisateur peut le changer --
    // s'il enregistre tel quel, le courriel devient "lié" à celui du contact).
    setForm({ ...ext, voicemail_email: ext.voicemail_email || ext.contact_email || '' })
  }, [ext])

  useEffect(() => {
    if (!perms.can_view_own_cdr) return
    setCdrLoading(true)
    portalApi.get('/v1/portal/cdr').then(r => setCdr(r.data)).finally(() => setCdrLoading(false))
  }, [perms.can_view_own_cdr])

  async function save(fields) {
    setSaving(true)
    setError('')
    try {
      const r = await portalApi.patch('/v1/portal/extension', fields)
      onSaved(r.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Échec de l\'enregistrement')
    } finally { setSaving(false) }
  }

  const FORWARD_FIELDS = [
    'forward_immediate_enabled', 'forward_immediate_destination_type', 'forward_immediate_destination',
    'forward_busy_enabled', 'forward_busy_destination_type', 'forward_busy_destination',
    'forward_no_answer_enabled', 'forward_no_answer_destination_type', 'forward_no_answer_destination', 'forward_no_answer_delay_seconds',
    'forward_offline_enabled', 'forward_offline_destination_type', 'forward_offline_destination',
  ]

  return (
    <div style={{ maxWidth: 560 }}>
      {error && <div className="portal-error" style={{ marginBottom: 10 }}>{error}</div>}

      <OptionSection title="Mon poste" defaultOpen>
        <div style={{ fontSize: 13, color: '#6B7280', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
          <span>Poste</span><span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#111827' }}>{ext.extension}</span>
          <span>Nom</span><span style={{ fontWeight: 600, color: '#111827' }}>{ext.name}</span>
        </div>
      </OptionSection>

      {perms.can_edit_extension_name && (
        <OptionSection title="Identification">
          <div className="form-group">
            <label>Nom affiché</label>
            <input value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <button className="btn-primary" style={{ fontSize: 13 }} disabled={saving} onClick={() => save({ name: form.name })}>
            {saving ? '...' : 'Enregistrer'}
          </button>
        </OptionSection>
      )}

      {perms.can_edit_call_forward && (
        <OptionSection title="Renvois d'appel">
          <ForwardGroup title="Renvoi immédiat (toujours)" prefix="forward_immediate" form={form} setForm={setForm} />
          <ForwardGroup title="Renvoi si occupé" prefix="forward_busy" form={form} setForm={setForm} />
          <ForwardGroup title="Renvoi sans réponse" prefix="forward_no_answer" form={form} setForm={setForm}
            extraFields={
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                après
                <input type="number" style={{ width: 50, fontSize: 13 }} value={form.forward_no_answer_delay_seconds || 20}
                  onChange={e => setForm(p => ({ ...p, forward_no_answer_delay_seconds: parseInt(e.target.value, 10) }))} />
                sec
              </span>
            } />
          <ForwardGroup title="Renvoi si poste hors ligne" prefix="forward_offline" form={form} setForm={setForm} />
          <button className="btn-primary" style={{ fontSize: 13 }} disabled={saving}
            onClick={() => save(Object.fromEntries(FORWARD_FIELDS.map(k => [k, form[k] ?? null])))}>
            {saving ? '...' : 'Enregistrer les renvois'}
          </button>
        </OptionSection>
      )}

      {perms.can_edit_dnd && (
        <OptionSection title="Ne pas déranger">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!form.dnd_enabled} disabled={saving}
              onChange={e => { setForm(p => ({ ...p, dnd_enabled: e.target.checked })); save({ dnd_enabled: e.target.checked }) }} />
            Ne pas déranger (les appels iront directement à la messagerie si activée, sinon occupé)
          </label>
        </OptionSection>
      )}

      {perms.can_edit_voicemail && (
        <OptionSection title="Messagerie vocale">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 10 }}>
            <input type="checkbox" checked={!!form.voicemail_enabled} disabled={saving}
              onChange={e => { setForm(p => ({ ...p, voicemail_enabled: e.target.checked })); save({ voicemail_enabled: e.target.checked }) }} />
            Messagerie vocale activée
          </label>
          <div className="form-group">
            <label>Courriel de notification</label>
            <input type="email" value={form.voicemail_email || ''} onChange={e => setForm(p => ({ ...p, voicemail_email: e.target.value }))}
              onBlur={() => save({ voicemail_email: form.voicemail_email || null })} />
            {ext.contact_email && form.voicemail_email === ext.contact_email && (
              <small style={{ color: '#6B7280' }}>Lié au courriel de votre fiche contact.</small>
            )}
          </div>
          <VoicemailGreetingGenerator />
        </OptionSection>
      )}

      {perms.can_edit_call_plan && (
        <OptionSection title="Plan d'appel">
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
            Une case non cochée mais grisée (indéterminée) signifie que le poste
            suit le défaut de la compagnie — cochez ou décochez pour l'imposer
            spécifiquement à ce poste.
          </div>
          {CALL_PLAN_ITEMS.map(({ key, label }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <input type="checkbox" id={`cp_${key}`} disabled={saving}
                checked={!!form[key]}
                ref={el => { if (el) el.indeterminate = form[key] === null || form[key] === undefined }}
                onChange={e => { setForm(p => ({ ...p, [key]: e.target.checked })); save({ [key]: e.target.checked }) }}
                style={{ width: 16, height: 16, accentColor: 'var(--brand)', cursor: 'pointer' }} />
              <label htmlFor={`cp_${key}`} style={{ fontSize: 13, cursor: 'pointer', minWidth: 160 }}>{label}</label>
              {(form[key] === null || form[key] === undefined) && (
                <span style={{ fontSize: 11, color: '#9CA3AF' }}>(défaut compagnie)</span>
              )}
            </div>
          ))}
        </OptionSection>
      )}

      {perms.can_view_own_cdr && (
        <OptionSection title="Historique d'appels">
          {cdrLoading && <div style={{ fontSize: 13, color: '#6B7280' }}>Chargement...</div>}
          {!cdrLoading && (!cdr || cdr.items.length === 0) && (
            <div style={{ fontSize: 13, color: '#9CA3AF' }}>Aucun appel.</div>
          )}
          {!cdrLoading && cdr && cdr.items.length > 0 && (
            <table className="portal-table">
              <thead><tr><th>Date</th><th>De</th><th>Vers</th><th>Durée</th><th>Direction</th></tr></thead>
              <tbody>
                {cdr.items.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontSize: 13 }}>{c.start_time ? new Date(c.start_time).toLocaleString('fr-CA') : '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{c.src || '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{c.dst || '—'}</td>
                    <td style={{ fontSize: 13 }}>{c.billsec != null ? `${c.billsec}s` : '—'}</td>
                    <td style={{ fontSize: 12, color: '#6B7280' }}>{c.direction || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </OptionSection>
      )}
    </div>
  )
}

// ── Gestion téléphonique (TASK-020) ─────────────────────────────────────────
// Verrou telephonie (backend, core/telephony_lock.py) applique a chaque
// ecriture -- une erreur 423 revient avec un message clair (qui detient le
// verrou, delai estime) affiche tel quel a l'utilisateur.

// "audio" utilise anyPerm (3 capacites independantes -- gerer/ecouter/generer,
// voir TASK-020 -- le sous-onglet apparait des qu'UNE des trois est cochee,
// chaque section a l'interieur reste gated individuellement).
const TELEPHONY_SUBTABS = [
  { key: 'extensions', label: 'Postes', perm: 'can_manage_telephony' },
  { key: 'ivr', label: 'IVR', perm: 'can_manage_ivr' },
  { key: 'groups', label: 'Groupes', perm: 'can_manage_groups' },
  { key: 'audio', label: 'Audio', anyPerm: ['can_manage_audio_prompts', 'can_listen_audio_prompts', 'can_generate_voice_prompts'] },
  { key: 'cdr', label: 'Historique', perm: 'can_view_company_cdr' },
]

function TelephonyManagementTab({ perms }) {
  const available = TELEPHONY_SUBTABS.filter(t => t.anyPerm ? t.anyPerm.some(k => perms[k]) : perms[t.perm])
  const [sub, setSub] = useState(available[0]?.key || '')
  if (available.length === 0) return null
  return (
    <div>
      <div className="portal-tabs" style={{ marginBottom: 16 }}>
        {available.map(t => (
          <button key={t.key} className={`portal-tab${sub === t.key ? ' active' : ''}`} onClick={() => setSub(t.key)}>{t.label}</button>
        ))}
      </div>
      {sub === 'extensions' && <TelephonyExtensionsPanel />}
      {sub === 'ivr' && <TelephonyIvrPanel />}
      {sub === 'groups' && <TelephonyGroupsPanel />}
      {sub === 'audio' && <TelephonyAudioPanel perms={perms} />}
      {sub === 'cdr' && <TelephonyCdrPanel />}
    </div>
  )
}

function LockNotice({ error }) {
  if (!error) return null
  return <div className="portal-error" style={{ marginBottom: 10 }}>{error}</div>
}

function TelephonyExtensionsPanel() {
  const [exts, setExts] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    portalApi.get('/v1/portal/telephony/extensions').then(r => setExts(r.data)).finally(() => setLoading(false))
  }
  useEffect(load, [])

  async function save() {
    setError('')
    try {
      await portalApi.patch(`/v1/portal/telephony/extensions/${editing.id}`, {
        name: editing.name, voicemail_enabled: editing.voicemail_enabled, voicemail_email: editing.voicemail_email || null,
      })
      setEditing(null)
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Échec de l\'enregistrement')
    }
  }

  if (loading) return <div className="loading">Chargement...</div>
  return (
    <div>
      <LockNotice error={error} />
      <table className="portal-table">
        <thead><tr><th>Poste</th><th>Nom</th><th>Messagerie</th><th></th></tr></thead>
        <tbody>
          {exts.map(e => (
            <tr key={e.id}>
              <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{e.extension}</td>
              <td>{e.name}</td>
              <td style={{ fontSize: 12, color: e.voicemail_enabled ? '#059669' : '#9CA3AF' }}>{e.voicemail_enabled ? 'Activée' : 'Désactivée'}</td>
              <td><button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setEditing(e)}>Modifier</button></td>
            </tr>
          ))}
          {exts.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9CA3AF', padding: '24px 0' }}>Aucun poste.</td></tr>}
        </tbody>
      </table>
      {editing && (
        <div className="modal-overlay">
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Poste {editing.extension}</h3>
            <div className="form-group"><label>Nom</label>
              <input value={editing.name || ''} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!editing.voicemail_enabled}
                onChange={e => setEditing(p => ({ ...p, voicemail_enabled: e.target.checked }))} />
              Messagerie vocale activée
            </label>
            <div className="form-group"><label>Courriel messagerie</label>
              <input type="email" value={editing.voicemail_email || ''} onChange={e => setEditing(p => ({ ...p, voicemail_email: e.target.value }))} />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setEditing(null)}>Annuler</button>
              <button className="btn-primary" onClick={save}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TelephonyIvrPanel() {
  const [ivrs, setIvrs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [error, setError] = useState('')

  function load() {
    setLoading(true)
    portalApi.get('/v1/portal/telephony/ivr').then(r => setIvrs(r.data)).finally(() => setLoading(false))
  }
  useEffect(load, [])

  async function toggleActive(ivr) {
    setError('')
    try {
      await portalApi.patch(`/v1/portal/telephony/ivr/${ivr.id}`, { is_active: !ivr.is_active })
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Échec')
    }
  }

  if (loading) return <div className="loading">Chargement...</div>
  return (
    <div>
      <LockNotice error={error} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn-primary" style={{ fontSize: 13 }} onClick={() => setShowNew(true)}>+ Nouveau IVR</button>
      </div>
      <table className="portal-table">
        <thead><tr><th>Nom</th><th>Options</th><th>Statut</th><th></th></tr></thead>
        <tbody>
          {ivrs.map(i => (
            <tr key={i.id}>
              <td style={{ fontWeight: 600 }}>{i.name}</td>
              <td style={{ fontSize: 13, color: '#6B7280' }}>{(i.options || []).length} choix</td>
              <td style={{ fontSize: 12, color: i.is_active ? '#059669' : '#9CA3AF' }}>{i.is_active ? 'Actif' : 'Inactif'}</td>
              <td><button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => toggleActive(i)}>{i.is_active ? 'Désactiver' : 'Activer'}</button></td>
            </tr>
          ))}
          {ivrs.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9CA3AF', padding: '24px 0' }}>Aucun IVR.</td></tr>}
        </tbody>
      </table>
      {showNew && <NewIvrModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load() }} setError={setError} />}
    </div>
  )
}

function NewIvrModal({ onClose, onCreated, setError }) {
  const [name, setName] = useState('')
  const [greeting, setGreeting] = useState('')
  const [timeoutSec, setTimeoutSec] = useState(10)
  const [options, setOptions] = useState([{ digit: '', destination_type: 'extension', destination: '' }])
  const [saving, setSaving] = useState(false)

  function updateOpt(i, field, val) {
    setOptions(p => p.map((o, idx) => idx === i ? { ...o, [field]: val } : o))
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      await portalApi.post('/v1/portal/telephony/ivr', {
        name, greeting_text: greeting || null, timeout_seconds: timeoutSec,
        options: options.filter(o => o.digit && o.destination),
      })
      onCreated()
    } catch (err) {
      setError(err.response?.data?.detail || 'Échec de la création')
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <h3 className="modal-title">Nouveau menu IVR</h3>
        <div className="form-group"><label>Nom *</label><input value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
        <div className="form-group"><label>Message d'accueil (texte)</label><textarea value={greeting} onChange={e => setGreeting(e.target.value)} rows={2} /></div>
        <div className="form-group"><label>Délai avant relance (secondes)</label><input type="number" value={timeoutSec} onChange={e => setTimeoutSec(parseInt(e.target.value, 10) || 10)} style={{ width: 80 }} /></div>
        <div className="form-group">
          <label>Choix du menu</label>
          {options.map((o, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input placeholder="Touche" value={o.digit} onChange={e => updateOpt(i, 'digit', e.target.value)} style={{ width: 50 }} />
              <select value={o.destination_type} onChange={e => updateOpt(i, 'destination_type', e.target.value)} style={{ fontSize: 13 }}>
                {FORWARD_DEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <input placeholder="Destination" value={o.destination} onChange={e => updateOpt(i, 'destination', e.target.value)} style={{ flex: 1 }} />
            </div>
          ))}
          <button type="button" className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setOptions(p => [...p, { digit: '', destination_type: 'extension', destination: '' }])}>+ Ajouter un choix</button>
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" disabled={saving || !name.trim()} onClick={save}>{saving ? '...' : 'Créer'}</button>
        </div>
      </div>
    </div>
  )
}

function TelephonyGroupsPanel() {
  const [ring, setRing] = useState([])
  const [paging, setPaging] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showNewRing, setShowNewRing] = useState(false)
  const [showNewPaging, setShowNewPaging] = useState(false)

  function load() {
    setLoading(true)
    Promise.all([
      portalApi.get('/v1/portal/telephony/ring-groups'),
      portalApi.get('/v1/portal/telephony/paging-groups'),
    ]).then(([r1, r2]) => { setRing(r1.data); setPaging(r2.data) }).finally(() => setLoading(false))
  }
  useEffect(load, [])

  if (loading) return <div className="loading">Chargement...</div>
  return (
    <div>
      <LockNotice error={error} />
      <h4 style={{ fontSize: 14, marginBottom: 8 }}>Groupes d'appel</h4>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setShowNewRing(true)}>+ Nouveau groupe</button>
      </div>
      <table className="portal-table" style={{ marginBottom: 24 }}>
        <thead><tr><th>Nom</th><th>Poste</th><th>Stratégie</th><th>Statut</th></tr></thead>
        <tbody>
          {ring.map(g => (
            <tr key={g.id}>
              <td style={{ fontWeight: 600 }}>{g.name}</td>
              <td style={{ fontFamily: 'monospace' }}>{g.extension}</td>
              <td style={{ fontSize: 13, color: '#6B7280' }}>{g.ring_strategy}</td>
              <td style={{ fontSize: 12, color: g.is_active ? '#059669' : '#9CA3AF' }}>{g.is_active ? 'Actif' : 'Inactif'}</td>
            </tr>
          ))}
          {ring.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9CA3AF', padding: '16px 0' }}>Aucun groupe d'appel.</td></tr>}
        </tbody>
      </table>

      <h4 style={{ fontSize: 14, marginBottom: 8 }}>Interphonie</h4>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setShowNewPaging(true)}>+ Nouveau groupe</button>
      </div>
      <table className="portal-table">
        <thead><tr><th>Nom</th><th>Poste</th><th>Mode</th><th>Statut</th></tr></thead>
        <tbody>
          {paging.map(g => (
            <tr key={g.id}>
              <td style={{ fontWeight: 600 }}>{g.name}</td>
              <td style={{ fontFamily: 'monospace' }}>{g.extension}</td>
              <td style={{ fontSize: 13, color: '#6B7280' }}>{g.mode}</td>
              <td style={{ fontSize: 12, color: g.is_active ? '#059669' : '#9CA3AF' }}>{g.is_active ? 'Actif' : 'Inactif'}</td>
            </tr>
          ))}
          {paging.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9CA3AF', padding: '16px 0' }}>Aucun groupe d'interphonie.</td></tr>}
        </tbody>
      </table>

      {showNewRing && <NewGroupModal type="ring" title="Nouveau groupe d'appel" onClose={() => setShowNewRing(false)}
        onCreated={() => { setShowNewRing(false); load() }} setError={setError} />}
      {showNewPaging && <NewGroupModal type="paging" title="Nouveau groupe d'interphonie" onClose={() => setShowNewPaging(false)}
        onCreated={() => { setShowNewPaging(false); load() }} setError={setError} />}
    </div>
  )
}

function NewGroupModal({ type, title, onClose, onCreated, setError }) {
  const [name, setName] = useState('')
  const [extension, setExtension] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    setError('')
    try {
      const path = type === 'ring' ? '/v1/portal/telephony/ring-groups' : '/v1/portal/telephony/paging-groups'
      await portalApi.post(path, { name, extension })
      onCreated()
    } catch (err) {
      setError(err.response?.data?.detail || 'Échec de la création')
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">{title}</h3>
        <div className="form-group"><label>Nom *</label><input value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
        <div className="form-group"><label>Numéro de poste *</label><input value={extension} onChange={e => setExtension(e.target.value)} /></div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" disabled={saving || !name.trim() || !extension.trim()} onClick={save}>{saving ? '...' : 'Créer'}</button>
        </div>
      </div>
    </div>
  )
}

function TelephonyAudioPanel({ perms }) {
  const [prompts, setPrompts] = useState([])
  const [moh, setMoh] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showUploadPrompt, setShowUploadPrompt] = useState(false)
  const [showUploadMoh, setShowUploadMoh] = useState(false)
  const [renaming, setRenaming] = useState(null)
  const portalToken = localStorage.getItem('portal_token')

  function load() {
    setLoading(true)
    Promise.all([
      portalApi.get('/v1/portal/telephony/prompts'),
      portalApi.get('/v1/portal/telephony/moh'),
    ]).then(([r1, r2]) => { setPrompts(r1.data); setMoh(r2.data) }).finally(() => setLoading(false))
  }
  useEffect(load, [])

  async function deletePrompt(id) {
    if (!confirm('Supprimer cette phrase ?')) return
    setError('')
    try {
      await portalApi.delete(`/v1/portal/telephony/prompts/${id}`)
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Échec de la suppression (peut-être encore utilisée par un IVR)')
    }
  }

  async function saveRename() {
    setError('')
    try {
      await portalApi.patch(`/v1/portal/telephony/prompts/${renaming.id}`, { name: renaming.name })
      setRenaming(null)
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Échec')
    }
  }

  async function deleteMoh(id) {
    if (!confirm('Supprimer ce fichier de musique d\'attente ?')) return
    setError('')
    try {
      await portalApi.delete(`/v1/portal/telephony/moh/${id}`)
      load()
    } catch (err) {
      setError(err.response?.data?.detail || 'Échec de la suppression')
    }
  }

  if (loading) return <div className="loading">Chargement...</div>
  return (
    <div>
      <LockNotice error={error} />
      <h4 style={{ fontSize: 14, marginBottom: 8 }}>Phrases / annonces</h4>
      {perms.can_manage_audio_prompts && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setShowUploadPrompt(true)}>+ Téléverser une phrase</button>
        </div>
      )}
      <table className="portal-table" style={{ marginBottom: 24 }}>
        <thead><tr><th>Nom</th><th></th></tr></thead>
        <tbody>
          {prompts.map(p => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                {perms.can_listen_audio_prompts && (
                  <audio controls src={`/api/v1/portal/telephony/prompts/${p.id}/file?token=${encodeURIComponent(portalToken)}`} style={{ height: 28, maxWidth: 180 }} />
                )}
                {perms.can_manage_audio_prompts && (
                  <>
                    <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setRenaming(p)}>Renommer</button>
                    <button className="btn-secondary" style={{ fontSize: 12, color: '#DC2626' }} onClick={() => deletePrompt(p.id)}>Supprimer</button>
                  </>
                )}
              </td>
            </tr>
          ))}
          {prompts.length === 0 && <tr><td colSpan={2} style={{ textAlign: 'center', color: '#9CA3AF', padding: '16px 0' }}>Aucune phrase.</td></tr>}
        </tbody>
      </table>

      {perms.can_generate_voice_prompts && <VoiceGenerateSection onGenerated={load} setError={setError} portalToken={portalToken} />}

      <h4 style={{ fontSize: 14, marginBottom: 8, marginTop: 24 }}>Musique d'attente</h4>
      {perms.can_manage_audio_prompts && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setShowUploadMoh(true)}>+ Téléverser un fichier</button>
        </div>
      )}
      <table className="portal-table">
        <thead><tr><th>Nom</th><th>Portée</th><th></th></tr></thead>
        <tbody>
          {moh.map(m => (
            <tr key={m.id}>
              <td>{m.name}</td>
              <td style={{ fontSize: 12, color: '#6B7280' }}>{m.tenant_id ? 'Votre compagnie' : 'Partagée (Simple IP)'}</td>
              <td style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                {perms.can_listen_audio_prompts && (
                  <audio controls src={`/api/v1/portal/telephony/moh/${m.id}/file?token=${encodeURIComponent(portalToken)}`} style={{ height: 28, maxWidth: 180 }} />
                )}
                {perms.can_manage_audio_prompts && m.tenant_id && (
                  <button className="btn-secondary" style={{ fontSize: 12, color: '#DC2626' }} onClick={() => deleteMoh(m.id)}>Supprimer</button>
                )}
              </td>
            </tr>
          ))}
          {moh.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: '#9CA3AF', padding: '16px 0' }}>Aucun fichier.</td></tr>}
        </tbody>
      </table>

      {renaming && (
        <div className="modal-overlay">
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Renommer la phrase</h3>
            <div className="form-group"><label>Nom</label>
              <input value={renaming.name} onChange={e => setRenaming(p => ({ ...p, name: e.target.value }))} autoFocus />
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setRenaming(null)}>Annuler</button>
              <button className="btn-primary" onClick={saveRename}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {showUploadPrompt && (
        <UploadAudioModal title="Téléverser une phrase" path="/v1/portal/telephony/prompts"
          onClose={() => setShowUploadPrompt(false)} onUploaded={() => { setShowUploadPrompt(false); load() }} setError={setError} />
      )}
      {showUploadMoh && (
        <UploadAudioModal title="Téléverser un fichier de musique d'attente" path="/v1/portal/telephony/moh"
          onClose={() => setShowUploadMoh(false)} onUploaded={() => { setShowUploadMoh(false); load() }} setError={setError} />
      )}
    </div>
  )
}

// Generation vocale (IA) -- meme UX que TelephonyTab.jsx cote interne (filtre
// langue/genre, previsualisation <audio> live, puis "Creer la phrase" qui
// genere et envoie directement a SIPV comme nouvelle phrase du tenant).
function VoiceGenerateSection({ onGenerated, setError, portalToken }) {
  const [genForm, setGenForm] = useState({ name: '', text: '', voiceId: '' })
  const [voices, setVoices] = useState([])
  const [langFilter, setLangFilter] = useState('fr')
  const [genderFilter, setGenderFilter] = useState('all')
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    portalApi.get('/v1/portal/telephony/voicebox/voices').then(r => setVoices(r.data)).catch(() => setVoices([]))
  }, [])

  const languages = [...new Set(voices.map(v => v.language))].sort()
  const filteredVoices = voices.filter(v => v.language === langFilter && (genderFilter === 'all' || v.gender === genderFilter))
  const selectedVoice = voices.find(v => v.voice_id === genForm.voiceId)

  function selectLanguage(lang) { setLangFilter(lang); setGenForm(p => ({ ...p, voiceId: '' })) }
  function selectGender(g) { setGenderFilter(g); setGenForm(p => ({ ...p, voiceId: '' })) }

  async function generate() {
    if (!genForm.name.trim() || !genForm.text.trim() || !genForm.voiceId) return
    setGenerating(true)
    setError('')
    try {
      await portalApi.post('/v1/portal/telephony/prompts/generate', {
        name: genForm.name.trim(), text: genForm.text.trim(), voice_id: genForm.voiceId, language: langFilter,
      })
      setGenForm({ name: '', text: '', voiceId: genForm.voiceId })
      onGenerated()
    } catch (err) {
      setError(err.response?.data?.detail || 'Échec de la génération')
    } finally { setGenerating(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: 12, marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Générer par voix (synthèse vocale IA)</div>
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
            {filteredVoices.map(v => <option key={v.voice_id} value={v.voice_id}>{v.name}</option>)}
          </select>
          {filteredVoices.length === 0 && voices.length > 0 && (
            <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>Aucune voix pour ce filtre.</div>
          )}
        </div>
        {selectedVoice && (
          <audio controls preload="none" style={{ height: 32 }} src={`/api/v1/portal/telephony/voicebox/preview?${new URLSearchParams({
            text: `Bonjour, je suis ${selectedVoice.name}, une des voix de Simple IP.`,
            voice_id: genForm.voiceId, language: langFilter, token: portalToken,
          }).toString()}`} />
        )}
        <button className="btn-primary" style={{ fontSize: 12, padding: '7px 14px' }} disabled={generating || !genForm.name.trim() || !genForm.text.trim() || !genForm.voiceId} onClick={generate}>
          {generating ? 'Génération...' : 'Créer la phrase'}
        </button>
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>Texte à lire</label>
        <textarea rows={3} value={genForm.text} onChange={e => setGenForm(p => ({ ...p, text: e.target.value }))} placeholder="Le texte de la phrase à créer" />
      </div>
    </div>
  )
}

function UploadAudioModal({ title, path, onClose, onUploaded, setError }) {
  const [name, setName] = useState('')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!file || !name.trim()) return
    setSaving(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('name', name)
      fd.append('file', file)
      await portalApi.postForm(path, fd)
      onUploaded()
    } catch (err) {
      setError(err.response?.data?.detail || 'Échec du téléversement')
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">{title}</h3>
        <div className="form-group"><label>Nom *</label><input value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
        <div className="form-group"><label>Fichier audio *</label>
          <input type="file" accept="audio/*" onChange={e => setFile(e.target.files?.[0] || null)} />
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" disabled={saving || !file || !name.trim()} onClick={save}>{saving ? '...' : 'Téléverser'}</button>
        </div>
      </div>
    </div>
  )
}

function TelephonyCdrPanel() {
  const [cdr, setCdr] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    portalApi.get('/v1/portal/telephony/cdr').then(r => setCdr(r.data)).finally(() => setLoading(false))
  }, [])
  if (loading) return <div className="loading">Chargement...</div>
  const items = cdr?.items || []
  return (
    <table className="portal-table">
      <thead><tr><th>Date</th><th>De</th><th>Vers</th><th>Durée</th><th>Direction</th></tr></thead>
      <tbody>
        {items.map(c => (
          <tr key={c.id}>
            <td style={{ fontSize: 13 }}>{c.start_time ? new Date(c.start_time).toLocaleString('fr-CA') : '—'}</td>
            <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{c.src || '—'}</td>
            <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{c.dst || '—'}</td>
            <td style={{ fontSize: 13 }}>{c.billsec != null ? `${c.billsec}s` : '—'}</td>
            <td style={{ fontSize: 12, color: '#6B7280' }}>{c.direction || '—'}</td>
          </tr>
        ))}
        {items.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9CA3AF', padding: '24px 0' }}>Aucun appel.</td></tr>}
      </tbody>
    </table>
  )
}

// Message d'accueil de boîte vocale par texte + IA (TASK-020, Mon poste) --
// reutilise can_edit_voicemail, pas une case separee (demande explicite,
// actif de base des que la gestion de messagerie l'est).
function VoicemailGreetingGenerator() {
  const [voices, setVoices] = useState([])
  const [langFilter, setLangFilter] = useState('fr')
  const [genderFilter, setGenderFilter] = useState('all')
  const [voiceId, setVoiceId] = useState('')
  const [text, setText] = useState('')
  const [greetingType, setGreetingType] = useState('unavailable')
  const [generating, setGenerating] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const portalToken = localStorage.getItem('portal_token')

  useEffect(() => {
    portalApi.get('/v1/portal/telephony/voicebox/voices').then(r => setVoices(r.data)).catch(() => setVoices([]))
  }, [])

  const languages = [...new Set(voices.map(v => v.language))].sort()
  const filteredVoices = voices.filter(v => v.language === langFilter && (genderFilter === 'all' || v.gender === genderFilter))
  const selectedVoice = voices.find(v => v.voice_id === voiceId)

  async function generate() {
    if (!text.trim() || !voiceId) return
    setGenerating(true)
    setError('')
    setMsg('')
    try {
      await portalApi.post('/v1/portal/extension/voicemail-greeting/generate', {
        text: text.trim(), voice_id: voiceId, language: langFilter, greeting_type: greetingType,
      })
      setMsg('✓ Message d\'accueil mis à jour')
    } catch (err) {
      setError(err.response?.data?.detail || 'Échec de la génération')
    } finally { setGenerating(false) }
  }

  if (voices.length === 0) return null
  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #F3F4F6' }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Message d'accueil par synthèse vocale (IA)</div>
      {error && <div className="portal-error" style={{ marginBottom: 8 }}>{error}</div>}
      {msg && <div style={{ fontSize: 12, color: '#059669', fontWeight: 600, marginBottom: 8 }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <select value={greetingType} onChange={e => setGreetingType(e.target.value)} style={{ fontSize: 13 }}>
          <option value="unavailable">Absence</option>
          <option value="busy">Occupé</option>
          <option value="name">Nom annoncé</option>
        </select>
        <select value={langFilter} onChange={e => { setLangFilter(e.target.value); setVoiceId('') }} style={{ fontSize: 13 }}>
          {languages.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={genderFilter} onChange={e => { setGenderFilter(e.target.value); setVoiceId('') }} style={{ fontSize: 13 }}>
          <option value="all">Tout genre</option>
          <option value="female">Femme</option>
          <option value="male">Homme</option>
        </select>
        <select value={voiceId} onChange={e => setVoiceId(e.target.value)} style={{ fontSize: 13 }}>
          <option value="">Choisir une voix...</option>
          {filteredVoices.map(v => <option key={v.voice_id} value={v.voice_id}>{v.name}</option>)}
        </select>
        {selectedVoice && (
          <audio controls preload="none" style={{ height: 30 }} src={`/api/v1/portal/telephony/voicebox/preview?${new URLSearchParams({
            text: `Bonjour, je suis ${selectedVoice.name}.`, voice_id: voiceId, language: langFilter, token: portalToken,
          }).toString()}`} />
        )}
      </div>
      <div className="form-group" style={{ marginBottom: 8 }}>
        <textarea rows={2} value={text} onChange={e => setText(e.target.value)} placeholder="Texte de votre message d'accueil..." />
      </div>
      <button className="btn-primary" style={{ fontSize: 12, padding: '6px 12px' }} disabled={generating || !text.trim() || !voiceId} onClick={generate}>
        {generating ? 'Génération...' : 'Enregistrer ce message'}
      </button>
    </div>
  )
}

function NewTicketModal({ onClose, onCreated }) {
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [saving, setSaving] = useState(false)
  async function save() {
    if (!title.trim()) return
    setSaving(true)
    try {
      const r = await portalApi.post('/v1/portal/tickets', { title, description: desc || null })
      onCreated(r.data)
    } finally { setSaving(false) }
  }
  return (
    <div className="modal-overlay">
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Nouveau ticket</h3>
        <div className="form-group"><label>Titre *</label><input value={title} onChange={e => setTitle(e.target.value)} autoFocus /></div>
        <div className="form-group"><label>Description</label><textarea value={desc} onChange={e => setDesc(e.target.value)} rows={4} /></div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving || !title.trim()}>{saving ? '...' : 'Envoyer'}</button>
        </div>
      </div>
    </div>
  )
}
