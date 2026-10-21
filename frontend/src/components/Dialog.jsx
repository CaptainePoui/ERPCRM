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

// Choix a plusieurs boutons : askChoice('message', [['cancel', 'Annuler'], ['custom', 'Personnaliser'], ['ok', 'OK']])
// -> la cle du bouton clique ('cancel' avec Echap). Le dernier bouton est le bouton principal (Entree).
export function askChoice(message, buttons, opts = {}) {
  return open({ kind: 'choice', message, buttons, ...opts })
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
    if (cur.kind === 'choice') v = v === true ? cur.buttons[cur.buttons.length - 1][0] : v === false ? 'cancel' : v
    cur.resolve(cur.kind === 'confirm' || cur.kind === 'choice' ? v : undefined)
    setItems(list => list.slice(1))
  }
  if (!cur) return null
  const danger = cur.danger ?? (cur.kind === 'confirm' && DANGER.test(cur.message))
  const lines = String(cur.message).split('\n')
  return (
    <div className="modal-overlay" style={{ zIndex: 5000 }}>
      <div className="modal-box" role="dialog" aria-modal="true" style={{ width: 'min(460px, 92vw)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--c-text)', textAlign: 'center' }}>
          {lines.map((l, i) => <div key={i} style={i === 0 && lines.length > 1 ? { fontWeight: 600 } : undefined}>{l || '\u00a0'}</div>)}
        </div>
        <div className="modal-actions" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
          {cur.kind === 'choice' ? cur.buttons.map(([k, l], i) => (
            <button key={k} autoFocus={i === cur.buttons.length - 1} className={i === cur.buttons.length - 1 ? 'btn-primary' : 'btn-secondary'} onClick={() => close(k)}>{l}</button>
          )) : <>
            {cur.kind === 'confirm' && <button className="btn-secondary" onClick={() => close(false)}>{cur.cancelLabel || 'Annuler'}</button>}
            <button autoFocus className={danger ? 'btn-danger' : 'btn-primary'} onClick={() => close(true)}>{cur.okLabel || 'OK'}</button>
          </>}
        </div>
      </div>
    </div>
  )
}
