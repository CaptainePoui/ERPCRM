import { useState, useEffect, useRef } from 'react'
import api, { getToken } from '../services/api'
import PhoneOptionsEditor from '../components/PhoneOptionsEditor'

export default function Server() {
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
      <p style={{ color: '#6B7280', fontSize: 14, marginTop: 8, marginBottom: 24 }}>
        Configuration globale du serveur SIPV (canaux de lignes, Fail2Ban, etc.) — à venir.
      </p>
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
