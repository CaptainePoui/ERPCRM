// Téléphonie → Provisionnement : modèles de provisionnement de la compagnie (TASK-051, 2026-10-14). Philippe : « c'est LA
// place ! pas de doublon » ; la liste des modèles en haut, on en choisit un et ses réglages apparaissent en dessous ; on
// choisit d'abord le modèle de téléphone (les bonnes options à la bonne place) ; touches page par page (« Ajouter une page »,
// une page non ajoutée n'est pas affichée et ses touches partent à « aucune ») ; boutons sous l'écran = seulement la
// disposition par état d'appel (« les options des softkeys »), sur une page à part, deux fenêtres + flèches.
// Tout ce qui est offert vient du gabarit officiel Grandstream, lu de SIPV (/key-catalog). Les blocs exportés servent aussi
// à l'onglet Provisionnement du poste.
import { useEffect, useState } from 'react'
import api from '../services/api'
import OptionsTree from './OptionsTree'
import WallpapersSection, { WallpaperSelect } from './WallpapersSection'
import { askConfirm } from './Dialog'

export const box = { border: '1px solid var(--c-border)', borderRadius: 12, padding: 18, marginBottom: 16, background: 'var(--c-surface)' }
export const title = { fontWeight: 700, fontSize: 13, color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }
export const muted = { fontSize: 12, color: 'var(--c-muted)' }
export const input = { fontSize: 13, padding: '5px 8px', width: '100%', boxSizing: 'border-box' }

export const preferredLayouts = cat => Object.fromEntries(cat.softkeys.states.map(s => [s.key, s.default]))
const same = (a, b) => (a || []).join(',') === (b || []).join(',')

// Deux fenêtres : à gauche ce qui est offert, à droite ce qu'on envoie, dans l'ordre (flèches ou double-clic)
export function DualList({ options, value, onChange, labels = {}, disabled = false, height = 168 }) {
  const [left, setLeft] = useState(null)
  const [right, setRight] = useState(null)
  const available = options.filter(o => !value.includes(o))
  const add = o => { if (o && !disabled) { onChange([...value, o]); setLeft(null); setRight(o) } }
  const remove = o => { if (o && !disabled) { onChange(value.filter(v => v !== o)); setRight(null); setLeft(o) } }
  const move = d => {
    const i = value.indexOf(right); const j = i + d
    if (disabled || i < 0 || j < 0 || j >= value.length) return
    const next = [...value]; [next[i], next[j]] = [next[j], next[i]]; onChange(next)
  }
  const list = (items, sel, setSel, onDbl, numbered) => (
    <div style={{ border: '1px solid var(--c-border)', borderRadius: 8, height, overflowY: 'auto', background: 'var(--c-surface-2)', padding: 4 }}>
      {items.map((o, i) => (
        <div key={o} onClick={() => !disabled && setSel(o)} onDoubleClick={() => onDbl(o)}
          style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 8px', fontSize: 13, borderRadius: 6, cursor: disabled ? 'default' : 'pointer',
            background: sel === o ? 'var(--brand)' : 'transparent', color: sel === o ? '#fff' : 'inherit', userSelect: 'none' }}>
          {numbered && <span style={{ fontSize: 11, opacity: 0.6, width: 14, textAlign: 'right' }}>{i + 1}</span>}
          {labels[o] || o}
        </div>
      ))}
      {items.length === 0 && <div style={{ ...muted, padding: 8 }}>—</div>}
    </div>
  )
  const arrow = { fontSize: 13, padding: '3px 10px', minWidth: 34 }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto', gap: 8, alignItems: 'center', opacity: disabled ? 0.6 : 1 }}>
      <div><div style={{ ...muted, marginBottom: 3 }}>Disponibles</div>{list(available, left, setLeft, add, false)}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button type="button" className="btn-secondary" style={arrow} onClick={() => add(left)} disabled={disabled || !left} title="Ajouter">→</button>
        <button type="button" className="btn-secondary" style={arrow} onClick={() => remove(right)} disabled={disabled || !right} title="Retirer">←</button>
      </div>
      <div><div style={{ ...muted, marginBottom: 3 }}>Sur le téléphone, dans l'ordre</div>{list(value, right, setRight, remove, true)}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button type="button" className="btn-secondary" style={arrow} onClick={() => move(-1)} disabled={disabled || !right} title="Monter">▲</button>
        <button type="button" className="btn-secondary" style={arrow} onClick={() => move(1)} disabled={disabled || !right} title="Descendre">▼</button>
      </div>
    </div>
  )
}

export function TemplateCheck({ checked, onChange }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer',
      color: checked ? 'var(--brand)' : 'var(--c-muted)' }} title={checked ? 'Valeur du modèle — décocher pour personnaliser ce poste' : 'Personnalisé pour ce poste — cocher pour reprendre la valeur du modèle'}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ width: 13, height: 13, accentColor: 'var(--brand)' }} />
      Modèle
    </label>
  )
}

export function KeyRow({ n, k, modes, accounts = 1, onChange, disabled, check }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: (check ? '64px 70px ' : '64px ') + '1.3fr 92px 1fr 1fr', gap: 6, alignItems: 'center', marginBottom: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-muted)' }}>Touche {n}</div>
      {check}
      <select value={k.button_type} disabled={disabled} onChange={e => onChange({ ...k, button_type: e.target.value })} style={input} aria-label={`Touche ${n} mode`}>
        {modes.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
      </select>
      <select value={k.sip_account_index || 1} disabled={disabled || k.button_type === 'none'} onChange={e => onChange({ ...k, sip_account_index: Number(e.target.value) })}
        style={input} aria-label={`Touche ${n} compte`} title="Compte SIP du téléphone">
        {Array.from({ length: accounts }, (_, i) => <option key={i} value={i + 1}>Compte {i + 1}</option>)}
      </select>
      <input placeholder="Description" value={k.label || ''} disabled={disabled || k.button_type === 'none'} onChange={e => onChange({ ...k, label: e.target.value })} style={input} aria-label={`Touche ${n} description`} />
      <input placeholder="Valeur" value={k.value || ''} disabled={disabled || k.button_type === 'none' || k.button_type === 'line'} onChange={e => onChange({ ...k, value: e.target.value })} style={input} aria-label={`Touche ${n} valeur`} />
    </div>
  )
}

// Une page de touches telle que sur le téléphone : la moitié à gauche, l'autre à droite
export function KeysPage({ cat, page, keyAt, renderKey, header }) {
  const base = page * cat.per_page
  const count = Math.min(cat.per_page, cat.total - base)
  const half = Math.ceil(count / 2)
  const col = (from, n) => Array.from({ length: n }, (_, i) => renderKey(from + i, base + from + i, base + from + i <= cat.fixed
    ? cat.modes : cat.modes.filter(m => !m.fixed_only)))
  return (
    <div style={{ border: '1px solid var(--c-border)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Page {page + 1}</div>
        <span style={muted}>{page === 0 ? `touches physiques : à gauche 1-${half}, à droite ${half + 1}-${count}` : "page suivante sur l'écran (pas de ligne)"}</span>
        {header}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>{col(1, half)}</div>
        <div>{col(half + 1, count - half)}</div>
      </div>
    </div>
  )
}

// Page « Boutons sous l'écran » : chaque état d'appel avec sa disposition (deux fenêtres). `inheritedLayouts` (poste) :
// case « Modèle » par état.
export function SoftkeysPage({ cat, layouts, onChange, onBack, inheritedLayouts }) {
  const states = cat.softkeys.states
  const pref = preferredLayouts(cat)
  const base = inheritedLayouts || pref
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <button type="button" className="btn-secondary" style={{ fontSize: 13 }} onClick={onBack}>← Retour</button>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Boutons sous l'écran</div>
        {!inheritedLayouts && <button type="button" className="btn-secondary" style={{ marginLeft: 'auto', fontSize: 12 }}
          onClick={() => onChange({ ...pref })}>Tout remettre à la préférence Simple IP</button>}
      </div>
      <div style={{ ...muted, marginBottom: 16 }}>
        Les boutons affichés sous l'écran selon ce que fait le téléphone. À droite, ceux qu'il affiche, dans l'ordre ; double-clic ou flèches pour ajouter, retirer et déplacer.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(620px, 1fr))', gap: 14 }}>
        {states.map(s => {
          const inheritedOn = inheritedLayouts && !(s.key in layouts)
          const v = inheritedOn ? (base[s.key] || s.default) : (layouts[s.key] || s.default)
          const custom = !same(v, s.default)
          return (
            <div key={s.key} style={{ border: '1px solid var(--c-border)', borderRadius: 12, padding: 14, background: 'var(--c-surface-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{s.label}</div>
                {inheritedLayouts ? <TemplateCheck checked={inheritedOn} onChange={c => {
                  const next = { ...layouts }; if (c) delete next[s.key]; else next[s.key] = v; onChange(next)
                }} /> : custom && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-on-amber)', background: 'var(--c-tint-amber)', borderRadius: 10, padding: '1px 8px' }}>modifié</span>}
                {!inheritedLayouts && custom && <button type="button" className="btn-secondary" style={{ marginLeft: 'auto', fontSize: 11, padding: '2px 8px' }}
                  onClick={() => onChange({ ...layouts, [s.key]: s.default })}>Préférence Simple IP</button>}
              </div>
              <DualList options={s.options} value={v} labels={cat.softkeys.labels} disabled={inheritedOn}
                onChange={next => onChange({ ...layouts, [s.key]: next })} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TemplateEditor({ companyId, account, phoneModels, template, onClose, onSaved }) {
  const [name, setName] = useState(template?.name || '')
  const [modelId, setModelId] = useState(template?.phone_model_id || '')
  const [cat, setCat] = useState(null)
  const [options, setOptions] = useState(template?.options || null)
  const [catMsg, setCatMsg] = useState('')
  const [pages, setPages] = useState(template?.pages || 1)
  const [keys, setKeys] = useState(() => Object.fromEntries((template?.items || []).map(i => [`${i.page}-${i.position}`,
    { button_type: i.button_type, label: i.label || '', value: i.value || '', sip_account_index: i.sip_account_index || 1 }])))
  const [layouts, setLayouts] = useState(template?.softkeys?.layouts || null)
  const [wallpaperId, setWallpaperId] = useState(template?.wallpaper_id || null)
  const [screen, setScreen] = useState(null)
  const [isDefault, setIsDefault] = useState(!!template?.is_default)
  const [wpRefresh, setWpRefresh] = useState(0)
  const [view, setView] = useState('main')        // 'main' | 'softkeys'
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setCat(null); setCatMsg('')
    if (!modelId) return
    api.get(`/v1/companies/${companyId}/key-catalog/${modelId}`).then(r => {
      if (!r.data.catalog) { setCatMsg(`Le ${r.data.model} n'a pas encore de disposition de touches (pour l'instant : GXP2130, 2135, 2140, 2160, 2170).`); return }
      setCat(r.data.catalog)
      setOptions(o => o || { ...r.data.default_options })              // nouveau modèle : valeurs Simple IP, modifiables
      setLayouts(l => l || preferredLayouts(r.data.catalog))
      setScreen(r.data.screen || null)
    }).catch(e => setCatMsg(e.response?.data?.detail || 'SIPV injoignable'))
  }, [modelId, companyId])

  const key = (p, pos) => keys[`${p}-${pos}`] || { button_type: 'none', label: '', value: '', sip_account_index: 1 }
  const setKey = (p, pos, k) => setKeys(prev => ({ ...prev, [`${p}-${pos}`]: k }))
  async function removePage() {
    if (!await askConfirm(`Retirer la page ${pages} ? Ses touches repasseront à « aucune ».`)) return
    setKeys(prev => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(`${pages - 1}-`))))
    setPages(pages - 1)
  }

  async function save() {
    setSaving(true); setError('')
    const items = Object.entries(keys).map(([k, v]) => { const [page, position] = k.split('-').map(Number); return { page, position, ...v } })
      .filter(i => i.page < pages && i.button_type !== 'none')
    const body = { name: name.trim(), phone_model_id: modelId, pages, options, softkeys: { layouts }, items, wallpaper_id: wallpaperId, is_default: isDefault }
    try {
      const r = template ? await api.put(`/v1/companies/${companyId}/button-templates/${template.id}`, body)
        : await api.post(`/v1/companies/${companyId}/button-templates`, body)
      onSaved(r.data)
    } catch (e) { setError(e.response?.data?.detail || 'Erreur') } finally { setSaving(false) }
  }

  const models = phoneModels.filter(m => m.brand === 'Grandstream').sort((a, b) => a.model.localeCompare(b.model))
  const changed = cat && layouts ? cat.softkeys.states.filter(s => !same(layouts[s.key] || s.default, s.default)).length : 0
  const actions = (
    <div style={{ display: 'flex', gap: 8, marginTop: 18, alignItems: 'center' }}>
      <button className="btn-primary" onClick={save} disabled={saving || !name.trim() || !cat}>{saving ? '...' : 'Enregistrer'}</button>
      <button className="btn-secondary" onClick={onClose} disabled={saving}>Annuler</button>
      {error && <span style={{ color: '#DC2626', fontSize: 13 }}>{error}</span>}
    </div>
  )

  if (view === 'softkeys' && cat) return (
    <div style={{ ...box, borderColor: 'var(--brand)' }}>
      <SoftkeysPage cat={cat} layouts={layouts || {}} onChange={setLayouts} onBack={() => setView('main')} />
      {actions}
    </div>
  )

  return (
    <div style={{ ...box, borderColor: 'var(--brand)' }}>
      <div style={{ ...title, marginBottom: 14 }}>{template ? `Modèle « ${template.name} »` : 'Nouveau modèle de provisionnement'}</div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 200px', maxWidth: 260 }}>
          <div className="ifield-label">Modèle de téléphone</div>
          <select value={modelId} onChange={e => setModelId(e.target.value)} style={input} disabled={!!template?.phones} aria-label="Modèle de téléphone"
            title={template?.phones ? 'Des postes utilisent ce modèle' : undefined}>
            <option value="">— Choisir d'abord —</option>
            {models.map(m => <option key={m.id} value={m.id}>{m.brand} {m.model}</option>)}
          </select>
        </div>
        <div style={{ flex: '1 1 260px', maxWidth: 360 }}>
          <div className="ifield-label">Nom</div>
          <input value={name} onChange={e => setName(e.target.value)} style={input} placeholder="ex. Réception" aria-label="Nom du modèle" />
        </div>
        <label style={{ display: 'flex', alignItems: 'flex-end', gap: 8, fontSize: 13, cursor: 'pointer', paddingBottom: 6 }}
          title="Les postes de ce modèle de téléphone qui n'ont pas de modèle choisi prennent celui-ci (comme « Default Model Template » de l'UCM)">
          <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} style={{ accentColor: 'var(--brand)' }} aria-label="Modèle par défaut" />
          Modèle par défaut
        </label>
      </div>
      {catMsg && <div style={{ ...muted, marginBottom: 12 }}>{catMsg}</div>}

      {cat && (<>
        <div style={title}>Options du téléphone</div>
        <div style={{ marginBottom: 22 }}><OptionsTree modelId={modelId} value={options || {}} onChange={setOptions} /></div>

        <div style={title}>Fond d'écran</div>
        <div style={{ marginBottom: 22 }}>
          <WallpaperSelect accountNumber={account} screen={screen} value={wallpaperId} onChange={setWallpaperId}
            emptyLabel="Fond par défaut de la compagnie" refreshKey={wpRefresh}>
            {account && <WallpapersSection accountNumber={account} buttonOnly onChanged={() => setWpRefresh(x => x + 1)}
              screen={screen} value={wallpaperId} onSelect={setWallpaperId} />}
          </WallpaperSelect>
        </div>

        <div style={title}>Touches à côté de l'écran</div>
        <div style={{ ...muted, marginBottom: 10 }}>Touches « Ligne » : la première affiche le nom du poste ; les suivantes s'affichent sans nom et servent aux appels suivants du même poste (comme sur l'UCM).</div>
        {Array.from({ length: pages }, (_, p) => (
          <KeysPage key={p} cat={cat} page={p}
            header={p > 0 && p === pages - 1 && <button type="button" className="btn-secondary" style={{ marginLeft: 'auto', fontSize: 12, padding: '3px 10px' }} onClick={removePage}>Retirer la page</button>}
            renderKey={(pos, n, modes) => <KeyRow key={pos} n={n} k={key(p, pos)} modes={modes} accounts={cat.accounts} onChange={k => setKey(p, pos, k)} />} />
        ))}
        {pages < cat.pages && <button type="button" className="btn-secondary" style={{ fontSize: 13, marginBottom: 22 }} onClick={() => setPages(pages + 1)}>+ Ajouter une page</button>}

        <div style={{ ...title, marginTop: 6 }}>Boutons sous l'écran</div>
        <button type="button" onClick={() => setView('softkeys')} aria-label="Boutons sous l'écran"
          style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', maxWidth: 620, textAlign: 'left', cursor: 'pointer', padding: '14px 16px',
            border: '1px solid var(--c-border-strong)', borderRadius: 12, background: 'var(--c-surface-2)', color: 'inherit', font: 'inherit' }}>
          <span style={{ fontSize: 22 }}>▭▭▭</span>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>Disposition des boutons sous l'écran</span>
            <span style={muted}>{cat.softkeys.states.length} états d'appel · {changed ? `${changed} modifié(s) par rapport à la préférence Simple IP` : 'préférence Simple IP'}</span>
          </span>
          <span style={{ fontSize: 18, color: 'var(--brand)' }}>→</span>
        </button>
      </>)}
      {actions}
    </div>
  )
}

export default function ProvisioningTemplates({ companyId, phoneModels, sipvEnabled }) {
  const [templates, setTemplates] = useState(null)
  const [selected, setSelected] = useState(null)      // null | 'new' | id du modèle
  const [error, setError] = useState('')

  const load = () => api.get(`/v1/companies/${companyId}/button-templates`).then(r => setTemplates(r.data)).catch(() => setTemplates([]))
  useEffect(() => { load() }, [companyId])   // eslint-disable-line

  async function pick(next) {
    if (selected && selected !== next && !await askConfirm('Quitter ce modèle ? Les changements non enregistrés seront perdus.')) return
    setSelected(next)
  }
  async function remove(t) {
    if (!await askConfirm(`Supprimer le modèle « ${t.name} » ?`)) return
    setError('')
    try { await api.delete(`/v1/companies/${companyId}/button-templates/${t.id}`); if (selected === t.id) setSelected(null); load() }
    catch (e) { setError(e.response?.data?.detail || 'Erreur') }
  }

  const [account, setAccount] = useState(null)
  useEffect(() => { api.get(`/v1/companies/${companyId}`).then(r => setAccount(r.data.account_number || null)).catch(() => {}) }, [companyId])
  if (!sipvEnabled) return <div className="empty-tab">Cette compagnie n'a pas de tenant téléphonique.</div>
  const current = templates?.find(t => t.id === selected)
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ ...title, marginBottom: 0 }}>Modèles de provisionnement ({templates?.length ?? 0})</div>
        <button className="btn-primary" style={{ marginLeft: 'auto', fontSize: 13 }} onClick={() => pick('new')}>+ Nouveau modèle</button>
      </div>
      <div style={{ ...muted, marginBottom: 12 }}>
        Un modèle par type de téléphone : ses options, ses touches et ses boutons sous l'écran. Choisissez un modèle pour voir et modifier ses réglages.
        Chaque poste choisit le sien et peut y personnaliser un réglage. Un changement s'applique aux postes au prochain chargement de leur configuration.
      </div>
      {error && <div style={{ color: '#DC2626', fontSize: 13, marginBottom: 10 }}>{error}</div>}
      {templates === null ? <div className="loading">Chargement...</div> : templates.length === 0 && selected !== 'new' ? (
        <div className="empty-tab">Aucun modèle.</div>
      ) : templates.length > 0 && (
        <table className="adm-table" style={{ width: '100%', marginBottom: 18 }}>
          <thead><tr><th>Nom</th><th>Téléphone</th><th>Pages</th><th>Touches configurées</th><th>Postes qui l'utilisent</th><th style={{ width: 110 }}></th></tr></thead>
          <tbody>
            {templates.map(t => (
              <tr key={t.id} onClick={() => pick(t.id)} aria-selected={selected === t.id}
                style={{ cursor: 'pointer', background: selected === t.id ? 'var(--c-tint-blue)' : undefined,
                  boxShadow: selected === t.id ? 'inset 3px 0 0 var(--brand)' : undefined }}>
                <td style={{ fontWeight: 600 }}>{t.name}{t.is_default && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: 'var(--brand)' }}>par défaut</span>}</td>
                <td>{t.phone_model || <span style={muted}>—</span>}</td>
                <td>{t.pages}</td>
                <td>{t.items.length}</td>
                <td>{t.phones}</td>
                <td style={{ textAlign: 'right' }} onClick={ev => ev.stopPropagation()}>
                  <button className="btn-secondary" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => remove(t)}>Supprimer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {selected && (selected === 'new' || current) && (
        <TemplateEditor key={selected} companyId={companyId} account={account} phoneModels={phoneModels} template={selected === 'new' ? null : current}
          onClose={() => setSelected(null)} onSaved={t => { load(); setSelected(t.id) }} />
      )}
    </div>
  )
}
