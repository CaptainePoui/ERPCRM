import { useState, useEffect, useRef } from 'react'
import api from '../services/api'
import { askConfirm } from './Dialog'
import { currentDevice, openMic } from '../utils/audioDevice'

// Voix d'une personne (TASK-055, 2026-10-23 ; Philippe : « dans Employés et dans Contact ») : la personne lit le texte
// devant le micro -> empreinte de sa voix, pour etre reconnue dans les conversations.
// Employe avec un compte : reconnu comme membre de l'equipe ; client : meme voix que celle apprise par « Qui est… ? ».
// 2026-10-24 : decompte 3-2-1, forme d'onde en direct, bouton Fin ; la lecture est verifiee en arriere-plan sur le
// serveur, puis « Vérifier » montre les mots reconnus (vert) et manques (gris) : un clic sur un mot gris fait relire
// sa phrase, qui s'ajoute a la voix.
const C = { border: 'var(--c-border)', muted: 'var(--c-muted)', red: '#DC2626', green: '#16A34A' }
const MAX_FULL = 60, MAX_LINE = 20        // arret automatique (secondes) : lecture complete, phrase relue

// Forme d'onde en direct : le niveau du micro defile de droite a gauche
function Waveform({ stream }) {
  const canvas = useRef(null)
  useEffect(() => {
    const ctx = new AudioContext()
    const an = ctx.createAnalyser(); an.fftSize = 1024
    ctx.createMediaStreamSource(stream).connect(an)
    const buf = new Uint8Array(an.fftSize), levels = []
    let raf
    const draw = () => {
      const cv = canvas.current
      if (cv) {
        const w = cv.clientWidth * devicePixelRatio, h = cv.clientHeight * devicePixelRatio
        if (cv.width !== w) cv.width = w
        if (cv.height !== h) cv.height = h
        an.getByteTimeDomainData(buf)
        let peak = 0
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128))
        levels.push(Math.min(1, peak / 90))
        const bar = 3 * devicePixelRatio, n = Math.floor(w / bar)
        while (levels.length > n) levels.shift()
        const g = cv.getContext('2d')
        g.clearRect(0, 0, w, h)
        g.fillStyle = getComputedStyle(cv).color
        levels.forEach((l, i) => {
          const bh = Math.max(devicePixelRatio, l * h)
          g.fillRect(w - (levels.length - i) * bar, (h - bh) / 2, bar - devicePixelRatio, bh)
        })
      }
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(raf); ctx.close() }
  }, [stream])
  return <canvas ref={canvas} style={{ width: '100%', height: 64, display: 'block', color: 'var(--brand)', marginTop: 10 }} />
}

// Gros decompte au centre de l'ecran avant l'enregistrement
function Countdown({ text }) {
  if (text == null) return null
  const big = typeof text === 'number'
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', background: 'rgba(10,25,41,0.35)' }}>
      <div style={{ fontSize: big ? '30vh' : '6vh', fontWeight: 800, color: big ? '#fff' : C.red, textShadow: '0 4px 24px rgba(0,0,0,0.5)' }}>
        {big ? text : '● Enregistrement en cours'}
      </div>
    </div>
  )
}

export default function VoiceSection({ contactId, name, framed = true }) {
  const [info, setInfo] = useState(null)
  const [lines, setLines] = useState([])
  const [phase, setPhase] = useState('idle')      // idle | countdown | recording | sending
  const [count, setCount] = useState(null)        // 3, 2, 1, puis 'rec' (« Enregistrement en cours »)
  const [target, setTarget] = useState(null)      // null = lecture complete, sinon numero de la phrase relue
  const [stream, setStream] = useState(null)
  const [showCheck, setShowCheck] = useState(false)
  const [msg, setMsg] = useState(null)
  const r = useRef({})
  const load = () => api.get(`/v1/speech/voices/${contactId}`).then(x => setInfo(x.data)).catch(e => setInfo({ error: e.response?.data?.detail || 'Erreur' }))
  useEffect(() => { load() }, [contactId])
  useEffect(() => { api.get('/v1/speech/reading-text').then(x => setLines(x.data.lines)).catch(() => {}) }, [])
  // Fenetre fermee pendant le decompte ou la lecture : on abandonne, rien n'est enregistre
  useEffect(() => () => { r.current.cancelled = true; cleanup() }, [])
  // Verification en cours sur le serveur : on regarde ou elle en est
  const checking = info?.checking || []
  useEffect(() => {
    if (!checking.length) return
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [checking.length])

  function cleanup() {
    r.current.timers?.forEach(clearTimeout)
    clearTimeout(r.current.limit)
    r.current.stream?.getTracks().forEach(t => t.stop())
  }

  async function start(line) {
    setMsg(null); setTarget(line); setShowCheck(false)
    try {
      let device = null
      try { device = await currentDevice() } catch { /* micro par defaut */ }
      const { stream: s } = await openMic(device)
      r.current = { stream: s, timers: [] }
      setStream(s); setPhase('countdown'); setCount(3)
      r.current.timers = [
        setTimeout(() => setCount(2), 1000),
        setTimeout(() => setCount(1), 2000),
        setTimeout(() => record(s, line), 3000),
        setTimeout(() => setCount(null), 3900),
      ]
    } catch (e) {
      setTarget(null)
      setMsg(e.name === 'NotAllowedError' ? 'Le navigateur a refusé le micro.' : (e.message || 'Micro introuvable.'))
    }
  }

  function record(s, line) {
    const mr = new MediaRecorder(s), chunks = []
    mr.ondataavailable = e => e.data.size && chunks.push(e.data)
    mr.onstop = async () => {
      cleanup(); setStream(null)
      if (r.current.cancelled) return
      setPhase('sending'); setMsg('Envoi…')
      const fd = new FormData(); fd.append('audio', new Blob(chunks, { type: mr.mimeType || 'audio/webm' }), 'voix')
      try {
        setInfo((await api.post(`/v1/speech/voices/${contactId}`, fd, { params: line == null ? {} : { line }, timeout: 0 })).data)
        setMsg(line == null ? '✓ Voix enregistrée. La lecture se vérifie sur le serveur.' : '✓ Phrase ajoutée à la voix. Elle se vérifie sur le serveur.')
      } catch (e) { setMsg(e.response?.data?.detail || 'Échec de l\'enregistrement de la voix.') }
      setPhase('idle'); setTarget(null)
      if (line != null) setShowCheck(true)     // retour a la verification apres une phrase relue
    }
    mr.start()
    r.current.mr = mr
    r.current.limit = setTimeout(() => mr.state === 'recording' && mr.stop(), (line == null ? MAX_FULL : MAX_LINE) * 1000)
    setCount('rec'); setPhase('recording')
  }

  function finish() {
    if (phase === 'countdown') { cleanup(); setStream(null); setCount(null); setPhase('idle'); setTarget(null); return }
    if (r.current.mr?.state === 'recording') r.current.mr.stop()
  }

  async function forget() {
    if (!await askConfirm(`Effacer l'empreinte de la voix de ${name} ? Cette personne ne sera plus reconnue dans les prochaines conversations (les conversations déjà transcrites ne changent pas).`)) return
    await api.delete(`/v1/speech/voices/${contactId}`); setMsg(null); setShowCheck(false); load()
  }

  if (info?.error) return <div style={{ fontSize: 13, color: C.muted }}>{info.error}</div>
  const known = info?.enrolled
  const busy = phase !== 'idle'
  const result = info?.check_lines
  const fullChecking = checking.includes(null)
  const total = result ? result.flat().length : 0
  const heard = result ? result.flat().filter(Boolean).length : 0
  const shown = target == null ? lines.map((l, i) => [l, i]) : [[lines[target], target]]
  const big = { fontSize: 'clamp(17px, 1.1vw, 24px)', lineHeight: 1.45, padding: '2% 3%', borderRadius: 8, background: 'var(--c-surface-2)', marginTop: 12 }

  return (
    <div style={framed ? { border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 } : undefined}>
      <style>{'@keyframes voice-pulse { 50% { opacity: .35 } }'}</style>
      <Countdown text={count} />
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>
        {!info ? '…' : known
          ? `Voix connue (mise à jour le ${new Date(info.updated_at).toLocaleDateString('fr-CA', { dateStyle: 'medium' })})${info.team ? ', reconnue comme membre de l\'équipe' : ''}.`
          : 'Voix pas encore connue. Fais lire le texte à voix haute devant le micro, à son rythme, puis Fin. Elle s\'apprend aussi avec « Qui est… ? » dans une conversation.'}
        {info?.conversations > 0 && ` Reconnue dans ${info.conversations} conversation${info.conversations > 1 ? 's' : ''}.`}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {!busy && <>
          <button className="btn-secondary" onClick={() => start(null)} disabled={!lines.length}>🎙️ {known ? 'Réenregistrer la voix' : 'Enregistrer la voix'}</button>
          {result && !fullChecking && !showCheck && <button className="btn-secondary" onClick={() => setShowCheck(true)}>Vérifier</button>}
          {known && <button className="btn-secondary" style={{ color: C.red }} onClick={forget}>Effacer la voix</button>}
        </>}
        {msg && <span style={{ fontSize: 13, color: C.muted }}>{msg}</span>}
      </div>

      {fullChecking && !busy && <div style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>Vérification de la lecture en cours sur le serveur (1 à 2 minutes)… Le bouton Vérifier apparaîtra ensuite.</div>}
      {info?.check_error && !busy && <div style={{ fontSize: 13, color: C.red, marginTop: 8 }}>{info.check_error}</div>}

      {stream && <Waveform stream={stream} />}
      {(phase === 'countdown' || phase === 'recording') && lines.length > 0 && (
        <div style={big}>
          {shown.map(([l, i]) => <p key={i} style={{ margin: '0 0 0.8em' }}>{l}</p>)}
        </div>
      )}
      {/* Fin en bas, sous le texte : on le trouve en terminant la lecture */}
      {(phase === 'countdown' || phase === 'recording') && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
          <button className="btn-secondary" style={{ color: C.red, borderColor: '#FCA5A5', fontWeight: 700 }} onClick={finish}>{phase === 'countdown' ? 'Annuler' : '⏹ Fin'}</button>
          {phase === 'recording' && <span style={{ color: C.red, fontWeight: 600, animation: 'voice-pulse 1.2s infinite' }}>● Enregistrement en cours</span>}
        </div>
      )}

      {showCheck && result && !busy && (
        <div style={big}>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: '1em' }}>
            {heard === total ? '✓ Tous les mots ont été reconnus.' : `${heard} mots reconnus sur ${total}. Clique un mot gris pour relire sa phrase.`}
          </div>
          {lines.map((l, i) => {
            const waiting = checking.includes(i)
            return (
              <p key={i} style={{ margin: '0 0 0.8em', opacity: waiting ? 0.55 : 1 }}>
                {l.split(' ').map((w, j) => {
                  const ok = result[i]?.[j]
                  return <span key={j}>
                    <span onClick={ok || waiting ? undefined : () => start(i)} title={ok || waiting ? undefined : 'Relire cette phrase'}
                      style={{ color: ok ? C.green : C.muted, cursor: ok || waiting ? 'default' : 'pointer', textDecoration: ok ? 'none' : 'underline dotted' }}>{w}</span>{' '}
                  </span>
                })}
                {waiting && <span style={{ fontSize: 13, color: C.muted }}> (vérification…)</span>}
              </p>
            )
          })}
          {/* fin de la verification en bas, sous le texte */}
          <button className="btn-secondary" style={{ fontSize: 13 }} onClick={() => setShowCheck(false)}>Fin de la vérification</button>
        </div>
      )}
    </div>
  )
}
