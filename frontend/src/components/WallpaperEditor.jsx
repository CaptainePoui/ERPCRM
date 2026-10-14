// Éditeur de fond d'écran (TASK-051, 2026-10-14, Philippe : « aller chercher le fichier ou drag and drop comme les relevés ;
// ajustement de taille selon le modèle, 2 options fit et crop ; crop : on peut déplacer l'image pour cadrer, petit carré
// bleu Simple IP, option activable Snap centre »). L'image est produite ici à la taille exacte de l'écran (JPEG) ; l'original
// et le cadrage sont envoyés aussi, pour pouvoir recadrer plus tard. Popup fermé seulement par Annuler / Enregistrer.
import { useEffect, useRef, useState } from 'react'
import api from '../services/api'

export const SCREENS = [{ key: '320x240', label: '320 × 240 (GXP2130, GXP2135)' }, { key: '480x272', label: '480 × 272 (GXP2140, GXP2160, GXP2170)' }]
const MARGIN = 70             // marge autour du cadre où l'on voit la partie coupée de l'image
const SNAP_PX = 10            // distance (pixels de l'écran du téléphone) où le Snap centre attrape

function layout(img, W, H, mode, zoom, cx, cy) {
  const base = mode === 'crop' ? Math.max(W / img.width, H / img.height) : Math.min(W / img.width, H / img.height)
  const dw = img.width * base * zoom, dh = img.height * base * zoom
  return { dw, dh, x: W / 2 - cx * dw, y: H / 2 - cy * dh }
}

function clampCenter(img, W, H, mode, zoom, cx, cy) {
  const { dw, dh } = layout(img, W, H, mode, zoom, cx, cy)
  if (mode === 'crop') {   // l'image couvre toujours tout l'écran
    const mx = (W / 2) / dw, my = (H / 2) / dh
    return [Math.min(1 - mx, Math.max(mx, cx)), Math.min(1 - my, Math.max(my, cy))]
  }
  const mx = (W / 2) / dw, my = (H / 2) / dh   // fit : l'image reste entièrement dans l'écran
  return [dw <= W ? Math.min(mx, Math.max(1 - mx, cx)) : 0.5, dh <= H ? Math.min(my, Math.max(1 - my, cy)) : 0.5]
}

export default function WallpaperEditor({ accountNumber, wallpaper, resolutions, onClose, onSaved }) {
  const [file, setFile] = useState(null)               // nouveau fichier choisi
  const [img, setImg] = useState(null)
  const [name, setName] = useState(wallpaper?.name || '')
  const [res, setRes] = useState(wallpaper?.resolution || resolutions?.[0] || '320x240')
  const [mode, setMode] = useState(wallpaper?.mode || 'crop')
  const [zoom, setZoom] = useState(wallpaper?.crop?.zoom || 1)
  const [cx, setCx] = useState(wallpaper?.crop?.cx ?? 0.5)
  const [cy, setCy] = useState(wallpaper?.crop?.cy ?? 0.5)
  const [bg, setBg] = useState(wallpaper?.crop?.bg || '#000000')
  const [snap, setSnap] = useState(true)
  const [over, setOver] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const canvasRef = useRef(null), inputRef = useRef(null), drag = useRef(null)
  const [W, H] = res.split('x').map(Number)
  // échelle d'affichage : assez grande pour cadrer, sans dépasser la fenêtre (Philippe : « la fenêtre dépasse »)
  const [vh, setVh] = useState(window.innerHeight)
  useEffect(() => { const f = () => setVh(window.innerHeight); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f) }, [])
  const s = Math.max(0.5, Math.min(1.6, 560 / W, (vh - 260 - 2 * MARGIN) / H))

  function load(blob) {
    const url = URL.createObjectURL(blob)
    const im = new Image()
    im.onload = () => setImg(im)
    im.onerror = () => setError('Image illisible (JPEG ou PNG)')
    im.src = url
  }
  useEffect(() => {                                    // recadrer : on repart de l'original
    if (wallpaper?.has_original) api.get(`/v1/telephony/wallpapers/${wallpaper.id}/image?original=true`, { responseType: 'blob' }).then(r => load(r.data))
    else if (wallpaper) api.get(`/v1/telephony/wallpapers/${wallpaper.id}/image`, { responseType: 'blob' }).then(r => load(r.data))
  }, [wallpaper?.id])   // eslint-disable-line

  function pick(f) {
    if (!f) return
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { setError('Choisissez une image JPEG ou PNG'); return }
    setError(''); setFile(f); load(f); setZoom(1); setCx(0.5); setCy(0.5)
    if (!name) setName(f.name.replace(/\.[^.]+$/, ''))
  }

  // dessin : l'image (atténuée hors du cadre), le cadre bleu de l'écran, les guides du centre quand c'est aligné
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    const CW = W * s + 2 * MARGIN, CH = H * s + 2 * MARGIN
    c.width = CW; c.height = CH
    ctx.fillStyle = '#1f2937'; ctx.fillRect(0, 0, CW, CH)
    if (!img) return
    const { dw, dh, x, y } = layout(img, W, H, mode, zoom, cx, cy)
    ctx.save(); ctx.globalAlpha = 0.35
    ctx.drawImage(img, MARGIN + x * s, MARGIN + y * s, dw * s, dh * s); ctx.restore()
    ctx.save(); ctx.beginPath(); ctx.rect(MARGIN, MARGIN, W * s, H * s); ctx.clip()
    ctx.fillStyle = mode === 'fit' ? bg : '#000'; ctx.fillRect(MARGIN, MARGIN, W * s, H * s)
    ctx.drawImage(img, MARGIN + x * s, MARGIN + y * s, dw * s, dh * s); ctx.restore()
    const brand = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || '#3b82f6'
    ctx.strokeStyle = brand; ctx.lineWidth = 2; ctx.strokeRect(MARGIN - 1, MARGIN - 1, W * s + 2, H * s + 2)
    if (snap) {
      ctx.setLineDash([5, 4]); ctx.lineWidth = 1
      if (Math.abs(cx - 0.5) < 1e-6) { ctx.beginPath(); ctx.moveTo(MARGIN + W * s / 2, MARGIN); ctx.lineTo(MARGIN + W * s / 2, MARGIN + H * s); ctx.stroke() }
      if (Math.abs(cy - 0.5) < 1e-6) { ctx.beginPath(); ctx.moveTo(MARGIN, MARGIN + H * s / 2); ctx.lineTo(MARGIN + W * s, MARGIN + H * s / 2); ctx.stroke() }
      ctx.setLineDash([])
    }
  }, [img, W, H, s, mode, zoom, cx, cy, bg, snap])

  function setCenter(nx, ny) {
    let [a, b] = clampCenter(img, W, H, mode, zoom, nx, ny)
    if (snap) {
      const { dw, dh } = layout(img, W, H, mode, zoom, a, b)
      if (Math.abs(a - 0.5) * dw < SNAP_PX) a = 0.5
      if (Math.abs(b - 0.5) * dh < SNAP_PX) b = 0.5
      ;[a, b] = clampCenter(img, W, H, mode, zoom, a, b)
    }
    setCx(a); setCy(b)
  }
  useEffect(() => { if (img) setCenter(cx, cy) }, [mode, zoom, res, img])   // eslint-disable-line

  function onDown(e) { if (img) drag.current = { x: e.clientX, y: e.clientY, cx, cy } }
  function onMove(e) {
    const d = drag.current
    if (!d) return
    const { dw, dh } = layout(img, W, H, mode, zoom, d.cx, d.cy)
    setCenter(d.cx - (e.clientX - d.x) / s / dw, d.cy - (e.clientY - d.y) / s / dh)
  }
  function onWheel(e) {
    if (!img) return
    e.preventDefault()
    setZoom(z => Math.min(4, Math.max(mode === 'crop' ? 1 : 0.2, +(z * (e.deltaY < 0 ? 1.08 : 1 / 1.08)).toFixed(3))))
  }

  async function save() {
    setSaving(true); setError('')
    try {
      const out = document.createElement('canvas'); out.width = W; out.height = H
      const ctx = out.getContext('2d')
      ctx.fillStyle = mode === 'fit' ? bg : '#000'; ctx.fillRect(0, 0, W, H)
      const { dw, dh, x, y } = layout(img, W, H, mode, zoom, cx, cy)
      ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, x, y, dw, dh)
      const blob = await new Promise(r => out.toBlob(r, 'image/jpeg', 0.92))
      const fd = new FormData()
      fd.append('name', name.trim() || 'Fond d\'écran'); fd.append('mode', mode)
      fd.append('crop', JSON.stringify({ zoom, cx, cy, ...(mode === 'fit' ? { bg } : {}) }))
      fd.append('file', blob, 'wallpaper.jpg')
      if (file) fd.append('original', file, file.name)
      let r
      if (wallpaper) r = await api.put(`/v1/telephony/wallpapers/${wallpaper.id}`, fd)
      else {
        fd.append('resolution', res)
        if (accountNumber) fd.append('account_number', accountNumber)
        r = await api.post('/v1/telephony/wallpapers', fd)
      }
      onSaved(r.data)
    } catch (e) { setError(e.response?.data?.detail || 'Erreur') } finally { setSaving(false) }
  }

  const seg = active => ({ fontSize: 13, padding: '5px 14px', border: '1px solid var(--c-border-strong)', cursor: 'pointer',
    background: active ? 'var(--brand)' : 'transparent', color: active ? '#fff' : 'inherit' })
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: '96vw', width: 'auto', maxHeight: '94vh', display: 'flex', flexDirection: 'column', cursor: 'default', overflow: 'hidden' }}>
        <h3 className="modal-title" style={{ flex: 'none' }}>{wallpaper ? `Recadrer « ${wallpaper.name} »` : 'Nouveau fond d\'écran'}{accountNumber ? '' : ' — Global Simple IP'}</h3>
        <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start', overflowY: 'auto', minHeight: 0, flex: 1 }}>
          <div>
            {!img ? (
              <div onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
                onDrop={e => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]) }} onClick={() => inputRef.current?.click()}
                style={{ width: W * s + 2 * MARGIN, height: H * s + 2 * MARGIN, border: `2px dashed ${over ? 'var(--brand)' : 'var(--c-border-strong)'}`,
                  background: over ? 'var(--c-tint-blue)' : 'var(--c-surface-2)', borderRadius: 10, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', textAlign: 'center', cursor: 'pointer', fontSize: 14, color: 'var(--c-muted)', padding: 20, boxSizing: 'border-box' }}>
                <span>Glissez une image ici (JPEG ou PNG) ou <span style={{ color: 'var(--brand)' }}>choisissez un fichier</span></span>
              </div>
            ) : (
              <canvas ref={canvasRef} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={() => { drag.current = null }}
                onMouseLeave={() => { drag.current = null }} onWheel={onWheel} aria-label="Cadrage"
                style={{ borderRadius: 10, cursor: drag.current ? 'grabbing' : 'grab', display: 'block' }} />
            )}
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={e => { pick(e.target.files[0]); e.target.value = '' }} />
            {img && <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 6 }}>Glissez l'image pour la cadrer dans le cadre bleu (l'écran du téléphone) ; molette = zoom. Image : {img.width}×{img.height}</div>}
          </div>
          <div style={{ width: 300, flex: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}><label>Nom</label>
              <input value={name} onChange={e => setName(e.target.value)} aria-label="Nom du fond d'écran" /></div>
            <div className="form-group" style={{ margin: 0 }}><label>Écran du téléphone</label>
              <select value={res} onChange={e => setRes(e.target.value)} disabled={!!wallpaper} aria-label="Écran du téléphone">
                {(resolutions?.length ? SCREENS.filter(x => resolutions.includes(x.key)) : SCREENS).map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                {wallpaper && !SCREENS.some(x => x.key === res) && <option value={res}>{res.replace('x', ' × ')}</option>}
              </select></div>
            <div>
              <div className="ifield-label">Ajustement</div>
              <div style={{ display: 'inline-flex', borderRadius: 8, overflow: 'hidden' }}>
                <button type="button" style={{ ...seg(mode === 'fit'), borderRadius: '8px 0 0 8px' }} onClick={() => { setMode('fit'); setZoom(1) }}>Fit</button>
                <button type="button" style={{ ...seg(mode === 'crop'), borderRadius: '0 8px 8px 0', borderLeft: 0 }} onClick={() => { setMode('crop'); setZoom(1) }}>Crop</button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--c-muted)', marginTop: 4 }}>{mode === 'fit' ? 'Toute l\'image, avec une bordure de couleur au besoin.' : 'L\'image remplit l\'écran ; déplacez-la pour choisir ce qui reste.'}</div>
            </div>
            <div><div className="ifield-label">Zoom</div>
              <input type="range" min={mode === 'crop' ? 1 : 0.2} max={4} step={0.01} value={zoom} onChange={e => setZoom(+e.target.value)} disabled={!img} style={{ width: '100%' }} aria-label="Zoom" /></div>
            {mode === 'fit' && <div><div className="ifield-label">Couleur de la bordure</div>
              <input type="color" value={bg} onChange={e => setBg(e.target.value)} aria-label="Couleur de la bordure" /></div>}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={snap} onChange={e => setSnap(e.target.checked)} style={{ accentColor: 'var(--brand)' }} aria-label="Snap centre" />
              Snap centre <span style={{ fontSize: 12, color: 'var(--c-muted)' }}>(l'image s'aligne au centre quand on s'en approche)</span>
            </label>
            <button type="button" className="btn-secondary" style={{ fontSize: 12, alignSelf: 'flex-start' }} disabled={!img}
              onClick={() => { setCx(0.5); setCy(0.5) }}>Centrer</button>
            {img && <button type="button" className="btn-secondary" style={{ fontSize: 12, alignSelf: 'flex-start' }} onClick={() => inputRef.current?.click()}>Changer d'image</button>}
          </div>
        </div>
        {error && <div style={{ color: '#DC2626', fontSize: 13, marginTop: 10, flex: 'none' }}>{error}</div>}
        <div className="modal-actions" style={{ flex: 'none' }}>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={saving || !img || !name.trim()}>{saving ? '...' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}
