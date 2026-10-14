// Téléphonie → Provisionnement : modèles de provisionnement de la compagnie (TASK-051, 2026-10-14). Philippe : « c'est LA
// place ! pas de doublon ; on crée ici, "sauvegarder comme modèle" dans le poste l'ajoute ici, dans le poste on choisit le
// modèle (ceux disponibles pour le modèle de téléphone) ». Par modèle de téléphone : les touches page par page (« Ajouter une
// page » ; une page non ajoutée n'est pas affichée et ses touches partent à « aucune »), chaque touche = menu déroulant du mode
// + description + valeur ; les boutons sous l'écran ; la disposition des boutons pendant un appel (deux fenêtres + flèches).
// Tout ce qui est offert vient du gabarit officiel Grandstream, lu de SIPV (/key-catalog).
import { useEffect, useState } from 'react'
import api from '../services/api'

const box = { border: '1px solid var(--c-border)', borderRadius: 10, padding: 16, marginBottom: 16, background: 'var(--c-surface)' }
const title = { fontWeight: 700, fontSize: 13, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }
const muted = { fontSize: 12, color: 'var(--c-muted)' }
const input = { fontSize: 13, padding: '5px 8px', width: '100%', boxSizing: 'border-box' }

function emptySoftkeys(cat) {
  return {
    idle: Array.from({ length: cat.softkeys.idle_count }, () => ({ mode: 'Default', description: '', value: '' })),
    call: Array.from({ length: cat.softkeys.call_count }, () => ({ mode: 'Default', description: '', value: '' })),
    hide_idle: [],
    layouts: Object.fromEntries(cat.softkeys.states.map(s => [s.key, s.default])),
  }
}

// Deux fenêtres : à gauche ce qui est offert, à droite ce qu'on envoie, dans l'ordre (flèches ou double-clic)
function DualList({ options, value, onChange, leftTitle = 'Disponibles', rightTitle = 'Envoyés au téléphone (dans l\'ordre)' }) {
  const [left, setLeft] = useState(null)
  const [right, setRight] = useState(null)
  const available = options.filter(o => !value.includes(o))
  const add = o => { if (o) { onChange([...value, o]); setLeft(null); setRight(o) } }
  const remove = o => { if (o) { onChange(value.filter(v => v !== o)); setRight(null); setLeft(o) } }
  const move = d => {
    const i = value.indexOf(right); const j = i + d
    if (i < 0 || j < 0 || j >= value.length) return
    const next = [...value]; [next[i], next[j]] = [next[j], next[i]]; onChange(next)
  }
  const list = (items, sel, setSel, onDbl) => (
    <div style={{ border: '1px solid var(--c-border)', borderRadius: 8, height: 220, overflowY: 'auto', background: 'var(--c-surface-2)' }}>
      {items.map(o => (
        <div key={o} onClick={() => setSel(o)} onDoubleClick={() => onDbl(o)}
          style={{ padding: '5px 10px', fontSize: 13, cursor: 'pointer', fontFamily: 'monospace',
            background: sel === o ? 'var(--brand)' : 'transparent', color: sel === o ? '#fff' : 'inherit' }}>{o}</div>
      ))}
      {items.length === 0 && <div style={{ ...muted, padding: 10 }}>—</div>}
    </div>
  )
  const arrow = { fontSize: 14, padding: '4px 12px' }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto', gap: 10, alignItems: 'center', maxWidth: 760 }}>
      <div><div style={{ ...muted, marginBottom: 4 }}>{leftTitle}</div>{list(available, left, setLeft, add)}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button type="button" className="btn-secondary" style={arrow} onClick={() => add(left)} disabled={!left} title="Envoyer">→</button>
        <button type="button" className="btn-secondary" style={arrow} onClick={() => remove(right)} disabled={!right} title="Retirer">←</button>
      </div>
      <div><div style={{ ...muted, marginBottom: 4 }}>{rightTitle}</div>{list(value, right, setRight, remove)}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button type="button" className="btn-secondary" style={arrow} onClick={() => move(-1)} disabled={!right} title="Monter">▲</button>
        <button type="button" className="btn-secondary" style={arrow} onClick={() => move(1)} disabled={!right} title="Descendre">▼</button>
      </div>
    </div>
  )
}

// Options du téléphone (langue, etc.) : toutes celles du catalogue valables pour la marque, à leur place, sans chaîne cachée
function OptionsFields({ brand, value, onChange }) {
  const [catalog, setCatalog] = useState([])
  useEffect(() => { api.get('/v1/ref/phone-options').then(r => setCatalog(r.data)) }, [])
  const opts = catalog.filter(o => !o.compatible_brands || o.compatible_brands.includes(brand))
  if (!opts.length) return <div style={muted}>Aucune option pour cette marque.</div>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, maxWidth: 900 }}>
      {opts.map(o => (
        <div key={o.key}>
          <div className="ifield-label">{o.label}</div>
          {o.type === 'select' ? (
            <select value={value[o.key] ?? o.default} onChange={e => onChange({ ...value, [o.key]: e.target.value })} style={input} aria-label={o.label}>
              {o.choices.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          ) : (
            <input value={value[o.key] ?? o.default ?? ''} onChange={e => onChange({ ...value, [o.key]: e.target.value })} style={input} aria-label={o.label} />
          )}
        </div>
      ))}
    </div>
  )
}

function KeyRow({ n, k, modes, onChange }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '64px 1.3fr 1fr 1fr', gap: 6, alignItems: 'center', marginBottom: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-muted)' }}>Touche {n}</div>
      <select value={k.button_type} onChange={e => onChange({ ...k, button_type: e.target.value })} style={input} aria-label={`Touche ${n} mode`}>
        {modes.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
      </select>
      <input placeholder="Description" value={k.label || ''} disabled={k.button_type === 'none'} onChange={e => onChange({ ...k, label: e.target.value })} style={input} />
      <input placeholder="Valeur" value={k.value || ''} disabled={k.button_type === 'none' || k.button_type === 'line'} onChange={e => onChange({ ...k, value: e.target.value })} style={input} aria-label={`Touche ${n} valeur`} />
    </div>
  )
}

function SoftkeyRows({ rows, modes, onChange }) {
  return rows.map((k, i) => (
    <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 1.3fr 1fr 1fr', gap: 6, alignItems: 'center', marginBottom: 6, maxWidth: 900 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-muted)' }}>Bouton {i + 1}</div>
      <select value={k.mode} onChange={e => onChange(i, { ...k, mode: e.target.value })} style={input}>
        {modes.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
      </select>
      <input placeholder="Description" value={k.description || ''} disabled={k.mode === 'Default'} onChange={e => onChange(i, { ...k, description: e.target.value })} style={input} />
      <input placeholder="Valeur" value={k.value || ''} disabled={k.mode === 'Default'} onChange={e => onChange(i, { ...k, value: e.target.value })} style={input} />
    </div>
  ))
}

function TemplateEditor({ companyId, phoneModels, template, onClose, onSaved }) {
  const [name, setName] = useState(template?.name || '')
  const [modelId, setModelId] = useState(template?.phone_model_id || '')
  const [cat, setCat] = useState(null)
  const [brand, setBrand] = useState('')
  const [options, setOptions] = useState(template?.options || null)
  const [catMsg, setCatMsg] = useState('')
  const [pages, setPages] = useState(template?.pages || 1)
  const [keys, setKeys] = useState({})            // "page-position" -> touche
  const [softkeys, setSoftkeys] = useState(template?.softkeys || null)
  const [state, setState] = useState('inCallConnected')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const m = {}
    for (const i of template?.items || []) m[`${i.page}-${i.position}`] = { button_type: i.button_type, label: i.label || '', value: i.value || '' }
    setKeys(m)
  }, [template])

  useEffect(() => {
    setCat(null); setCatMsg('')
    if (!modelId) return
    api.get(`/v1/companies/${companyId}/key-catalog/${modelId}`).then(r => {
      if (!r.data.catalog) { setCatMsg(`Le ${r.data.model} n'a pas encore de disposition de touches (pour l'instant : GXP2130, 2135, 2140, 2160, 2170).`); return }
      setCat(r.data.catalog)
      setBrand(r.data.brand)
      setOptions(o => o || { ...r.data.default_options })      // nouveau modèle : valeurs Simple IP, modifiables
      setSoftkeys(s => s || emptySoftkeys(r.data.catalog))
    }).catch(e => setCatMsg(e.response?.data?.detail || 'SIPV injoignable'))
  }, [modelId, companyId])

  const key = (p, pos) => keys[`${p}-${pos}`] || { button_type: 'none', label: '', value: '' }
  const setKey = (p, pos, k) => setKeys(prev => ({ ...prev, [`${p}-${pos}`]: k }))
  function removePage() {
    if (!confirm(`Retirer la page ${pages} ? Ses touches repasseront à « aucune ».`)) return
    setKeys(prev => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(`${pages - 1}-`))))
    setPages(pages - 1)
  }

  async function save() {
    setSaving(true); setError('')
    const items = Object.entries(keys).map(([k, v]) => { const [page, position] = k.split('-').map(Number); return { page, position, ...v } })
      .filter(i => i.page < pages && i.button_type !== 'none')
    const body = { name: name.trim(), phone_model_id: modelId, pages, options, softkeys, items }
    try {
      const r = template ? await api.put(`/v1/companies/${companyId}/button-templates/${template.id}`, body)
        : await api.post(`/v1/companies/${companyId}/button-templates`, body)
      onSaved(r.data)
    } catch (e) { setError(e.response?.data?.detail || 'Erreur') } finally { setSaving(false) }
  }

  const models = phoneModels.filter(m => m.brand === 'Grandstream').sort((a, b) => a.model.localeCompare(b.model))
  const stateDef = cat?.softkeys.states.find(s => s.key === state)
  return (
    <div style={{ ...box, borderColor: 'var(--brand)' }}>
      <div style={{ ...title, marginBottom: 14 }}>{template ? `Modifier « ${template.name} »` : 'Nouveau modèle de provisionnement'}</div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px', maxWidth: 360 }}>
          <div className="ifield-label">Nom</div>
          <input value={name} onChange={e => setName(e.target.value)} style={input} placeholder="ex. Réception" aria-label="Nom du modèle" />
        </div>
        <div style={{ flex: '1 1 200px', maxWidth: 260 }}>
          <div className="ifield-label">Modèle de téléphone</div>
          <select value={modelId} onChange={e => setModelId(e.target.value)} style={input} disabled={!!template?.phones} aria-label="Modèle de téléphone"
            title={template?.phones ? 'Des postes utilisent ce modèle' : undefined}>
            <option value="">— Choisir —</option>
            {models.map(m => <option key={m.id} value={m.id}>{m.brand} {m.model}</option>)}
          </select>
        </div>
      </div>
      {catMsg && <div style={{ ...muted, marginBottom: 12 }}>{catMsg}</div>}

      {cat && (<>
        <div style={title}>Options du téléphone</div>
        <div style={{ marginBottom: 20 }}><OptionsFields brand={brand} value={options || {}} onChange={setOptions} /></div>

        <div style={title}>Touches à côté de l'écran</div>
        {Array.from({ length: pages }, (_, p) => {
          const base = p * cat.per_page
          const count = Math.min(cat.per_page, cat.total - base)
          const fixed = p === 0
          const modes = cat.modes.filter(m => base + 1 <= cat.fixed || !m.fixed_only)
          const half = Math.ceil(count / 2)
          const col = positions => positions.map(pos => <KeyRow key={pos} n={base + pos} k={key(p, pos)} modes={base + pos <= cat.fixed ? cat.modes : modes} onChange={k => setKey(p, pos, k)} />)
          return (
            <div key={p} style={{ border: '1px solid var(--c-border)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Page {p + 1}</div>
                <span style={{ ...muted, marginLeft: 10 }}>{fixed ? 'touches physiques : à gauche 1-' + half + ', à droite ' + (half + 1) + '-' + count : 'page suivante sur l\'écran (pas de ligne)'}</span>
                {p > 0 && p === pages - 1 && <button type="button" className="btn-secondary" style={{ marginLeft: 'auto', fontSize: 12, padding: '3px 10px' }} onClick={removePage}>Retirer la page</button>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <div>{col(Array.from({ length: half }, (_, i) => i + 1))}</div>
                <div>{col(Array.from({ length: count - half }, (_, i) => half + i + 1))}</div>
              </div>
            </div>
          )
        })}
        {pages < cat.pages && <button type="button" className="btn-secondary" style={{ fontSize: 13, marginBottom: 20 }} onClick={() => setPages(pages + 1)}>+ Ajouter une page</button>}

        {softkeys && (<>
          <div style={{ ...title, marginTop: 10 }}>Boutons sous l'écran — écran au repos</div>
          <SoftkeyRows rows={softkeys.idle} modes={cat.softkeys.idle_modes}
            onChange={(i, k) => setSoftkeys(s => ({ ...s, idle: s.idle.map((x, j) => j === i ? k : x) }))} />
          <div style={{ ...muted, margin: '10px 0 6px' }}>Boutons du téléphone cachés au repos</div>
          <DualList options={cat.softkeys.idle_system} value={softkeys.hide_idle || []} leftTitle="Affichés" rightTitle="Cachés"
            onChange={v => setSoftkeys(s => ({ ...s, hide_idle: v }))} />

          <div style={{ ...title, marginTop: 20 }}>Boutons sous l'écran — pendant un appel</div>
          <SoftkeyRows rows={softkeys.call} modes={cat.softkeys.call_modes}
            onChange={(i, k) => setSoftkeys(s => ({ ...s, call: s.call.map((x, j) => j === i ? k : x) }))} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0 8px' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Disposition quand le téléphone est</span>
            <select value={state} onChange={e => setState(e.target.value)} style={{ ...input, width: 'auto' }} aria-label="État d'appel">
              {cat.softkeys.states.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <button type="button" className="btn-secondary" style={{ fontSize: 12, padding: '3px 10px' }}
              onClick={() => setSoftkeys(s => ({ ...s, layouts: { ...s.layouts, [state]: stateDef.default } }))}>Remettre par défaut</button>
          </div>
          {stateDef && <DualList options={stateDef.options} value={softkeys.layouts?.[state] || stateDef.default}
            onChange={v => setSoftkeys(s => ({ ...s, layouts: { ...s.layouts, [state]: v } }))} />}
        </>)}
      </>)}

      {error && <div style={{ color: '#DC2626', fontSize: 13, marginTop: 12 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        <button className="btn-primary" onClick={save} disabled={saving || !name.trim() || !cat}>{saving ? '...' : 'Enregistrer'}</button>
        <button className="btn-secondary" onClick={onClose} disabled={saving}>Annuler</button>
      </div>
    </div>
  )
}

export default function ProvisioningTemplates({ companyId, phoneModels, sipvEnabled }) {
  const [templates, setTemplates] = useState(null)
  const [editing, setEditing] = useState(null)      // null | 'new' | modèle
  const [error, setError] = useState('')

  const load = () => api.get(`/v1/companies/${companyId}/button-templates`).then(r => setTemplates(r.data)).catch(() => setTemplates([]))
  useEffect(() => { load() }, [companyId])   // eslint-disable-line

  async function remove(t) {
    if (!confirm(`Supprimer le modèle « ${t.name} » ?`)) return
    setError('')
    try { await api.delete(`/v1/companies/${companyId}/button-templates/${t.id}`); load() } catch (e) { setError(e.response?.data?.detail || 'Erreur') }
  }

  if (!sipvEnabled) return <div className="empty-tab">Cette compagnie n'a pas de tenant téléphonique.</div>
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ ...title, marginBottom: 0 }}>Modèles de provisionnement ({templates?.length ?? 0})</div>
        {!editing && <button className="btn-primary" style={{ marginLeft: 'auto', fontSize: 13 }} onClick={() => setEditing('new')}>+ Nouveau modèle</button>}
      </div>
      <div style={{ ...muted, marginBottom: 14 }}>
        Un modèle par type de téléphone : ses options, ses touches et ses boutons sous l'écran. Un nouveau modèle part des valeurs
        par défaut du serveur. Chaque poste choisit le sien dans sa fiche et peut y ajuster une option ou une touche (« Sauvegarder
        comme modèle » dans un poste l'ajoute ici). Un changement s'applique aux postes qui l'utilisent au prochain redémarrage.
      </div>
      {editing && <TemplateEditor companyId={companyId} phoneModels={phoneModels} template={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
      {error && <div style={{ color: '#DC2626', fontSize: 13, marginBottom: 10 }}>{error}</div>}
      {templates === null ? <div className="loading">Chargement...</div> : templates.length === 0 ? (
        <div className="empty-tab">Aucun modèle.</div>
      ) : (
        <table className="adm-table" style={{ width: '100%' }}>
          <thead><tr><th>Nom</th><th>Téléphone</th><th>Pages</th><th>Touches configurées</th><th>Postes qui l'utilisent</th><th style={{ width: 200 }}></th></tr></thead>
          <tbody>
            {templates.map(t => (
              <tr key={t.id}>
                <td style={{ fontWeight: 600 }}>{t.name}</td>
                <td>{t.phone_model || <span style={muted}>—</span>}</td>
                <td>{t.pages}</td>
                <td>{t.items.length}</td>
                <td>{t.phones}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="btn-secondary" style={{ fontSize: 12, padding: '3px 10px', marginRight: 6 }} onClick={() => setEditing(t)} disabled={!!editing}>Modifier</button>
                  <button className="btn-secondary" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => remove(t)} disabled={!!editing}>Supprimer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
