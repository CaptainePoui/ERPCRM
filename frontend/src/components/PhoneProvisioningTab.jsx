// Onglet « Provisionnement » du poste (TASK-051, 2026-10-14). Philippe : « le choix du template, mais aussi les réglages
// que le template donne, avec des cases cochées (Modèle) ; si je décoche, je peux configurer l'option personnalisée ».
// Options, touches et boutons sous l'écran : case « Modèle » cochée = valeur du modèle ; décochée = personnalisé pour ce
// poste (remplace celle du modèle). Enregistré d'un coup ; le téléphone le prend au prochain chargement de sa config.
import { useEffect, useState } from 'react'
import api from '../services/api'
import { box, title, muted, input, OptionsFields, TemplateCheck, KeyRow, KeysPage, SoftkeysPage, preferredLayouts } from './ProvisioningTemplates'

const NONE = { button_type: 'none', label: '', value: '' }
const asKey = b => ({ button_type: b.button_type, label: b.label || '', value: b.value || '' })

export default function PhoneProvisioningTab({ contactId, phone, onPhoneChange }) {
  const base = `/v1/contacts/${contactId}/sip-extension/phone/${phone.id}`
  const [templates, setTemplates] = useState([])
  const [cat, setCat] = useState(null)
  const [brand, setBrand] = useState('')
  const [options, setOptions] = useState(phone.extra_config || {})
  const [own, setOwn] = useState({})                  // "page-position" -> touche personnalisée du poste
  const [layouts, setLayouts] = useState(phone.softkeys?.layouts || {})
  const [view, setView] = useState('main')
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get(`${base}/button-templates`).then(r => setTemplates(r.data)).catch(() => setTemplates([]))
    api.get(`${base}/buttons`).then(r => setOwn(Object.fromEntries(r.data.map(b => [`${b.page}-${b.position}`, asKey(b)]))))
    if (phone.phone_model_id) api.get(`/v1/contacts/${contactId}/sip-extension/key-catalog/${phone.phone_model_id}`)
      .then(r => { setCat(r.data.catalog); setBrand(r.data.brand) }).catch(() => setCat(null))
  }, [phone.id])   // eslint-disable-line

  const tpl = templates.find(t => t.id === phone.button_template_id) || null
  const tplKeys = Object.fromEntries((tpl?.items || []).map(i => [`${i.page}-${i.position}`, asKey(i)]))
  const tplLayouts = tpl?.softkeys?.layouts || (cat ? preferredLayouts(cat) : {})
  const touch = f => (...a) => { f(...a); setDirty(true); setMsg('') }

  async function chooseTemplate(id) {
    if (dirty && !confirm('Changer de modèle ? Les changements non enregistrés de cet onglet seront perdus.')) return
    const r = await api.put(`${base}/button-template`, { button_template_id: id || null })
    onPhoneChange({ ...phone, button_template_id: r.data.button_template_id })
  }

  async function save() {
    setSaving(true); setMsg('')
    const buttons = Object.entries(own).map(([k, v]) => { const [page, position] = k.split('-').map(Number); return { page, position, ...v } })
    try {
      const r = await api.put(`${base}/provisioning`, { extra_config: options, softkeys: { layouts }, buttons })
      onPhoneChange({ ...phone, extra_config: r.data.extra_config, softkeys: r.data.softkeys })
      setDirty(false); setMsg('Enregistré — le téléphone le prendra au prochain chargement de sa configuration (bouton « Pousser la config »).')
    } catch (e) { setMsg(e.response?.data?.detail || 'Erreur') } finally { setSaving(false) }
  }

  async function saveAsTemplate() {
    if (dirty) { alert('Enregistrez d\'abord vos changements.'); return }
    const name = prompt('Nom du nouveau modèle (les réglages de ce poste deviennent un modèle de la compagnie, utilisé par ce poste) :')
    if (!name?.trim()) return
    try { await api.post(`${base}/save-as-template`, { name: name.trim() }) } catch (e) { alert(e.response?.data?.detail || 'Erreur'); return }
    window.location.reload()
  }

  const pages = cat ? Math.max(tpl?.pages || 1, ...Object.keys(own).map(k => Number(k.split('-')[0]) + 1)) : 0
  const customCount = Object.keys(options).length + Object.keys(own).length + Object.keys(layouts).length
  const actions = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 18, flexWrap: 'wrap' }}>
      <button className="btn-primary" onClick={save} disabled={saving || !dirty}>{saving ? '...' : 'Enregistrer'}</button>
      <button className="btn-secondary" onClick={saveAsTemplate} disabled={saving}>Sauvegarder comme modèle</button>
      {msg && <span style={{ fontSize: 13, color: msg.startsWith('Enregistré') ? '#059669' : '#DC2626' }}>{msg}</span>}
    </div>
  )

  if (view === 'softkeys' && cat) return (
    <div style={box}>
      <SoftkeysPage cat={cat} layouts={layouts} inheritedLayouts={tplLayouts} onChange={touch(setLayouts)} onBack={() => setView('main')} />
      {actions}
    </div>
  )

  return (
    <div>
      <div style={box}>
        <div style={title}>Modèle de provisionnement</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <select value={phone.button_template_id || ''} onChange={e => chooseTemplate(e.target.value)} aria-label="Modèle de provisionnement"
            style={{ ...input, width: 320 }}>
            <option value="">Aucun (valeurs par défaut, touches à « aucune »)</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <span style={muted}>
            {templates.length ? 'Seuls les modèles de la compagnie faits pour ce téléphone sont offerts.' : 'Aucun modèle pour ce téléphone : créez-en un dans la fiche Compagnie → Téléphonie → Provisionnement.'}
          </span>
        </div>
        <div style={{ ...muted, marginTop: 10 }}>
          Case <b>Modèle</b> cochée : le réglage vient du modèle. Décochée : il est personnalisé pour ce poste.
          {customCount > 0 && ` ${customCount} réglage(s) personnalisé(s).`}
        </div>
      </div>

      {!cat ? <div style={box}><span style={muted}>Ce téléphone n'a pas encore de disposition de touches (pour l'instant : GXP2130, 2135, 2140, 2160, 2170).</span></div> : (
        <div style={box}>
          <div style={title}>Options du téléphone</div>
          <div style={{ marginBottom: 22 }}>
            <OptionsFields brand={brand} value={options} inherited={tpl?.options || {}} onChange={touch(setOptions)} />
          </div>

          <div style={title}>Touches à côté de l'écran</div>
          <div style={{ ...muted, marginBottom: 10 }}>Touches « Ligne » : la première affiche le nom du poste ; les suivantes s'affichent sans nom et servent aux appels suivants du même poste (comme sur l'UCM).</div>
          {Array.from({ length: pages }, (_, p) => (
            <KeysPage key={p} cat={cat} page={p} renderKey={(pos, n, modes) => {
              const k = `${p}-${pos}`
              const fromTpl = !(k in own)
              return <KeyRow key={pos} n={n} modes={modes} k={fromTpl ? (tplKeys[k] || NONE) : own[k]} disabled={fromTpl}
                onChange={v => touch(setOwn)(prev => ({ ...prev, [k]: v }))}
                check={<TemplateCheck checked={fromTpl} onChange={c => touch(setOwn)(prev => {
                  const next = { ...prev }; if (c) delete next[k]; else next[k] = { ...(tplKeys[k] || NONE) }; return next
                })} />} />
            }} />
          ))}
          {pages < cat.pages && <div style={{ ...muted, marginBottom: 18 }}>Les autres pages se font dans le modèle (« Ajouter une page »).</div>}

          <div style={{ ...title, marginTop: 6 }}>Boutons sous l'écran</div>
          <button type="button" onClick={() => setView('softkeys')} aria-label="Boutons sous l'écran"
            style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', maxWidth: 620, textAlign: 'left', cursor: 'pointer', padding: '14px 16px',
              border: '1px solid var(--c-border-strong)', borderRadius: 12, background: 'var(--c-surface-2)', color: 'inherit', font: 'inherit' }}>
            <span style={{ fontSize: 22 }}>▭▭▭</span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>Disposition des boutons sous l'écran</span>
              <span style={muted}>{Object.keys(layouts).length ? `${Object.keys(layouts).length} état(s) personnalisé(s) pour ce poste` : 'tout vient du modèle'}</span>
            </span>
            <span style={{ fontSize: 18, color: 'var(--brand)' }}>→</span>
          </button>
          {actions}
        </div>
      )}
    </div>
  )
}
