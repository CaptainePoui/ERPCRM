import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../services/api'
import { Link } from 'react-router-dom'
import { askConfirm } from './Dialog'
import { NameDeviceModal, localStorageBlocked } from './MicButton'
import { currentDevice, openMic } from '../utils/audioDevice'

// Conversations enregistrees (TASK-055 etape 3, 2026-10-23) : enregistrer depuis le ticket, puis transcription et
// voix reconnues sur le serveur (rien ne sort). Le son part par morceaux de 10 s pendant l'enregistrement : une page
// fermee par erreur garde ce qui a deja ete recu. Visible aussi dans la fiche de la compagnie et du contact.
const C = { border: 'var(--c-border)', muted: 'var(--c-muted)', faint: 'var(--c-faint)', red: '#DC2626', amber: '#B45309' }
export const STATUS = { recording: 'Enregistrement en cours…', pending: 'Transcription en attente…', transcribing: 'Transcription en cours…' }

export function clock(s) { s = Math.floor(s || 0); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

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
      {state === 'idle' && <Uploader ticketId={ticketId} onChanged={onChanged} />}
      {state === 'recording' && <button className="btn-secondary" style={{ color: C.red, borderColor: '#FCA5A5' }} onClick={stop}>⏹ Arrêter · {clock(secs)}</button>}
      {state === 'stopping' && <span style={{ fontSize: 13, color: C.muted }}>Envoi de la fin…</span>}
      {notice && <span style={{ fontSize: 12, color: C.amber }}>{notice}</span>}
      {naming && <NameDeviceModal onClose={() => setNaming(false)} onDone={d => { setNaming(false); start(d) }} />}
    </div>
  )
}

// ── Téléverser des enregistrements d'appel déjà faits (2026-11-04) ─────────
// Même transcription et mêmes voix que l'enregistrement en direct ; la date de l'appel se corrige avant l'envoi.
const AUDIO_EXT = { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/x-m4a', mp4: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg',
  oga: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm', flac: 'audio/flac', amr: 'audio/amr', wma: 'audio/x-ms-wma' }
const SLICE = 8 * 1024 * 1024        // morceaux de 8 Mo (le serveur refuse plus de 10 Mo par morceau)
// Date de l'appel à l'heure de l'entreprise (Montréal), pas à celle de l'ordinateur qui envoie (2026-11-05) : le
// serveur lit la date sans fuseau à l'heure de l'entreprise.
const localInput = (ms, tz) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)).map(x => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}
const mimeOf = f => AUDIO_EXT[(f.name.split('.').pop() || '').toLowerCase()] || f.type || 'audio/webm'

function Uploader({ ticketId, onChanged }) {
  const [files, setFiles] = useState(null)       // [{ file, when, state, error }]
  const [sending, setSending] = useState(false)
  const input = useRef(null)

  async function pick(e) {
    const picked = [...e.target.files]
    e.target.value = ''
    const tz = await api.get('/v1/settings/timezones').then(r => r.data.current).catch(() => undefined)
    const list = picked.map(file => ({ file, when: localInput(file.lastModified || Date.now(), tz), state: '', error: null }))
    if (list.length) setFiles(list)
  }
  const set = (i, patch) => setFiles(p => p.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  async function send() {
    setSending(true)
    for (let i = 0; i < files.length; i++) {
      const { file, when, state } = files[i]
      if (state === 'ok') continue
      try {
        set(i, { state: 'Envoi…', error: null })
        const { id } = (await api.post('/v1/conversations', { ticket_id: ticketId, mime: mimeOf(file), started_at: `${when}:00` })).data
        for (let off = 0; off < file.size; off += SLICE) {
          const fd = new FormData(); fd.append('audio', file.slice(off, off + SLICE), 'morceau')
          await api.post(`/v1/conversations/${id}/chunk`, fd)
          set(i, { state: `Envoi… ${Math.min(100, Math.round(((off + SLICE) / file.size) * 100))} %` })
        }
        await api.post(`/v1/conversations/${id}/finish`)
        set(i, { state: 'ok' })
      } catch (e) {
        set(i, { state: 'error', error: e.response?.data?.detail || e.message || 'Erreur' })
      }
    }
    setSending(false)
    onChanged()
    setFiles(p => (p.every(x => x.state === 'ok') ? null : p))
  }

  return (
    <>
      <button className="btn-secondary" onClick={() => input.current.click()}>📤 Téléverser un enregistrement</button>
      <input ref={input} type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac,.amr,.wma,.webm" multiple hidden onChange={pick} />
      {files && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ width: 'auto', minWidth: 'min(520px, 92vw)', maxWidth: '92vw' }}>
            <div className="modal-title">Téléverser des enregistrements d'appel</div>
            <p style={{ fontSize: 13, color: C.muted, margin: '0 0 12px' }}>
              Chaque fichier devient une conversation de ce ticket : transcription et voix reconnues comme un enregistrement fait ici.
              Vérifie la date de chaque appel, à l'heure de l'entreprise (proposée : la date du fichier).
            </p>
            <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
              <thead><tr><th style={{ textAlign: 'left', padding: 4 }}>Fichier</th><th style={{ textAlign: 'left', padding: 4 }}>Date de l'appel</th><th /></tr></thead>
              <tbody>
                {files.map((x, i) => (
                  <tr key={i}>
                    <td style={{ padding: 4, whiteSpace: 'nowrap' }}>{x.file.name} <span style={{ color: C.faint }}>({(x.file.size / 1048576).toFixed(1)} Mo)</span></td>
                    <td style={{ padding: 4 }}>
                      <input type="datetime-local" value={x.when} disabled={sending || x.state === 'ok'} onChange={e => set(i, { when: e.target.value })} />
                    </td>
                    <td style={{ padding: 4, whiteSpace: 'nowrap', color: x.state === 'error' ? C.red : x.state === 'ok' ? '#059669' : C.muted }}>
                      {x.state === 'ok' ? '✓ envoyé' : x.state === 'error' ? x.error : x.state}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="modal-actions">
              <button className="btn-secondary" disabled={sending} onClick={() => { setFiles(null); onChanged() }}>{files.some(x => x.state === 'ok') ? 'Fermer' : 'Annuler'}</button>
              <button className="btn-primary" disabled={sending || files.some(x => !x.when)} onClick={send}>
                {sending ? 'Envoi…' : files.some(x => x.state === 'error') ? 'Réessayer' : 'Envoyer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Liste des enregistrements : une ligne-lien chacun (2026-11-05) ────────
// Philippe : « pas de transcription, juste les enregistrements, et c'est des liens ». Le texte s'ouvre sur la page
// de la conversation ; heures au fuseau de l'entreprise (Montréal), pas celui du navigateur ni du serveur.
export function fmtWhen(conv) {
  return new Date(conv.started_at).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short', timeZone: conv.tz || undefined })
}

function RecordingLine({ conv, showTicket }) {
  return (
    <Link to={`/conversations/${conv.id}`} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline', padding: '7px 0',
      borderBottom: `1px solid var(--c-surface-3)`, fontSize: 14, color: 'inherit', textDecoration: 'none' }}>
      <span style={{ color: 'var(--brand)', fontWeight: 600 }}>🎙️ {fmtWhen(conv)}</span>
      {conv.duration ? <span style={{ color: C.muted }}>{clock(conv.duration)}</span> : null}
      {showTicket && <span style={{ color: C.muted }}>{conv.ticket.number} {conv.ticket.title}</span>}
      {STATUS[conv.status] && <span style={{ color: C.faint, fontSize: 12 }}>{STATUS[conv.status]}</span>}
      {conv.status === 'error' && <span style={{ color: C.red, fontSize: 12 }}>Transcription échouée</span>}
    </Link>
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
      {rows.length === 0 && <div style={{ fontSize: 13, color: C.faint }}>{ticketId ? 'Aucun enregistrement.' : 'Aucun enregistrement. Ils se font depuis un ticket (🎙️ ou 📤).'}</div>}
      {rows.map(c => <RecordingLine key={c.id} conv={c} showTicket={!ticketId} />)}
    </div>
  )
}
