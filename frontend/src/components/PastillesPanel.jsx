// Administration -> Pastilles (TASK-002.3, 2026-10-10) : les pastilles des compagnies et des contacts (client,
// fournisseur, sous-traitant...). Ajouter, renommer, changer la couleur, désactiver. Jamais supprimées : une pastille
// désactivée ne s'offre plus sur les fiches, mais reste sur celles qui la portent.
import { Fragment, useEffect, useState } from 'react'
import api from '../services/api'
import { contrastText } from '../utils/color'

const EMPTY = { name: '', color: '#6B7280', company_tabs: [], contact_tabs: [], applies_to: 'both', choice_menu: false, choicesText: '' }
// TASK-002.20 (2026-11-04) : menu déroulant d'une pastille, écrit un choix par ligne ; une ligne qui finit par « : » = groupe
const toText = groups => (groups || []).map(g => (g.group ? `${g.group} :\n` : '') + g.options.join('\n')).join('\n\n')
function toGroups(text) {
  const out = []
  let cur = null
  for (const raw of (text || '').split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (line.endsWith(':')) { cur = { group: line.slice(0, -1).trim(), options: [] }; out.push(cur); continue }
    if (!cur) { cur = { group: null, options: [] }; out.push(cur) }
    cur.options.push(line)
  }
  return out.filter(g => g.options.length)
}
// TASK-002.14 : à qui la pastille s'offre (une fiche qui la porte déjà la garde)
const APPLIES = [['both', 'Compagnies et contacts'], ['companies', 'Compagnies'], ['contacts', 'Contacts']]
const appliesLabel = Object.fromEntries(APPLIES)
// TASK-002.13 : onglets de la fiche compagnie qu'une pastille peut apporter (Général, Contacts, Courriels et Journal y
// sont toujours). Même liste que core/company_tabs.py OPTIONAL.
const TABS = [['tickets', 'Tickets'], ['telephonie', 'Téléphonie'], ['transactions', 'Transactions'], ['entente', 'Entente'],
              ['inventaire', 'Inventaire'], ['conversations', 'Conversations'], ['photos', 'Photos']]   // ordre de la fiche
// TASK-002.17 : onglets de la fiche contact (Général y est toujours). Même liste que core/contact_tabs.py OPTIONAL.
const CTABS = [['telephonie', 'Téléphonie'], ['courriels', 'Courriels'], ['provisionnement', 'Provisionnement'], ['conversations', 'Conversations']]

export default function PastillesPanel() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)      // id, ou 'new'
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    try { setRows((await api.get('/v1/admin/statuses')).data) }
    catch (e) { setError(e.response?.data?.detail || 'Accès refusé') }
  }

  function start(r) {
    setError('')
    setEditing(r ? r.id : 'new')
    setForm(r ? { name: r.name, color: r.color || '#6B7280', is_active: r.is_active, company_tabs: r.company_tabs || [], contact_tabs: r.contact_tabs || [], applies_to: r.applies_to || 'both', choice_menu: !!r.choice_menu, choicesText: toText(r.choices) } : EMPTY)
  }

  async function save() {
    setSaving(true); setError('')
    try {
      const { choicesText, ...rest } = form
      const body = { ...rest, choices: toGroups(choicesText) }
      if (body.choice_menu && !body.choices.length) { setError('Menu déroulant : écris au moins un choix'); return }
      if (editing === 'new') await api.post('/v1/admin/statuses', body)
      else await api.put(`/v1/admin/statuses/${editing}`, body)
      setEditing(null)
      load()
    } catch (e) { setError(e.response?.data?.detail || 'Erreur') } finally { setSaving(false) }
  }

  if (!rows && !error) return <div className="loading">Chargement...</div>
  if (!rows) return <div className="adm-error">{error}</div>

  const chip = (name, color, faded) => (
    <span style={{ background: color, color: contrastText(color), borderRadius: 12, padding: '3px 10px', fontSize: 12, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap', opacity: faded ? 0.45 : 1 }}>{name || '…'}</span>
  )
  const editRow = (
    <>
      <td>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} autoFocus placeholder="Nom de la pastille"
            onKeyDown={e => e.key === 'Enter' && form.name.trim() && save()}
            style={{ border: '1px solid var(--c-border-strong)', borderRadius: 4, padding: '4px 8px', fontSize: 14 }} />
          <input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} title="Couleur"
            style={{ width: 36, height: 28, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }} />
          {chip(form.name, form.color)}
        </div>
      </td>
      <td>
        <select value={form.applies_to} onChange={e => setForm(p => ({ ...p, applies_to: e.target.value }))}
          style={{ border: '1px solid var(--c-border-strong)', borderRadius: 4, padding: '4px 6px', fontSize: 13, background: 'var(--c-surface)', color: 'var(--c-text)' }}>
          {APPLIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </td>
      <td>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
          {TABS.map(([k, l]) => (
            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, whiteSpace: 'nowrap', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.company_tabs.includes(k)}
                onChange={e => setForm(p => ({ ...p, company_tabs: e.target.checked ? [...p.company_tabs, k] : p.company_tabs.filter(x => x !== k) }))} /> {l}
            </label>
          ))}
        </div>
      </td>
      <td>
        {/* 2026-11-04 : une pastille de compagnie apporte ces onglets aux contacts de la compagnie (p. ex. Hébergé -> Provisionnement) */}
        {(
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
            {CTABS.map(([k, l]) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, whiteSpace: 'nowrap', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.contact_tabs.includes(k)}
                  onChange={e => setForm(p => ({ ...p, contact_tabs: e.target.checked ? [...p.contact_tabs, k] : p.contact_tabs.filter(x => x !== k) }))} /> {l}
              </label>
            ))}
          </div>
        )}
      </td>
      <td />
      <td style={{ textAlign: 'center' }}>
        {editing !== 'new' && <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} />}
      </td>
      <td>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn-primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={save} disabled={saving || !form.name.trim()}>{saving ? '...' : 'Enregistrer'}</button>
          <button className="btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setEditing(null)}>Annuler</button>
        </div>
      </td>
    </>
  )

  const nChoices = toGroups(form.choicesText).reduce((n, g) => n + g.options.length, 0)
  const menuRow = (
    <tr>
      <td colSpan={7} style={{ paddingTop: 0 }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.choice_menu} onChange={e => setForm(p => ({ ...p, choice_menu: e.target.checked }))} />
          Menu déroulant : en posant la pastille, on choisit dans une liste (ex. « Système numérique » → Norstar MICS)
        </label>
        {form.choice_menu && (
          <div style={{ marginTop: 6 }}>
            <textarea value={form.choicesText} onChange={e => setForm(p => ({ ...p, choicesText: e.target.value }))} rows={14}
              placeholder={'Un choix par ligne. Une ligne qui finit par « : » commence un groupe, par exemple :\nNortel / Norstar :\nNorstar CICS\nNorstar MICS\n\nToshiba :\nStrata CIX40'}
              style={{ width: '100%', minWidth: 'min(640px, 90vw)', fontSize: 13, fontFamily: 'inherit', padding: 8, boxSizing: 'border-box' }} />
            <div style={{ fontSize: 12, color: 'var(--c-faint)' }}>{nChoices} choix. Un choix retiré de la liste reste sur les fiches qui l'ont déjà.</div>
          </div>
        )}
      </td>
    </tr>
  )

  return (
    <div>
      <div className="adm-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className="adm-count">Pastilles des compagnies et des contacts</span>
        {editing === null && <button className="btn-primary" onClick={() => start(null)}>+ Nouvelle pastille</button>}
      </div>
      <p style={{ color: 'var(--c-muted)', fontSize: 13, margin: '8px 0 16px' }}>
        Une compagnie ou un contact peut porter plusieurs pastilles (ex. client et sous-traitant). Une pastille désactivée
        ne s'offre plus sur les fiches, mais reste sur celles qui la portent déjà.
      </p>
      <p style={{ color: 'var(--c-muted)', fontSize: 13, margin: '0 0 16px' }}>
        <b>S'offre à</b> : les fiches où la pastille peut être ajoutée ; une fiche qui la porte déjà la garde.{' '}
        <b>Onglets</b> : ceux que la pastille ajoute sur la fiche d'une compagnie. La fiche montre les onglets de toutes ses
        pastilles. Général, Contacts, Courriels et Journal sont toujours là ; un onglet qui contient déjà des données reste
        visible ; une compagnie sans pastille, et la compagnie du propriétaire, montrent tous les onglets. Même chose pour la
        fiche d'un contact (Général toujours là ; un contact sans pastille montre tous ses onglets, sauf Provisionnement).
        Une pastille de compagnie peut aussi donner des onglets aux fiches de ses contacts (par exemple « Hébergé » → Provisionnement).
      </p>
      {error && <div className="form-error">{error}</div>}
      <div style={{ overflowX: 'auto' }}>
        <table className="adm-table">
          <thead><tr><th>Pastille</th><th>S'offre à</th><th>Onglets sur la fiche compagnie</th><th title="Pastille de contact : onglets de sa fiche. Pastille de compagnie : onglets donnés aux fiches de ses contacts.">Onglets sur la fiche contact</th><th>Fiches</th><th style={{ textAlign: 'center' }}>Active</th><th></th></tr></thead>
          <tbody>
            {editing === 'new' && <><tr>{editRow}</tr>{menuRow}</>}
            {rows.map(r => (
              <Fragment key={r.id}>
              <tr>
                {editing === r.id ? editRow : (
                  <>
                    <td>{chip(r.name, r.color, !r.is_active)}{r.choice_menu && <span style={{ fontSize: 12, color: 'var(--c-muted)', marginLeft: 6, whiteSpace: 'nowrap' }}>▾ {(r.choices || []).reduce((n, g) => n + g.options.length, 0)} choix</span>}</td>
                    <td style={{ color: 'var(--c-muted)', fontSize: 13, whiteSpace: 'nowrap' }}>{appliesLabel[r.applies_to] || appliesLabel.both}</td>
                    <td style={{ color: 'var(--c-muted)', fontSize: 13 }}>
                      {(r.company_tabs || []).length ? TABS.filter(([k]) => r.company_tabs.includes(k)).map(([, l]) => l).join(', ') : <span style={{ color: 'var(--c-faint)' }}>aucun</span>}
                    </td>
                    <td style={{ color: 'var(--c-muted)', fontSize: 13 }}>
                      {(r.contact_tabs || []).length ? CTABS.filter(([k]) => r.contact_tabs.includes(k)).map(([, l]) => l).join(', ') : <span style={{ color: 'var(--c-faint)' }}>aucun</span>}
                    </td>
                    <td style={{ color: 'var(--c-muted)', fontSize: 13 }}>{r.used}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ color: r.is_active ? '#059669' : 'var(--c-faint)', fontWeight: 600, fontSize: 13 }}>{r.is_active ? 'Oui' : 'Non'}</span>
                    </td>
                    <td>{editing === null && <button className="adm-edit-btn" onClick={() => start(r)}>Modifier</button>}</td>
                  </>
                )}
              </tr>
              {editing === r.id && menuRow}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
