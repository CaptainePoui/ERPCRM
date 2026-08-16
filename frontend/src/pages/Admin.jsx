import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../services/api'
import './Admin.css'

const ROLES = ['admin', 'manager', 'tech', 'billing', 'readonly']
const ROLE_LABELS = { admin: 'Admin', manager: 'Gérant', tech: 'Technicien', billing: 'Facturation', readonly: 'Lecture seule' }
const ROLE_COLORS = { admin: '#DC2626', manager: '#7C3AED', tech: 'var(--brand)', billing: '#059669', readonly: '#6B7280' }

const fmtDate = s => s ? new Date(s).toLocaleDateString('fr-CA', { year:'numeric', month:'short', day:'numeric' }) : '—'

// Arbre de privilèges (TASK-S053) : cocher le "maître" d'une branche coche/décoche
// aussi tous ses sous-items en un clic (cascade), révèle/cache la branche
// (progressive disclosure — "un scroll down avec l'arbre d'option"), et chaque
// sous-item reste éditable individuellement après coup sans affecter les autres.
function PermissionBranch({ masterKey, masterLabel, items, form, onChange, headerBg, headerColor }) {
  const [expanded, setExpanded] = useState(!!form[masterKey])
  useEffect(() => { if (form[masterKey]) setExpanded(true) }, [form[masterKey]])
  const checkedCount = items.filter(([k]) => form[k]).length

  function toggleMaster(checked) {
    onChange(masterKey, checked)
    items.forEach(([k]) => onChange(k, checked))
    setExpanded(checked)
  }

  return (
    <div style={{ background: headerBg || '#F9FAFB', border: `1px solid ${headerColor ? headerColor + '55' : '#E5E7EB'}`, borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: headerColor || '#374151', cursor: 'pointer' }}>
        <input type="checkbox" checked={!!form[masterKey]} onChange={e => toggleMaster(e.target.checked)} />
        <span style={{ flex: 1 }} onClick={e => { e.preventDefault(); setExpanded(v => !v) }}>{masterLabel}</span>
        <span style={{ fontSize: 11, fontWeight: 400, color: '#9CA3AF' }}>
          {checkedCount}/{items.length} · {expanded ? '▾' : '▸'}
        </span>
      </label>
      {expanded && (
        <div style={{ marginLeft: 26, marginTop: 8 }}>
          {items.map(([key, label]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!form[key]} onChange={e => onChange(key, e.target.checked)} />
              {label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

const TABS = ['Utilisateurs', 'Portail client', 'Méthodes de paiement', 'Intégrations', 'Backup cloud', 'Tickets']

export default function Admin() {
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState(searchParams.get('google_calendar') ? 3 : searchParams.get('backup') ? 4 : 0)

  return (
    <div className="adm-page">
      <div className="adm-header">
        <h1 className="adm-title">Administration</h1>
      </div>
      <div className="adm-tabs">
        {TABS.map((t, i) => (
          <button key={t} className={`adm-tab${tab === i ? ' active' : ''}`} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>
      <div className="adm-body">
        {tab === 0 && <UsersPanel />}
        {tab === 1 && <PortalUsersPanel />}
        {tab === 2 && <PaymentMethodsPanel />}
        {tab === 3 && <IntegrationsPanel />}
        {tab === 4 && <BackupPanel />}
        {tab === 5 && <TicketsSettingsPanel />}
      </div>
    </div>
  )
}

// ── Tickets (TASK-015.12) ────────────────────────────────────────────────────

function TicketsSettingsPanel() {
  const [threshold, setThreshold] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.get('/v1/settings').then(r => {
      setThreshold(String(r.data.ticket_time_confirm_threshold_minutes))
      setLoading(false)
    })
  }, [])

  async function save() {
    setSaving(true)
    setSaved(false)
    try {
      await api.put('/v1/settings', { ticket_time_confirm_threshold_minutes: parseInt(threshold) })
      setSaved(true)
    } finally { setSaving(false) }
  }

  if (loading) return <div className="loading">Chargement...</div>

  return (
    <div>
      <div className="adm-panel-header">
        <span className="adm-count">Chrono des tickets</span>
      </div>
      <p style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>
        Au-delà de ce seuil de temps écoulé depuis la dernière note, une confirmation (avec possibilité de corriger le temps) est demandée avant d'enregistrer — protège contre le chrono laissé tourner par erreur (ex. onglet oublié ouvert). En dessous du seuil, la note s'enregistre directement sans interruption.
      </p>
      <div className="form-group" style={{ maxWidth: 260 }}>
        <label>Seuil de confirmation (minutes)</label>
        <input type="number" min="1" value={threshold} onChange={e => { setThreshold(e.target.value); setSaved(false) }} />
      </div>
      <button className="btn-primary" onClick={save} disabled={saving || !threshold}>
        {saving ? '...' : saved ? '✓ Enregistré' : 'Enregistrer'}
      </button>
    </div>
  )
}

// ── Intégrations ──────────────────────────────────────────────────────────────

const GOOGLE_CALLBACK_MESSAGES = {
  connected: { text: '✓ Google Calendar connecté avec succès.', color: '#059669' },
  error: { text: "La connexion Google a été refusée ou annulée.", color: '#DC2626' },
  csrf: { text: "Échec de vérification de sécurité, veuillez réessayer.", color: '#DC2626' },
  no_refresh_token: { text: "Google n'a pas retourné de jeton — réessayez (déconnectez d'abord l'accès existant dans les paramètres de votre compte Google si le problème persiste).", color: '#DC2626' },
}

function IntegrationsPanel() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)

  const callbackMsg = GOOGLE_CALLBACK_MESSAGES[searchParams.get('google_calendar')]

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const r = await api.get('/v1/google-calendar/status')
      setStatus(r.data)
    } finally { setLoading(false) }
  }

  function connect() {
    window.location.href = '/api/v1/google-calendar/connect'
  }

  async function disconnect() {
    if (!confirm('Déconnecter Google Calendar ? Le module RDV continuera de fonctionner avec seulement les rendez-vous locaux comme contrainte.')) return
    setDisconnecting(true)
    try {
      await api.post('/v1/google-calendar/disconnect')
      await load()
    } finally { setDisconnecting(false) }
  }

  function dismissMsg() {
    searchParams.delete('google_calendar')
    setSearchParams(searchParams)
  }

  return (
    <div>
      <div className="adm-panel-header">
        <span className="adm-count">Synchronisation Google Calendar</span>
      </div>
      <p style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>
        Synchronise le module de prise de RDV en ligne avec un agenda Google : lecture des plages occupées, écriture des rendez-vous réservés.
      </p>

      {callbackMsg && (
        <div style={{ background: '#F9FAFB', border: `1px solid ${callbackMsg.color}`, color: callbackMsg.color, borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{callbackMsg.text}</span>
          <button onClick={dismissMsg} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 16 }}>×</button>
        </div>
      )}

      {loading ? <div className="loading">Chargement...</div> : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{
            fontSize: 13, fontWeight: 700, padding: '5px 12px', borderRadius: 20,
            background: status.connected ? '#D1FAE5' : '#FEF2F2',
            color: status.connected ? '#059669' : '#DC2626',
          }}>
            {status.connected ? '✓ Connecté' : 'Non connecté'}
          </span>
          {!status.client_configured && (
            <span style={{ fontSize: 12, color: '#9CA3AF' }}>
              GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET pas encore configurés sur le serveur.
            </span>
          )}
          {status.client_configured && !status.connected && (
            <button className="btn-primary" onClick={connect}>Connecter Google Calendar</button>
          )}
          {status.connected && (
            <button className="btn-secondary" onClick={disconnect} disabled={disconnecting}>{disconnecting ? '...' : 'Déconnecter'}</button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Backup cloud (TASK-035) ──────────────────────────────────────────────────
// Backup de notre propre infra ERPCRM (DB + uploads) vers Dropbox/Google Drive,
// PAS le stockage cloud client pour enregistrements d'appel (TASK-034, séparé).

const PROVIDER_LABELS = { dropbox: 'Dropbox', google_drive: 'Google Drive' }
const FREQUENCY_LABELS = { daily: 'Journalier', weekly: 'Hebdomadaire', monthly: 'Mensuel', yearly: 'Annuel' }
const WEEKDAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const TIMEZONES = ['America/Toronto', 'America/Winnipeg', 'America/Edmonton', 'America/Vancouver', 'America/Halifax']
const BACKUP_STATUS_SUFFIXES = ['_no_refresh_token', '_connected', '_error', '_csrf']

function parseBackupCallback(value) {
  if (!value) return null
  for (const suffix of BACKUP_STATUS_SUFFIXES) {
    if (value.endsWith(suffix)) {
      const provider = value.slice(0, -suffix.length)
      return { provider, status: suffix.slice(1) }
    }
  }
  return null
}

const BACKUP_CALLBACK_MESSAGES = {
  connected: { text: p => `✓ ${PROVIDER_LABELS[p] || p} connecté avec succès.`, color: '#059669' },
  error: { text: p => `La connexion ${PROVIDER_LABELS[p] || p} a été refusée ou annulée.`, color: '#DC2626' },
  csrf: { text: () => "Échec de vérification de sécurité, veuillez réessayer.", color: '#DC2626' },
  no_refresh_token: { text: p => `${PROVIDER_LABELS[p] || p} n'a pas retourné de jeton — réessayez.`, color: '#DC2626' },
}

function BackupPanel() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [connections, setConnections] = useState([])
  const [cycles, setCycles] = useState([])
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [runningNow, setRunningNow] = useState(false)
  const [runMsg, setRunMsg] = useState('')
  const [showCycleModal, setShowCycleModal] = useState(false)
  const [editingCycle, setEditingCycle] = useState(null)

  const callback = parseBackupCallback(searchParams.get('backup'))
  const callbackMsg = callback && BACKUP_CALLBACK_MESSAGES[callback.status]

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [c, cy, lg] = await Promise.all([
        api.get('/v1/backup/connections'),
        api.get('/v1/backup/cycles'),
        api.get('/v1/backup/logs'),
      ])
      setConnections(c.data)
      setCycles(cy.data)
      setLogs(lg.data)
    } finally { setLoading(false) }
  }

  function dismissMsg() {
    searchParams.delete('backup')
    setSearchParams(searchParams)
  }

  function connect(provider) {
    window.location.href = `/api/v1/backup/connections/${provider}/connect`
  }

  async function disconnect(provider) {
    if (!confirm(`Déconnecter ${PROVIDER_LABELS[provider]} ? Le backup vers ce cloud sera suspendu.`)) return
    await api.post(`/v1/backup/connections/${provider}/disconnect`)
    await load()
  }

  async function updateConnection(provider, patch) {
    await api.put(`/v1/backup/connections/${provider}`, patch)
    setConnections(p => p.map(c => c.provider === provider ? { ...c, ...patch } : c))
  }

  async function deleteCycle(cycle) {
    if (!confirm(`Supprimer le cycle ${FREQUENCY_LABELS[cycle.frequency_type]} ?`)) return
    await api.delete(`/v1/backup/cycles/${cycle.id}`)
    setCycles(p => p.filter(c => c.id !== cycle.id))
  }

  async function toggleCycle(cycle) {
    const r = await api.put(`/v1/backup/cycles/${cycle.id}`, { enabled: !cycle.enabled })
    setCycles(p => p.map(c => c.id === cycle.id ? r.data : c))
  }

  async function runNow() {
    setRunningNow(true)
    setRunMsg('')
    try {
      const r = await api.post('/v1/backup/run')
      const ran = r.data.ran
      if (!ran.length) {
        setRunMsg('Aucune connexion/cycle actif — rien à envoyer.')
      } else {
        const okCount = ran.filter(x => x.success).length
        const failCount = ran.length - okCount
        setRunMsg(
          failCount === 0 ? `✓ Backup envoyé (${okCount} copies).`
          : okCount === 0 ? `✗ Échec des ${failCount} copies — voir l'historique ci-dessous pour le détail.`
          : `⚠ ${okCount} copie(s) envoyée(s), ${failCount} échec(s) — voir l'historique ci-dessous.`
        )
      }
      const lg = await api.get('/v1/backup/logs')
      setLogs(lg.data)
    } catch (e) {
      setRunMsg(e.response?.data?.detail || 'Échec du backup')
    } finally { setRunningNow(false) }
  }

  const cycleLabel = c => {
    if (c.frequency_type === 'weekly') return `${FREQUENCY_LABELS[c.frequency_type]} — ${WEEKDAY_LABELS[c.day_of_week] ?? '?'}`
    if (c.frequency_type === 'monthly') return `${FREQUENCY_LABELS[c.frequency_type]} — le ${c.day_of_month}`
    if (c.frequency_type === 'yearly') return `${FREQUENCY_LABELS[c.frequency_type]} — ${c.day_of_month}/${c.month_of_year}`
    return FREQUENCY_LABELS[c.frequency_type]
  }

  if (loading) return <div className="loading">Chargement...</div>

  return (
    <div>
      <p style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>
        Backup automatique de notre propre infra ERPCRM (base de données + fichiers uploadés) vers Dropbox et/ou Google Drive. Distinct du stockage cloud offert aux clients pour leurs enregistrements d'appel.
      </p>

      {callbackMsg && (
        <div style={{ background: '#F9FAFB', border: `1px solid ${callbackMsg.color}`, color: callbackMsg.color, borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{callbackMsg.text(callback.provider)}</span>
          <button onClick={dismissMsg} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 16 }}>×</button>
        </div>
      )}

      <div className="adm-panel-header">
        <span className="adm-count">Connexions cloud</span>
      </div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        {connections.map(c => (
          <div key={c.provider} style={{ flex: '1 1 320px', border: '1px solid #E5E7EB', borderRadius: 8, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <strong>{PROVIDER_LABELS[c.provider]}</strong>
              <span style={{
                fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                background: c.connected ? '#D1FAE5' : '#FEF2F2',
                color: c.connected ? '#059669' : '#DC2626',
              }}>
                {c.connected ? '✓ Connecté' : 'Non connecté'}
              </span>
            </div>
            {c.connected && c.account_label && (
              <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 10 }}>{c.account_label}</div>
            )}
            {!c.connected ? (
              <>
                <CredentialsForm provider={c.provider} initialClientId={c.client_id} onSaved={load} />
                <button className="btn-primary" onClick={() => connect(c.provider)} disabled={!c.has_credentials}>
                  Connecter {PROVIDER_LABELS[c.provider]}
                </button>
                {!c.has_credentials && (
                  <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 6 }}>Entrez et enregistrez les identifiants ci-dessus avant de connecter.</div>
                )}
              </>
            ) : (
              <>
                <div className="form-group">
                  <label>Fuseau horaire</label>
                  <select value={c.timezone} onChange={e => updateConnection(c.provider, { timezone: e.target.value })}>
                    {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Heure de déclenchement</label>
                  <input type="time" value={c.backup_hour} onChange={e => updateConnection(c.provider, { backup_hour: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Limite de bande passante (kbps, vide = illimité)</label>
                  <input type="number" min="0" value={c.bandwidth_limit_kbps ?? ''}
                    onChange={e => updateConnection(c.provider, { bandwidth_limit_kbps: e.target.value === '' ? null : parseInt(e.target.value) })} />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={c.enabled} onChange={e => updateConnection(c.provider, { enabled: e.target.checked })} />
                  Actif (participe au backup)
                </label>
                <button className="btn-secondary" onClick={() => disconnect(c.provider)}>Déconnecter</button>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="adm-panel-header">
        <span className="adm-count">{cycles.length} cycle{cycles.length !== 1 ? 's' : ''} de rotation</span>
        <button className="btn-primary" onClick={() => { setEditingCycle(null); setShowCycleModal(true) }}>+ Ajouter un cycle</button>
      </div>
      <table className="adm-table">
        <thead><tr><th>Cycle</th><th>Générations gardées</th><th>Actif</th><th></th></tr></thead>
        <tbody>
          {cycles.map(c => (
            <tr key={c.id} className={c.enabled ? '' : 'adm-row-inactive'}>
              <td className="adm-name">{cycleLabel(c)}</td>
              <td>{c.retention_enabled ? c.retention_count : '1 (toujours écrasé)'}</td>
              <td>
                <button className={`adm-toggle ${c.enabled ? 'active' : 'inactive'}`} onClick={() => toggleCycle(c)}>
                  {c.enabled ? 'Actif' : 'Inactif'}
                </button>
              </td>
              <td>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="adm-edit-btn" onClick={() => { setEditingCycle(c); setShowCycleModal(true) }}>Modifier</button>
                  <button className="adm-del-btn" onClick={() => deleteCycle(c)}>✕</button>
                </div>
              </td>
            </tr>
          ))}
          {cycles.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9CA3AF', padding: '24px 0' }}>Aucun cycle configuré.</td></tr>}
        </tbody>
      </table>

      <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn-primary" onClick={runNow} disabled={runningNow}>{runningNow ? '...' : 'Backup maintenant'}</button>
        {runMsg && <span style={{ fontSize: 13, color: '#6B7280' }}>{runMsg}</span>}
      </div>

      {logs.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div className="adm-panel-header"><span className="adm-count">Historique récent</span></div>
          <table className="adm-table">
            <thead><tr><th>Date</th><th>Fournisseur</th><th>Fichier</th><th>Résultat</th></tr></thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id}>
                  <td style={{ fontSize: 12, color: '#9CA3AF' }}>{fmtDate(l.started_at)}{l.triggered_manually ? ' (manuel)' : ''}</td>
                  <td>{PROVIDER_LABELS[l.provider] || l.provider}</td>
                  <td style={{ fontSize: 12, color: '#6B7280' }}>{l.filename || '—'}</td>
                  <td>
                    <span style={{ fontSize: 12, fontWeight: 600, color: l.success ? '#059669' : '#DC2626' }}>
                      {l.success ? 'Succès' : (l.error_message || 'Échec')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCycleModal && (
        <CycleModal cycle={editingCycle} onClose={() => setShowCycleModal(false)}
          onSaved={c => {
            setCycles(p => editingCycle ? p.map(x => x.id === c.id ? c : x) : [...p, c])
            setShowCycleModal(false)
          }} />
      )}
    </div>
  )
}

function CredentialsForm({ provider, initialClientId, onSaved }) {
  const [clientId, setClientId] = useState(initialClientId || '')
  const [clientSecret, setClientSecret] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    if (!clientId.trim() || !clientSecret.trim()) return
    setSaving(true)
    try {
      await api.put(`/v1/backup/connections/${provider}/credentials`, { client_id: clientId.trim(), client_secret: clientSecret.trim() })
      setSaved(true)
      setClientSecret('')
      await onSaved()
    } finally { setSaving(false) }
  }

  return (
    <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>
        IDENTIFIANTS API {provider === 'dropbox' ? '(App Key / App Secret Dropbox)' : '(Client ID / Client Secret Google)'}
      </div>
      <div className="form-group">
        <label>{provider === 'dropbox' ? 'App Key' : 'Client ID'}</label>
        <input value={clientId} onChange={e => { setClientId(e.target.value); setSaved(false) }} />
      </div>
      <div className="form-group">
        <label>{provider === 'dropbox' ? 'App Secret' : 'Client Secret'}</label>
        <input type="password" value={clientSecret} onChange={e => { setClientSecret(e.target.value); setSaved(false) }}
          placeholder={initialClientId ? 'laisser vide pour ne pas changer' : ''} />
      </div>
      <button className="btn-secondary" onClick={save} disabled={saving || !clientId.trim() || !clientSecret.trim()}>
        {saving ? '...' : saved ? '✓ Enregistré' : 'Enregistrer les identifiants'}
      </button>
    </div>
  )
}

function CycleModal({ cycle, onClose, onSaved }) {
  const [form, setForm] = useState({
    frequency_type: cycle?.frequency_type || 'daily',
    day_of_week: cycle?.day_of_week ?? 6,
    day_of_month: cycle?.day_of_month ?? 1,
    month_of_year: cycle?.month_of_year ?? 1,
    retention_enabled: cycle?.retention_enabled ?? true,
    retention_count: cycle?.retention_count ?? 3,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  async function save() {
    setSaving(true)
    setError('')
    try {
      let r
      if (cycle) {
        r = await api.put(`/v1/backup/cycles/${cycle.id}`, form)
      } else {
        r = await api.post('/v1/backup/cycles', { ...form, enabled: true })
      }
      onSaved(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Erreur')
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">{cycle ? 'Modifier le cycle' : 'Ajouter un cycle'}</h3>
        {error && <div className="adm-form-error">{error}</div>}
        <div className="form-group">
          <label>Fréquence</label>
          <select value={form.frequency_type} onChange={e => f('frequency_type', e.target.value)} disabled={!!cycle}>
            {Object.entries(FREQUENCY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {form.frequency_type === 'weekly' && (
          <div className="form-group">
            <label>Jour de la semaine</label>
            <select value={form.day_of_week} onChange={e => f('day_of_week', parseInt(e.target.value))}>
              {WEEKDAY_LABELS.map((label, i) => <option key={i} value={i}>{label}</option>)}
            </select>
          </div>
        )}
        {(form.frequency_type === 'monthly' || form.frequency_type === 'yearly') && (
          <div className="form-group">
            <label>Jour du mois</label>
            <input type="number" min="1" max="31" value={form.day_of_month} onChange={e => f('day_of_month', parseInt(e.target.value))} />
          </div>
        )}
        {form.frequency_type === 'yearly' && (
          <div className="form-group">
            <label>Mois</label>
            <input type="number" min="1" max="12" value={form.month_of_year} onChange={e => f('month_of_year', parseInt(e.target.value))} />
          </div>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.retention_enabled} onChange={e => f('retention_enabled', e.target.checked)} />
          Garder plusieurs générations (sinon un seul fichier toujours écrasé)
        </label>
        {form.retention_enabled && (
          <div className="form-group">
            <label>Combien de générations garder</label>
            <input type="number" min="1" value={form.retention_count} onChange={e => f('retention_count', parseInt(e.target.value))} />
          </div>
        )}
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? '...' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}


// ── Users ─────────────────────────────────────────────────────────────────────

function UsersPanel() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const r = await api.get('/v1/admin/users')
      setUsers(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Accès refusé')
    } finally { setLoading(false) }
  }

  async function toggle(user) {
    const r = await api.put(`/v1/admin/users/${user.id}`, { is_active: !user.is_active })
    setUsers(p => p.map(u => u.id === user.id ? r.data : u))
  }

  async function deleteUser(user) {
    if (!confirm(`Supprimer ${user.full_name} ?`)) return
    await api.delete(`/v1/admin/users/${user.id}`)
    setUsers(p => p.filter(u => u.id !== user.id))
  }

  if (loading) return <div className="loading">Chargement...</div>
  if (error) return <div className="adm-error">{error}</div>

  return (
    <div>
      <div className="adm-panel-header">
        <span className="adm-count">{users.length} utilisateur{users.length !== 1 ? 's' : ''}</span>
        <button className="btn-primary" onClick={() => setShowNew(true)}>+ Nouvel utilisateur</button>
      </div>
      <table className="adm-table">
        <thead>
          <tr>{['Nom', 'Courriel', 'Rôle', 'Statut', 'Dernier accès', ''].map(h => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} className={u.is_active ? '' : 'adm-row-inactive'}>
              <td className="adm-name">{u.full_name}</td>
              <td style={{ color: '#6B7280', fontSize: 13 }}>{u.email}</td>
              <td>
                <span className="adm-role" style={{ background: ROLE_COLORS[u.role] + '20', color: ROLE_COLORS[u.role] }}>
                  {ROLE_LABELS[u.role] || u.role}
                </span>
              </td>
              <td>
                <button className={`adm-toggle ${u.is_active ? 'active' : 'inactive'}`} onClick={() => toggle(u)}>
                  {u.is_active ? 'Actif' : 'Inactif'}
                </button>
              </td>
              <td style={{ color: '#9CA3AF', fontSize: 13 }}>{fmtDate(u.last_login)}</td>
              <td>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="adm-edit-btn" onClick={() => setEditing(u)}>Modifier</button>
                  <button className="adm-del-btn" onClick={() => deleteUser(u)}>✕</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showNew && (
        <UserModal onClose={() => setShowNew(false)}
          onSaved={u => { setUsers(p => [...p, u]); setShowNew(false) }} />
      )}
      {editing && (
        <UserModal user={editing} onClose={() => setEditing(null)}
          onSaved={u => { setUsers(p => p.map(x => x.id === u.id ? u : x)); setEditing(null) }} />
      )}
    </div>
  )
}

function UserModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState({
    full_name: user?.full_name || '',
    email: user?.email || '',
    role: user?.role || 'readonly',
    password: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  async function save() {
    if (!form.full_name.trim() || !form.email.trim()) return
    if (!user && !form.password) { setError('Mot de passe requis'); return }
    setSaving(true)
    setError('')
    try {
      const payload = { full_name: form.full_name, email: form.email, role: form.role }
      if (form.password) payload.password = form.password
      let r
      if (user) {
        r = await api.put(`/v1/admin/users/${user.id}`, payload)
      } else {
        r = await api.post('/v1/admin/users', payload)
      }
      onSaved(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Erreur')
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">{user ? 'Modifier utilisateur' : 'Nouvel utilisateur'}</h3>
        {error && <div className="adm-form-error">{error}</div>}
        <div className="form-group"><label>Nom complet *</label><input value={form.full_name} onChange={e => f('full_name', e.target.value)} autoFocus /></div>
        <div className="form-group"><label>Courriel *</label><input type="email" value={form.email} onChange={e => f('email', e.target.value)} /></div>
        <div className="form-group">
          <label>Rôle</label>
          <select value={form.role} onChange={e => f('role', e.target.value)}>
            {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>{user ? 'Nouveau mot de passe (laisser vide = inchangé)' : 'Mot de passe *'}</label>
          <input type="password" value={form.password} onChange={e => f('password', e.target.value)} />
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? '...' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}


// ── Portal Users ──────────────────────────────────────────────────────────────

function PortalUsersPanel() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const r = await api.get('/v1/portal/users')
      setUsers(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Erreur de chargement')
    } finally { setLoading(false) }
  }

  async function toggleActive(u) {
    const r = await api.put(`/v1/portal/users/${u.id}`, { is_active: !u.is_active })
    setUsers(p => p.map(x => x.id === u.id ? r.data : x))
  }

  async function deleteUser(u) {
    if (!confirm(`Supprimer l'accès portail de ${u.full_name} ?`)) return
    await api.delete(`/v1/portal/users/${u.id}`)
    setUsers(p => p.filter(x => x.id !== u.id))
  }

  if (loading) return <div className="loading">Chargement...</div>
  if (error) return <div className="adm-error">{error}</div>

  const permLabel = u => [
    u.can_view_invoices && 'Factures',
    u.can_view_tickets && 'Tickets',
    u.can_create_tickets && 'Créer tickets',
    u.can_view_equipment && 'Équipements',
    u.can_view_own_extension && 'Mon poste',
    u.can_manage_telephony && 'Gestionnaire téléphonie',
  ].filter(Boolean).join(', ') || 'Aucune'

  return (
    <div>
      <p style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>
        Gérez les accès au portail client. URL du portail : <strong>/portal</strong>
      </p>
      <div className="adm-panel-header">
        <span className="adm-count">{users.length} accès portail</span>
        <button className="btn-primary" onClick={() => setShowNew(true)}>+ Nouvel accès</button>
      </div>
      <table className="adm-table">
        <thead><tr><th>Nom</th><th>Courriel</th><th>Permissions</th><th>Statut</th><th>Dernier accès</th><th></th></tr></thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} className={u.is_active ? '' : 'adm-row-inactive'}>
              <td className="adm-name">{u.full_name}</td>
              <td style={{ color: '#6B7280', fontSize: 13 }}>{u.email}</td>
              <td style={{ color: '#6B7280', fontSize: 12 }}>{permLabel(u)}</td>
              <td>
                <button className={`adm-toggle ${u.is_active ? 'active' : 'inactive'}`} onClick={() => toggleActive(u)}>
                  {u.is_active ? 'Actif' : 'Inactif'}
                </button>
              </td>
              <td style={{ color: '#9CA3AF', fontSize: 13 }}>{fmtDate(u.last_login)}</td>
              <td><button className="adm-del-btn" onClick={() => deleteUser(u)}>✕</button></td>
            </tr>
          ))}
          {users.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9CA3AF', padding: '24px 0' }}>Aucun accès portail.</td></tr>}
        </tbody>
      </table>
      {showNew && (
        <PortalUserModal onClose={() => setShowNew(false)}
          onSaved={u => { setUsers(p => [...p, u]); setShowNew(false) }} />
      )}
    </div>
  )
}

function PortalUserModal({ onClose, onSaved }) {
  const [companies, setCompanies] = useState([])
  const [form, setForm] = useState({
    company_id: '', full_name: '', email: '', password: '',
    can_view_invoices: true, can_view_tickets: true, can_create_tickets: false, can_view_equipment: false,
    // Défauts TASK-S055 (demande explicite 2026-08-07) : les options utiles au
    // quotidien activées d'emblée, le reste (nom du poste, DND, écoute des
    // messages, alertes) désactivé — l'admin les active au cas par cas.
    can_view_own_extension: true, can_edit_extension_name: false, can_edit_call_forward: true,
    can_edit_dnd: false, can_edit_voicemail: true, can_edit_call_plan: false, can_view_own_cdr: true,
    can_view_voicemail_messages: false, can_receive_alerts: false,
    can_manage_telephony: false, can_manage_ivr: false, can_manage_groups: false,
    can_manage_audio_prompts: false, can_view_company_cdr: false,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    api.get('/v1/companies/').then(r => setCompanies(r.data))
  }, [])

  async function save() {
    if (!form.company_id || !form.email || !form.full_name || !form.password) { setError('Tous les champs obligatoires'); return }
    setSaving(true)
    setError('')
    try {
      const r = await api.post('/v1/portal/users', form)
      onSaved(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Erreur')
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 460 }} onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">Nouvel accès portail</h3>
        {error && <div className="adm-form-error">{error}</div>}
        <div className="form-group">
          <label>Compagnie *</label>
          <select value={form.company_id} onChange={e => f('company_id', e.target.value)} autoFocus>
            <option value="">— Sélectionner —</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Nom complet *</label><input value={form.full_name} onChange={e => f('full_name', e.target.value)} /></div>
        <div className="form-group"><label>Courriel *</label><input type="email" value={form.email} onChange={e => f('email', e.target.value)} /></div>
        <div className="form-group"><label>Mot de passe *</label><input type="password" value={form.password} onChange={e => f('password', e.target.value)} /></div>
        <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>PERMISSIONS</div>
          {[
            ['can_view_invoices', 'Voir les factures'],
            ['can_view_tickets', 'Voir les tickets'],
            ['can_create_tickets', 'Créer des tickets'],
            ['can_view_equipment', 'Voir l\'inventaire'],
          ].map(([key, label]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={form[key]} onChange={e => f(key, e.target.checked)} />
              {label}
            </label>
          ))}
        </div>
        <PermissionBranch
          masterKey="can_view_own_extension" masterLabel="TÉLÉPHONIE — MON POSTE"
          form={form} onChange={f} headerColor="#374151"
          items={[
            ['can_edit_extension_name', 'Modifier le nom affiché de son poste'],
            ['can_edit_call_forward', 'Gérer ses renvois d\'appel'],
            ['can_edit_dnd', 'Activer/désactiver Ne pas déranger'],
            ['can_edit_voicemail', 'Gérer ses options de messagerie vocale'],
            ['can_edit_call_plan', 'Gérer son plan d\'appel (Canada/US/international/payants)'],
            ['can_view_own_cdr', 'Voir son historique d\'appels personnel'],
            ['can_view_voicemail_messages', 'Écouter ses messages vocaux'],
            ['can_receive_alerts', 'Recevoir les alertes (poste hors ligne, etc.)'],
          ]}
        />
        <PermissionBranch
          masterKey="can_manage_telephony" masterLabel="TÉLÉPHONIE — GESTIONNAIRE (toute la compagnie)"
          form={form} onChange={f} headerBg="#FFFBEB" headerColor="#92400E"
          items={[
            ['can_manage_ivr', 'Gérer les menus IVR'],
            ['can_manage_groups', 'Gérer les groupes d\'appel / ring groups'],
            ['can_manage_audio_prompts', 'Gérer les messages audio / musique d\'attente'],
            ['can_view_company_cdr', 'Voir l\'historique d\'appels de toute la compagnie'],
          ]}
        />
        <div style={{ marginTop: -6, marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#92400E' }}>
            Jamais exposé au client, peu importe ces permissions : trunks, routes sortantes, DIDs principaux, 911, sécurité.
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


// ── Payment Methods ───────────────────────────────────────────────────────────

function PaymentMethodsPanel() {
  const [methods, setMethods] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const r = await api.get('/v1/admin/payment-methods')
      setMethods(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Accès refusé')
    } finally { setLoading(false) }
  }

  function startEdit(m) {
    setEditing(m.id)
    setEditForm({ name: m.name, discount_rate: m.discount_rate, is_active: m.is_active })
  }

  async function saveEdit(id) {
    setSaving(true)
    try {
      const r = await api.put(`/v1/admin/payment-methods/${id}`, editForm)
      setMethods(p => p.map(m => m.id === id ? r.data : m))
      setEditing(null)
    } finally { setSaving(false) }
  }

  if (loading) return <div className="loading">Chargement...</div>
  if (error) return <div className="adm-error">{error}</div>

  return (
    <div>
      <p style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>
        Configurez les modes de paiement disponibles et leur taux de rabais automatique.
      </p>
      <table className="adm-table">
        <thead>
          <tr>{['Code', 'Nom', 'Rabais (%)', 'Actif', ''].map(h => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {methods.map(m => (
            <tr key={m.id}>
              <td style={{ fontFamily: 'monospace', color: '#6B7280', fontSize: 12 }}>{m.code}</td>
              <td>
                {editing === m.id ? (
                  <input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                    style={{ border: '1px solid #D1D5DB', borderRadius: 4, padding: '4px 8px', fontSize: 14 }} />
                ) : m.name}
              </td>
              <td style={{ textAlign: 'center' }}>
                {editing === m.id ? (
                  <input type="number" min="0" max="100" step="0.1" value={editForm.discount_rate}
                    onChange={e => setEditForm(p => ({ ...p, discount_rate: parseFloat(e.target.value) }))}
                    style={{ width: 70, border: '1px solid #D1D5DB', borderRadius: 4, padding: '4px 8px', textAlign: 'center', fontSize: 14 }} />
                ) : `${m.discount_rate}%`}
              </td>
              <td style={{ textAlign: 'center' }}>
                {editing === m.id ? (
                  <input type="checkbox" checked={editForm.is_active} onChange={e => setEditForm(p => ({ ...p, is_active: e.target.checked }))} />
                ) : (
                  <span style={{ color: m.is_active ? '#059669' : '#9CA3AF', fontWeight: 600, fontSize: 13 }}>
                    {m.is_active ? 'Oui' : 'Non'}
                  </span>
                )}
              </td>
              <td>
                {editing === m.id ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => saveEdit(m.id)} disabled={saving}>{saving ? '...' : 'Sauvegarder'}</button>
                    <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setEditing(null)}>Annuler</button>
                  </div>
                ) : (
                  <button className="adm-edit-btn" onClick={() => startEdit(m)}>Modifier</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
