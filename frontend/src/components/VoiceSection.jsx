import { useState, useEffect, useRef } from 'react'
import api from '../services/api'
import { askConfirm } from './Dialog'
import { currentDevice, openMic } from '../utils/audioDevice'

// Voix d'une personne (TASK-055, 2026-10-23 ; Philippe : « dans Employés et dans Contact ») : la personne lit le texte
// devant le micro a son rythme (jusqu'a 2 min) -> empreinte de sa voix, pour etre reconnue dans les conversations.
// Employe avec un compte : reconnu comme membre de l'equipe ; client : meme voix que celle apprise par « Qui est… ? ».
const C = { border: 'var(--c-border)', muted: 'var(--c-muted)', red: '#DC2626' }
// Une phrase par ligne, en gros caracteres : plus facile a lire a voix haute sans se tromper
const READ_LINES = [
  "Bonjour, ici c'est moi qui parle.",
  "J'enregistre ma voix pour qu'ERPCRM la reconnaisse dans les conversations avec les clients.",
  "Je lis ce texte lentement, comme je parle d'habitude au téléphone ou chez un client.",
  "Le technicien passera jeudi matin vers dix heures pour vérifier le portier, le poste de la réception et la boîte vocale.",
  "Si le problème revient, rappelez-nous au service technique.",
  "Pour la facture du mois dernier, je vais vérifier le paiement reçu par Interac.",
  "Je vous envoie un reçu par courriel dès aujourd'hui.",
  "Le nouveau téléphone sera installé lundi.",
  "Je reviendrai mardi après-midi pour configurer les postes et montrer comment transférer un appel.",
  "Merci et bonne journée.",
]
const MIN_SECS = 20, MAX_SECS = 120
const fmtSecs = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
export default function VoiceSection({ contactId, name, framed = true }) {
  const [info, setInfo] = useState(null)
  const [secs, setSecs] = useState(null)        // null = pas en cours
  const [msg, setMsg] = useState(null)
  const r = useRef({})
  const load = () => api.get(`/v1/speech/voices/${contactId}`).then(x => setInfo(x.data)).catch(e => setInfo({ error: e.response?.data?.detail || 'Erreur' }))
  useEffect(() => { load() }, [contactId])
  useEffect(() => () => { clearInterval(r.current.timer); r.current.mr?.stream.getTracks().forEach(t => t.stop()) }, [])
  async function start() {
    setMsg(null)
    try {
      let device = null
      try { device = await currentDevice() } catch { /* micro par defaut */ }
      const { stream } = await openMic(device)
      const mr = new MediaRecorder(stream), chunks = []
      mr.ondataavailable = e => e.data.size && chunks.push(e.data)
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop()); setSecs(null); setMsg('Analyse de la voix…')
        const fd = new FormData(); fd.append('audio', new Blob(chunks, { type: mr.mimeType || 'audio/webm' }), 'voix')
        try { setInfo((await api.post(`/v1/speech/voices/${contactId}`, fd)).data); setMsg('✓ Voix enregistrée.') }
        catch (e) { setMsg(e.response?.data?.detail || 'Échec de l\'enregistrement de la voix.') }
      }
      mr.start(); setSecs(0)
      r.current = { mr, timer: setInterval(() => setSecs(s => { if (s + 1 >= MAX_SECS) { clearInterval(r.current.timer); mr.stop() } return s + 1 }), 1000) }
    } catch (e) { setMsg(e.name === 'NotAllowedError' ? 'Le navigateur a refusé le micro.' : (e.message || 'Micro introuvable.')) }
  }
  function stop() { clearInterval(r.current.timer); r.current.mr.stop() }
  async function forget() {
    if (!await askConfirm(`Effacer l'empreinte de la voix de ${name} ? Cette personne ne sera plus reconnue dans les prochaines conversations (les conversations déjà transcrites ne changent pas).`)) return
    await api.delete(`/v1/speech/voices/${contactId}`); setMsg(null); load()
  }
  if (info?.error) return <div style={{ fontSize: 13, color: C.muted }}>{info.error}</div>
  const known = info?.enrolled
  return (
    <div style={framed ? { border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 } : undefined}>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>
        {!info ? '…' : known
          ? `Voix connue (mise à jour le ${new Date(info.updated_at).toLocaleDateString('fr-CA', { dateStyle: 'medium' })})${info.team ? ', reconnue comme membre de l\'équipe' : ''}.`
          : 'Voix pas encore connue. Fais lire le texte à voix haute devant le micro, à son rythme, puis Terminer. Elle s\'apprend aussi avec « Qui est… ? » dans une conversation.'}
        {info?.conversations > 0 && ` Reconnue dans ${info.conversations} conversation${info.conversations > 1 ? 's' : ''}.`}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {secs === null
          ? <><button className="btn-secondary" onClick={start}>🎙️ {known ? 'Réenregistrer la voix' : 'Enregistrer la voix'}</button>
            {known && <button className="btn-secondary" style={{ color: C.red }} onClick={forget}>Effacer la voix</button>}</>
          : <button className="btn-secondary" style={{ color: C.red }} disabled={secs < MIN_SECS} onClick={stop}>⏹ {secs < MIN_SECS ? `Continue de lire… ${fmtSecs(secs)}` : `Terminer · ${fmtSecs(secs)} / ${fmtSecs(MAX_SECS)}`}</button>}
        {msg && <span style={{ fontSize: 13, color: C.muted }}>{msg}</span>}
      </div>
      {secs !== null && <div style={{ fontSize: 21, lineHeight: 1.45, padding: '16px 20px', borderRadius: 8, background: 'var(--c-surface-2)', marginTop: 12, maxWidth: 760 }}>
        {READ_LINES.map((l, i) => <p key={i} style={{ margin: '0 0 18px', overflowWrap: 'anywhere' }}>{l}</p>)}</div>}
    </div>
  )
}
