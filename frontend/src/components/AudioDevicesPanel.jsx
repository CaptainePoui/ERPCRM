import { useState, useEffect, useRef } from 'react'
import api from '../services/api'
import { askConfirm } from './Dialog'
import { localDeviceId, openMic, currentDevice } from '../utils/audioDevice'

// Administration > Configuration > Appareils audio (TASK-055, 2026-10-23) : le micro de chaque appareil (« Ordi de
// Phil », « Cell de Phil »…), choisi depuis n'importe lequel. La liste des micros est celle que l'appareil a vue a sa
// derniere utilisation ; le test de niveau ne marche que sur l'appareil ou l'on est.
const C = { border: 'var(--c-border)', muted: 'var(--c-muted)', red: '#DC2626', amber: '#B45309' }

function seen(iso) {
  if (!iso) return 'jamais utilisé'
  return 'utilisé le ' + new Date(iso).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' })
}

function LevelMeter({ device }) {
  const [on, setOn] = useState(false)
  const [level, setLevel] = useState(0)
  const [info, setInfo] = useState(null)
  const stop = useRef(null)
  useEffect(() => () => stop.current?.(), [])
  async function toggle() {
    if (on) { stop.current?.(); return }
    try {
      const { stream, fellBack, usedLabel } = await openMic(device)
      setInfo(fellBack ? `Micro choisi absent : ${usedLabel || 'micro par défaut'}` : usedLabel)
      const ctx = new AudioContext()
      const an = ctx.createAnalyser(); an.fftSize = 512
      ctx.createMediaStreamSource(stream).connect(an)
      const buf = new Uint8Array(an.fftSize)
      let raf
      const tick = () => {
        an.getByteTimeDomainData(buf)
        let peak = 0
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128))
        setLevel(Math.min(1, peak / 64)); raf = requestAnimationFrame(tick)
      }
      tick(); setOn(true)
      stop.current = () => { cancelAnimationFrame(raf); stream.getTracks().forEach(t => t.stop()); ctx.close(); setOn(false); setLevel(0); stop.current = null }
    } catch (e) { setInfo(e.name === 'NotAllowedError' ? 'Le navigateur a refusé le micro.' : (e.message || 'Micro introuvable.')) }
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
      <button className="btn-secondary" style={{ fontSize: 12, padding: '3px 10px' }} onClick={toggle}>{on ? 'Arrêter le test' : 'Tester le micro'}</button>
      {on && <div style={{ flex: '1 1 120px', maxWidth: 240, height: 8, borderRadius: 4, background: 'var(--c-surface-3)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.round(level * 100)}%`, height: '100%', background: level > 0.85 ? C.red : '#16A34A', transition: 'width 60ms' }} /></div>}
      {info && <span style={{ fontSize: 12, color: C.muted, overflowWrap: 'anywhere' }}>{info}</span>}
    </div>
  )
}

function DeviceRow({ d, here, onChanged }) {
  const [name, setName] = useState(d.name)
  const [error, setError] = useState(null)
  const known = d.mics || []
  const missing = d.selected_mic_id && !known.some(m => m.id === d.selected_mic_id)
  async function put(body) {
    setError(null)
    try { await api.put(`/v1/speech/devices/${d.id}`, body); onChanged() }
    catch (e) { setError(e.response?.data?.detail || 'Erreur') }
  }
  function chooseMic(id) {
    const m = known.find(x => x.id === id)
    put({ selected_mic_id: id || null, selected_mic_label: m?.label || null })
  }
  async function remove() {
    if (!await askConfirm(`Retirer l'appareil « ${d.name} » ? Il redemandera son nom à sa prochaine dictée.`)) return
    await api.delete(`/v1/speech/devices/${d.id}`); onChanged()
  }
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ flex: '1 1 200px', minWidth: 0, marginBottom: 0 }}>
          <label>Appareil {here && <span style={{ color: 'var(--brand)', textTransform: 'none' }}>· celui-ci</span>}</label>
          <input value={name} onChange={e => setName(e.target.value)} onBlur={() => name.trim() && name.trim() !== d.name && put({ name: name.trim() })} />
        </div>
        <div className="form-group" style={{ flex: '2 1 260px', minWidth: 0, marginBottom: 0 }}>
          <label>Micro</label>
          <select value={d.selected_mic_id || ''} onChange={e => chooseMic(e.target.value)}>
            <option value="">Micro par défaut de l'appareil</option>
            {known.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            {missing && <option value={d.selected_mic_id}>{d.selected_mic_label || 'Micro choisi'} (absent)</option>}
          </select>
        </div>
        <button className="btn-secondary" style={{ color: C.red }} onClick={remove}>Retirer</button>
      </div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 6, overflowWrap: 'anywhere' }}>
        {d.owner ? `${d.owner} · ` : ''}{seen(d.last_seen_at)}{d.last_mic_label ? ` · dernier micro : ${d.last_mic_label}` : ''}
      </div>
      {d.fell_back && <div style={{ fontSize: 12, color: C.amber, marginTop: 4 }}>Le micro choisi n'était pas branché à la dernière utilisation : le micro par défaut a servi.</div>}
      {known.length === 0 && <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Liste des micros pas encore reçue : elle arrive à la première dictée sur cet appareil.</div>}
      {here && <LevelMeter device={d} />}
      {error && <div style={{ color: C.red, fontSize: 13, marginTop: 6 }}>{error}</div>}
    </div>
  )
}

// Ma voix (TASK-055 etape 3) : 30 s de lecture a voix haute -> empreinte de la voix, pour etre reconnu dans les conversations
const READ_TEXT = "Bonjour, ici c'est moi qui parle. J'enregistre ma voix pour qu'ERPCRM la reconnaisse dans les conversations avec les clients. " +
  "Je lis ce texte lentement, comme je parle d'habitude au téléphone ou chez un client. Le technicien passera jeudi matin vers dix heures " +
  "pour vérifier le portier, le poste de la réception et la boîte vocale. Si le problème revient, rappelez-nous au service technique. Merci et bonne journée."
function MyVoice() {
  const [info, setInfo] = useState(null)
  const [secs, setSecs] = useState(null)        // null = pas en cours
  const [msg, setMsg] = useState(null)
  const r = useRef({})
  const load = () => api.get('/v1/speech/my-voice').then(x => setInfo(x.data))
  useEffect(() => { load(); return () => { clearInterval(r.current.timer); r.current.mr?.stream.getTracks().forEach(t => t.stop()) } }, [])
  async function start() {
    setMsg(null)
    try {
      let device = null
      try { device = await currentDevice() } catch { /* micro par defaut */ }
      const { stream } = await openMic(device)
      const mr = new MediaRecorder(stream), chunks = []
      mr.ondataavailable = e => e.data.size && chunks.push(e.data)
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop()); setSecs(null); setMsg('Analyse de ta voix…')
        const fd = new FormData(); fd.append('audio', new Blob(chunks, { type: mr.mimeType || 'audio/webm' }), 'ma-voix')
        try { await api.post('/v1/speech/my-voice', fd); setMsg('✓ Ta voix est enregistrée.'); load() }
        catch (e) { setMsg(e.response?.data?.detail || 'Échec de l\'enregistrement de ta voix.') }
      }
      mr.start(); setSecs(0)
      r.current = { mr, timer: setInterval(() => setSecs(s => { if (s + 1 >= 30) { clearInterval(r.current.timer); mr.stop() } return s + 1 }), 1000) }
    } catch (e) { setMsg(e.name === 'NotAllowedError' ? 'Le navigateur a refusé le micro.' : (e.message || 'Micro introuvable.')) }
  }
  function stop() { clearInterval(r.current.timer); r.current.mr.stop() }
  async function forget() {
    if (!await askConfirm('Effacer l\'empreinte de ta voix ? Tu ne seras plus reconnu dans les prochaines conversations.')) return
    await api.delete('/v1/speech/my-voice'); setMsg(null); load()
  }
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, marginBottom: 20 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Ma voix</div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>
        {info?.enrolled ? `Enregistrée le ${new Date(info.updated_at).toLocaleDateString('fr-CA', { dateStyle: 'medium' })} : tu es reconnu dans les conversations enregistrées.`
          : 'Pas encore enregistrée. Lis le texte à voix haute pendant 30 secondes : tu seras ensuite reconnu dans les conversations enregistrées.'}
      </div>
      {secs !== null && <div style={{ fontSize: 15, lineHeight: 1.6, padding: 10, borderRadius: 8, background: 'var(--c-surface-2)', marginBottom: 10 }}>{READ_TEXT}</div>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {secs === null
          ? <><button className="btn-secondary" onClick={start}>🎙️ {info?.enrolled ? 'Réenregistrer ma voix' : 'Enregistrer ma voix'}</button>
            {info?.enrolled && <button className="btn-secondary" style={{ color: C.red }} onClick={forget}>Effacer ma voix</button>}</>
          : <button className="btn-secondary" style={{ color: C.red }} disabled={secs < 20} onClick={stop}>⏹ {secs < 20 ? `Lis encore… ${30 - secs} s` : `Terminer (${30 - secs} s)`}</button>}
        {msg && <span style={{ fontSize: 13, color: C.muted }}>{msg}</span>}
      </div>
    </div>
  )
}

export default function AudioDevicesPanel() {
  const [rows, setRows] = useState(null)
  const here = localDeviceId()
  async function load() { setRows((await api.get('/v1/speech/devices')).data) }
  useEffect(() => { load() }, [])
  return (
    <div>
      <div className="adm-panel-header"><span className="adm-count">Appareils audio</span></div>
      <MyVoice />
      <p style={{ color: C.muted, fontSize: 13, marginBottom: 16 }}>
        Chaque appareil qui dicte (🎙️) s'inscrit une fois sous un nom. Choisis ici le micro de chacun ; l'appareil l'utilise à sa prochaine dictée.
        Un appareil ne voit que ses propres micros : la liste est celle qu'il a vue la dernière fois. La voix est transcrite sur ton serveur, rien ne sort.
      </p>
      {rows === null ? <div style={{ color: C.muted }}>Chargement…</div>
        : rows.length === 0 ? <div style={{ color: C.muted, fontSize: 13 }}>Aucun appareil encore. Touche 🎙️ dans Zéko sur un appareil pour l'inscrire.</div>
        : rows.map(d => <DeviceRow key={d.id + d.selected_mic_id + d.last_seen_at} d={d} here={d.id === here} onChanged={load} />)}
    </div>
  )
}
