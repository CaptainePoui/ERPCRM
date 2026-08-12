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
}

const TABS_MAP = {
  can_view_invoices: { label: 'Factures', key: 'invoices' },
  can_view_tickets: { label: 'Tickets', key: 'tickets' },
  can_view_equipment: { label: 'Équipements', key: 'equipment' },
  can_view_own_extension: { label: 'Mon poste', key: 'extension' },
}

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
  const [tab, setTab] = useState(tabs[0]?.key || '')
  const [data, setData] = useState({})
  const [loading, setLoading] = useState(false)
  const [showNewTicket, setShowNewTicket] = useState(false)

  useEffect(() => {
    if (!tab) return
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
    <div className="modal-overlay" onClick={onClose}>
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
