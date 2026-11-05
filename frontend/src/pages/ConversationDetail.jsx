import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'
import { askConfirm } from '../components/Dialog'
import EntityLink from '../components/EntityLink'
import { fmtWhen, clock, STATUS } from '../components/ConversationsSection'
import './Tickets.css'

// Page d'un enregistrement (TASK-055, Philippe 2026-11-05) : le ticket n'en montre qu'un lien ; ici le son, ce à quoi
// il est relié (ticket, compagnie, contact, corrigeable) et la transcription « sans nom, juste les mots avec la
// ponctuation » (les voix ne sont pas reconnues sur les appels), corrigeable comme un document.
export default function ConversationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [conv, setConv] = useState(null)
  const [error, setError] = useState(null)
  const [src, setSrc] = useState(null)
  const [loadingAudio, setLoadingAudio] = useState(false)
  const [contacts, setContacts] = useState(null)
  const [draft, setDraft] = useState(null)        // texte en correction
  const [saving, setSaving] = useState(false)
  const [changing, setChanging] = useState(false)   // menu du contact ouvert

  const load = useCallback(() => api.get(`/v1/conversations/${id}`).then(r => setConv(r.data))
    .catch(e => setError(e.response?.data?.detail || 'Enregistrement introuvable')), [id])
  useEffect(() => { load() }, [load])
  useEffect(() => () => { if (src) URL.revokeObjectURL(src) }, [src])
  const busy = conv && STATUS[conv.status]
  useEffect(() => {
    if (!busy) return
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [busy, load])
  const companyId = conv?.company?.id
  useEffect(() => {
    if (!companyId) { setContacts([]); return }
    api.get('/v1/contacts', { params: { company_id: companyId } }).then(r => setContacts(r.data)).catch(() => setContacts([]))
  }, [companyId])

  async function listen() {
    setLoadingAudio(true)
    try {
      const r = await api.get(`/v1/conversations/${id}/audio`, { responseType: 'blob' })
      setSrc(URL.createObjectURL(r.data))
    } finally { setLoadingAudio(false) }
  }
  async function edit(patch) {
    setError(null)
    try { setConv((await api.put(`/v1/conversations/${id}`, patch)).data); return true }
    catch (e) { setError(e.response?.data?.detail || 'Erreur'); return false }
  }
  async function saveText() {
    setSaving(true)
    if (await edit({ text: draft })) setDraft(null)
    setSaving(false)
  }
  async function retry() { await api.post(`/v1/conversations/${id}/retry`); load() }
  async function redo() {
    if (!await askConfirm('Refaire la transcription ? Les corrections faites à la main dans le texte seront perdues.')) return
    retry()
  }
  async function remove() {
    if (!await askConfirm('Supprimer cet enregistrement (son et transcription) ? Il ne pourra pas être récupéré.')) return
    await api.delete(`/v1/conversations/${id}`)
    navigate(`/tickets/${conv.ticket.id}`)
  }

  if (!conv) return <div style={{ padding: 24, color: 'var(--c-muted)' }}>{error || 'Chargement…'}</div>
  const small = { fontSize: 12, padding: '3px 10px' }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1100 }}>
      <button className="btn-secondary" style={small} onClick={() => navigate(`/tickets/${conv.ticket.id}`)}>← Ticket {conv.ticket.number}</button>
      <h2 style={{ margin: '14px 0 4px' }}>🎙️ {fmtWhen(conv)}</h2>
      <div style={{ fontSize: 13, color: 'var(--c-muted)', marginBottom: 16 }}>
        {conv.duration ? `Durée ${clock(conv.duration)}` : null}{conv.recorded_by ? ` · par ${conv.recorded_by}` : ''}
      </div>

      <div className="tkt-section" style={{ marginBottom: 16 }}>
        <div className="tkt-info-row"><span>Ticket</span><strong><EntityLink kind="ticket" id={conv.ticket.id}>{conv.ticket.number} {conv.ticket.title}</EntityLink></strong></div>
        <div className="tkt-info-row"><span>Compagnie</span><strong>{conv.company ? <EntityLink kind="company" id={conv.company.id}>{conv.company.name}</EntityLink> : '—'}</strong></div>
        <div className="tkt-info-row">
          <span>Contact</span>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {!changing && <strong>{conv.contact ? <EntityLink kind="contact" id={conv.contact.id}>{conv.contact.name}</EntityLink> : '—'}</strong>}
            {!changing && contacts && contacts.length > 0 && <button className="btn-secondary" style={small} onClick={() => setChanging(true)}>Changer</button>}
            {changing && (
              <select className="tkt-select-inline" autoFocus value={conv.contact?.id || ''} onChange={async e => { await edit({ contact_id: e.target.value || null }); setChanging(false) }} onBlur={() => setChanging(false)}>
                <option value="">— Aucun —</option>
                {contacts.map(c => <option key={c.id} value={c.id}>{`${c.first_name} ${c.last_name}`.trim()}</option>)}
              </select>
            )}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        {!src && <button className="btn-secondary" style={small} disabled={loadingAudio} onClick={listen}>{loadingAudio ? 'Chargement du son…' : '▶ Écouter'}</button>}
        {conv.status === 'done' && draft === null && <button className="btn-secondary" style={small} onClick={() => setDraft(conv.text)}>✎ Corriger le texte</button>}
        {conv.status === 'done' && <button className="btn-secondary" style={small} onClick={redo}>↻ Refaire la transcription</button>}
        {conv.status !== 'transcribing' && conv.status !== 'recording' && <button className="btn-secondary" style={{ ...small, color: '#DC2626' }} onClick={remove}>Supprimer</button>}
      </div>
      {src && <audio src={src} controls autoPlay style={{ width: '100%', marginBottom: 12 }} />}
      {error && <div style={{ color: '#DC2626', fontSize: 13, marginBottom: 10 }}>{error}</div>}

      {STATUS[conv.status] && <div style={{ fontSize: 14, color: 'var(--c-muted)' }}>{STATUS[conv.status]} <span style={{ color: 'var(--c-faint)' }}>La transcription prend un peu plus que la durée de l'enregistrement sur le serveur actuel.</span></div>}
      {conv.status === 'error' && <div style={{ fontSize: 14, color: '#DC2626' }}>Transcription échouée : {conv.error} <button className="btn-secondary" style={small} onClick={retry}>Réessayer</button></div>}
      {conv.status === 'done' && (draft !== null ? (
        <div>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} autoFocus
            style={{ width: '100%', minHeight: '60vh', fontSize: 15, lineHeight: 1.7, padding: 12, boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn-secondary" disabled={saving} onClick={() => setDraft(null)}>Annuler</button>
            <button className="btn-primary" disabled={saving} onClick={saveText}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
        </div>
      ) : (
        <div className="tkt-section" style={{ fontSize: 15, lineHeight: 1.7, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {conv.text || <span style={{ color: 'var(--c-faint)' }}>Rien n'a été transcrit.</span>}
        </div>
      ))}
    </div>
  )
}
