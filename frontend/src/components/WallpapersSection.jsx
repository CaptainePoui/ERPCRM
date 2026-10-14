// Fonds d'écran (TASK-051, 2026-10-14). Philippe : « recadrer ou crop, c'est des options de gestion après le choix du
// background, pas en premier ; tu mets un background inadéquat pour le modèle ». Donc : on AJOUTE une image (glisser ou
// choisir) → elle devient un fond avec sa version pour chaque taille d'écran, faite automatiquement en « Fit » (image
// entière, jamais coupée ; telle quelle si déjà à la bonne taille). On clique un fond pour le GÉRER : nom, par défaut,
// télécharger l'original, supprimer, et pour chaque taille l'aperçu + « Ajuster » (Fit / Crop, cadre bleu, Snap centre).
// Le modèle et le poste choisissent un fond ; SIPV envoie la version à la taille de l'écran du téléphone.
import { useEffect, useRef, useState } from 'react'
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

// Un fond = ses versions (une par taille d'écran)
export function groupWallpapers(list) {
  const m = new Map()
  for (const w of list || []) {
    if (!m.has(w.group_id)) m.set(w.group_id, { id: w.group_id, name: w.name, global: w.global, is_default: w.is_default, versions: [] })
    m.get(w.group_id).versions.push(w)
  }
  return [...m.values()]
}
const preview = g => g.versions.find(v => v.resolution === '480x272') || g.versions[0]

// Image → JPEG à la taille W×H en « Fit » (entière, bordure de la couleur du coin) ; telle quelle si déjà à la taille
async function autoVersion(file, img, W, H) {
  if (img.width === W && img.height === H && file.type === 'image/jpeg') return file
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const ctx = c.getContext('2d')
  const probe = document.createElement('canvas'); probe.width = probe.height = 1
  probe.getContext('2d').drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1)
  const [r, g, b] = probe.getContext('2d').getImageData(0, 0, 1, 1).data
  ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fillRect(0, 0, W, H)
  const sc = Math.min(W / img.width, H / img.height), dw = img.width * sc, dh = img.height * sc
  ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)
  return await new Promise(res => c.toBlob(res, 'image/jpeg', 0.92))
}
const hex = (r, g, b) => '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')

// Choix d'un fond pour un modèle ou un poste : la liste des fonds ; la valeur est la version à la taille de l'écran
export function WallpaperSelect({ accountNumber, screen, value, onChange, disabled, emptyLabel, refreshKey, children }) {
  const groups = groupWallpapers(useWallpapers(accountNumber, refreshKey)).filter(g => g.versions.some(v => v.resolution === screen))
  const at = g => g.versions.find(v => v.resolution === screen)
  const def = groups.find(g => !g.global && g.is_default) || groups.find(g => g.global && g.is_default)
  const cur = groups.find(g => g.versions.some(v => v.id === value))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <WallpaperThumb w={cur ? at(cur) : def ? at(def) : null} height={60} />
      <select value={cur?.id || ''} onChange={e => { const g = groups.find(x => x.id === e.target.value); onChange(g ? at(g).id : null) }}
        disabled={disabled || !screen} style={{ fontSize: 13, padding: '5px 8px', minWidth: 280 }} aria-label="Fond d'écran">
        <option value="">{emptyLabel || 'Par défaut'}{def ? ` (${def.name}${def.global ? ', Simple IP' : ''})` : ''}</option>
        {groups.map(g => <option key={g.id} value={g.id}>{g.name}{g.global ? ' — Simple IP' : ''}</option>)}
      </select>
      {children}
      {!screen && <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>Taille d'écran inconnue pour ce modèle.</span>}
    </div>
  )
}

// Fenêtre Paramètres (Philippe, 2026-10-14, GO) : les vignettes — un clic = le fond choisi (pour le modèle, si onSelect) —
// puis, du fond choisi : nom, par défaut, télécharger, supprimer, et son éditeur graphique ouvert directement (Fit / Crop,
// déplacement dans le cadre bleu, zoom, Snap centre), une taille d'écran à la fois. Le fond Simple IP se modifie aussi
// (avertissement avant d'enregistrer : il change le fond de tous les téléphones).
function WallpaperWorkspace({ list, accountNumber, screen, value, onSelect, onChanged }) {
  const groups = groupWallpapers(list).filter(g => (accountNumber ? true : g.global) && (!screen || g.versions.some(v => v.resolution === screen)))
    .sort((a, b) => (a.global === b.global ? 0 : a.global ? 1 : -1))
  const def = groups.find(g => !g.global && g.is_default) || groups.find(g => g.global && g.is_default)
  const chosen = groups.find(g => g.versions.some(v => v.id === value))
  const [currentId, setCurrentId] = useState((chosen || def || groups[0])?.id || null)
  const current = groups.find(g => g.id === currentId) || chosen || def || groups[0]
  const [size, setSize] = useState(screen || current?.versions[0]?.resolution)
  useEffect(() => { if (current && !current.versions.some(v => v.resolution === size)) setSize(screen && current.versions.some(v => v.resolution === screen) ? screen : current.versions[0].resolution) }, [currentId])   // eslint-disable-line
  const version = current?.versions.find(v => v.resolution === size)
  const at = g => g.versions.find(v => v.resolution === screen) || g.versions[0]
  function pick(g) { setCurrentId(g.id); if (onSelect) onSelect(at(g).id) }
  if (!groups.length) return <div className="empty-tab">Aucun fond d'écran{screen ? ' à cette taille' : ''}. Ajoutez une image ci-dessus.</div>
  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {groups.map(g => {
          const isCur = current?.id === g.id
          const tag = onSelect ? (chosen?.id === g.id ? 'choisi' : !value && def?.id === g.id ? 'par défaut' : '') : (g.is_default ? 'par défaut' : '')
          return (
            <div key={g.id} onClick={() => pick(g)} role="button" aria-label={`Fond ${g.name}`}
              style={{ border: `${isCur ? 2 : 1}px solid ${isCur ? 'var(--brand)' : 'var(--c-border)'}`, borderRadius: 10, padding: 8, cursor: 'pointer',
                background: isCur ? 'var(--c-tint-blue)' : 'var(--c-surface)', width: 170 }}>
              <WallpaperThumb w={at(g)} height={84} />
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
              <div style={{ fontSize: 11, color: 'var(--c-muted)' }}>{g.global ? 'Simple IP' : 'Compagnie'}{tag && <span style={{ color: 'var(--brand)', fontWeight: 700 }}> · {tag}</span>}</div>
            </div>
          )
        })}
      </div>
      {current && <>
        <WallpaperActions key={current.id} group={current} onChanged={onChanged} />
        {current.versions.length > 1 && (
          <div style={{ display: 'flex', gap: 6, margin: '8px 0' }}>
            {current.versions.map(v => (
              <button key={v.id} type="button" className={v.resolution === size ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: 12, padding: '3px 10px' }}
                onClick={() => setSize(v.resolution)}>{SCREENS.find(x => x.key === v.resolution)?.label || v.resolution.replace('x', ' × ')}</button>
            ))}
          </div>
        )}
        {version && <WallpaperEditor key={version.id + version.updated_at} inline wallpaper={version} accountNumber={version.account_number}
          onClose={() => onChanged()} onSaved={() => onChanged()} />}
      </>}
    </div>
  )
}

// Nom, fond par défaut, télécharger l'original, supprimer -- du fond choisi
function WallpaperActions({ group, onChanged }) {
  const [name, setName] = useState(group.name)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const first = group.versions[0]
  async function run(fn) { setBusy(true); setError(''); try { await fn(); onChanged() } catch (e) { setError(e.response?.data?.detail || 'Erreur') } finally { setBusy(false) } }
  const rename = () => name.trim() && name.trim() !== group.name && run(() => { const fd = new FormData(); fd.append('name', name.trim()); return api.put(`/v1/telephony/wallpapers/${first.id}`, fd) })
  async function download() {
    const v = group.versions.find(x => x.has_original) || first
    const r = await api.get(`/v1/telephony/wallpapers/${v.id}/image`, { params: v.has_original ? { original: true } : {}, responseType: 'blob' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(r.data); a.download = v.original_name || `${group.name}.jpg`; a.click()
  }
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <input value={name} onChange={e => setName(e.target.value)} onBlur={rename} disabled={group.global} aria-label="Nom du fond d'écran"
        style={{ fontSize: 14, fontWeight: 600, padding: '5px 8px', flex: '1 1 220px', maxWidth: 360 }} />
      {group.is_default ? <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)' }}>Fond par défaut{group.global ? ' (Simple IP)' : ' de la compagnie'}</span>
        : !group.global && <button className="btn-secondary" style={{ fontSize: 12 }} disabled={busy} onClick={() => run(() => api.put(`/v1/telephony/wallpapers/${first.id}/default`))}>Fond par défaut de la compagnie</button>}
      <button className="btn-secondary" style={{ fontSize: 12 }} onClick={download}>Télécharger l'original</button>
      {!group.global && <button className="btn-secondary" style={{ fontSize: 12, color: '#DC2626' }} disabled={busy}
        onClick={() => confirm(`Supprimer le fond « ${group.name} » (toutes ses tailles) ?`) && run(() => api.delete(`/v1/telephony/wallpapers/${first.id}`))}>Supprimer</button>}
      {error && <span style={{ color: '#DC2626', fontSize: 13 }}>{error}</span>}
    </div>
  )
}

export default function WallpapersSection({ accountNumber, title, buttonOnly, onChanged, screen, value, onSelect }) {
  const [refresh, setRefresh] = useState(0)
  const list = useWallpapers(accountNumber, refresh)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const reload = () => { setRefresh(x => x + 1); onChanged?.() }

  // Ajouter : le fond est créé tout de suite, avec une version par taille d'écran (Fit), sans passer par le cadrage
  async function add(file) {
    if (!file) return
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setError('Choisissez une image JPEG ou PNG'); return }
    setBusy(true); setError('')
    try {
      const img = await new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = ko; im.src = URL.createObjectURL(file) })
      const probe = document.createElement('canvas'); probe.width = probe.height = 1
      probe.getContext('2d').drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1)
      const [r, g, b] = probe.getContext('2d').getImageData(0, 0, 1, 1).data
      let groupId = null
      for (const sc of SCREENS) {
        const [W, H] = sc.key.split('x').map(Number)
        const fd = new FormData()
        fd.append('name', file.name.replace(/\.[^.]+$/, '')); fd.append('resolution', sc.key); fd.append('mode', 'fit')
        fd.append('crop', JSON.stringify({ zoom: 1, cx: 0.5, cy: 0.5, bg: hex(r, g, b) }))
        fd.append('file', await autoVersion(file, img, W, H), 'wallpaper.jpg'); fd.append('original', file, file.name)
        if (accountNumber) fd.append('account_number', accountNumber)
        if (groupId) fd.append('group_id', groupId)
        const res = await api.post('/v1/telephony/wallpapers', fd)
        groupId = groupId || res.data.group_id
      }
      reload()
    } catch (e) { setError(e.response?.data?.detail || 'Image illisible') } finally { setBusy(false) }
  }

  // Philippe (2026-10-14) : pas de section qui allonge la page -- une ligne avec un bouton « Paramètres » ; l'ajout d'image
  // et la gestion sont dans cette fenêtre. Les fonds Simple IP (Global) ne sont pas montrés dans une compagnie : ils se
  // gèrent dans Serveur.
  const [open, setOpen] = useState(false)
  const own = groupWallpapers(list).filter(g => accountNumber ? !g.global : g.global)
  const def = own.find(g => g.is_default)
  return (
    <div style={buttonOnly ? { display: 'inline-flex' } : { marginTop: 28, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      {!buttonOnly && <>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title || 'Fonds d\'écran'}</div>
        {def && <WallpaperThumb w={preview(def)} height={34} />}
        <span style={{ fontSize: 13, color: 'var(--c-muted)' }}>
          {list === null ? 'Chargement…' : own.length ? `${own.length} fond(s)${def ? ` · par défaut : ${def.name}` : ''}` : 'Aucun fond'}
        </span>
      </>}
      <button type="button" className="btn-secondary" style={{ fontSize: 13 }} onClick={() => setOpen(true)} aria-label="Paramètres des fonds d'écran">⚙ Paramètres</button>
      {open && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: '96vw', width: 980, maxHeight: '94vh', overflowY: 'auto', cursor: 'default' }}>
            <h3 className="modal-title">{title || 'Fonds d\'écran'}</h3>
            <div style={{ fontSize: 12, color: 'var(--c-muted)', marginBottom: 10 }}>
              {accountNumber ? 'Le fond par défaut va sur tous les postes de la compagnie, sauf si leur modèle ou le poste en choisit un autre. Cliquez un fond : il est choisi et ses réglages graphiques s\'ouvrent en dessous.'
                : 'Fond de tous les téléphones (« Global ») : ceux d\'une compagnie le remplacent pour ses postes. Cliquez un fond : il est choisi et ses réglages graphiques s\'ouvrent en dessous.'}
            </div>
            <div onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
              onDrop={e => { e.preventDefault(); setOver(false); add(e.dataTransfer.files[0]) }} onClick={() => !busy && inputRef.current?.click()}
              style={{ border: `2px dashed ${over ? 'var(--brand)' : 'var(--c-border)'}`, background: over ? 'var(--c-tint-blue)' : 'var(--c-surface-2)', borderRadius: 10,
                padding: '14px 16px', textAlign: 'center', cursor: 'pointer', fontSize: 13, color: 'var(--c-muted)', marginBottom: 14 }}>
              {busy ? 'Ajout du fond…' : <>Ajouter un fond d'écran : glissez une image ici ou <span style={{ color: 'var(--brand)' }}>choisissez un fichier</span></>}
              <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={e => { add(e.target.files[0]); e.target.value = '' }} />
            </div>
            {error && <div style={{ color: '#DC2626', fontSize: 13, marginBottom: 10 }}>{error}</div>}
            {list === null ? <div className="loading">Chargement...</div>
              : <WallpaperWorkspace list={list} accountNumber={accountNumber} screen={screen} value={value} onSelect={onSelect} onChanged={reload} />}
            <div className="modal-actions"><button className="btn-primary" onClick={() => setOpen(false)}>Fermer</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
