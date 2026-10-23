import api from '../services/api'

// Appareils audio (TASK-055, 2026-10-23) : cet appareil (ordi, tablette, cell) s'inscrit une fois sous un nom ; le
// micro a utiliser se choisit dans Administration > Configuration > Appareils audio. Un navigateur ne voit que ses
// propres micros : il envoie sa liste au serveur a chaque utilisation.
const KEY = 'erpcrm.audioDevice'

export function localDeviceId() {
  try { return localStorage.getItem(KEY) } catch { return null }
}
function setLocalDeviceId(id) {
  try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY) } catch { /* stockage bloque */ }
}

// Micros de cet appareil (sans les pseudo-entrees « default »/« communications » de Chrome : « par defaut » est un choix a part)
export async function listMics() {
  const all = await navigator.mediaDevices.enumerateDevices()
  return all.filter(d => d.kind === 'audioinput' && !['default', 'communications'].includes(d.deviceId))
    .map(d => ({ id: d.deviceId, label: d.label || 'Micro' }))
}

// Fiche de cet appareil au serveur, ou null s'il n'est pas (ou plus) inscrit
export async function currentDevice() {
  const id = localDeviceId()
  if (!id) return null
  try { return (await api.get(`/v1/speech/devices/${id}`)).data }
  catch (e) {
    if ([403, 404].includes(e.response?.status)) { setLocalDeviceId(null); return null }
    throw e
  }
}

export async function registerDevice(name) {
  let mics = []
  try { mics = await listMics() } catch { /* liste vide avant la permission du micro */ }
  const d = (await api.post('/v1/speech/devices', { name, mics })).data
  setLocalDeviceId(d.id)
  return d
}

// Ouvre le micro choisi pour cet appareil ; s'il est absent, celui par defaut (signale au serveur et a l'appelant)
export async function openMic(device) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Ce navigateur ne donne pas accès au micro (page non sécurisée ?).')
  let stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const mics = await listMics()
  let fellBack = false
  if (device?.selected_mic_id) {
    const target = mics.find(m => m.id === device.selected_mic_id) || mics.find(m => m.label && m.label === device.selected_mic_label)
    if (!target) fellBack = true
    else if (stream.getAudioTracks()[0]?.getSettings().deviceId !== target.id) {
      stream.getTracks().forEach(t => t.stop())
      stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: target.id } } })
    }
  }
  const usedLabel = stream.getAudioTracks()[0]?.label || null
  if (device) api.post(`/v1/speech/devices/${device.id}/report`, { mics, used_label: usedLabel, fell_back: fellBack }).catch(() => {})
  return { stream, fellBack, usedLabel }
}
