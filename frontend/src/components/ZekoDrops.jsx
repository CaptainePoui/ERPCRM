// Documents déposés sur Zéko (TASK-006.9, 2026-10-26) : on glisse un fichier (PDF, photo, ZIP, courriel .eml, relevé
// CSV/OFX) sur le bouton Zéko, de n'importe quelle page. Zéko le lit en arrière-plan, reconnaît ce que c'est et propose
// où le placer : « Oui » le fait ; « Autre » relance l'analyse ; à la 2e fois, on lui dit où il va.
// La fenêtre ne se ferme que par ses boutons (Réduire, OK sur chaque ligne).
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import api from '../services/api'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

export async function dropOnZeko(files, path) {
  const fd = new FormData()
  for (const f of files) fd.append('files', f)
  const co = path.match(new RegExp(`^/companies/(${UUID})`))
  const ct = path.match(new RegExp(`^/contacts/(${UUID})`))
  if (co) fd.append('page_company_id', co[1])
  if (ct) fd.append('page_contact_id', ct[1])
  await api.post('/v1/zeko/drops', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  window.dispatchEvent(new Event('zeko-drops'))
}

// Le bouton Zéko accepte les fichiers glissés dessus
export function useZekoDropTarget() {
  const location = useLocation()
  const [over, setOver] = useState(false)
  const [err, setErr] = useState('')
  const props = {
    onDragOver: e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setOver(true) } },
    onDragLeave: () => setOver(false),
    onDrop: async e => {
      e.preventDefault(); setOver(false)
      if (!e.dataTransfer.files.length) return
      setErr('')
      try { await dropOnZeko(e.dataTransfer.files, location.pathname) } catch (x) { setErr(x.response?.data?.detail || 'Dépôt impossible') }
    },
  }
  return { over, err, props }
}

function wait(d) {
  if (d.status === 'pending' && d.queue_position > 1) return `En file (n° ${d.queue_position}, environ ${Math.ceil(d.eta_seconds / 60)} min)`
  return d.status === 'reading' ? 'Zéko lit le document…' : 'Zéko analyse le document…'
}

function Item({ d, onChange }) {
  const navigate = useNavigate()
  const [where, setWhere] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function call(path, body) {
    setBusy(true); setErr('')
    try { await api.post(`/v1/zeko/drops/${d.id}/${path}`, body || {}); setWhere(null); onChange() }
    catch (e) { setErr(e.response?.data?.detail || 'Erreur') } finally { setBusy(false) }
  }
  const other = () => (d.tries >= 1 || d.status === 'failed' ? setWhere('') : call('other'))
  const btn = { fontSize: 12, padding: '4px 12px' }
  return (
    <div style={{ padding: '10px 12px', borderTop: '1px solid var(--c-border)' }}>
      <div style={{ fontSize: 12, color: 'var(--c-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        📄 {d.filename}{d.origin ? ` — ${d.origin}` : ''}
      </div>
      {['pending', 'reading', 'analyzing'].includes(d.status) && <div style={{ fontSize: 13, color: 'var(--c-muted)', marginTop: 4 }}>{wait(d)}</div>}
      {d.status === 'ready' && <div style={{ fontSize: 14, marginTop: 4, color: 'var(--c-text)', lineHeight: 1.45 }}>{d.question}</div>}
      {d.status === 'done' && <div style={{ fontSize: 14, marginTop: 4, color: 'var(--c-on-green)', fontWeight: 600 }}>✓ {d.result?.texte}</div>}
      {d.status === 'failed' && <div style={{ fontSize: 13, marginTop: 4, color: 'var(--c-on-red)' }}>✗ {d.error}</div>}
      {err && <div style={{ fontSize: 13, marginTop: 4, color: 'var(--c-on-red)', fontWeight: 600 }}>{err}</div>}
      {where !== null && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input autoFocus value={where} onChange={e => setWhere(e.target.value)} placeholder="Dis-moi où ça va (ex. dépense, documents de CNJ, carte d'affaires…)"
            onKeyDown={e => { if (e.key === 'Enter' && where.trim()) call('other', { where }) }}
            style={{ flex: 1, minWidth: 0, fontSize: 13, padding: '5px 8px' }} />
          <button className="btn-primary" style={btn} disabled={busy || !where.trim()} onClick={() => call('other', { where })}>Envoyer</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {d.status === 'ready' && where === null && <>
          <button className="btn-secondary" style={btn} disabled={busy} onClick={() => call('dismiss')}>Ignorer</button>
          <button className="btn-secondary" style={btn} disabled={busy} onClick={other} title={d.tries >= 1 ? 'Tu me dis où il va' : 'Zéko refait l\'analyse'}>Autre</button>
          {d.can_accept && <button className="btn-primary" style={btn} disabled={busy} onClick={() => call('accept')}>{busy ? '…' : 'Oui'}</button>}
        </>}
        {d.status === 'failed' && where === null && <>
          <button className="btn-secondary" style={btn} disabled={busy} onClick={() => call('dismiss')}>OK</button>
          <button className="btn-secondary" style={btn} disabled={busy} onClick={other}>Dire où il va</button>
        </>}
        {d.status === 'done' && <>
          {d.result?.chemin && <button className="btn-secondary" style={btn} onClick={() => navigate(d.result.chemin)}>Ouvrir</button>}
          <button className="btn-primary" style={btn} disabled={busy} onClick={() => call('dismiss')}>OK</button>
        </>}
      </div>
    </div>
  )
}

// Fenêtre des documents déposés (en bas à droite, ne bloque pas la page)
export default function ZekoDropPopup() {
  const [list, setList] = useState([])
  const [small, setSmall] = useState(false)
  const timer = useRef(null)
  async function load() {
    try {
      const r = await api.get('/v1/zeko/drops')
      setList(r.data)
    } catch { /* hors ligne : on réessaie */ }
  }
  useEffect(() => {
    load()
    const on = () => { setSmall(false); load() }
    window.addEventListener('zeko-drops', on)
    return () => window.removeEventListener('zeko-drops', on)
  }, [])
  const working = list.some(d => ['pending', 'reading', 'analyzing'].includes(d.status))
  useEffect(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(load, working ? 3000 : 15000)
    return () => clearTimeout(timer.current)
  }, [list])
  if (!list.length) return null
  const ready = list.filter(d => d.status === 'ready').length
  if (small) return (
    <button onClick={() => setSmall(false)} style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1300, borderRadius: 20, padding: '8px 14px', border: '1px solid var(--brand)',
      background: 'var(--c-surface)', color: 'var(--brand)', fontWeight: 700, cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,.25)' }}>
      Z  Documents : {list.length}{ready ? ` (${ready} à décider)` : ''}
    </button>
  )
  return (
    <div style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1300, width: 'min(520px, calc(100vw - 32px))', maxHeight: '70vh', display: 'flex', flexDirection: 'column',
                  background: 'var(--c-surface)', border: '1px solid var(--c-border-strong)', borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,.35)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}>
        <span style={{ width: 24, height: 24, borderRadius: 12, background: 'var(--brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>Z</span>
        <div style={{ flex: 1, fontWeight: 700, color: 'var(--c-text)' }}>Zéko — documents déposés</div>
        <button className="btn-secondary" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => setSmall(true)}>Réduire</button>
      </div>
      <div style={{ overflowY: 'auto' }}>{list.map(d => <Item key={d.id} d={d} onChange={load} />)}</div>
    </div>
  )
}
