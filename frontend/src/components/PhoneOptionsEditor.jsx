import { useState, useEffect } from 'react'
import api from '../services/api'

// Style "Options" UCM Grandstream (TASK-S011.5) : catalogue caché par défaut,
// seule une option ajoutée explicitement ou couverte par le template actif
// apparaît. `value` = dict {clé: valeur} des overrides personnalisés
// (défauts compagnie ou override poste selon l'appelant), `onChange` reçoit
// le nouveau dict complet à sauvegarder.
//
// TASK-S044.1 : `templateOptions` (dict résolu du template actuellement
// choisi, ou null/undefined si aucun) fait apparaître automatiquement les
// options qu'il couvre avec une étiquette "(as template)" -- cliquer dessus
// personnalise le champ (ajoute la clé à `value`) ; cliquer sur l'étiquette
// une fois personnalisé revient au template (retire la clé de `value`).
export default function PhoneOptionsEditor({ title, value, onChange, disabledHint, templateOptions, templateLabel }) {
  const [catalog, setCatalog] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  // Indice visuel de sauvegarde (demande Philippe 2026-08-04) : une option
  // touchee passe en bleu tant que la sauvegarde est en cours, revient a la
  // normale une fois confirmee -- `onChange` doit retourner une promesse
  // (deja le cas partout ou ce composant est utilise, fonctions async).
  const [savingKeys, setSavingKeys] = useState(new Set())

  useEffect(() => { api.get('/v1/ref/phone-options').then(r => setCatalog(r.data)) }, [])

  const current = value || {}
  const tmpl = templateOptions || null
  const customKeys = Object.keys(current)
  const templateKeys = tmpl ? catalog.filter(o => o.key in tmpl).map(o => o.key) : []
  const shownKeys = [...new Set([...customKeys, ...templateKeys])]
  const availableToAdd = catalog.filter(o => !shownKeys.includes(o.key))

  async function persist(key, next) {
    setSavingKeys(p => new Set(p).add(key))
    const start = Date.now()
    try {
      await onChange(next)
    } finally {
      // Reseau local = souvent <50ms -- l'indice bleu pouvait disparaitre avant
      // meme d'etre visible (signale par Philippe, 2026-08-04, sur le formulaire
      // BV qui utilise le meme principe). Duree minimum garantie ici aussi.
      const elapsed = Date.now() - start
      if (elapsed < 400) await new Promise(r => setTimeout(r, 400 - elapsed))
      setSavingKeys(p => { const n = new Set(p); n.delete(key); return n })
    }
  }
  function addOption(opt) {
    persist(opt.key, { ...current, [opt.key]: opt.default })
    setShowPicker(false)
  }
  function removeOption(key) {
    const next = { ...current }
    delete next[key]
    persist(key, next)
  }
  function setValue(key, val) {
    persist(key, { ...current, [key]: val })
  }

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</div>
        <div style={{ position: 'relative' }}>
          <button className="btn-primary" style={{ fontSize: 12, padding: '5px 12px' }}
            disabled={!!disabledHint} title={disabledHint || ''}
            onClick={() => setShowPicker(v => !v)}>+ Ajouter une option</button>
          {showPicker && (
            <div style={{ position: 'absolute', right: 0, top: '110%', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', zIndex: 10, minWidth: 220 }}>
              {availableToAdd.length === 0 ? (
                <div style={{ padding: 10, fontSize: 13, color: '#9CA3AF' }}>Toutes les options sont déjà ajoutées.</div>
              ) : availableToAdd.map(o => (
                <div key={o.key} onClick={() => addOption(o)}
                  style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid #F3F4F6' }}>
                  {o.label}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {shownKeys.length === 0 ? (
        <div className="empty-tab">Aucune option ajoutée.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shownKeys.map(key => {
            const opt = catalog.find(o => o.key === key)
            if (!opt) return null
            const isCustom = key in current
            const isFromTemplate = !!(tmpl && key in tmpl)
            const displayValue = isCustom ? current[key] : tmpl[key]
            const isSaving = savingKeys.has(key)
            return (
              <div key={key} style={{
                display: 'flex', alignItems: 'center', gap: 10, background: isSaving ? '#EFF6FF' : '#F9FAFB',
                border: `1px solid ${isSaving ? '#3B82F6' : '#E5E7EB'}`, borderRadius: 8, padding: '8px 12px',
                transition: 'background 0.15s, border-color 0.15s',
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, minWidth: 160 }}>{opt.label}</div>
                {opt.type === 'select' ? (
                  <select value={displayValue} onChange={e => setValue(key, e.target.value)} style={{ fontSize: 13 }}>
                    {opt.choices.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                ) : (
                  <input value={displayValue} onChange={e => setValue(key, e.target.value)} style={{ fontSize: 13 }} />
                )}
                {isFromTemplate && (
                  <span
                    onClick={isCustom ? () => removeOption(key) : undefined}
                    title={isCustom ? `Revenir au template${templateLabel ? ` (${templateLabel})` : ''}` : `Suit le template${templateLabel ? ` (${templateLabel})` : ''}`}
                    style={{
                      fontSize: 11, fontWeight: 600, borderRadius: 10, padding: '2px 8px',
                      cursor: isCustom ? 'pointer' : 'default',
                      background: isCustom ? '#F3F4F6' : '#DBEAFE',
                      color: isCustom ? '#6B7280' : '#1D4ED8',
                    }}
                  >
                    (as template)
                  </span>
                )}
                {!isFromTemplate && (
                  <button className="inv-del-btn" onClick={() => removeOption(key)} style={{ marginLeft: 'auto' }}
                    title="Retirer cette option">✕</button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
