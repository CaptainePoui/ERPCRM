// Rappels de chrono de ticket actif (TASK-006.5, 2026-10-17) : son + notification du navigateur.
// Limites des navigateurs : le son ne joue qu'après un premier clic dans la page (règle anti-lecture automatique),
// et la notification demande l'autorisation une fois.

let ctx = null

export function playReminder(volume = 60) {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()
    const gain = Math.max(0, Math.min(1, volume / 100)) * 0.5
    ;[0, 0.28].forEach((at, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = i ? 1046 : 784
      g.gain.setValueAtTime(0, ctx.currentTime + at)
      g.gain.linearRampToValueAtTime(gain, ctx.currentTime + at + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.25)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + at)
      o.stop(ctx.currentTime + at + 0.26)
    })
  } catch { /* pas de son possible dans ce navigateur */ }
}

export function notificationState() {
  return typeof Notification === 'undefined' ? 'indisponible' : Notification.permission
}

export async function askNotificationPermission() {
  if (typeof Notification === 'undefined') return 'indisponible'
  if (Notification.permission === 'default') {
    try { return await Notification.requestPermission() } catch { return Notification.permission }
  }
  return Notification.permission
}

export function showNotification(title, body, onClick) {
  if (notificationState() !== 'granted') return
  try {
    const n = new Notification(title, { body, tag: title })
    n.onclick = () => { window.focus(); onClick && onClick(); n.close() }
  } catch { /* ignoré */ }
}

export function fmtSince(secs) {
  const m = Math.floor(secs / 60), h = Math.floor(m / 60)
  return h ? `${h} h ${String(m % 60).padStart(2, '0')}` : `${m} min`
}
