// Fenêtre Zéko à part (TASK-006.7, 2026-10-24 ; Philippe : « une fenêtre à part pour pouvoir la mettre dans un autre
// écran, et qu'il travaille dans ERPCRM ») : quand Zéko ouvre une page, elle s'affiche dans la fenêtre ERPCRM
// utilisée en dernier (pas dans la fenêtre de Zéko). Si aucune n'est ouverte, une nouvelle s'ouvre.
const CHANNEL = 'erpcrm-zeko'
const LAST_MAIN = 'erpcrm-fenetre-principale'
const tabId = Math.random().toString(36).slice(2)

function channel() {
  try { return new BroadcastChannel(CHANNEL) } catch { return null }
}

// Fenêtre ERPCRM principale : se signale quand on l'utilise, et ouvre les pages demandées par Zéko
export function listenForZeko(navigate) {
  const mark = () => { try { localStorage.setItem(LAST_MAIN, tabId) } catch { /* sans stockage */ } }
  if (document.hasFocus()) mark()
  window.addEventListener('focus', mark)
  const ch = channel()
  if (ch) ch.onmessage = e => {
    if (e.data?.type !== 'ouvrir') return
    let last = null
    try { last = localStorage.getItem(LAST_MAIN) } catch { /* sans stockage */ }
    if (last && last !== tabId) return             // une autre fenêtre ERPCRM a servi plus récemment
    navigate(e.data.chemin)
    ch.postMessage({ type: 'ouvert', id: e.data.id })
  }
  return () => { window.removeEventListener('focus', mark); ch?.close() }
}

// Depuis la fenêtre de Zéko : ouvrir une page dans la fenêtre ERPCRM
export function openInMain(chemin) {
  const ch = channel()
  if (!ch) { window.open(chemin, 'erpcrm-principale'); return }
  const id = Math.random().toString(36).slice(2)
  const timer = setTimeout(() => { ch.close(); window.open(chemin, 'erpcrm-principale') }, 1500)
  ch.onmessage = e => { if (e.data?.type === 'ouvert' && e.data.id === id) { clearTimeout(timer); ch.close() } }
  ch.postMessage({ type: 'ouvrir', chemin, id })
}

export function openZekoWindow() {
  const w = Math.round(window.screen.availWidth * 0.4), h = Math.round(window.screen.availHeight * 0.85)
  window.open('/zeko', 'zeko', `popup,width=${w},height=${h}`)
}
