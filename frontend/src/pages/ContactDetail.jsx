import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import NewTicketModal from '../components/NewTicketModal'
import NewInvoiceModal from '../components/NewInvoiceModal'
import NewTaskModal from '../components/NewTaskModal'
import JournalFeed from '../components/JournalFeed'
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
            style={{ '--sc': s.color }}
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
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  async function save() {
    if (!form.first_name.trim()) { setError('Le prénom est requis.'); return }
    setSaving(true)
    try {
      const r = await api.post('/v1/contacts', form)
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
      </div>
      <div className="new-form-actions">
        <button className="btn-secondary" onClick={() => navigate('/contacts')}>Annuler</button>
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Création...' : 'Créer le contact'}</button>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ContactDetail({ isNew }) {
  const { id } = useParams()
  const navigate = useNavigate()
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

  useEffect(() => {
    api.get('/v1/ref/statuses').then(r => setStatuses(r.data))
    if (!isNew) load()
  }, [id, isNew])

  async function load() {
    setLoading(true)
    const r = await api.get(`/v1/contacts/${id}`)
    setContact(r.data)
    setLoading(false)
    if (r.data.sipv_sync) loadSipExtension()
  }

  async function loadSipExtension() {
    setSipExtLoading(true)
    try {
      const r = await api.get(`/v1/contacts/${id}/sip-extension`)
      setSipExt(r.data)
    } finally {
      setSipExtLoading(false)
    }
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

  async function saveField(field, value) {
    await api.put(`/v1/contacts/${id}`, { [field]: value })
    setContact(prev => ({ ...prev, [field]: value }))
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

  if (loading) return <div className="detail-loading">Chargement...</div>

  const c = contact

  return (
    <div className="detail-page">
      <div className="detail-header">
        <div className="detail-breadcrumb">
          <button className="back-btn" onClick={() => navigate('/contacts')}>← Contacts</button>
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
                  await api.put(`/v1/contacts/${id}`, { sipv_sync: val })
                  setContact(prev => ({ ...prev, sipv_sync: val }))
                  if (val) loadSipExtension()
                  else setSipExt(null)
                }}
                style={{ width: 16, height: 16, accentColor: '#184FA0', cursor: 'pointer' }}
              />
              <label htmlFor="sipv_sync" style={{ fontSize: 13, color: '#374151', cursor: 'pointer', userSelect: 'none' }}>
                Synchroniser avec SIPV
              </label>
              {c.sipv_sync && (
                <span style={{ fontSize: 11, background: '#EFF6FF', color: '#1D4ED8', borderRadius: 4, padding: '2px 8px', fontWeight: 600 }}>
                  SIP actif
                </span>
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
                      <div className="ifield"><div className="ifield-label">Poste</div><div className="ifield-value">{sipExt.extension}</div></div>
                      <div className="ifield"><div className="ifield-label">Nom SIP</div><div className="ifield-value">{sipExt.name}</div></div>
                      <div className="ifield"><div className="ifield-label">Username SIP</div><div className="ifield-value"><code>{sipExt.username}</code></div></div>
                      <div className="ifield"><div className="ifield-label">Actif</div><div className="ifield-value">{sipExt.is_active ? 'Oui' : 'Non'}</div></div>
                      <div className="ifield"><div className="ifield-label">Messagerie vocale</div><div className="ifield-value">{sipExt.voicemail_enabled ? 'Activée' : 'Désactivée'}</div></div>
                      <div className="ifield"><div className="ifield-label">Synchronisé FreeSWITCH</div><div className="ifield-value">{sipExt.freeswitch_synced ? 'Oui' : 'En attente'}</div></div>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <button className="btn-secondary" onClick={toggleConnInfo} disabled={connInfoLoading} style={{ fontSize: 11, padding: '3px 8px' }}>
                        {connInfoLoading ? 'Chargement...' : connInfo ? 'Masquer les infos de connexion' : 'Afficher les infos de connexion'}
                      </button>
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
                          style={{ width: 16, height: 16, accentColor: '#184FA0', cursor: 'pointer' }}
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
                            style={{ width: 16, height: 16, accentColor: '#184FA0', cursor: 'pointer' }}
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
                          style={{ width: 16, height: 16, accentColor: '#184FA0', cursor: 'pointer' }}
                        />
                        <label htmlFor="record_calls" style={{ fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                          Manuel (déclenché par l'agent — pas encore actif, en attente de configuration du bouton sur le téléphone)
                        </label>
                      </div>
                    </div>

                    <div style={{ marginTop: 16, borderTop: '1px solid #E5E7EB', paddingTop: 10 }}>
                      <div style={{ fontSize: 13, color: '#374151', fontWeight: 600, marginBottom: 6 }}>Renvois</div>
                      {[
                        { key: 'forward_immediate', label: 'Renvoi immédiat' },
                        { key: 'forward_busy', label: 'Renvoi si occupé' },
                        { key: 'forward_no_answer', label: 'Renvoi si non répondu' },
                        { key: 'forward_offline', label: 'Renvoi si hors ligne' },
                      ].map(({ key, label }) => (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                          <input
                            type="checkbox"
                            id={key}
                            checked={sipExt[`${key}_enabled`] || false}
                            onChange={e => saveSipExtField(`${key}_enabled`, e.target.checked)}
                            style={{ width: 16, height: 16, accentColor: '#184FA0', cursor: 'pointer' }}
                          />
                          <label htmlFor={key} style={{ fontSize: 13, color: '#374151', cursor: 'pointer', minWidth: 160 }}>{label}</label>
                          {sipExt[`${key}_enabled`] && (
                            <input
                              type="text"
                              placeholder="Destination (ex: poste ou numéro)"
                              defaultValue={sipExt[`${key}_destination`] || ''}
                              onBlur={e => saveSipExtField(`${key}_destination`, e.target.value)}
                              style={{ fontSize: 12, padding: '3px 6px', width: 160 }}
                            />
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
                    </div>

                    <div style={{ marginTop: 16, borderTop: '1px solid #E5E7EB', paddingTop: 10 }}>
                      <div style={{ fontSize: 13, color: '#374151', fontWeight: 600, marginBottom: 6 }}>Caller ID</div>
                      <div className="ifields-grid">
                        <InlineField label="Nom (interne)" value={sipExt.caller_id_internal_name} onSave={v => saveSipExtField('caller_id_internal_name', v)} />
                        <InlineField label="Numéro (interne)" value={sipExt.caller_id_internal_number} onSave={v => saveSipExtField('caller_id_internal_number', v)} />
                        <InlineField label="Nom (externe)" value={sipExt.caller_id_external_name} onSave={v => saveSipExtField('caller_id_external_name', v)} />
                        <InlineField label="Numéro (externe)" value={sipExt.caller_id_external_number} onSave={v => saveSipExtField('caller_id_external_number', v)} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                        <input
                          type="checkbox"
                          id="hide_caller_id"
                          checked={sipExt.hide_caller_id || false}
                          onChange={e => saveSipExtField('hide_caller_id', e.target.checked)}
                          style={{ width: 16, height: 16, accentColor: '#184FA0', cursor: 'pointer' }}
                        />
                        <label htmlFor="hide_caller_id" style={{ fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                          Masquer le Caller ID (appels externes seulement)
                        </label>
                      </div>
                    </div>

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
                            style={{ width: 16, height: 16, accentColor: '#184FA0', cursor: 'pointer' }}
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
            <input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} style={{ accentColor: '#184FA0' }} />
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
            <input type="checkbox" checked={t.completed} onChange={() => toggleComplete(t)} style={{ width: 14, height: 14, accentColor: '#184FA0', marginTop: 2, cursor: 'pointer', flexShrink: 0 }} />
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
