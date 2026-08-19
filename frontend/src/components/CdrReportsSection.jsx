import { useState, useEffect, Fragment } from 'react'
import api from '../services/api'

// TASK-032.2 -- rapports CDR programmés par courriel. Partagé entre
// CompanyDetail.jsx (onglet CDR, tous les postes) et ContactDetail.jsx
// (verrouillé sur le poste de ce contact, via fixedExtension).
export const CDR_WEEKDAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
export const CDR_FREQUENCY_LABELS = { custom_days: 'Journalier (jours choisis)', weekly: 'Hebdomadaire', monthly: 'Mensuel' }
export const CDR_DIRECTION_LABELS = { '': 'Tous les appels', inbound: 'Entrants seulement', outbound: 'Sortants seulement' }

function cdrReportFrequencyLabel(s) {
  if (s.frequency_type === 'custom_days') return (s.days_of_week || []).map(d => CDR_WEEKDAY_LABELS[d].slice(0, 2)).join('/') || '—'
  if (s.frequency_type === 'weekly') return CDR_WEEKDAY_LABELS[s.day_of_week] ?? '—'
  if (s.frequency_type === 'monthly') return `le ${s.day_of_month}`
  return ''
}

export default function CdrReportsSection({ companyId, fixedExtension }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [sipExts, setSipExts] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [logs, setLogs] = useState({})
  const [sending, setSending] = useState(null)

  function load() {
    setLoading(true)
    api.get(`/v1/telephony/company/${companyId}/cdr-reports`).then(r => setReports(r.data)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [companyId])
  // Pas besoin de la liste des postes si le poste est déjà fixé (contexte contact).
  useEffect(() => { if (!fixedExtension) api.get(`/v1/companies/${companyId}/sip-extensions`).then(r => setSipExts(r.data)) }, [companyId, fixedExtension])

  const visibleReports = fixedExtension ? reports.filter(r => r.extension === fixedExtension) : reports

  async function toggleActive(r, checked) {
    await api.put(`/v1/telephony/cdr-reports/${r.id}`, { is_active: checked })
    load()
  }
  async function removeReport(id) {
    if (!confirm('Supprimer ce rapport programmé ?')) return
    await api.delete(`/v1/telephony/cdr-reports/${id}`)
    load()
  }
  async function sendNow(id) {
    setSending(id)
    try {
      const r = await api.post(`/v1/telephony/cdr-reports/${id}/send-now`)
      alert(r.data.success ? `Envoyé (${r.data.call_count} appel(s), ${r.data.recipient_count} destinataire(s)).` : `Échec : ${r.data.error_message || 'erreur inconnue'}`)
      loadLogs(id)
    } catch (e) {
      alert(e.response?.data?.detail || 'Erreur')
    } finally { setSending(null) }
  }
  function loadLogs(id) {
    api.get(`/v1/telephony/cdr-reports/${id}/logs`).then(r => setLogs(p => ({ ...p, [id]: r.data })))
  }
  function toggleExpand(id) {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    if (!logs[id]) loadLogs(id)
  }

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Rapports programmés par courriel ({visibleReports.length})
        </div>
        <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => { setEditing(null); setShowModal(true) }}>+ Ajouter</button>
      </div>
      {loading ? <div style={{ fontSize: 13, color: '#6B7280' }}>Chargement...</div> : visibleReports.length === 0 ? (
        <div className="empty-tab">Aucun rapport programmé.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#F9FAFB' }}>
              {[
                'Nom', 'Récurrence',
                ...(fixedExtension ? [] : ['Filtre']),
                'Destinataires', 'Actif', '',
              ].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid #E5E7EB', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleReports.map(r => (
              <Fragment key={r.id}>
                <tr style={{ borderBottom: '1px solid #F3F4F6', cursor: 'pointer' }} onClick={() => toggleExpand(r.id)}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{r.name}</td>
                  <td style={{ padding: '10px 12px' }}>{CDR_FREQUENCY_LABELS[r.frequency_type]} — {cdrReportFrequencyLabel(r)} à {r.send_hour}</td>
                  {!fixedExtension && (
                    <td style={{ padding: '10px 12px' }}>{[r.extension ? `poste ${r.extension}` : null, r.direction ? CDR_DIRECTION_LABELS[r.direction] : null].filter(Boolean).join(', ') || 'Tous'}</td>
                  )}
                  <td style={{ padding: '10px 12px' }}>{r.recipients}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <input type="checkbox" checked={r.is_active} onClick={e => e.stopPropagation()} onChange={e => toggleActive(r, e.target.checked)} />
                  </td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                    <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }} disabled={sending === r.id} onClick={() => sendNow(r.id)}>{sending === r.id ? '...' : 'Envoyer maintenant'}</button>
                    <button className="adm-edit-btn" style={{ marginLeft: 6 }} onClick={() => { setEditing(r); setShowModal(true) }}>Modifier</button>
                    <button className="inv-del-btn" onClick={() => removeReport(r.id)}>✕</button>
                  </td>
                </tr>
                {expanded === r.id && (
                  <tr>
                    <td colSpan={fixedExtension ? 5 : 6} style={{ padding: '10px 20px', background: '#F9FAFB' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Historique des envois</div>
                      {!logs[r.id] ? (
                        <div style={{ fontSize: 12, color: '#6B7280' }}>Chargement...</div>
                      ) : logs[r.id].length === 0 ? (
                        <div style={{ fontSize: 12, color: '#6B7280' }}>Aucun envoi encore.</div>
                      ) : (
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                          {logs[r.id].map(l => (
                            <li key={l.id} style={{ color: l.success ? '#166534' : '#991B1B' }}>
                              {new Date(l.sent_at).toLocaleString('fr-CA')} — {l.success ? 'Envoyé' : 'Échec'} — {l.call_count} appel(s), {l.recipient_count} destinataire(s){l.triggered_manually ? ' (manuel)' : ''}
                              {l.error_message && ` — ${l.error_message}`}
                            </li>
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
      {showModal && (
        <CdrReportModal companyId={companyId} report={editing} sipExts={sipExts} fixedExtension={fixedExtension} onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }} />
      )}
    </div>
  )
}

function CdrReportModal({ companyId, report, sipExts, fixedExtension, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: report?.name || '',
    recipients: report?.recipients || '',
    extension: report?.extension || fixedExtension || '',
    direction: report?.direction || '',
    frequency_type: report?.frequency_type || 'weekly',
    days_of_week: report?.days_of_week || [],
    day_of_week: report?.day_of_week ?? 0,
    day_of_month: report?.day_of_month ?? 1,
    send_hour: report?.send_hour || '08:00',
    timezone: report?.timezone || 'America/Toronto',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  function toggleDay(d) {
    const next = form.days_of_week.includes(d) ? form.days_of_week.filter(x => x !== d) : [...form.days_of_week, d].sort()
    f('days_of_week', next)
  }

  async function save() {
    if (!form.name.trim() || !form.recipients.trim()) { setError('Nom et destinataires requis'); return }
    if (form.frequency_type === 'custom_days' && form.days_of_week.length === 0) { setError('Choisir au moins un jour'); return }
    setSaving(true)
    setError('')
    const payload = {
      ...form,
      extension: fixedExtension || form.extension || null,
      direction: form.direction || null,
      days_of_week: form.frequency_type === 'custom_days' ? form.days_of_week : null,
      day_of_week: form.frequency_type === 'weekly' ? form.day_of_week : null,
      day_of_month: form.frequency_type === 'monthly' ? form.day_of_month : null,
    }
    try {
      if (report) {
        await api.put(`/v1/telephony/cdr-reports/${report.id}`, payload)
      } else {
        await api.post(`/v1/telephony/company/${companyId}/cdr-reports`, payload)
      }
      onSaved()
    } catch (e) {
      setError(e.response?.data?.detail || 'Erreur')
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <h3 className="modal-title">{report ? 'Modifier le rapport' : 'Nouveau rapport programmé'}</h3>
        {error && <div className="adm-form-error">{error}</div>}

        <div className="form-group"><label>Nom</label><input value={form.name} onChange={e => f('name', e.target.value)} placeholder="ex: Rapport hebdo poste 227" autoFocus /></div>
        <div className="form-group"><label>Destinataires (courriels séparés par virgule)</label><input value={form.recipients} onChange={e => f('recipients', e.target.value)} placeholder="client@exemple.com" /></div>

        {fixedExtension ? (
          <div className="form-group"><label>Poste</label><input value={fixedExtension} disabled /></div>
        ) : (
          <div className="form-group">
            <label>Poste (optionnel)</label>
            <select value={form.extension} onChange={e => f('extension', e.target.value)}>
              <option value="">— Tous les postes —</option>
              {sipExts.map(e => <option key={e.id} value={e.extension}>{e.extension} — {e.name}</option>)}
            </select>
          </div>
        )}
        <div className="form-group">
          <label>Direction</label>
          <select value={form.direction} onChange={e => f('direction', e.target.value)}>
            {Object.entries(CDR_DIRECTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label>Fréquence</label>
          <select value={form.frequency_type} onChange={e => f('frequency_type', e.target.value)}>
            {Object.entries(CDR_FREQUENCY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {form.frequency_type === 'custom_days' && (
          <div className="form-group">
            <label>Jours</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {CDR_WEEKDAY_LABELS.map((label, i) => (
                <button key={i} type="button"
                  onClick={() => toggleDay(i)}
                  className={form.days_of_week.includes(i) ? 'btn-primary' : 'btn-secondary'}
                  style={{ fontSize: 11, padding: '4px 8px' }}>{label.slice(0, 2)}</button>
              ))}
            </div>
          </div>
        )}
        {form.frequency_type === 'weekly' && (
          <div className="form-group">
            <label>Jour de la semaine</label>
            <select value={form.day_of_week} onChange={e => f('day_of_week', parseInt(e.target.value))}>
              {CDR_WEEKDAY_LABELS.map((label, i) => <option key={i} value={i}>{label}</option>)}
            </select>
          </div>
        )}
        {form.frequency_type === 'monthly' && (
          <div className="form-group">
            <label>Jour du mois</label>
            <input type="number" min="1" max="31" value={form.day_of_month} onChange={e => f('day_of_month', parseInt(e.target.value, 10))} />
          </div>
        )}
        <div className="form-group"><label>Heure d'envoi</label><input type="time" value={form.send_hour} onChange={e => f('send_hour', e.target.value)} /></div>

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}
