import { useEffect, useState } from 'react'

// Fenetres de confirmation et d'avis d'ERPCRM (2026-10-16) : remplacent confirm() / alert() du navigateur, que le
// navigateur place en haut avec « portail.simpleip.tel indique » et ses propres couleurs (Philippe : « mets la fenêtre
// avec les couleurs de Simple IP au milieu de l'écran »). Utilisation : if (!(await askConfirm('…'))) return ;
// showAlert('…'). <DialogHost /> est monte une fois a la racine de l'application.

let push = null
const queue = []

function open(d) {
  return new Promise(resolve => {
    const item = { ...d, resolve }
    if (push) push(item); else queue.push(item)
  })
}

export function askConfirm(message, opts = {}) {
  return open({ kind: 'confirm', message, ...opts })
}

export function showAlert(message, opts = {}) {
  return open({ kind: 'alert', message: typeof message === 'string' ? message : String(message ?? ''), ...opts })
}

const DANGER = /supprim|retir|annul|effac|arr[eê]t|d[eé]sactiv|rejet/i

export default function DialogHost() {
  const [items, setItems] = useState([])
  useEffect(() => {
    push = item => setItems(list => [...list, item])
    if (queue.length) setItems(list => [...list, ...queue.splice(0)])
    return () => { push = null }
  }, [])
  const cur = items[0]
  useEffect(() => {
    if (!cur) return
    const onKey = e => {
      if (e.key === 'Escape') close(false)
      if (e.key === 'Enter') { e.preventDefault(); close(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cur])
  function close(v) {
    if (!cur) return
    cur.resolve(cur.kind === 'confirm' ? v : undefined)
    setItems(list => list.slice(1))
  }
  if (!cur) return null
  const danger = cur.danger ?? (cur.kind === 'confirm' && DANGER.test(cur.message))
  const lines = String(cur.message).split('\n')
  return (
    <div className="modal-overlay" style={{ zIndex: 5000 }}>
      <div className="modal-box" role="dialog" aria-modal="true" style={{ width: 'min(460px, 92vw)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: '0 0 36px', height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18,
            background: danger ? 'rgba(220,38,38,.15)' : cur.kind === 'alert' ? 'rgba(37,99,235,.15)' : 'rgba(37,99,235,.15)', color: danger ? '#DC2626' : 'var(--brand)' }}>
            {danger ? '!' : cur.kind === 'alert' ? 'i' : '?'}
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--c-text)', paddingTop: 6 }}>
            {lines.map((l, i) => <div key={i} style={i === 0 && lines.length > 1 ? { fontWeight: 600 } : undefined}>{l || ' '}</div>)}
          </div>
        </div>
        <div className="modal-actions">
          {cur.kind === 'confirm' && <button className="btn-secondary" onClick={() => close(false)}>{cur.cancelLabel || 'Annuler'}</button>}
          <button autoFocus className={danger ? 'btn-danger' : 'btn-primary'} onClick={() => close(true)}>{cur.okLabel || 'OK'}</button>
        </div>
      </div>
    </div>
  )
}
