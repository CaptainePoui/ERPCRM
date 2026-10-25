// Administration › Privilèges (TASK-007.4, 2026-10-25) : les profils (Tout, Comptable, Technicien…) et ce que chacun
// permet, section par section. « Tout » donne tout et ne se modifie pas. Le profil de chaque employé se choisit dans
// Employés › Privilèges.
import { useEffect, useState } from 'react'
import api from '../services/api'
import PrivilegeGrid from './PrivilegeGrid'
import { askConfirm } from './Dialog'

export default function PrivilegesAdmin() {
  const [sections, setSections] = useState([])
  const [profiles, setProfiles] = useState([])
  const [sel, setSel] = useState(null)            // id du profil ouvert, ou 'nouveau'
  const [form, setForm] = useState({ name: '', grants: {} })
  const [msg, setMsg] = useState(null)
  const [saving, setSaving] = useState(false)

  async function load(keep) {
    const [s, p] = await Promise.all([api.get('/v1/privileges/sections'), api.get('/v1/privileges/profiles')])
    setSections(s.data)
    setProfiles(p.data)
    const cur = p.data.find(x => x.id === (keep || sel)) || p.data[0]
    if (cur) open(cur)
  }
  useEffect(() => { load().catch(e => setMsg({ err: e.response?.data?.detail || 'Erreur de chargement' })) }, [])

  function open(p) {
    setSel(p ? p.id : 'nouveau')
    setForm(p ? { name: p.name, grants: { ...p.grants } } : { name: '', grants: {} })
    setMsg(null)
  }

  const cur = profiles.find(p => p.id === sel)
  const locked = cur?.full_access

  async function save() {
    setSaving(true); setMsg(null)
    try {
      const body = { name: form.name, grants: form.grants }
      const r = sel === 'nouveau' ? await api.post('/v1/privileges/profiles', body) : await api.put(`/v1/privileges/profiles/${sel}`, body)
      await load(r.data.id)
      setMsg({ ok: 'Profil enregistré' })
    } catch (e) {
      setMsg({ err: e.response?.data?.detail || 'Erreur' })
    } finally { setSaving(false) }
  }

  async function remove() {
    if (!(await askConfirm(`Supprimer le profil « ${cur.name} » ?`))) return
    try {
      await api.delete(`/v1/privileges/profiles/${sel}`)
      setSel(null)
      await load()
    } catch (e) { setMsg({ err: e.response?.data?.detail || 'Erreur' }) }
  }

  return (
    <div>
      <p style={{ color: 'var(--c-muted)', marginTop: 0 }}>
        Un profil dit ce qu'on peut voir et modifier dans chaque section d'ERPCRM. Chaque employé reçoit un profil, et
        des exceptions au besoin, dans Employés › Privilèges. Zéko suit les privilèges de la personne qui lui parle.
      </p>
      <div className="filter-tabs" style={{ flexWrap: 'wrap' }}>
        {profiles.map(p => (
          <button key={p.id} className={`filter-tab${sel === p.id ? ' active' : ''}`} onClick={() => open(p)}>
            {p.name}{p.users.length ? ` (${p.users.length})` : ''}
          </button>
        ))}
        <button className={`filter-tab${sel === 'nouveau' ? ' active' : ''}`} onClick={() => open(null)}>+ Nouveau profil</button>
      </div>

      {(cur || sel === 'nouveau') && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
            <div className="form-group" style={{ flex: '1 1 280px', margin: 0 }}>
              <label>Nom du profil</label>
              <input value={form.name} disabled={locked} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ex. Comptable" />
            </div>
            {!locked && <button className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>}
            {cur && !locked && <button className="btn-secondary" onClick={remove}>Supprimer</button>}
          </div>
          {locked && <p style={{ margin: '0 0 12px', fontWeight: 600 }}>Ce profil donne tout et ne se modifie pas : il reste toujours au moins un compte qui l'a.</p>}
          {cur && <p style={{ margin: '0 0 12px', color: 'var(--c-muted)' }}>
            {cur.users.length ? `Donné à : ${cur.users.join(', ')}` : 'Donné à personne pour l’instant'}
          </p>}
          {msg && <p style={{ margin: '0 0 12px', fontWeight: 600, color: msg.err ? 'var(--c-on-red)' : 'var(--c-on-green)' }}>{msg.err || msg.ok}</p>}
          <PrivilegeGrid sections={sections} value={form.grants} disabled={locked} onChange={g => setForm(f => ({ ...f, grants: g }))} />
        </div>
      )}
    </div>
  )
}
