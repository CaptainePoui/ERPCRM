import { useState, useRef, useEffect } from 'react'
import api from '../services/api'
import { currentDevice, registerDevice, openMic } from '../utils/audioDevice'

// Dictee (TASK-055, 2026-10-23) : enregistre la voix avec le micro choisi pour cet appareil, la transcrit sur le
// serveur (rien ne sort) et rend le texte a onText. Premiere fois sur un appareil : on lui donne un nom.
function fmt(s) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

export function NameDeviceModal({ onClose, onDone }) {
  const [name, setName] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  async function save() {
    setSaving(true); setError(null)
    try { onDone(await registerDevice(name.trim())) }
    catch (e) { setError(e.response?.data?.detail || 'Erreur'); setSaving(false) }
  }
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 420, width: '100%' }}>
        <h3 className="modal-title">Nommer cet appareil</h3>
        <div style={{ fontSize: 13, color: 'var(--c-muted)', marginBottom: 12 }}>
          Une seule fois par appareil. Son micro se choisit ensuite dans Administration › Configuration › Appareils audio.
        </div>
        <div className="form-group"><label>Nom</label>
          <input value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="ex. Ordi de Phil, Cell de Phil"
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) save() }} /></div>
        {error && <div style={{ color: '#DC2626', fontSize: 13 }}>{error}</div>}
        <div className="modal-actions" style={{ flexWrap: 'wrap' }}>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving || !name.trim()}>Enregistrer</button>
        </div>
      </div>
    </div>
  )
}

export default function MicButton({ onText, style }) {
  const [state, setState] = useState('idle')        // idle | recording | transcribing
  const [secs, setSecs] = useState(0)
  const [naming, setNaming] = useState(false)
  const [notice, setNotice] = useState(null)
  const rec = useRef(null)
  const timer = useRef(null)

  useEffect(() => () => { clearInterval(timer.current); rec.current?.stream.getTracks().forEach(t => t.stop()) }, [])

  async function start(device) {
    setNotice(null)
    try {
      const { stream, fellBack } = await openMic(device)
      if (fellBack) setNotice('Le micro choisi pour cet appareil est absent : micro par défaut utilisé.')
      const chunks = []
      const mr = new MediaRecorder(stream)
      mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
      mr.onstop = () => send(new Blob(chunks, { type: mr.mimeType || 'audio/webm' }))
      mr.start()
      rec.current = mr
      setSecs(0); setState('recording')
      timer.current = setInterval(() => setSecs(s => s + 1), 1000)
    } catch (e) {
      setNotice(e.name === 'NotAllowedError' ? 'Le navigateur a refusé le micro : autorise-le dans les réglages du site.' : (e.message || 'Micro introuvable.'))
    }
  }

  async function click() {
    if (state === 'recording') {
      clearInterval(timer.current)
      rec.current.stop()
      rec.current.stream.getTracks().forEach(t => t.stop())
      setState('transcribing')
      return
    }
    if (state !== 'idle') return
    let device = null, reachable = true
    try { device = await currentDevice() } catch { reachable = false }   // serveur injoignable : micro par defaut
    if (!device && reachable && !localStorageBlocked()) { setNaming(true); return }
    start(device)
  }

  async function send(blob) {
    const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm'
    const fd = new FormData()
    fd.append('audio', blob, `dictee.${ext}`)
    try {
      const r = await api.post('/v1/speech/transcribe', fd, { timeout: 0 })
      if (r.data.text) onText(r.data.text)
      else setNotice('Aucune parole reconnue.')
    } catch (e) {
      setNotice(e.response?.data?.detail || 'La transcription a échoué.')
    } finally { setState('idle') }
  }

  const label = state === 'recording' ? `⏹ ${fmt(secs)}` : state === 'transcribing' ? 'Transcription…' : '🎙️'
  const title = state === 'recording' ? 'Arrêter et transcrire' : state === 'transcribing' ? 'Transcription sur le serveur (environ 30 s par phrase sur le serveur actuel)' : 'Dicter'
  return (
    <>
      <button type="button" className="btn-secondary" onClick={click} disabled={state === 'transcribing'} title={title}
        style={{ whiteSpace: 'nowrap', ...(state === 'recording' ? { color: '#DC2626', borderColor: '#FCA5A5' } : {}), ...style }}>{label}</button>
      {notice && <div style={{ fontSize: 11, color: 'var(--c-muted)', maxWidth: 220 }}>{notice}</div>}
      {naming && <NameDeviceModal onClose={() => setNaming(false)} onDone={d => { setNaming(false); start(d) }} />}
    </>
  )
}

// Sans stockage local (navigation privee), on ne peut pas retenir l'appareil : on enregistre avec le micro par defaut
export function localStorageBlocked() {
  try { localStorage.setItem('erpcrm.t', '1'); localStorage.removeItem('erpcrm.t'); return false } catch { return true }
}
