// Administration -> Configuration -> Spécialisations (TASK-002.18, 2026-11-02) : ce que fait un contact chez une compagnie
// (TI, réseau, technique, facturation, propriétaire…). Ajouter, renommer, couleur, onglets de la fiche contact, désactiver.
// Jamais supprimées : une spécialisation désactivée ne s'offre plus, mais reste sur les contacts qui l'ont.
import { useEffect, useState } from 'react'
import api from '../services/api'
import { contrastText } from '../utils/color'

const EMPTY = { name: '', color: '#6B7280', contact_tabs: ['courriels'], is_active: true }
const CTABS = [['telephonie', 'Téléphonie'], ['courriels', 'Courriels'], ['provisionnement', 'Provisionnement'], ['conversations', 'Conversations']]   // core/contact_tabs.py

export default function SpecialtiesPanel() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)      // id, ou 'new'
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [q, setQ] = useState('')

  useEffect(() => { load() }, [])
  async function load() {
    try { setRows((await api.get('/v1/admin/functions')).data) }
    catch (e) { setError(e.response?.data?.detail || 'Accès refusé') }
  }
  function start(r) {
    setError('')
    setEditing(r ? r.id : 'new')
    setForm(r ? { name: r.name, color: r.color || '#6B7280', contact_tabs: r.contact_tabs || [], is_active: r.is_active } : EMPTY)
  }
  async function save() {
    setSaving(true); setError('')
    try {
      if (editing === 'new') await api.post('/v1/admin/functions', form)
      else await api.put(`/v1/admin/functions/${editing}`, form)
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
  const tabsText = t => (t || []).length ? CTABS.filter(([k]) => t.includes(k)).map(([, l]) => l).join(', ') : <span style={{ color: 'var(--c-faint)' }}>aucun</span>
  const editRow = (
    <>
      <td>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} autoFocus placeholder="Nom de la spécialisation"
            onKeyDown={e => e.key === 'Enter' && form.name.trim() && save()}
            style={{ border: '1px solid var(--c-border-strong)', borderRadius: 4, padding: '4px 8px', fontSize: 14 }} />
          <input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} title="Couleur"
            style={{ width: 36, height: 28, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }} />
          {chip(form.name, form.color)}
        </div>
      </td>
      <td>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
          {CTABS.map(([k, l]) => (
            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, whiteSpace: 'nowrap', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.contact_tabs.includes(k)}
                onChange={e => setForm(p => ({ ...p, contact_tabs: e.target.checked ? [...p.contact_tabs, k] : p.contact_tabs.filter(x => x !== k) }))} /> {l}
            </label>
          ))}
        </div>
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
  const shown = rows.filter(r => !q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <div>
      <div className="adm-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className="adm-count">Spécialisations des contacts</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher…" style={{ fontSize: 13, padding: '4px 8px' }} />
          {editing === null && <button className="btn-primary" onClick={() => start(null)}>+ Nouvelle spécialisation</button>}
        </div>
      </div>
      <p style={{ color: 'var(--c-muted)', fontSize: 13, margin: '8px 0 16px' }}>
        Ce que fait un contact chez une compagnie (une personne peut faire la facturation chez l'une et la technique chez l'autre).
        Elles se mettent sur la fiche du contact (« Spécialisations », bouton +) ; la fiche de la compagnie montre celles de tous ses contacts,
        une fois chacune. <b>Onglets</b> : ceux que la spécialisation ajoute sur la fiche du contact (Général toujours là ; un onglet qui
        contient des données reste visible). « comptes payables » et « facturation » servent à trouver l'adresse des factures : leur nom ne change pas.
        Une spécialisation désactivée ne s'offre plus, mais reste sur les contacts qui l'ont.
      </p>
      {error && <div className="form-error">{error}</div>}
      <div style={{ overflowX: 'auto' }}>
        <table className="adm-table">
          <thead><tr><th>Spécialisation</th><th>Onglets sur la fiche contact</th><th>Contacts</th><th style={{ textAlign: 'center' }}>Active</th><th></th></tr></thead>
          <tbody>
            {editing === 'new' && <tr>{editRow}</tr>}
            {shown.map(r => (
              <tr key={r.id}>
                {editing === r.id ? editRow : (
                  <>
                    <td>{chip(r.name, r.color || '#6B7280', !r.is_active)}</td>
                    <td style={{ color: 'var(--c-muted)', fontSize: 13 }}>{tabsText(r.contact_tabs)}</td>
                    <td style={{ color: 'var(--c-muted)', fontSize: 13 }}>{r.used}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ color: r.is_active ? '#059669' : 'var(--c-faint)', fontWeight: 600, fontSize: 13 }}>{r.is_active ? 'Oui' : 'Non'}</span>
                    </td>
                    <td>{editing === null && <button className="adm-edit-btn" onClick={() => start(r)}>Modifier</button>}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
