import { useState, useEffect, useRef, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import RebootButton from '../../components/RebootButton'
import api, { getToken } from '../../services/api'
import Autocomplete from '../../components/Autocomplete'
import QuickNewContact from '../../components/QuickNewContact'
import ParkingLotsSection from './ParkingLotsSection'
import CdrReportsSection from '../../components/CdrReportsSection'
import ProvisioningTemplates from '../../components/ProvisioningTemplates'

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

function TelephonyTab({ companyId, companyName, sipvEnabled, initialSubTab }) {
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
  const [parkingLots, setParkingLots] = useState([])
  const [parkingLotsLoading, setParkingLotsLoading] = useState(true)
  const [phoneOptions, setPhoneOptions] = useState({})
  const [phoneModels, setPhoneModels] = useState([])
  const [e911Addresses, setE911Addresses] = useState([])
  const [e911AddressesLoading, setE911AddressesLoading] = useState(true)
  const [schedules, setSchedules] = useState([])
  const [showNewSchedule, setShowNewSchedule] = useState(false)
  const [prompts, setPrompts] = useState([])
  const [subTab, setSubTab] = useState(initialSubTab || 'numeros')

  useEffect(() => {
    Promise.all([
      api.get(`/v1/telephony/company/${companyId}/dids`),
      api.get(`/v1/telephony/company/${companyId}/extensions`),
    ]).then(([d, e]) => { setDids(d.data); setExts(e.data) }).finally(() => setLoading(false))
    loadSipExtensions()
    loadRingGroups()
    loadIvrsAndQueues()
    loadPagingGroups()
    loadParkingLots()
    loadPhoneOptions()
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

  function loadPhoneOptions() {
    api.get(`/v1/companies/${companyId}/phone-options`).then(r => {
      setPhoneOptions(r.data.phone_option_defaults || {})
    })
  }

  async function savePhoneOptions(next) {
    setPhoneOptions(next)
    await api.put(`/v1/companies/${companyId}/phone-options`, { phone_option_defaults: next })
  }

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

  function loadParkingLots() {
    setParkingLotsLoading(true)
    api.get(`/v1/companies/${companyId}/parking-lots`)
      .then(r => setParkingLots(r.data))
      .finally(() => setParkingLotsLoading(false))
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

  const TEL_SUB_TABS = [
    { key: 'numeros', label: 'Numéros' },
    { key: 'postes', label: 'Postes' },
    { key: 'acheminement', label: "Acheminement d'appels" },
    { key: 'horaires', label: 'Horaires & Audio' },
    { key: 'appareils', label: 'Provisionnement' },
    { key: 'urgence', label: 'Urgence & Sécurité' },
    { key: 'avance', label: 'Avancé' },
    { key: 'cdr', label: 'CDR' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--c-border)', marginBottom: 4 }}>
        {TEL_SUB_TABS.map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            style={{
              padding: '8px 14px', fontSize: 13, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer',
              color: subTab === t.key ? 'var(--brand)' : 'var(--c-muted)',
              borderBottom: subTab === t.key ? '2px solid var(--brand)' : '2px solid transparent',
              marginBottom: -1,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'numeros' && (<>
      {/* DIDs */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Numéros DID ({dids.length})</div>
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
                <tr style={{ background: 'var(--c-surface-2)' }}>
                  {['','Numéro','Note','Destination','Horaire','Adresse 911','Actif',''].map((h, i) => (
                    <th key={i} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--c-border)', fontSize: 12, fontWeight: 600, color: 'var(--c-muted)' }}>{h}</th>
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
                        borderBottom: i === n - 1 ? '1px solid var(--c-border)' : 'none',
                        opacity: draggingDidId === d.id ? 0.4 : 1,
                        background: dragOverGroupKey === head.id ? 'var(--c-tint-blue)' : undefined,
                      }}>
                      <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                        <span draggable title="Glisser sur un autre DID pour le grouper"
                          onDragStart={e => {
                            e.dataTransfer.effectAllowed = 'move'
                            e.dataTransfer.setData('text/plain', d.id)
                            setDraggingDidId(d.id)
                          }}
                          onDragEnd={() => { setDraggingDidId(null); setDragOverGroupKey(null) }}
                          style={{ cursor: 'grab', color: 'var(--c-faint)', fontSize: 14, userSelect: 'none' }}>⠿</span>
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
                        <td rowSpan={n} style={{ padding: '8px 12px', verticalAlign: 'middle', borderLeft: n > 1 ? '2px solid var(--c-tint-blue)' : undefined }}>
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
                                  <span style={{ fontSize: 10, color: 'var(--c-muted)' }}>puis</span>
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
                    style={{ background: dragOverGroupKey === '__leave__' ? 'var(--c-tint-red)' : 'var(--c-surface-2)' }}>
                    <td colSpan={8} style={{
                      padding: '8px 12px', textAlign: 'center', fontSize: 11,
                      color: dragOverGroupKey === '__leave__' ? '#DC2626' : 'var(--c-faint)',
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

      </>)}

      {subTab === 'horaires' && (<>
      {/* Langue des annonces vocales de la compagnie (messagerie, parcage...) -- réglage de compagnie, pas du téléphone
          (l'écran du téléphone prend la langue de son modèle de provisionnement), TASK-051 2026-10-14 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Langue des annonces vocales</div>
        <select value={phoneOptions.language || 'auto'} aria-label="Langue des annonces vocales"
          onChange={e => { const next = { ...phoneOptions }; if (e.target.value === 'auto') delete next.language; else next.language = e.target.value; savePhoneOptions(next) }}
          style={{ fontSize: 13, padding: '4px 8px' }}>
          <option value="auto">Par défaut du serveur (anglais)</option>
          <option value="fr">Français</option>
          <option value="en">Anglais</option>
        </select>
      </div>
      <SchedulesSection companyId={companyId} schedules={schedules} onRefresh={loadSchedules}
        mergedExtensions={mergedExtensions} ringGroups={ringGroups} ivrs={ivrs} queues={queues} />

      <MohSelectionSection companyId={companyId} sipvEnabled={sipvEnabled} sipExts={sipExts} />

      <PromptsSection companyId={companyId} prompts={prompts} sipExts={sipExts} onRefresh={loadPrompts} />

      </>)}

      {subTab === 'postes' && (<>
      {/* Extensions */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Extensions ({mergedExtensions.length})
            {sipExtsLoading && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--c-faint)', marginLeft: 8 }}>chargement statut SIP...</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={loadSipExtensions}>↻ Statut SIP</button>
            <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setShowNewExt(true)}>+ Ajouter</button>
          </div>
        </div>
        {mergedExtensions.length === 0 ? <div className="empty-tab">Aucune extension enregistrée.</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'var(--c-surface-2)' }}>
                {['','Ext.','Nom','DID associé','Messagerie','Renvoi/DND','IP publique','IP privée','Redémarrer','Actif',''].map((h, i) => (
                  <th key={i} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--c-border)', fontSize: 12, fontWeight: 600, color: 'var(--c-muted)' }}>{h}</th>
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
                    style={{ borderBottom: '1px solid var(--c-surface-3)', cursor: contactId ? 'pointer' : 'default' }}>
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
                        <span title="Pas de poste SIPV" style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: 'var(--c-border-strong)' }} />
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 700, fontFamily: 'monospace' }}>{e.extension}</td>
                    <td style={{ padding: '10px 12px' }}>{e.name}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--c-muted)', fontFamily: 'monospace', fontSize: 12 }}>{e.did_number || '—'}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--c-muted)', fontSize: 12 }}>{e.voicemail_email || '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: 11 }}>
                      {sip?.dnd_enabled && <span style={{ background: 'var(--c-tint-red)', color: 'var(--c-on-red)', borderRadius: 4, padding: '2px 6px', fontWeight: 600, marginRight: 4 }}>DND</span>}
                      {sip && ['forward_immediate_enabled', 'forward_busy_enabled', 'forward_no_answer_enabled', 'forward_offline_enabled'].some(k => sip[k]) && (
                        <span style={{ background: 'var(--c-tint-amber)', color: 'var(--c-on-amber)', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>Renvoi</span>
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
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      {sip && <RebootButton sipExtId={sip.id} extension={e.extension} registered={sip.registered} compact />}
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

      </>)}

      {subTab === 'appareils' && (<>
      <ProvisioningTemplates companyId={companyId} phoneModels={phoneModels} sipvEnabled={sipvEnabled} />

      </>)}

      {subTab === 'acheminement' && (<>
      <RingGroupsSection companyId={companyId} ringGroups={ringGroups} ringGroupsLoading={ringGroupsLoading}
        sipExts={sipExts} onRefresh={loadRingGroups} />

      </>)}

      {subTab === 'postes' && (<>
      <PickupGroupSection companyId={companyId} sipExts={sipExts} onRefresh={loadSipExtensions} />
      </>)}

      {subTab === 'acheminement' && (<>

      <PagingGroupsSection companyId={companyId} pagingGroups={pagingGroups} pagingGroupsLoading={pagingGroupsLoading}
        sipExts={sipExts} onRefresh={loadPagingGroups} />

      <ParkingLotsSection companyId={companyId} parkingLots={parkingLots} parkingLotsLoading={parkingLotsLoading}
        sipExts={sipExts} onRefresh={loadParkingLots} onGoToAudio={() => setSubTab('horaires')} />

      </>)}

      {subTab === 'urgence' && (<>
      <div style={{ marginTop: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
          Adresses E911
        </div>
        <div style={{ fontSize: 12, color: 'var(--c-muted)' }}>
          Gérées pour l'instant dans l'onglet "Informations" de la compagnie, pas encore déplacées ici.
        </div>
      </div>
      <div style={{ marginTop: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
          Fax
        </div>
        <div className="empty-tab">Pas encore construit côté SIPV (modèle `FaxLine`/`FaxJob` existe, aucun proxy/écran).</div>
      </div>
      <div style={{ marginTop: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
          SMS
        </div>
        <div className="empty-tab">Pas encore construit côté SIPV (modèle `SMSConfig`/`SMSMessage` existe, aucun proxy/écran).</div>
      </div>
      <div style={{ marginTop: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
          Sécurité (ACL, anti-fraude)
        </div>
        <div className="empty-tab">Pas encore construit côté SIPV (modèles `SecurityEvent`/`ACLRule`/`FraudRule`/`BlockedIP` existent, aucun proxy/écran).</div>
      </div>
      </>)}

      {subTab === 'avance' && (<>
      <TrunkSection companyId={companyId} />
      </>)}

      {subTab === 'cdr' && (<>
      <CdrSection companyId={companyId} />
      <CdrReportsSection companyId={companyId} />
      </>)}

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
// Détail complet d'un appel (TASK-032.2) -- champs pas déjà dans le tableau.
// Réutilisé tel quel dans CompanyDetail.jsx et ContactDetail.jsx.
function CdrDetailRow({ c, colSpan }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: '10px 16px', background: 'var(--c-surface-2)', fontSize: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
          <div><span style={{ color: 'var(--c-muted)' }}>Réponse : </span>{c.answer_time ? new Date(c.answer_time).toLocaleString('fr-CA') : '—'}</div>
          <div><span style={{ color: 'var(--c-muted)' }}>Fin : </span>{c.end_time ? new Date(c.end_time).toLocaleString('fr-CA') : '—'}</div>
          <div><span style={{ color: 'var(--c-muted)' }}>Durée totale : </span>{c.duration != null ? `${c.duration}s` : '—'}</div>
          <div><span style={{ color: 'var(--c-muted)' }}>Nom afficheur : </span>{c.clid || '—'}</div>
          <div><span style={{ color: 'var(--c-muted)' }}>Coût : </span>{c.cost != null ? `${c.cost} $` : '—'}</div>
          <div><span style={{ color: 'var(--c-muted)' }}>Taux/min : </span>{c.rate_per_minute != null ? `${c.rate_per_minute} $` : '—'}</div>
          <div><span style={{ color: 'var(--c-muted)' }}>Compte : </span>{c.accountcode || '—'}</div>
          <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--c-muted)' }}>ID appel : </span><code>{c.uniqueid || '—'}</code></div>
        </div>
      </td>
    </tr>
  )
}

export function CdrSection({ companyId }) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [extFilter, setExtFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [sipExts, setSipExts] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [retentionDays, setRetentionDays] = useState(null)
  const [retentionSaving, setRetentionSaving] = useState(false)
  const pageSize = 25

  // Filtres texte/date (TASK-032.5) -- appliqués seulement au clic sur
  // "Appliquer" (pas en direct à chaque frappe, demande explicite de Philippe).
  // pendingX = champs affichés, X = filtres réellement utilisés par la requête.
  const [pendingSearch, setPendingSearch] = useState('')
  const [pendingDateFrom, setPendingDateFrom] = useState('')
  const [pendingDateTo, setPendingDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  function applyFilters() {
    setSearch(pendingSearch)
    setDateFrom(pendingDateFrom)
    setDateTo(pendingDateTo)
    setPage(1)
  }
  function resetFilters() {
    setPendingSearch(''); setPendingDateFrom(''); setPendingDateTo('')
    setSearch(''); setDateFrom(''); setDateTo('')
    setPage(1)
  }

  useEffect(() => { load() }, [companyId, page, extFilter, search, dateFrom, dateTo])
  // Onglet CDR séparé (plus dans l'onglet Téléphonie) -- charge ses propres
  // postes pour le filtre au lieu de dépendre de l'état de TelephonyTab.
  useEffect(() => { api.get(`/v1/companies/${companyId}/sip-extensions`).then(r => setSipExts(r.data)) }, [companyId])
  useEffect(() => { api.get(`/v1/telephony/company/${companyId}/cdr-retention`).then(r => setRetentionDays(r.data.retention_days)) }, [companyId])

  async function saveRetention() {
    setRetentionSaving(true)
    try {
      const r = await api.put(`/v1/telephony/company/${companyId}/cdr-retention`, { retention_days: retentionDays })
      setRetentionDays(r.data.retention_days)
    } finally { setRetentionSaving(false) }
  }

  function load() {
    setLoading(true)
    api.get(`/v1/telephony/company/${companyId}/cdr`, {
      params: {
        page, page_size: pageSize, extension: extFilter || undefined,
        search: search || undefined,
        date_from: dateFrom ? new Date(dateFrom).toISOString() : undefined,
        date_to: dateTo ? new Date(dateTo).toISOString() : undefined,
      },
    })
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
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Historique d'appels ({total})
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {retentionDays !== null && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--c-muted)' }}>
              Conserver
              <input type="number" min="1" value={retentionDays} onChange={e => setRetentionDays(parseInt(e.target.value, 10) || 1)}
                style={{ width: 60, fontSize: 12, padding: '3px 6px' }} />
              jours
              <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={saveRetention} disabled={retentionSaving}>
                {retentionSaving ? '...' : 'Enregistrer'}
              </button>
            </div>
          )}
          <select value={extFilter} onChange={e => { setPage(1); setExtFilter(e.target.value) }} style={{ fontSize: 12, padding: '4px 8px' }}>
            <option value="">Tous les postes</option>
            {sipExts.map(e => <option key={e.id} value={e.extension}>{e.extension} — {e.name}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14, padding: '10px 12px', background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', borderRadius: 8 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: 11 }}>Recherche (numéro)</label>
          <input value={pendingSearch} onChange={e => setPendingSearch(e.target.value)} placeholder="ex: 514" style={{ fontSize: 12, padding: '4px 8px', width: 130 }}
            onKeyDown={e => e.key === 'Enter' && applyFilters()} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: 11 }}>Du</label>
          <input type="datetime-local" value={pendingDateFrom} onChange={e => setPendingDateFrom(e.target.value)} style={{ fontSize: 12, padding: '4px 8px' }} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: 11 }}>Au</label>
          <input type="datetime-local" value={pendingDateTo} onChange={e => setPendingDateTo(e.target.value)} style={{ fontSize: 12, padding: '4px 8px' }} />
        </div>
        <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px', alignSelf: 'flex-end' }} onClick={applyFilters}>Appliquer</button>
        {(search || dateFrom || dateTo) && (
          <button className="btn-secondary" style={{ fontSize: 12, padding: '5px 12px', alignSelf: 'flex-end' }} onClick={resetFilters}>Réinitialiser</button>
        )}
      </div>
      {!loading && items.length === 0 ? (
        <div className="empty-tab">Aucun appel enregistré.</div>
      ) : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'var(--c-surface-2)' }}>
                {['Date', 'De', 'Vers', 'Direction', 'Durée', 'Statut'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--c-border)', fontSize: 12, fontWeight: 600, color: 'var(--c-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(c => (
                <Fragment key={c.id}>
                  <tr style={{ borderBottom: '1px solid var(--c-surface-3)', cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}>
                    <td style={{ padding: '8px 12px' }}>{c.start_time ? new Date(c.start_time).toLocaleString('fr-CA') : ''}</td>
                    <td style={{ padding: '8px 12px' }}>{c.src || ''}</td>
                    <td style={{ padding: '8px 12px' }}>{c.dst || ''}</td>
                    <td style={{ padding: '8px 12px' }}>{c.direction === 'inbound' ? 'Entrant' : c.direction === 'outbound' ? 'Sortant' : (c.direction || '')}</td>
                    <td style={{ padding: '8px 12px' }}>{fmtDuration(c.billsec)}</td>
                    <td style={{ padding: '8px 12px' }}>{c.disposition || ''}</td>
                  </tr>
                  {expandedId === c.id && <CdrDetailRow c={c} colSpan={6} />}
                </Fragment>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 10, alignItems: 'center' }}>
            <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Précédent</button>
            <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>Page {page} / {totalPages}</span>
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
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Trunks ({trunks.length})
        </div>
        <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setShowNew(v => !v)}>+ Ajouter</button>
      </div>
      {showNew && (
        <div style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', borderRadius: 8, padding: 12, marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
          <div className="form-group"><label>Nom</label><input value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} autoFocus /></div>
          <div className="form-group"><label>Carrier</label><input value={newForm.carrier_name} onChange={e => setNewForm(f => ({ ...f, carrier_name: e.target.value }))} /></div>
          <div className="form-group"><label>Host</label><input value={newForm.host} onChange={e => setNewForm(f => ({ ...f, host: e.target.value }))} placeholder="ex: vgw1.provider.com" /></div>
          <div className="form-group"><label>Username</label><input value={newForm.username} onChange={e => setNewForm(f => ({ ...f, username: e.target.value }))} /></div>
          <div className="form-group"><label>Password</label><input type="password" value={newForm.password} onChange={e => setNewForm(f => ({ ...f, password: e.target.value }))} /></div>
          <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={createTrunk}>Créer</button>
        </div>
      )}
      {loading ? <div style={{ fontSize: 13, color: 'var(--c-muted)' }}>Chargement...</div> : trunks.length === 0 ? (
        <div className="empty-tab">Aucun trunk configuré.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: 'var(--c-surface-2)' }}>
              {['Nom', 'Carrier', 'Host', 'Synchronisé', 'Actif', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--c-border)', fontSize: 12, fontWeight: 600, color: 'var(--c-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trunks.map(t => (
              <Fragment key={t.id}>
                <tr style={{ borderBottom: '1px solid var(--c-surface-3)', cursor: 'pointer' }} onClick={() => toggleExpand(t.id)}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{t.name}</td>
                  <td style={{ padding: '10px 12px' }}>{t.carrier_name}</td>
                  <td style={{ padding: '10px 12px' }}>{t.host}</td>
                  <td style={{ padding: '10px 12px' }}>
                    {t.freeswitch_synced ? (
                      <span style={{ fontSize: 11, color: 'var(--c-on-green)' }}>✓ synchronisé</span>
                    ) : (
                      <span title="Modifié dans SIPV mais pas encore redéployé sur le gateway FreeSWITCH réel (fichier serveur, manuel)" style={{ fontSize: 11, color: 'var(--c-on-amber)' }}>⚠ non synchronisé</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <input type="checkbox" checked={t.is_active} onClick={e => e.stopPropagation()} onChange={e => updateTrunk(t.id, { is_active: e.target.checked })} />
                  </td>
                  <td style={{ padding: '10px 12px' }}><button className="inv-del-btn" onClick={e => { e.stopPropagation(); removeTrunk(t.id) }}>✕</button></td>
                </tr>
                {expanded === t.id && (
                  <tr>
                    <td colSpan={6} style={{ padding: '10px 20px', background: 'var(--c-surface-2)' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)', marginBottom: 6 }}>Statut live (gateway FreeSWITCH)</div>
                      {!status[t.id] ? (
                        <div style={{ fontSize: 12, color: 'var(--c-muted)', marginBottom: 14 }}>Chargement...</div>
                      ) : !status[t.id].configured ? (
                        <div style={{ fontSize: 12, color: 'var(--c-on-amber)', marginBottom: 14 }}>Gateway pas encore déployé sur FreeSWITCH ({status[t.id].error})</div>
                      ) : (
                        <div style={{ fontSize: 12, marginBottom: 14 }}>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                            background: status[t.id].status === 'UP' ? '#DCFCE7' : 'var(--c-tint-red)',
                            color: status[t.id].status === 'UP' ? 'var(--c-on-green)' : 'var(--c-on-red)',
                          }}>{status[t.id].status || '?'}</span>
                          <span style={{ marginLeft: 8, color: 'var(--c-muted)' }}>État : {status[t.id].state || '?'} — {status[t.id].gateway_name}</span>
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
                          <label>Password {t.has_password && <span style={{ color: 'var(--c-muted)', fontWeight: 400 }}>(déjà défini)</span>}</label>
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

                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)', marginBottom: 6 }}>Routes sortantes utilisant ce trunk</div>
                      {!routes[t.id] ? (
                        <div style={{ fontSize: 12, color: 'var(--c-muted)' }}>Chargement...</div>
                      ) : routes[t.id].length === 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--c-muted)' }}>Aucune route n'utilise ce trunk.</div>
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
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', borderRadius: 6, padding: '6px 8px' }}>
      <div style={{ display: 'flex', gap: 2 }}>
        {PLAGE_DAYS.map(d => {
          const on = rule.days_of_week.includes(d.v)
          return (
            <button key={d.v} type="button"
              onClick={() => onPatch({ days_of_week: on ? rule.days_of_week.filter(x => x !== d.v) : [...rule.days_of_week, d.v].sort() })}
              style={{
                fontSize: 10, padding: '2px 5px', borderRadius: 4, border: '1px solid ' + (on ? 'var(--brand)' : 'var(--c-border-strong)'),
                background: on ? 'var(--brand)' : 'var(--c-surface)', color: on ? '#fff' : 'var(--c-muted)', cursor: 'pointer',
              }}>{d.l}</button>
          )
        })}
      </div>
      <input type="time" value={rule.open_time} onChange={e => onPatch({ open_time: e.target.value })} style={{ fontSize: 12, padding: '3px 4px', width: 90 }} />
      <span style={{ fontSize: 11, color: 'var(--c-faint)' }}>à</span>
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
    <div style={{ border: '1px solid var(--c-border)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
        Musique d'attente (MOH) {saving && <span style={{ fontSize: 11, fontWeight: 400, color: '#3B82F6' }}> enregistrement...</span>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--c-muted)', marginBottom: 10 }}>
        Fichiers disponibles pour cette compagnie (globaux + dédiés). Cocher pour sélectionner — plusieurs possibles, jouées dans l'ordre ci-dessous. La bibliothèque globale se gère dans "Serveur".
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12, fontSize: 12 }}>
        <span style={{ fontWeight: 600, color: 'var(--c-text-2)' }}>Ordre de lecture :</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input type="radio" checked={!shuffle} onChange={() => setShuffleMode(false)} /> Liste (ordre choisi)
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input type="radio" checked={shuffle} onChange={() => setShuffleMode(true)} /> Aléatoire
        </label>
        {shuffleSaving && <span style={{ color: '#3B82F6' }}>enregistrement...</span>}
      </div>
      {loading ? <div style={{ fontSize: 13, color: 'var(--c-muted)' }}>Chargement...</div> : available.length === 0 ? (
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
                background: isSelected ? 'var(--c-tint-blue)' : 'var(--c-surface-2)', border: '1px solid var(--c-border)', borderRadius: 6, padding: '6px 10px',
              }}>
                <input type="checkbox" checked={isSelected} onChange={() => toggle(f)} />
                <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                <span>{!f.tenant_id && <span style={{ background: 'var(--c-tint-blue)', color: 'var(--c-on-blue)', fontSize: 11, fontWeight: 700, borderRadius: 10, padding: '2px 8px' }}>Global</span>}</span>
                <span style={{ fontSize: 12, color: 'var(--c-faint)' }}>{f.duration_seconds ? `${f.duration_seconds}s` : ''}</span>
                <audio controls src={`/api/v1/server/moh/${f.id}/file?token=${encodeURIComponent(getToken())}`} style={{ height: 26, width: '100%' }} />
                <button className="btn-secondary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => { setCallFor(callFor === f.id ? null : f.id); setCallExtId('') }}>
                  📞 Écouter par poste
                </button>
                <button className="btn-secondary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => downloadFile(f)}>Télécharger</button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {isSelected && (<>
                    <span style={{ fontSize: 11, color: 'var(--c-muted)' }}>#{idx + 1}</span>
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
                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center', paddingTop: 6, marginTop: 4, borderTop: '1px solid var(--c-border)' }}>
                    <select value={callExtId} onChange={e => setCallExtId(e.target.value)} style={{ fontSize: 12 }}>
                      <option value="">Choisir un poste (actif et connecté)...</option>
                      {availableExts.map(e => <option key={e.id} value={e.id}>{e.extension} — {e.name}</option>)}
                    </select>
                    <button className="btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} disabled={!callExtId || calling} onClick={() => callToListen(f)}>
                      {calling ? 'Appel...' : 'Appeler'}
                    </button>
                    {availableExts.length === 0 && <span style={{ fontSize: 12, color: 'var(--c-faint)' }}>Aucun poste actif/connecté en ce moment.</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {callMsgOk && <div style={{ fontSize: 12, color: '#059669', fontWeight: 600, marginBottom: 8 }}>{callMsgOk}</div>}
      {callMsgError && <div style={{ fontSize: 12, color: '#DC2626', fontWeight: 600, marginBottom: 8 }}>{callMsgError}</div>}

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', borderRadius: 8, padding: 12 }}>
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
    <div style={{ border: '1px solid var(--c-border)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
        Phrases (annonces IVR)
      </div>
      <div style={{ fontSize: 12, color: 'var(--c-muted)', marginBottom: 10 }}>
        Utilisées comme destination "Message enregistré" sur un DID, ou greeting d'un IVR.
      </div>

      {prompts.length === 0 ? (
        <div className="empty-tab">Aucune phrase.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {prompts.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', borderRadius: 6, padding: '6px 10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</span>
              {p.duration_seconds && <span style={{ fontSize: 12, color: 'var(--c-faint)' }}>{p.duration_seconds}s</span>}
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
                <div style={{ width: '100%', display: 'flex', gap: 8, alignItems: 'center', paddingTop: 6, borderTop: '1px solid var(--c-border)' }}>
                  <select value={callExtId} onChange={e => setCallExtId(e.target.value)} style={{ fontSize: 12 }}>
                    <option value="">Choisir un poste (actif et connecté)...</option>
                    {availableExts.map(e => <option key={e.id} value={e.id}>{e.extension} — {e.name}</option>)}
                  </select>
                  <button className="btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} disabled={!callExtId || calling} onClick={() => callToListen(p)}>
                    {calling ? 'Appel...' : 'Appeler'}
                  </button>
                  {availableExts.length === 0 && <span style={{ fontSize: 12, color: 'var(--c-faint)' }}>Aucun poste actif/connecté en ce moment.</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {msgOk && <div style={{ fontSize: 12, color: '#059669', fontWeight: 600, marginBottom: 8 }}>{msgOk}</div>}
      {msgError && <div style={{ fontSize: 12, color: '#DC2626', fontWeight: 600, marginBottom: 8 }}>{msgError}</div>}

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12, background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', borderRadius: 8, padding: 12 }}>
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', borderRadius: 8, padding: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-text-2)' }}>Générer par voix (synthèse vocale)</div>
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
              <div style={{ fontSize: 11, color: 'var(--c-faint)', marginTop: 4 }}>Aucune voix pour ce filtre.</div>
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
        {voices.length === 0 && <div style={{ fontSize: 12, color: 'var(--c-faint)' }}>Aucune voix disponible (service Voicebox pas encore prêt, ou injoignable).</div>}
        {voices.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--c-faint)' }}>Une seule voix française disponible pour l'instant (Arianne, femme) — les autres voix françaises ou masculines nécessiteraient du clonage de voix (audio de référence), pas encore branché.</div>
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
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Horaires ({schedules.length})
        </div>
        <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setShowNew(true)}>+ Ajouter</button>
      </div>
      {schedules.length === 0 ? <div className="empty-tab">Aucun horaire configuré.</div> : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: 'var(--c-surface-2)' }}>
              {['Nom', 'Plages', 'Actif', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--c-border)', fontSize: 12, fontWeight: 600, color: 'var(--c-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {schedules.map(s => (
              <Fragment key={s.id}>
                <tr style={{ borderBottom: '1px solid var(--c-surface-3)', cursor: 'pointer' }} onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{s.name}</td>
                  <td style={{ padding: '10px 12px' }}>{s.rules.length}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <input type="checkbox" checked={s.is_active} onClick={e => e.stopPropagation()} onChange={e => updateSchedule(s.id, { is_active: e.target.checked })} />
                  </td>
                  <td style={{ padding: '10px 12px' }}><button className="inv-del-btn" onClick={e => { e.stopPropagation(); removeSchedule(s.id) }}>✕</button></td>
                </tr>
                {expanded === s.id && (
                  <tr>
                    <td colSpan={4} style={{ padding: '10px 20px', background: 'var(--c-surface-2)' }}>
                      <div className="form-group" style={{ maxWidth: 300 }}>
                        <label>Nom</label>
                        <input defaultValue={s.name} onBlur={e => e.target.value.trim() && updateSchedule(s.id, { name: e.target.value.trim() })} />
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)', margin: '10px 0 6px' }}>Plages horaires</div>
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
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Groupes d'appel ({ringGroups.length})
        </div>
        <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setShowNew(v => !v)}>+ Ajouter</button>
      </div>
      {showNew && (
        <div style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', borderRadius: 8, padding: 12, marginBottom: 10, display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
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
      {ringGroupsLoading ? <div style={{ fontSize: 13, color: 'var(--c-muted)' }}>Chargement...</div> : ringGroups.length === 0 ? (
        <div className="empty-tab">Aucun groupe d'appel.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: 'var(--c-surface-2)' }}>
              {['Nom', 'Ext.', 'Stratégie', 'Temps', 'Confirmer', 'Membres', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--c-border)', fontSize: 12, fontWeight: 600, color: 'var(--c-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ringGroups.map(rg => (
              <Fragment key={rg.id}>
                <tr key={rg.id} style={{ borderBottom: '1px solid var(--c-surface-3)', cursor: 'pointer' }} onClick={() => setExpanded(expanded === rg.id ? null : rg.id)}>
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
                    <td colSpan={7} style={{ padding: '10px 20px', background: 'var(--c-surface-2)' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)', marginBottom: 6 }}>Membres</div>
                      {rg.ring_members.map(m => (
                        <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ minWidth: 100, fontFamily: 'monospace' }}>{m.extension_username}</span>
                          <span style={{ fontSize: 11, color: 'var(--c-muted)' }}>Priorité</span>
                          <input type="number" defaultValue={m.priority} onBlur={e => updateMember(m.id, 'priority', parseInt(e.target.value, 10))} style={{ width: 50, fontSize: 12 }} />
                          <span style={{ fontSize: 11, color: 'var(--c-muted)' }}>Ordre</span>
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

                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)', marginTop: 16, marginBottom: 6 }}>
                        Si personne ne répond après {rg.ring_time}s — destinations essayées dans l'ordre
                      </div>
                      {rg.failover_steps.length === 0 && (
                        <div style={{ fontSize: 12, color: 'var(--c-faint)', marginBottom: 6 }}>
                          Aucune — l'appel raccroche après {rg.ring_time}s si personne ne répond.
                        </div>
                      )}
                      {rg.failover_steps.map((s, idx) => (
                        <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ minWidth: 18, fontSize: 11, color: 'var(--c-faint)', fontWeight: 700 }}>{idx + 1}.</span>
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
                              <span style={{ fontSize: 11, color: 'var(--c-muted)' }}>sec</span>
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
                            <span style={{ fontSize: 11, color: 'var(--c-muted)' }}>sec</span>
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
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Groupes de pickup (interception) ({groups.length})
        </div>
        <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setShowNew(v => !v)}>+ Ajouter</button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--c-muted)', marginBottom: 10 }}>
        Composer <code>*8</code> depuis un poste décroche l'appel qui sonne pour un autre poste du même groupe.
      </div>
      {showNew && (
        <div style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', borderRadius: 8, padding: 12, marginBottom: 10, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div className="form-group"><label>Nom du groupe</label><input value={newName} onChange={e => setNewName(e.target.value)} autoFocus /></div>
          <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={createGroup}>Créer</button>
        </div>
      )}
      {loading ? <div style={{ fontSize: 13, color: 'var(--c-muted)' }}>Chargement...</div> : groups.length === 0 ? (
        <div className="empty-tab">Aucun groupe de pickup.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: 'var(--c-surface-2)' }}>
              {['Nom', 'Membres', 'Actif', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--c-border)', fontSize: 12, fontWeight: 600, color: 'var(--c-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map(g => {
              const members = sipExts.filter(e => e.pickup_group === g.name)
              const available = sipExts.filter(e => e.pickup_group !== g.name)
              return (
                <Fragment key={g.id}>
                  <tr style={{ borderBottom: '1px solid var(--c-surface-3)', cursor: 'pointer' }} onClick={() => setExpanded(expanded === g.id ? null : g.id)}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{g.name}</td>
                    <td style={{ padding: '10px 12px' }}>{g.member_count}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <input type="checkbox" checked={g.is_active} onClick={e => e.stopPropagation()} onChange={e => updateGroup(g.id, { is_active: e.target.checked })} />
                    </td>
                    <td style={{ padding: '10px 12px' }}><button className="inv-del-btn" onClick={e => { e.stopPropagation(); removeGroup(g.id) }}>✕</button></td>
                  </tr>
                  {expanded === g.id && (
                    <tr>
                      <td colSpan={4} style={{ padding: '10px 20px', background: 'var(--c-surface-2)' }}>
                        <div className="form-group" style={{ maxWidth: 250 }}>
                          <label>Nom</label>
                          <input defaultValue={g.name} onBlur={e => { const v = e.target.value.trim(); if (v && v !== g.name) updateGroup(g.id, { name: v }) }} />
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)', margin: '10px 0 6px' }}>Postes membres</div>
                        {members.length === 0 && <div style={{ fontSize: 12, color: 'var(--c-faint)', marginBottom: 6 }}>Aucun poste assigné.</div>}
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
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Groupe de paging ({pagingGroups.length})
        </div>
        <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setShowNew(v => !v)}>+ Ajouter</button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--c-muted)', marginBottom: 10 }}>
        Unidirectionnelle = annonce (le récepteur écoute seulement) ; bidirectionnelle = intercom (les deux entendent). ⚠ le mode unidirectionnel ne coupe pas encore réellement l'audio du récepteur — voir TASKSIPV.
      </div>
      {showNew && (
        <div style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', borderRadius: 8, padding: 12, marginBottom: 10, display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
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
      {pagingGroupsLoading ? <div style={{ fontSize: 13, color: 'var(--c-muted)' }}>Chargement...</div> : pagingGroups.length === 0 ? (
        <div className="empty-tab">Aucun groupe de paging.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: 'var(--c-surface-2)' }}>
              {['Nom', 'Ext.', 'Mode', 'Multicast', 'Membres', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--c-border)', fontSize: 12, fontWeight: 600, color: 'var(--c-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagingGroups.map(pg => (
              <Fragment key={pg.id}>
                <tr style={{ borderBottom: '1px solid var(--c-surface-3)', cursor: 'pointer' }} onClick={() => setExpanded(expanded === pg.id ? null : pg.id)}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{pg.name}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>{pg.extension}</td>
                  <td style={{ padding: '10px 12px' }}>{pg.mode === 'bidirectional' ? 'Bidirectionnelle' : 'Unidirectionnelle'}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12 }}>{pg.multicast_address ? `${pg.multicast_address}:${pg.multicast_port || ''}` : '—'}</td>
                  <td style={{ padding: '10px 12px' }}>{pg.paging_members.length}</td>
                  <td style={{ padding: '10px 12px' }}><button className="inv-del-btn" onClick={e => { e.stopPropagation(); removeGroup(pg.id) }}>✕</button></td>
                </tr>
                {expanded === pg.id && (
                  <tr>
                    <td colSpan={6} style={{ padding: '10px 20px', background: 'var(--c-surface-2)' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-2)', marginBottom: 6 }}>Membres</div>
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
// ── Templates de tenant scopés a un modele -- niveau le plus specifique avant
// le poste individuel (TASK-S044). Meme structure que TenantTemplatesSection,
// avec un selecteur marque/modele (memes donnees que ContactDetail.jsx).
// ── Succursales (company_sites) -- TASK-S010/S010.4, plusieurs sites par
// compagnie, chacun avec sa propre adresse 911 ET sa propre facturation.
// ERPCRM est maitre ici (synchronise vers SIPV pour le 911, voir sync_site).
export function E911AddressesSection({ companyId, sipvEnabled = true }) {
  const navigate = useNavigate()
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

  // Sans tenant, pas d'adresse 911 a gerer ici (celle d'une succursale vit dans le tenant de sa maison mere)
  if (!sipvEnabled && !loading && addresses.length === 0) return null
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Adresses 911 ({addresses.length})
        </div>
        {sipvEnabled && !addresses.some(a => a.is_primary) && <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => { openNew(); setForm(p => ({ ...p, is_primary: true })) }}>+ Adresse principale</button>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--c-muted)', marginBottom: 10 }}>
        Adresses envoyées au 911 pour les postes et les numéros de ce tenant. ★ = l'adresse de la compagnie elle-même ; chaque autre adresse est celle
        d'une compagnie succursale et suit sa fiche (pour en ajouter une : cochez « Succursale » dans la fiche de cette compagnie).
      </div>
      {loading ? <div style={{ fontSize: 13, color: 'var(--c-muted)' }}>Chargement...</div> : addresses.length === 0 ? (
        <div className="empty-tab">Aucune adresse 911.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: 'var(--c-surface-2)' }}>
              {['', 'Nom', 'Adresse', 'Compagnie', 'Statut', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--c-border)', fontSize: 12, fontWeight: 600, color: 'var(--c-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {addresses.map(a => (
              <tr key={a.id} style={{ borderBottom: '1px solid var(--c-surface-3)', cursor: 'pointer', opacity: a.is_active ? 1 : 0.55 }}
                onClick={() => a.branch_company_id ? navigate(`/companies/${a.branch_company_id}`) : openEdit(a)}
                title={a.branch_company_id ? `Adresse de ${a.branch_company_name} : elle se modifie dans sa fiche` : ''}>
                <td style={{ padding: '10px 12px' }}>
                  {a.is_primary
                    ? <span title="Succursale principale (défaut pour le 911 des postes)" style={{ color: '#D97706' }}>★</span>
                    : a.is_active && <button title="Définir comme succursale principale" onClick={e => { e.stopPropagation(); makePrimary(a) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-border-strong)', fontSize: 15 }}>☆</button>}
                </td>
                <td style={{ padding: '10px 12px', fontWeight: 600 }}>{a.label}</td>
                <td style={{ padding: '10px 12px', color: 'var(--c-muted)' }}>{a.civic_number} {a.street_name}{a.unit ? `, ${a.unit}` : ''}, {a.city} {a.province} {a.postal_code}</td>
                <td style={{ padding: '10px 12px', fontSize: 13 }}>{a.branch_company_id
                  ? <span style={{ color: 'var(--brand)', fontWeight: 600 }}>{a.branch_company_name} ↗</span>
                  : <span style={{ color: 'var(--c-muted)' }}>Cette compagnie</span>}</td>
                <td style={{ padding: '10px 12px' }}>{a.is_active ? <span style={{ color: '#059669', fontWeight: 600 }}>Active</span> : <span style={{ color: 'var(--c-faint)' }}>Désactivée</span>}</td>
                <td style={{ padding: '10px 12px' }}>
                  {a.branch_company_id ? null : a.is_active
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
        <QuickNewContact initialName={quickContactName} companyId={companyId} onCreated={afterContactCreated} onClose={() => setQuickContactName(null)} />
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
    <div className="modal-overlay">
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
    <div className="modal-overlay">
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

export default TelephonyTab
