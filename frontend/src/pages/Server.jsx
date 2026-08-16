import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import api, { getToken } from '../services/api'
import PhoneOptionsEditor from '../components/PhoneOptionsEditor'
import './Admin.css'

const SERVER_TABS = ['Téléphonie', 'Backup cloud']

export default function Server() {
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState(searchParams.get('server_backup') ? 1 : 0)

  const [servers, setServers] = useState([])
  const [loading, setLoading] = useState(true)

  function load() {
    api.get('/v1/server/servers').then(r => setServers(r.data)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const [companies, setCompanies] = useState([])
  useEffect(() => {
    api.get('/v1/companies').then(r => setCompanies(r.data.filter(c => c.sipv_enabled && c.sipv_tenant_id)))
  }, [])

  async function updateServerField(serverId, field, value) {
    const r = await api.put(`/v1/server/servers/${serverId}`, { [field]: value || null })
    setServers(prev => prev.map(s => s.id === serverId ? r.data : s))
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#111827' }}>Serveur</h1>
      <p style={{ color: '#6B7280', fontSize: 14, marginTop: 8, marginBottom: 16 }}>
        Configuration globale du serveur SIPV (canaux de lignes, Fail2Ban, etc.) — à venir.
      </p>
      <div className="adm-tabs" style={{ marginBottom: 24 }}>
        {SERVER_TABS.map((t, i) => (
          <button key={t} className={`adm-tab${tab === i ? ' active' : ''}`} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>

      {tab === 0 && (
        <>
          <VoicemailSettingsSection />
          <MohLibrarySection companies={companies} />
          {loading ? <div className="loading">Chargement...</div> : servers.length === 0 ? (
            <div className="empty-tab">Aucun serveur SIPV enregistré.</div>
          ) : (
            servers.map(s => (
              <div key={s.id} style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{s.name}</div>
                  <span style={{ fontSize: 12, color: s.is_active ? '#059669' : '#9CA3AF' }}>{s.is_active ? 'Actif' : 'Inactif'}</span>
                </div>
                <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 16 }}>
                  {s.hostname} {s.ip_address ? `(${s.ip_address})` : ''} — {s.tenant_count} compagnie(s) hébergée(s)
                </div>
                <SipChannelIpsSection server={s} onSave={updateServerField} />
                <GlobalTemplatesSection server={s} />
                <TenantTemplatesSection server={s} />
              </div>
            ))
          )}
        </>
      )}

      {tab === 1 && <BackupCloudSection />}
    </div>
  )
}

// NIP par defaut des nouvelles boites vocales -- reglage GLOBAL (pas par
// serveur SIPV, TelephonySettings est un singleton), demande explicite de
// Philippe (2026-08-04). Vide = comportement precedent inchange (NIP
// aleatoire 4 chiffres a la creation d'une boite).
function VoicemailSettingsSection() {
  const [defaultPassword, setDefaultPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/v1/server/voicemail-settings').then(r => setDefaultPassword(r.data.voicemail_default_password || '')).finally(() => setLoading(false))
  }, [])

  async function save(value) {
    setSaving(true)
    const start = Date.now()
    try {
      await api.put('/v1/server/voicemail-settings', { voicemail_default_password: value || null })
    } finally {
      const elapsed = Date.now() - start
      if (elapsed < 400) await new Promise(r => setTimeout(r, 400 - elapsed))
      setSaving(false)
    }
  }

  return (
    <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
        Boîte vocale — réglages globaux
      </div>
      <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
        NIP appliqué aux NOUVELLES boîtes vocales créées (n'affecte pas celles qui existent déjà). Vide = NIP aléatoire à 4 chiffres (comportement d'avant).
      </div>
      {loading ? <div style={{ fontSize: 13, color: '#6B7280' }}>Chargement...</div> : (
        <div className="form-group" style={{ width: 140 }}>
          <label>NIP par défaut</label>
          <input value={defaultPassword} maxLength={20} onChange={e => setDefaultPassword(e.target.value)}
            onBlur={e => save(e.target.value)}
            style={{ width: '100%', borderColor: saving ? '#3B82F6' : undefined, background: saving ? '#EFF6FF' : undefined }} />
        </div>
      )}
    </div>
  )
}

// ── Backup cloud SIPV (TASK-S059) ────────────────────────────────────────
// Meme mecanisme que Admin > Backup cloud (ERPCRM), proxy via /v1/server/backup/*
// -- tout vit reellement cote SIPV, le flux OAuth est relaye par ERPCRM (seul
// domaine public joignable par Dropbox/Google).

const SIPV_PROVIDER_LABELS = { dropbox: 'Dropbox', google_drive: 'Google Drive' }
const SIPV_FREQUENCY_LABELS = { daily: 'Journalier', weekly: 'Hebdomadaire', monthly: 'Mensuel', yearly: 'Annuel' }
const SIPV_WEEKDAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
const SIPV_TIMEZONES = ['America/Toronto', 'America/Winnipeg', 'America/Edmonton', 'America/Vancouver', 'America/Halifax']
const SIPV_BACKUP_STATUS_SUFFIXES = ['_no_refresh_token', '_connected', '_error', '_csrf']

function parseSipvBackupCallback(value) {
  if (!value) return null
  for (const suffix of SIPV_BACKUP_STATUS_SUFFIXES) {
    if (value.endsWith(suffix)) return { provider: value.slice(0, -suffix.length), status: suffix.slice(1) }
  }
  return null
}

const SIPV_BACKUP_CALLBACK_MESSAGES = {
  connected: { text: p => `✓ ${SIPV_PROVIDER_LABELS[p] || p} connecté avec succès.`, color: '#059669' },
  error: { text: p => `La connexion ${SIPV_PROVIDER_LABELS[p] || p} a été refusée ou annulée.`, color: '#DC2626' },
  csrf: { text: () => "Échec de vérification de sécurité, veuillez réessayer.", color: '#DC2626' },
  no_refresh_token: { text: p => `${SIPV_PROVIDER_LABELS[p] || p} n'a pas retourné de jeton — réessayez.`, color: '#DC2626' },
}

function fmtLogDate(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-CA') + ' ' + d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })
}

function BackupCloudSection() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [connections, setConnections] = useState([])
  const [cycles, setCycles] = useState([])
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [runningNow, setRunningNow] = useState(false)
  const [runMsg, setRunMsg] = useState('')
  const [showCycleModal, setShowCycleModal] = useState(false)
  const [editingCycle, setEditingCycle] = useState(null)

  const callback = parseSipvBackupCallback(searchParams.get('server_backup'))
  const callbackMsg = callback && SIPV_BACKUP_CALLBACK_MESSAGES[callback.status]

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [c, cy, lg] = await Promise.all([
        api.get('/v1/server/backup/connections'),
        api.get('/v1/server/backup/cycles'),
        api.get('/v1/server/backup/logs'),
      ])
      setConnections(c.data)
      setCycles(cy.data)
      setLogs(lg.data)
    } finally { setLoading(false) }
  }

  function dismissMsg() {
    searchParams.delete('server_backup')
    setSearchParams(searchParams)
  }

  function connect(provider) {
    window.location.href = `/api/v1/server/backup/connections/${provider}/connect`
  }

  async function disconnect(provider) {
    if (!confirm(`Déconnecter ${SIPV_PROVIDER_LABELS[provider]} ? Le backup SIPV vers ce cloud sera suspendu.`)) return
    await api.post(`/v1/server/backup/connections/${provider}/disconnect`)
    await load()
  }

  async function updateConnection(provider, patch) {
    await api.put(`/v1/server/backup/connections/${provider}`, patch)
    setConnections(p => p.map(c => c.provider === provider ? { ...c, ...patch } : c))
  }

  async function deleteCycle(cycle) {
    if (!confirm(`Supprimer le cycle ${SIPV_FREQUENCY_LABELS[cycle.frequency_type]} ?`)) return
    await api.delete(`/v1/server/backup/cycles/${cycle.id}`)
    setCycles(p => p.filter(c => c.id !== cycle.id))
  }

  async function toggleCycle(cycle) {
    const r = await api.put(`/v1/server/backup/cycles/${cycle.id}`, { enabled: !cycle.enabled })
    setCycles(p => p.map(c => c.id === cycle.id ? r.data : c))
  }

  async function runNow() {
    setRunningNow(true)
    setRunMsg('')
    try {
      const r = await api.post('/v1/server/backup/run')
      const ran = r.data.ran
      if (!ran.length) {
        setRunMsg('Aucune connexion/cycle actif — rien à envoyer.')
      } else {
        const okCount = ran.filter(x => x.success).length
        const failCount = ran.length - okCount
        setRunMsg(
          failCount === 0 ? `✓ Backup envoyé (${okCount} copies).`
          : okCount === 0 ? `✗ Échec des ${failCount} copies — voir l'historique ci-dessous.`
          : `⚠ ${okCount} copie(s) envoyée(s), ${failCount} échec(s) — voir l'historique ci-dessous.`
        )
      }
      const lg = await api.get('/v1/server/backup/logs')
      setLogs(lg.data)
    } catch (e) {
      setRunMsg(e.response?.data?.detail || 'Échec du backup')
    } finally { setRunningNow(false) }
  }

  const cycleLabel = c => {
    if (c.frequency_type === 'weekly') return `${SIPV_FREQUENCY_LABELS[c.frequency_type]} — ${SIPV_WEEKDAY_LABELS[c.day_of_week] ?? '?'}`
    if (c.frequency_type === 'monthly') return `${SIPV_FREQUENCY_LABELS[c.frequency_type]} — le ${c.day_of_month}`
    if (c.frequency_type === 'yearly') return `${SIPV_FREQUENCY_LABELS[c.frequency_type]} — ${c.day_of_month}/${c.month_of_year}`
    return SIPV_FREQUENCY_LABELS[c.frequency_type]
  }

  return (
    <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
        Backup cloud SIPV
      </div>
      <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 16 }}>
        Backup automatique de notre propre infra SIPV (base de données, config Kamailio/FreeSWITCH, MOH) vers Dropbox et/ou Google Drive — accès séparé de celui d'ERPCRM.
      </div>

      {callbackMsg && (
        <div style={{ background: '#F9FAFB', border: `1px solid ${callbackMsg.color}`, color: callbackMsg.color, borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{callbackMsg.text(callback.provider)}</span>
          <button onClick={dismissMsg} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 16 }}>×</button>
        </div>
      )}

      {loading ? <div style={{ fontSize: 13, color: '#6B7280' }}>Chargement...</div> : (
        <>
          <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
            {connections.map(c => (
              <div key={c.provider} style={{ flex: '1 1 320px', border: '1px solid #E5E7EB', borderRadius: 8, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <strong>{SIPV_PROVIDER_LABELS[c.provider]}</strong>
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
                    <SipvCredentialsForm provider={c.provider} initialClientId={c.client_id} onSaved={load} />
                    <button className="btn-primary" onClick={() => connect(c.provider)} disabled={!c.has_credentials}>
                      Connecter {SIPV_PROVIDER_LABELS[c.provider]}
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
                        {SIPV_TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
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

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{cycles.length} cycle{cycles.length !== 1 ? 's' : ''} de rotation</span>
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

          <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn-primary" onClick={runNow} disabled={runningNow}>{runningNow ? '...' : 'Backup maintenant'}</button>
            {runMsg && <span style={{ fontSize: 13, color: '#6B7280' }}>{runMsg}</span>}
          </div>

          {logs.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Historique récent</div>
              <table className="adm-table">
                <thead><tr><th>Date</th><th>Fournisseur</th><th>Fichier</th><th>Résultat</th></tr></thead>
                <tbody>
                  {logs.map(l => (
                    <tr key={l.id}>
                      <td style={{ fontSize: 12, color: '#9CA3AF' }}>{fmtLogDate(l.started_at)}{l.triggered_manually ? ' (manuel)' : ''}</td>
                      <td>{SIPV_PROVIDER_LABELS[l.provider] || l.provider}</td>
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
        </>
      )}

      {showCycleModal && (
        <SipvCycleModal cycle={editingCycle} onClose={() => setShowCycleModal(false)}
          onSaved={c => {
            setCycles(p => editingCycle ? p.map(x => x.id === c.id ? c : x) : [...p, c])
            setShowCycleModal(false)
          }} />
      )}
    </div>
  )
}

function SipvCredentialsForm({ provider, initialClientId, onSaved }) {
  const [clientId, setClientId] = useState(initialClientId || '')
  const [clientSecret, setClientSecret] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    if (!clientId.trim() || !clientSecret.trim()) return
    setSaving(true)
    try {
      await api.put(`/v1/server/backup/connections/${provider}/credentials`, { client_id: clientId.trim(), client_secret: clientSecret.trim() })
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

function SipvCycleModal({ cycle, onClose, onSaved }) {
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
        r = await api.put(`/v1/server/backup/cycles/${cycle.id}`, form)
      } else {
        r = await api.post('/v1/server/backup/cycles', { ...form, enabled: true })
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
            {Object.entries(SIPV_FREQUENCY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {form.frequency_type === 'weekly' && (
          <div className="form-group">
            <label>Jour de la semaine</label>
            <select value={form.day_of_week} onChange={e => f('day_of_week', parseInt(e.target.value))}>
              {SIPV_WEEKDAY_LABELS.map((label, i) => <option key={i} value={i}>{label}</option>)}
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

// TASK-S054 : le fournisseur SIP exige 2 IP publiques distinctes pour les canaux
// (entrant / sortant). Champs de référence/config seulement — l'IP réelle vient
// du fournisseur, rien n'est appliqué automatiquement au réseau du serveur ici.
function SipChannelIpsSection({ server, onSave }) {
  const [inboundIp, setInboundIp] = useState(server.sip_inbound_ip || '')
  const [outboundIp, setOutboundIp] = useState(server.sip_outbound_ip || '')
  const [saving, setSaving] = useState(false)
  useEffect(() => { setInboundIp(server.sip_inbound_ip || ''); setOutboundIp(server.sip_outbound_ip || '') }, [server.id])

  async function save(field, value) {
    setSaving(true)
    try { await onSave(server.id, field, value.trim()) } finally { setSaving(false) }
  }

  return (
    <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: 12, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Canaux SIP (fournisseur)</div>
      <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
        Certains fournisseurs SIP exigent 2 IP publiques distinctes — une pour les appels entrants,
        une pour les sortants. À confirmer avec le fournisseur avant de les remplir ; ces champs sont
        seulement de la configuration/référence pour l'instant, pas encore appliqués automatiquement
        au réseau du serveur.
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div className="form-group" style={{ width: 200 }}>
          <label>IP entrante</label>
          <input value={inboundIp} placeholder="ex: 173.242.190.10" onChange={e => setInboundIp(e.target.value)}
            onBlur={() => save('sip_inbound_ip', inboundIp)}
            style={{ borderColor: saving ? '#3B82F6' : undefined }} />
        </div>
        <div className="form-group" style={{ width: 200 }}>
          <label>IP sortante</label>
          <input value={outboundIp} placeholder="ex: 173.242.190.11" onChange={e => setOutboundIp(e.target.value)}
            onBlur={() => save('sip_outbound_ip', outboundIp)}
            style={{ borderColor: saving ? '#3B82F6' : undefined }} />
        </div>
      </div>
    </div>
  )
}

// TASK-S033 : bibliothèque MOH globale -- fichiers uploadés ici sans compagnie
// assignée sont "Global" (visibles comme option dans TOUTES les compagnies) ;
// assignés à une compagnie = dédiés à celle-ci seulement. La sélection
// (plusieurs fichiers, ordonnée) se fait dans CompanyDetail.jsx.
function MohLibrarySection({ companies }) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadOk, setUploadOk] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [form, setForm] = useState({ name: '', tenantId: '', file: null })
  const [fileInputKey, setFileInputKey] = useState(0)

  function loadFiles() {
    setLoading(true)
    api.get('/v1/server/moh').then(r => setFiles(r.data)).finally(() => setLoading(false))
  }
  useEffect(() => { loadFiles() }, [])

  function companyName(tenantId) {
    if (!tenantId) return null
    const c = companies.find(c => c.sipv_tenant_id === tenantId)
    return c ? c.name : tenantId
  }

  async function upload() {
    if (!form.name.trim() || !form.file) return
    setUploading(true)
    setUploadOk(false)
    setUploadError('')
    try {
      const fd = new FormData()
      fd.append('name', form.name.trim())
      fd.append('file', form.file)
      if (form.tenantId) fd.append('tenant_id', form.tenantId)
      await api.post('/v1/server/moh', fd)
      setForm({ name: '', tenantId: '', file: null })
      setFileInputKey(k => k + 1)
      setUploadOk(true)
      setTimeout(() => setUploadOk(false), 4000)
      loadFiles()
    } catch (e) {
      setUploadError(e.response?.data?.detail || "Échec de l'envoi")
    } finally {
      setUploading(false)
    }
  }

  async function toggleActive(f) {
    const r = await api.put(`/v1/server/moh/${f.id}`, { is_active: !f.is_active })
    setFiles(prev => prev.map(x => x.id === f.id ? r.data : x))
  }

  async function rename(f, name) {
    if (!name.trim() || name === f.name) return
    const r = await api.put(`/v1/server/moh/${f.id}`, { name: name.trim() })
    setFiles(prev => prev.map(x => x.id === f.id ? r.data : x))
  }

  async function reassign(f, tenantId) {
    const payload = tenantId ? { tenant_id: tenantId } : { clear_tenant: true }
    const r = await api.put(`/v1/server/moh/${f.id}`, payload)
    setFiles(prev => prev.map(x => x.id === f.id ? r.data : x))
  }

  async function removeFile(f) {
    if (!confirm(`Supprimer "${f.name}" ? (retiré de toutes les sélections de compagnie)`)) return
    await api.delete(`/v1/server/moh/${f.id}`)
    loadFiles()
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

  return (
    <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
        Musique d'attente (MOH) — bibliothèque
      </div>
      <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
        Un fichier sans compagnie assignée est "Global" — il apparaît comme option dans TOUTES les compagnies.
        Assigné à une compagnie = dédié seulement à celle-ci. Chaque compagnie choisit ensuite un ou plusieurs
        fichiers dans sa fiche (onglet Informations).
      </div>

      {loading ? <div style={{ fontSize: 13, color: '#6B7280' }}>Chargement...</div> : files.length === 0 ? (
        <div className="empty-tab">Aucun fichier MOH.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {files.map(f => (
            <div key={f.id} style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <input defaultValue={f.name} key={f.id + f.name} style={{ fontWeight: 600, fontSize: 13, border: '1px solid transparent', background: 'transparent', width: 200 }}
                onBlur={e => rename(f, e.target.value)} />
              <span style={{ fontSize: 12, color: '#9CA3AF' }}>{f.duration_seconds ? `${f.duration_seconds}s` : ''}</span>
              <select value={f.tenant_id || ''} onChange={e => reassign(f, e.target.value)} style={{ fontSize: 12 }}>
                <option value="">Global (toutes les compagnies)</option>
                {companies.map(c => <option key={c.id} value={c.sipv_tenant_id}>{c.name}</option>)}
              </select>
              {!f.tenant_id && <span style={{ background: '#DBEAFE', color: '#1D4ED8', fontSize: 11, fontWeight: 700, borderRadius: 10, padding: '2px 8px' }}>Global</span>}
              <audio controls src={`/api/v1/server/moh/${f.id}/file?token=${encodeURIComponent(getToken())}`} style={{ height: 28, maxWidth: 200, marginLeft: 'auto' }} />
              <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => downloadFile(f)}>Télécharger</button>
              <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => toggleActive(f)}>
                {f.is_active ? 'Désactiver' : 'Activer'}
              </button>
              <button className="inv-del-btn" onClick={() => removeFile(f)}>✕</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: 12 }}>
        <div className="form-group" style={{ width: 200, marginBottom: 0 }}>
          <label>Nom</label>
          <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="ex: Musique classique" />
        </div>
        <div className="form-group" style={{ width: 200, marginBottom: 0 }}>
          <label>Compagnie</label>
          <select value={form.tenantId} onChange={e => setForm(p => ({ ...p, tenantId: e.target.value }))}>
            <option value="">Global (toutes les compagnies)</option>
            {companies.map(c => <option key={c.id} value={c.sipv_tenant_id}>{c.name}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Fichier audio</label>
          <input key={fileInputKey} type="file" accept="audio/*" onChange={e => setForm(p => ({ ...p, file: e.target.files?.[0] || null }))} />
        </div>
        <button className="btn-primary" style={{ fontSize: 12, padding: '7px 14px' }} disabled={uploading || !form.name.trim() || !form.file} onClick={upload}>
          {uploading ? 'Envoi...' : '+ Téléverser'}
        </button>
        {uploadOk && <span style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>✓ Téléversé</span>}
        {uploadError && <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 600 }}>{uploadError}</span>}
      </div>
    </div>
  )
}

function GlobalTemplatesSection({ server }) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', description: '' })
  const [expanded, setExpanded] = useState(null)

  function loadTemplates() {
    setLoading(true)
    api.get(`/v1/server/servers/${server.id}/global-templates`).then(r => setTemplates(r.data)).finally(() => setLoading(false))
  }
  useEffect(() => { loadTemplates() }, [server.id])

  function openNew() { setForm({ name: '', description: '' }); setShowNew(true) }
  function openEdit(t) { setForm({ name: t.name, description: t.description || '' }); setEditing(t) }
  function closeForm() { setShowNew(false); setEditing(null) }

  async function createTemplate() {
    if (!form.name.trim()) return
    await api.post(`/v1/server/servers/${server.id}/global-templates`, form)
    closeForm()
    loadTemplates()
  }
  async function saveEdit() {
    if (!form.name.trim()) return
    await api.put(`/v1/server/global-templates/${editing.id}`, form)
    closeForm()
    loadTemplates()
  }
  async function removeTemplate(id) {
    if (!confirm('Supprimer ce template ?')) return
    await api.delete(`/v1/server/global-templates/${id}`)
    loadTemplates()
  }
  async function toggleDefault(t) {
    await api.put(`/v1/server/global-templates/${t.id}`, { is_default: !t.is_default })
    loadTemplates()
  }
  async function saveOptions(t, options) {
    await api.put(`/v1/server/global-templates/${t.id}`, { options })
    loadTemplates()
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Global Templates ({templates.length})
        </div>
        <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={openNew}>+ Nouveau template</button>
      </div>
      <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
        Partagé par toutes les compagnies hébergées sur ce serveur — le niveau le plus général de la chaîne (avant les options par compagnie). "Défaut" s'applique automatiquement à tous, sans choix requis.
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
            <h3 className="modal-title">{editing ? 'Modifier le template' : 'Nouveau Global Template'}</h3>
            <div className="form-group"><label>Nom *</label><input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} autoFocus /></div>
            <div className="form-group"><label>Description</label><input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={closeForm}>Annuler</button>
              <button className="btn-primary" onClick={editing ? saveEdit : createTemplate} disabled={!form.name.trim()}>{editing ? 'Enregistrer' : 'Créer'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// TASK-S044.1 : bibliotheque de "Template de tenant" -- meme forme que Global
// Templates mais JAMAIS automatique, choisi explicitement par compagnie
// (picker dans CompanyDetail.jsx, au-dessus de "Options téléphonie").
function TenantTemplatesSection({ server }) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', description: '' })
  const [expanded, setExpanded] = useState(null)

  function loadTemplates() {
    setLoading(true)
    api.get(`/v1/server/servers/${server.id}/tenant-templates`).then(r => setTemplates(r.data)).finally(() => setLoading(false))
  }
  useEffect(() => { loadTemplates() }, [server.id])

  function openNew() { setForm({ name: '', description: '' }); setShowNew(true) }
  function openEdit(t) { setForm({ name: t.name, description: t.description || '' }); setEditing(t) }
  function closeForm() { setShowNew(false); setEditing(null) }

  async function createTemplate() {
    if (!form.name.trim()) return
    await api.post(`/v1/server/servers/${server.id}/tenant-templates`, form)
    closeForm()
    loadTemplates()
  }
  async function saveEdit() {
    if (!form.name.trim()) return
    await api.put(`/v1/server/tenant-templates/${editing.id}`, form)
    closeForm()
    loadTemplates()
  }
  async function removeTemplate(id) {
    if (!confirm('Supprimer ce template ?')) return
    await api.delete(`/v1/server/tenant-templates/${id}`)
    loadTemplates()
  }
  async function saveOptions(t, options) {
    await api.put(`/v1/server/tenant-templates/${t.id}`, { options })
    loadTemplates()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Templates de tenant ({templates.length})
        </div>
        <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={openNew}>+ Nouveau template</button>
      </div>
      <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
        Bibliothèque de gabarits (ex. "Français", "Anglais") — chaque compagnie choisit celui qu'elle utilise pour ses "Options téléphonie" ; jamais appliqué automatiquement.
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
                <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px', marginLeft: 'auto' }} onClick={() => openEdit(t)}>✎ Modifier</button>
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
            <h3 className="modal-title">{editing ? 'Modifier le template' : 'Nouveau template de tenant'}</h3>
            <div className="form-group"><label>Nom *</label><input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} autoFocus /></div>
            <div className="form-group"><label>Description</label><input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={closeForm}>Annuler</button>
              <button className="btn-primary" onClick={editing ? saveEdit : createTemplate} disabled={!form.name.trim()}>{editing ? 'Enregistrer' : 'Créer'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
