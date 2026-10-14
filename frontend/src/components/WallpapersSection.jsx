// Fonds d'écran (TASK-051, 2026-10-14) : ceux d'une compagnie (numéro de compte) ou les Global Simple IP (accountNumber
// vide, page Serveur). Une vignette par fond, « par défaut » par taille d'écran (les postes sans choix le prennent ; sans
// fond de compagnie, le Global), recadrer, supprimer ; dépôt d'une image (glisser ou choisir) qui ouvre l'éditeur.
import { useEffect, useState } from 'react'
import api from '../services/api'
import WallpaperEditor, { SCREENS } from './WallpaperEditor'

const thumbs = new Map()
export function WallpaperThumb({ w, height = 90 }) {
  const key = w ? `${w.id}:${w.updated_at}` : null
  const [url, setUrl] = useState(key ? thumbs.get(key) : null)
  useEffect(() => {
    if (!key || thumbs.has(key)) { setUrl(key ? thumbs.get(key) : null); return }
    api.get(`/v1/telephony/wallpapers/${w.id}/image`, { responseType: 'blob' })
      .then(r => { const u = URL.createObjectURL(r.data); thumbs.set(key, u); setUrl(u) }).catch(() => {})
  }, [key])   // eslint-disable-line
  if (!w) return null
  const [W, H] = w.resolution.split('x').map(Number)
  return <div style={{ height, width: Math.round(height * W / H), borderRadius: 6, background: url ? `center/cover url(${url})` : 'var(--c-surface-3)', border: '1px solid var(--c-border)', flex: 'none' }} />
}

export function useWallpapers(accountNumber, refreshKey) {
  const [list, setList] = useState(null)
  useEffect(() => {
    api.get('/v1/telephony/wallpapers', { params: accountNumber ? { account: accountNumber } : {} }).then(r => setList(r.data)).catch(() => setList([]))
  }, [accountNumber, refreshKey])
  return list
}

// Choix d'un fond d'écran pour un modèle ou un poste (taille d'écran du téléphone seulement)
export function WallpaperSelect({ accountNumber, screen, value, onChange, disabled, emptyLabel }) {
  const list = useWallpapers(accountNumber)
  const fits = (list || []).filter(w => w.resolution === screen)
  const def = fits.find(w => !w.global && w.is_default) || fits.find(w => w.global && w.is_default)
  const cur = fits.find(w => w.id === value)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <WallpaperThumb w={cur || def} height={60} />
      <select value={value || ''} onChange={e => onChange(e.target.value || null)} disabled={disabled || !screen}
        style={{ fontSize: 13, padding: '5px 8px', minWidth: 280 }} aria-label="Fond d'écran">
        <option value="">{emptyLabel || 'Par défaut'}{def ? ` (${def.name}${def.global ? ', Simple IP' : ''})` : ''}</option>
        {fits.map(w => <option key={w.id} value={w.id}>{w.name}{w.global ? ' — Simple IP' : ''}</option>)}
      </select>
      {!screen && <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>Taille d'écran inconnue pour ce modèle.</span>}
    </div>
  )
}

export default function WallpapersSection({ accountNumber, title }) {
  const [refresh, setRefresh] = useState(0)
  const list = useWallpapers(accountNumber, refresh)
  const [editing, setEditing] = useState(null)        // null | 'new' | fond
  const [over, setOver] = useState(false)
  const [dropped, setDropped] = useState(null)
  const [error, setError] = useState('')
  const reload = () => setRefresh(x => x + 1)

  async function makeDefault(w) {
    setError('')
    try { await api.put(`/v1/telephony/wallpapers/${w.id}/default`); reload() } catch (e) { setError(e.response?.data?.detail || 'Erreur') }
  }
  async function remove(w) {
    if (!confirm(`Supprimer le fond d'écran « ${w.name} » (${w.resolution.replace('x', '×')}) ?`)) return
    setError('')
    try { await api.delete(`/v1/telephony/wallpapers/${w.id}`); reload() } catch (e) { setError(e.response?.data?.detail || 'Erreur') }
  }

  const own = (list || []).filter(w => accountNumber ? !w.global : w.global)
  const globals = accountNumber ? (list || []).filter(w => w.global) : []
  const card = (w, readOnly) => (
    <div key={w.id} style={{ border: `1px solid ${w.is_default ? 'var(--brand)' : 'var(--c-border)'}`, borderRadius: 12, padding: 10, width: 220, background: 'var(--c-surface)' }}>
      <WallpaperThumb w={w} height={110} />
      <div style={{ fontWeight: 600, fontSize: 13, marginTop: 8 }}>{w.name}</div>
      <div style={{ fontSize: 12, color: 'var(--c-muted)' }}>{w.resolution.replace('x', ' × ')} · {w.mode === 'fit' ? 'Fit' : 'Crop'}
        {w.is_default && <span style={{ color: 'var(--brand)', fontWeight: 700 }}> · par défaut</span>}</div>
      {!readOnly && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {!w.is_default && <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => makeDefault(w)}>Par défaut</button>}
          <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setEditing(w)}>Recadrer</button>
          <button className="btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => remove(w)}>Supprimer</button>
        </div>
      )}
    </div>
  )
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{title || 'Fonds d\'écran'}</div>
      <div style={{ fontSize: 12, color: 'var(--c-muted)', marginBottom: 10 }}>
        {accountNumber ? 'Le fond « par défaut » de chaque taille d\'écran va sur tous les postes de la compagnie, sauf si leur modèle ou le poste en choisit un autre ; sans fond de la compagnie, ils prennent celui de Simple IP.'
          : 'Fond de tous les téléphones (« Global ») : ceux d\'une compagnie le remplacent pour ses postes.'}
      </div>
      <div onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) { setDropped(f); setEditing('new') } }}
        onClick={() => { setDropped(null); setEditing('new') }}
        style={{ border: `2px dashed ${over ? 'var(--brand)' : 'var(--c-border)'}`, background: over ? 'var(--c-tint-blue)' : 'var(--c-surface-2)', borderRadius: 10,
          padding: '14px 16px', textAlign: 'center', cursor: 'pointer', fontSize: 13, color: 'var(--c-muted)', marginBottom: 14 }}>
        Glissez une image ici ou <span style={{ color: 'var(--brand)' }}>choisissez un fichier</span> — elle sera ajustée à l'écran du téléphone (Fit ou Crop).
      </div>
      {error && <div style={{ color: '#DC2626', fontSize: 13, marginBottom: 10 }}>{error}</div>}
      {list === null ? <div className="loading">Chargement...</div> : (
        <>
          {SCREENS.map(sc => {
            const items = own.filter(w => w.resolution === sc.key)
            return items.length ? <div key={sc.key} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-muted)', marginBottom: 6 }}>{sc.label}</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>{items.map(w => card(w, false))}</div>
            </div> : null
          })}
          {own.filter(w => !SCREENS.some(sc => sc.key === w.resolution)).length > 0 && <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-muted)', marginBottom: 6 }}>Autres tailles</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>{own.filter(w => !SCREENS.some(sc => sc.key === w.resolution)).map(w => card(w, false))}</div>
          </div>}
          {own.length === 0 && <div className="empty-tab">Aucun fond d'écran{accountNumber ? ' pour cette compagnie' : ''}.</div>}
          {globals.length > 0 && <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-muted)', marginBottom: 6 }}>Simple IP (Global — se gèrent dans Serveur)</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>{globals.map(w => card(w, true))}</div>
          </div>}
        </>
      )}
      {editing && <DroppedEditor key={editing === 'new' ? 'new' : editing.id} accountNumber={accountNumber} wallpaper={editing === 'new' ? null : editing}
        dropped={editing === 'new' ? dropped : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />}
    </div>
  )
}

// Ouvre l'éditeur avec le fichier déposé dans la zone, s'il y en a un
function DroppedEditor({ dropped, ...props }) {
  useEffect(() => {
    if (!dropped) return
    const t = setTimeout(() => {
      const input = document.querySelector('.modal-box input[type=file]')
      if (input) { const dt = new DataTransfer(); dt.items.add(dropped); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })) }
    }, 50)
    return () => clearTimeout(t)
  }, [dropped])
  return <WallpaperEditor {...props} />
}
