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

function ManageWallpaper({ group, readOnly, onClose, onChanged }) {
  const [name, setName] = useState(group.name)
  const [editing, setEditing] = useState(null)
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
  async function addSize(res) {
    const v = group.versions.find(x => x.has_original) || first
    const r = await api.get(`/v1/telephony/wallpapers/${v.id}/image`, { params: v.has_original ? { original: true } : {}, responseType: 'blob' })
    const img = await new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = ko; im.src = URL.createObjectURL(r.data) })
    const [W, H] = res.split('x').map(Number)
    const fd = new FormData()
    fd.append('name', group.name); fd.append('resolution', res); fd.append('mode', 'fit'); fd.append('group_id', group.id)
    fd.append('crop', JSON.stringify({ zoom: 1, cx: 0.5, cy: 0.5 }))
    fd.append('file', await autoVersion(new File([r.data], 'o', { type: r.data.type }), img, W, H), 'wallpaper.jpg')
    fd.append('original', r.data, v.original_name || 'original.jpg')
    if (!group.global && first.account_number) fd.append('account_number', first.account_number)
    await api.post('/v1/telephony/wallpapers', fd)
  }
  const sizes = [...SCREENS.map(s => s.key), ...group.versions.map(v => v.resolution).filter(r => !SCREENS.some(s => s.key === r))]
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: '96vw', width: 760, maxHeight: '94vh', overflowY: 'auto', cursor: 'default' }}>
        <h3 className="modal-title">Fond d'écran « {group.name} »{group.global ? ' — Simple IP' : ''}</h3>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
          <div className="form-group" style={{ margin: 0, flex: '1 1 260px' }}><label>Nom</label>
            <input value={name} onChange={e => setName(e.target.value)} onBlur={rename} disabled={readOnly} aria-label="Nom du fond d'écran" /></div>
          {!readOnly && !group.is_default && <button className="btn-secondary" disabled={busy} onClick={() => run(() => api.put(`/v1/telephony/wallpapers/${first.id}/default`))}>Fond par défaut</button>}
          {group.is_default && <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)', paddingBottom: 8 }}>Fond par défaut</span>}
          <button className="btn-secondary" onClick={download}>Télécharger l'original</button>
          {!readOnly && <button className="btn-secondary" style={{ color: '#DC2626' }} disabled={busy}
            onClick={() => confirm(`Supprimer le fond « ${group.name} » (toutes ses tailles) ?`) && run(async () => { await api.delete(`/v1/telephony/wallpapers/${first.id}`); onClose() })}>Supprimer</button>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--c-muted)', marginBottom: 10 }}>Chaque téléphone reçoit la version à la taille de son écran.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 14 }}>
          {sizes.map(res => {
            const v = group.versions.find(x => x.resolution === res)
            const label = SCREENS.find(s => s.key === res)?.label || res.replace('x', ' × ')
            return (
              <div key={res} style={{ border: '1px solid var(--c-border)', borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{label}</div>
                {v ? <>
                  <WallpaperThumb w={v} height={130} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>{v.mode === 'fit' ? 'Fit (image entière)' : 'Crop (cadrée)'}</span>
                    {!readOnly && <button className="btn-secondary" style={{ marginLeft: 'auto', fontSize: 12, padding: '3px 10px' }} onClick={() => setEditing(v)}>Ajuster</button>}
                  </div>
                </> : !readOnly ? <button className="btn-secondary" style={{ fontSize: 12 }} disabled={busy} onClick={() => run(() => addSize(res))}>Créer cette taille</button>
                  : <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>Pas de version à cette taille</span>}
              </div>
            )
          })}
        </div>
        {error && <div style={{ color: '#DC2626', fontSize: 13, marginTop: 10 }}>{error}</div>}
        <div className="modal-actions"><button className="btn-primary" onClick={onClose}>Fermer</button></div>
      </div>
      {editing && <WallpaperEditor wallpaper={editing} accountNumber={editing.account_number} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); onChanged() }} />}
    </div>
  )
}

export default function WallpapersSection({ accountNumber, title, buttonOnly, onChanged }) {
  const [refresh, setRefresh] = useState(0)
  const list = useWallpapers(accountNumber, refresh)
  const [managing, setManaging] = useState(null)       // id du fond
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
  const current = own.find(g => g.id === managing)
  const card = g => (
    <div key={g.id} onClick={() => setManaging(g.id)} role="button" aria-label={`Gérer ${g.name}`}
      style={{ border: `1px solid ${g.is_default ? 'var(--brand)' : 'var(--c-border)'}`, borderRadius: 12, padding: 10, width: 220, background: 'var(--c-surface)', cursor: 'pointer' }}>
      <WallpaperThumb w={preview(g)} height={110} />
      <div style={{ fontWeight: 600, fontSize: 13, marginTop: 8 }}>{g.name}</div>
      <div style={{ fontSize: 12, color: 'var(--c-muted)' }}>{g.versions.map(v => v.resolution.replace('x', '×')).join(' · ')}
        {g.is_default && <span style={{ color: 'var(--brand)', fontWeight: 700 }}> · par défaut</span>}</div>
    </div>
  )
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
              {accountNumber ? 'Le fond par défaut va sur tous les postes de la compagnie, sauf si leur modèle ou le poste en choisit un autre. Cliquez un fond pour le gérer.'
                : 'Fond de tous les téléphones (« Global ») : ceux d\'une compagnie le remplacent pour ses postes. Cliquez un fond pour le gérer.'}
            </div>
            <div onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
              onDrop={e => { e.preventDefault(); setOver(false); add(e.dataTransfer.files[0]) }} onClick={() => !busy && inputRef.current?.click()}
              style={{ border: `2px dashed ${over ? 'var(--brand)' : 'var(--c-border)'}`, background: over ? 'var(--c-tint-blue)' : 'var(--c-surface-2)', borderRadius: 10,
                padding: '14px 16px', textAlign: 'center', cursor: 'pointer', fontSize: 13, color: 'var(--c-muted)', marginBottom: 14 }}>
              {busy ? 'Ajout du fond…' : <>Ajouter un fond d'écran : glissez une image ici ou <span style={{ color: 'var(--brand)' }}>choisissez un fichier</span></>}
              <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={e => { add(e.target.files[0]); e.target.value = '' }} />
            </div>
            {error && <div style={{ color: '#DC2626', fontSize: 13, marginBottom: 10 }}>{error}</div>}
            {list === null ? <div className="loading">Chargement...</div> : own.length
              ? <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>{own.map(card)}</div>
              : <div className="empty-tab">Aucun fond d'écran{accountNumber ? ' pour cette compagnie' : ''}.</div>}
            <div className="modal-actions"><button className="btn-primary" onClick={() => setOpen(false)}>Fermer</button></div>
          </div>
        </div>
      )}
      {current && <ManageWallpaper group={current} readOnly={false} onClose={() => setManaging(null)} onChanged={reload} />}
    </div>
  )
}
