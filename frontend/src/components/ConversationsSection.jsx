import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../services/api'
import { askConfirm } from './Dialog'
import EntityLink from './EntityLink'
import { NameDeviceModal, localStorageBlocked } from './MicButton'
import { currentDevice, openMic } from '../utils/audioDevice'

// Conversations enregistrees (TASK-055 etape 3, 2026-10-23) : enregistrer depuis le ticket, puis transcription et
// voix reconnues sur le serveur (rien ne sort). Le son part par morceaux de 10 s pendant l'enregistrement : une page
// fermee par erreur garde ce qui a deja ete recu. Visible aussi dans la fiche de la compagnie et du contact.
const C = { border: 'var(--c-border)', muted: 'var(--c-muted)', faint: 'var(--c-faint)', red: '#DC2626', amber: '#B45309' }
const PALETTE = ['#2563EB', '#16A34A', '#9333EA', '#EA580C', '#0891B2', '#DB2777']
const STATUS = { recording: 'Enregistrement en cours…', pending: 'Transcription en attente…', transcribing: 'Transcription en cours…' }

function me() {
  try { return JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || 'null') } catch { return null }
}
function clock(s) { s = Math.floor(s || 0); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
const unknownLabel = s => !s.user_id && !s.contact_id

// ── Enregistreur ────────────────────────────────────────────────────────────
function Recorder({ ticketId, onChanged }) {
  const [state, setState] = useState('idle')      // idle | recording | stopping
  const [secs, setSecs] = useState(0)
  const [naming, setNaming] = useState(false)
  const [notice, setNotice] = useState(null)
  const r = useRef({})

  useEffect(() => {
    const warn = e => { if (r.current.mr?.state === 'recording') { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => { window.removeEventListener('beforeunload', warn); clearInterval(r.current.timer); r.current.mr?.stream.getTracks().forEach(t => t.stop()) }
  }, [])

  async function begin() {
    if (!await askConfirm('Avise le client que la conversation est enregistrée et pourquoi (Loi 25), par exemple : « J\'enregistre notre conversation pour garder une trace de votre demande. »\n\nCommencer l\'enregistrement ?', { okLabel: 'Commencer' })) return
    let device = null, reachable = true
    try { device = await currentDevice() } catch { reachable = false }
    if (!device && reachable && !localStorageBlocked()) { setNaming(true); return }
    start(device)
  }

  async function start(device) {
    setNotice(null)
    try {
      const { stream, fellBack } = await openMic(device)
      if (fellBack) setNotice('Le micro choisi pour cet appareil est absent : micro par défaut utilisé.')
      const mr = new MediaRecorder(stream)
      const { id } = (await api.post('/v1/conversations', { ticket_id: ticketId, mime: mr.mimeType || 'audio/webm' })).data
      let queue = Promise.resolve()
      mr.ondataavailable = e => {
        if (!e.data.size) return
        const fd = new FormData(); fd.append('audio', e.data, 'morceau')
        queue = queue.then(() => api.post(`/v1/conversations/${id}/chunk`, fd)).catch(() => setNotice('Un morceau n\'a pas pu être envoyé : vérifie la connexion.'))
      }
      mr.onstop = async () => {
        await queue
        await api.post(`/v1/conversations/${id}/finish`).catch(() => {})
        stream.getTracks().forEach(t => t.stop())
        setState('idle'); onChanged()
      }
      mr.start(10000)
      r.current = { mr, timer: setInterval(() => setSecs(s => s + 1), 1000) }
      setSecs(0); setState('recording'); onChanged()
    } catch (e) {
      setNotice(e.name === 'NotAllowedError' ? 'Le navigateur a refusé le micro : autorise-le dans les réglages du site.' : (e.response?.data?.detail || e.message || 'Micro introuvable.'))
    }
  }

  function stop() { clearInterval(r.current.timer); setState('stopping'); r.current.mr.stop() }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
      {state === 'idle' && <button className="btn-secondary" onClick={begin}>🎙️ Enregistrer la conversation</button>}
      {state === 'recording' && <button className="btn-secondary" style={{ color: C.red, borderColor: '#FCA5A5' }} onClick={stop}>⏹ Arrêter · {clock(secs)}</button>}
      {state === 'stopping' && <span style={{ fontSize: 13, color: C.muted }}>Envoi de la fin…</span>}
      {notice && <span style={{ fontSize: 12, color: C.amber }}>{notice}</span>}
      {naming && <NameDeviceModal onClose={() => setNaming(false)} onDone={d => { setNaming(false); start(d) }} />}
    </div>
  )
}

// ── « Qui est-ce ? » ────────────────────────────────────────────────────────
function WhoIsIt({ conv, label, onDone }) {
  const [people, setPeople] = useState(null)
  const [pick, setPick] = useState('')
  const [error, setError] = useState(null)
  useEffect(() => {
    const u = me()
    Promise.all([
      api.get('/v1/admin/users').then(r => r.data.filter(x => x.is_active !== false)).catch(() => (u ? [{ id: u.id, full_name: u.full_name }] : [])),
      api.get('/v1/contacts', { params: { company_id: conv.ticket.company_id } }).then(r => r.data).catch(() => []),
    ]).then(([users, contacts]) => setPeople({ users, contacts }))
  }, [conv.ticket.company_id])
  async function save() {
    setError(null)
    const [kind, id] = pick.split(':')
    try {
      await api.put(`/v1/conversations/${conv.id}/speaker`, { label, [kind === 'u' ? 'user_id' : 'contact_id']: id })
      onDone()
    } catch (e) { setError(e.response?.data?.detail || 'Erreur') }
  }
  if (!people) return <span style={{ fontSize: 12, color: C.muted }}>…</span>
  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <select value={pick} onChange={e => setPick(e.target.value)} style={{ fontSize: 12, padding: '3px 6px', maxWidth: 220 }}>
        <option value="">« {label} », c'est…</option>
        {people.contacts.length > 0 && <optgroup label="Contacts du client">
          {people.contacts.map(c => <option key={c.id} value={`c:${c.id}`}>{`${c.first_name} ${c.last_name}`.trim()}</option>)}</optgroup>}
        <optgroup label="Équipe">{people.users.map(u => <option key={u.id} value={`u:${u.id}`}>{u.full_name}</option>)}</optgroup>
      </select>
      <button className="btn-primary" style={{ fontSize: 12, padding: '3px 10px' }} disabled={!pick} onClick={save}>OK</button>
      {error && <span style={{ fontSize: 12, color: C.red }}>{error}</span>}
    </span>
  )
}

// ── Une conversation ────────────────────────────────────────────────────────
function ConversationCard({ conv, showTicket, onChanged }) {
  const [src, setSrc] = useState(null)
  const [editing, setEditing] = useState(null)      // id de la phrase
  const [draft, setDraft] = useState('')
  const [asking, setAsking] = useState(null)        // etiquette
  const audioRef = useRef(null)
  useEffect(() => () => { if (src) URL.revokeObjectURL(src) }, [src])

  async function listen(at) {
    let url = src
    if (!url) {
      const r = await api.get(`/v1/conversations/${conv.id}/audio`, { responseType: 'blob' })
      url = URL.createObjectURL(r.data); setSrc(url)
    }
    setTimeout(() => { const a = audioRef.current; if (a) { if (at != null) a.currentTime = at; a.play().catch(() => {}) } }, 50)
  }
  async function saveText(seg) {
    await api.put(`/v1/conversations/segments/${seg.id}`, { text: draft }); setEditing(null); onChanged()
  }
  async function remove() {
    if (!await askConfirm('Supprimer cette conversation (son et transcription) ? Elle ne pourra pas être récupérée.')) return
    await api.delete(`/v1/conversations/${conv.id}`); onChanged()
  }
  async function retry() { await api.post(`/v1/conversations/${conv.id}/retry`); onChanged() }
  async function redo() {
    if (!await askConfirm('Refaire la transcription ? Les voix apprises depuis seront reconnues ; les corrections faites à la main dans le texte seront perdues.')) return
    retry()
  }

  const speakers = [...new Set(conv.segments.map(s => s.speaker))]
  const color = s => PALETTE[speakers.indexOf(s) % PALETTE.length]
  const unknown = [...new Set(conv.segments.filter(unknownLabel).map(s => s.speaker))]
  const when = new Date(conv.started_at).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
        <span style={{ fontWeight: 600 }}>🎙️ {when}</span>
        {conv.duration ? <span style={{ color: C.muted }}>{clock(conv.duration)}</span> : null}
        {conv.recorded_by && <span style={{ color: C.muted }}>par {conv.recorded_by}</span>}
        {showTicket && <EntityLink kind="ticket" id={conv.ticket.id}>{conv.ticket.number} {conv.ticket.title}</EntityLink>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {conv.status === 'done' && <button className="btn-secondary" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => listen(null)}>▶ Écouter</button>}
          {conv.status === 'done' && <button className="btn-secondary" style={{ fontSize: 12, padding: '3px 10px' }} title="Refaire la transcription (reconnaît les voix apprises depuis ; les corrections de texte sont perdues)" onClick={redo}>↻ Refaire</button>}
          {conv.status !== 'transcribing' && conv.status !== 'recording' && <button className="btn-secondary" style={{ fontSize: 12, padding: '3px 10px', color: C.red }} onClick={remove}>Supprimer</button>}
        </span>
      </div>
      {STATUS[conv.status] && <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>{STATUS[conv.status]} {conv.status !== 'recording' && <span style={{ color: C.faint }}>La transcription prend un peu plus que la durée de l'enregistrement sur le serveur actuel.</span>}</div>}
      {conv.status === 'error' && <div style={{ fontSize: 13, color: C.red, marginTop: 6 }}>Transcription échouée : {conv.error} <button className="btn-secondary" style={{ fontSize: 12, padding: '2px 8px' }} onClick={retry}>Réessayer</button></div>}
      {src && <audio ref={audioRef} src={src} controls style={{ width: '100%', marginTop: 8 }} />}
      {unknown.length > 0 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 8, fontSize: 12, color: C.muted }}>
          {unknown.map(l => asking === l
            ? <WhoIsIt key={l} conv={conv} label={l} onDone={() => { setAsking(null); onChanged() }} />
            : <button key={l} className="btn-secondary" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => setAsking(l)}>Qui est « {l} » ?</button>)}
          <span>Sa voix sera reconnue les prochaines fois.</span>
        </div>
      )}
      {conv.segments.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {conv.segments.map(s => (
            <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 14, minWidth: 0 }}>
              <button onClick={() => listen(s.start)} title="Écouter à partir d'ici" style={{ background: 'none', border: 'none', color: C.faint, cursor: 'pointer', fontSize: 11, padding: 0, flexShrink: 0 }}>{clock(s.start)}</button>
              <div style={{ minWidth: 0, flex: 1 }}>
                <span style={{ fontWeight: 600, color: color(s.speaker), marginRight: 6 }}>{s.speaker}</span>
                {editing === s.id ? (
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    <input value={draft} onChange={e => setDraft(e.target.value)} autoFocus style={{ flex: '1 1 200px', minWidth: 0 }} />
                    <button className="btn-secondary" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => setEditing(null)}>Annuler</button>
                    <button className="btn-primary" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => saveText(s)}>Enregistrer</button>
                  </span>
                ) : <span style={{ overflowWrap: 'anywhere', cursor: 'text' }} title="Cliquer pour corriger" onClick={() => { setEditing(s.id); setDraft(s.text) }}>{s.text}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ConversationsSection({ ticketId, companyId, contactId }) {
  const [rows, setRows] = useState([])
  const params = ticketId ? { ticket_id: ticketId } : companyId ? { company_id: companyId } : { contact_id: contactId }
  const key = JSON.stringify(params)
  const load = useCallback(() => api.get('/v1/conversations', { params: JSON.parse(key) }).then(r => setRows(r.data)).catch(() => {}), [key])
  useEffect(() => { load() }, [load])
  const busy = rows.some(c => STATUS[c.status])
  useEffect(() => {
    if (!busy) return
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [busy, load])
  return (
    <div>
      {ticketId && <Recorder ticketId={ticketId} onChanged={load} />}
      {rows.length === 0 && !ticketId && <div style={{ fontSize: 13, color: C.faint }}>Aucune conversation enregistrée. Elles s'enregistrent depuis un ticket (🎙️).</div>}
      {rows.map(c => <ConversationCard key={c.id} conv={c} showTicket={!ticketId} onChanged={load} />)}
    </div>
  )
}
