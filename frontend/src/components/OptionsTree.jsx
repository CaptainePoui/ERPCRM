// Options du téléphone, comme l'UCM (TASK-051, 2026-10-14, Philippe : « il donne les options qu'on peut ajouter au template,
// si non c'est tout par défaut ») : un menu « Options » en arbre avec recherche (tiré du gabarit officiel Grandstream, lu de
// SIPV), les options ajoutées rangées par section en dessous (barres repliables), corbeille pour retirer, et « Paramètres
// personnalisés » (P-code libre). Valeur = {« P84 »: « 20 », …}. Mode poste (`inherited` = options du modèle) : chaque
// option du modèle a une case « Modèle » ; décochée = personnalisée pour ce poste.
import { useEffect, useMemo, useRef, useState } from 'react'
import api from '../services/api'

const cache = new Map()
function useCatalog(modelId) {
  const [cat, setCat] = useState(cache.get(modelId) || null)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!modelId) { setCat(null); return }
    if (cache.has(modelId)) { setCat(cache.get(modelId)); return }
    api.get(`/v1/telephony/option-catalog/${modelId}`).then(r => { cache.set(modelId, r.data.catalog); setCat(r.data.catalog) })
      .catch(e => setErr(e.response?.data?.detail || 'SIPV injoignable'))
  }, [modelId])
  return [cat, err]
}

const muted = { fontSize: 12, color: 'var(--c-muted)' }
const input = { fontSize: 13, padding: '5px 8px', width: '100%', boxSizing: 'border-box' }
const FR_ROOT = { Network: 'Réseau', Maintenance: 'Maintenance', Phonebook: 'Répertoire', Settings: 'Réglages' }
const rootLabel = r => FR_ROOT[r] || r.replace(/^Account (\d+)$/, 'Compte $1')

function ValueInput({ opt, value, onChange, disabled }) {
  const v = value ?? ''
  if (opt?.type === 'select') {
    const choices = opt.choices.some(c => String(c.value).toLowerCase() === String(v).toLowerCase()) || v === '' ? opt.choices
      : [...opt.choices, { value: v, label: v }]
    return (
      <select value={choices.find(c => String(c.value).toLowerCase() === String(v).toLowerCase())?.value ?? v} disabled={disabled}
        onChange={e => onChange(e.target.value)} style={input} aria-label={opt.label}>
        {choices.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
    )
  }
  return <input value={v} disabled={disabled} onChange={e => onChange(e.target.value)} style={input} aria-label={opt?.label || 'Valeur'}
    type={opt?.type === 'number' ? 'number' : 'text'} min={opt?.min ?? undefined} max={opt?.max ?? undefined} />
}

function TreePicker({ cat, added, onAdd }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [exp, setExp] = useState({})
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [open])
  // arbre : racine -> sous-chemin -> options
  const tree = useMemo(() => {
    const t = new Map()
    for (const s of cat.sections) {
      const root = s.path[0]; const sub = s.path.slice(1).join(' › ') || 'Général'
      if (!t.has(root)) t.set(root, new Map())
      const m = t.get(root); if (!m.has(sub)) m.set(sub, [])
      m.get(sub).push(...s.options)
    }
    return t
  }, [cat])
  const needle = q.trim().toLowerCase()
  const match = o => !needle || o.label.toLowerCase().includes(needle) || o.p.toLowerCase() === needle || o.p.toLowerCase().includes(needle)
  const has = opts => opts.some(o => o.p in added)
  const toggle = k => setExp(e => ({ ...e, [k]: !e[k] }))
  const row = (depth, bold, label, onClick, caret) => (
    <div onClick={onClick} style={{ padding: `4px 8px 4px ${8 + depth * 18}px`, cursor: 'pointer', fontSize: 13, fontWeight: bold ? 700 : 400, display: 'flex', gap: 6 }}>
      {caret !== undefined && <span style={{ width: 10, color: 'var(--c-muted)' }}>{caret ? '▾' : '▸'}</span>}{label}
    </div>
  )
  return (
    <div ref={ref} style={{ position: 'relative', maxWidth: 520 }}>
      <button type="button" className="btn-secondary" onClick={() => setOpen(o => !o)} aria-label="Options"
        style={{ width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span>+ Ajouter une option</span><span>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', zIndex: 30, top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--c-surface)',
          border: '1px solid var(--c-border-strong)', borderRadius: 10, boxShadow: 'var(--c-shadow)', maxHeight: 460, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 8 }}>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher (nom ou P-code)…" style={input} aria-label="Rechercher une option" />
          </div>
          <div style={{ overflowY: 'auto', paddingBottom: 6 }}>
            {[...tree.entries()].map(([root, subs]) => {
              const rootOpts = [...subs.values()].flat()
              if (!rootOpts.some(match)) return null
              const ro = needle || exp[root]
              return (
                <div key={root}>
                  {row(0, has(rootOpts), rootLabel(root), () => toggle(root), !!ro)}
                  {ro && [...subs.entries()].map(([sub, opts]) => {
                    const vis = opts.filter(match)
                    if (!vis.length) return null
                    const k = root + '|' + sub; const so = needle || exp[k]
                    return (
                      <div key={k}>
                        {row(1, has(opts), sub, () => toggle(k), !!so)}
                        {so && vis.map(o => {
                          const managed = o.p in cat.managed; const isAdded = o.p in added
                          return (
                            <div key={o.p} onClick={() => { if (!managed && !isAdded) { onAdd(o); } }}
                              title={managed ? `Réglé par SIPV (${cat.managed[o.p]})` : isAdded ? 'Déjà ajoutée' : 'Ajouter'}
                              style={{ padding: '4px 8px 4px 52px', fontSize: 13, cursor: managed || isAdded ? 'default' : 'pointer',
                                color: managed ? 'var(--c-faint)' : isAdded ? 'var(--c-muted)' : '#059669', display: 'flex', gap: 8 }}>
                              <span style={{ flex: 1 }}>{o.label}</span>
                              <span style={{ ...muted, fontFamily: 'monospace' }}>{o.p}{isAdded ? ' ✓' : managed ? ' · SIPV' : ''}</span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function OptionsTree({ modelId, value, onChange, inherited }) {
  const [cat, err] = useCatalog(modelId)
  const [collapsed, setCollapsed] = useState({})
  const [customDraft, setCustomDraft] = useState([])     // lignes « paramètre personnalisé » en cours de saisie
  const index = useMemo(() => {
    const m = new Map()
    for (const s of cat?.sections || []) for (const o of s.options) m.set(o.p, { ...o, path: s.path })
    return m
  }, [cat])
  if (err) return <div style={{ ...muted, color: '#DC2626' }}>{err}</div>
  if (!cat) return <div style={muted}>{modelId ? 'Chargement des options…' : 'Choisissez d\'abord le modèle de téléphone.'}</div>

  const cur = value || {}
  const inh = inherited || null
  const shownKeys = [...new Set([...Object.keys(inh || {}), ...Object.keys(cur)])].filter(k => /^P\d+$/.test(k))
  const known = shownKeys.filter(k => index.has(k))
  const custom = shownKeys.filter(k => !index.has(k))
  // regroupement par section, dans l'ordre du gabarit
  const order = new Map(); let i = 0
  for (const s of cat.sections) order.set(s.path.join('/'), i++)
  const groups = new Map()
  for (const k of known) {
    const o = index.get(k); const key = o.path.join('/')
    if (!groups.has(key)) groups.set(key, { path: o.path, keys: [] })
    groups.get(key).keys.push(k)
  }
  const sorted = [...groups.values()].sort((a, b) => order.get(a.path.join('/')) - order.get(b.path.join('/')))
  const set = (k, v) => onChange({ ...cur, [k]: v })
  const remove = k => { const n = { ...cur }; delete n[k]; onChange(n) }

  const line = k => {
    const o = index.get(k)
    const fromTpl = inh && (k in inh) && !(k in cur)
    const v = fromTpl ? inh[k] : cur[k]
    return (
      <div key={k} style={{ display: 'grid', gridTemplateColumns: inh ? '70px minmax(220px, 1.2fr) 1fr 150px 34px' : 'minmax(220px, 1.2fr) 1fr 150px 34px', gap: 8, alignItems: 'center', padding: '5px 0' }}>
        {inh && ((k in inh) ? (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: fromTpl ? 'var(--brand)' : 'var(--c-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={fromTpl} onChange={e => e.target.checked ? remove(k) : set(k, inh[k])} style={{ accentColor: 'var(--brand)' }} />Modèle
          </label>
        ) : <span style={{ fontSize: 11, color: 'var(--c-muted)' }}>poste</span>)}
        <div style={{ fontSize: 13 }}>{o.label}<span style={{ ...muted, fontFamily: 'monospace', marginLeft: 6 }}>{o.p}</span></div>
        <ValueInput opt={o} value={v} disabled={fromTpl} onChange={x => set(k, x)} />
        <span style={muted} title="Valeur par défaut du téléphone (gabarit Grandstream)">défaut : {o.choices?.find(c => String(c.value).toLowerCase() === String(o.default).toLowerCase())?.label ?? (o.default || '—')}</span>
        {!fromTpl && (k in cur) && !(inh && k in inh)
          ? <button type="button" className="inv-del-btn" onClick={() => remove(k)} title="Retirer l'option" aria-label={`Retirer ${o.label}`}>✕</button> : <span />}
      </div>
    )
  }

  return (
    <div>
      <TreePicker cat={cat} added={Object.fromEntries(shownKeys.map(k => [k, 1]))} onAdd={o => set(o.p, o.default ?? '')} />
      <div style={{ marginTop: 12 }}>
        {sorted.length === 0 && custom.length === 0 && <div style={muted}>Aucune option ajoutée : le téléphone garde ses valeurs par défaut.</div>}
        {sorted.map(g => {
          const key = g.path.join('/'); const c = collapsed[key]
          return (
            <div key={key} style={{ border: '1px solid var(--c-border)', borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
              <div onClick={() => setCollapsed(x => ({ ...x, [key]: !c }))} style={{ cursor: 'pointer', padding: '7px 12px', background: 'var(--c-surface-2)', fontSize: 13, fontWeight: 600 }}>
                {c ? '▸' : '▾'} {[rootLabel(g.path[0]), ...g.path.slice(1)].join(' › ')} <span style={muted}>({g.keys.length})</span>
              </div>
              {!c && <div style={{ padding: '4px 12px' }}>{g.keys.map(line)}</div>}
            </div>
          )
        })}
        <div style={{ border: '1px solid var(--c-border)', borderRadius: 10, marginTop: 10, padding: '8px 12px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Paramètres personnalisés <span style={muted}>— P-code libre, pour ce qui n'est pas dans la liste</span></div>
          {custom.map(k => {
            const fromTpl = inh && (k in inh) && !(k in cur)
            return (
              <div key={k} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 34px', gap: 8, alignItems: 'center', padding: '4px 0' }}>
                <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{k}{fromTpl && <span style={{ ...muted, marginLeft: 6 }}>(modèle)</span>}</span>
                <input value={(fromTpl ? inh[k] : cur[k]) ?? ''} disabled={fromTpl} onChange={e => set(k, e.target.value)} style={input} aria-label={`Valeur ${k}`} />
                {!fromTpl ? <button type="button" className="inv-del-btn" onClick={() => remove(k)} aria-label={`Retirer ${k}`}>✕</button> : <span />}
              </div>
            )
          })}
          {customDraft.map((d, j) => (
            <div key={'d' + j} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 90px', gap: 8, alignItems: 'center', padding: '4px 0' }}>
              <input value={d.p} placeholder="P1234" onChange={e => setCustomDraft(x => x.map((y, n) => n === j ? { ...y, p: e.target.value.trim().toUpperCase() } : y))} style={input} aria-label="P-code" />
              <input value={d.v} placeholder="Valeur" onChange={e => setCustomDraft(x => x.map((y, n) => n === j ? { ...y, v: e.target.value } : y))} style={input} aria-label="Valeur du paramètre" />
              <button type="button" className="btn-secondary" style={{ fontSize: 12 }} disabled={!/^P\d+$/.test(d.p) || d.p in cat.managed}
                title={d.p in cat.managed ? 'Réglé par SIPV' : undefined}
                onClick={() => { set(d.p, d.v); setCustomDraft(x => x.filter((_, n) => n !== j)) }}>Ajouter</button>
            </div>
          ))}
          <button type="button" className="btn-secondary" style={{ fontSize: 12, marginTop: 6 }} onClick={() => setCustomDraft(x => [...x, { p: '', v: '' }])}>+ Ajouter un champ</button>
        </div>
      </div>
    </div>
  )
}
