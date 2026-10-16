import { useEffect, useRef, useState } from 'react'

// Affichage d'un document (facture, avoir, facture periodique) : la page HTML du document elle-meme (instantane, le
// PDF ne se fabrique qu'au clic sur « PDF »), ou les pages en images pour un document d'origine. La page (8,5 po de
// large) est reduite pour tenir dans la largeur disponible.
export default function DocumentView({ html, pages }) {
  const wrap = useRef(null)
  const frame = useRef(null)
  const [scale, setScale] = useState(1)
  const [height, setHeight] = useState(1056)
  useEffect(() => {
    if (!wrap.current) return
    const fit = () => setScale(Math.min(1, (wrap.current.clientWidth - 32) / 816))
    fit()
    const ro = new ResizeObserver(fit); ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [])
  function onLoad() {
    const d = frame.current?.contentDocument
    if (d) setHeight(Math.max(1056, d.documentElement.scrollHeight))
  }
  const box = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, background: 'var(--c-surface-2)', borderRadius: 8, padding: 16 }
  if (pages) return (
    <div style={box}>
      {pages.map((src, n) => <img key={n} src={src} alt={`Page ${n + 1}`} style={{ width: '100%', maxWidth: 900, background: '#fff', borderRadius: 4, boxShadow: '0 4px 18px rgba(0,0,0,.25)' }} />)}
    </div>
  )
  return (
    <div ref={wrap} style={box}>
      <div style={{ width: 816 * scale, height: height * scale, overflow: 'hidden', borderRadius: 4, boxShadow: '0 4px 18px rgba(0,0,0,.25)', background: '#fff' }}>
        <iframe ref={frame} title="Document" srcDoc={html} onLoad={onLoad} scrolling="no"
          style={{ width: 816, height, border: 0, transform: `scale(${scale})`, transformOrigin: 'top left', display: 'block' }} />
      </div>
    </div>
  )
}
