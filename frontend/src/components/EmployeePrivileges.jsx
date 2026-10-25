// Employés › Privilèges (TASK-007.4, 2026-10-25) : pour chaque employé, son compte pour entrer dans ERPCRM, son profil
// (Administration › Privilèges) et ses exceptions section par section. Zéko suit les mêmes privilèges.
import { useEffect, useState } from 'react'
import api from '../services/api'
import PrivilegeGrid from './PrivilegeGrid'

function when(d) {
  return d ? new Date(d).toLocaleString('fr-CA', { dateStyle: 'medium', timeStyle: 'short' }) : 'jamais'
}

export default function EmployeePrivileges() {
  const [rows, setRows] = useState([])
  const [profiles, setProfiles] = useState([])
  const [sections, setSections] = useState([])
  const [edit, setEdit] = useState(null)
  const [err, setErr] = useState('')

  async function load() {
    try {
      const [e, p, s] = await Promise.all([api.get('/v1/employees'), api.get('/v1/privileges/profiles'), api.get('/v1/privileges/sections')])
      const privs = await Promise.all(e.data.map(x => api.get(`/v1/employees/${x.contact_id}/privileges`).then(r => r.data)))
      setRows(e.data.map((x, i) => ({ ...x, priv: privs[i] })))
      setProfiles(p.data)
      setSections(s.data)
    } catch (e) { setErr(e.response?.data?.detail || 'Erreur de chargement') }
  }
  useEffect(() => { load() }, [])

  return (
    <div>
      <p style={{ color: 'var(--c-muted)', marginTop: 0 }}>
        Ce que chaque employé peut voir et modifier dans ERPCRM. Les profils se créent et se changent dans Administration › Privilèges.
      </p>
      {err && <p style={{ color: 'var(--c-on-red)', fontWeight: 600 }}>{err}</p>}
      <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 12 }}>
        {rows.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: 'var(--c-faint)' }}>Aucun employé.</div>}
        {rows.map(r => (
          <div key={r.contact_id} style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '14px 20px', borderBottom: '1px solid var(--c-border)' }}>
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{r.first_name} {r.last_name}</div>
              <div style={{ fontSize: 12, color: 'var(--c-muted)' }}>
                {r.priv.account ? `${r.priv.account.email}${r.priv.account.is_active ? '' : ' (désactivé)'}` : 'Aucun compte pour entrer dans ERPCRM'}
              </div>
            </div>
            <div style={{ flex: '0 1 220px', fontSize: 13 }}>
              {r.priv.account?.administrateur ? 'Administrateur : tout' : (r.priv.profile || 'Aucun profil')}
              {Object.keys(r.priv.overrides || {}).length > 0 && <span style={{ color: 'var(--c-muted)' }}> + {Object.keys(r.priv.overrides).length} exception(s)</span>}
            </div>
            <div style={{ flex: '0 1 200px', fontSize: 12, color: 'var(--c-muted)' }}>{r.priv.account ? `Dernière connexion : ${when(r.priv.account.last_login)}` : ''}</div>
            <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setEdit(r)}>Modifier</button>
          </div>
        ))}
      </div>
      {edit && <EditModal row={edit} profiles={profiles} sections={sections} onClose={() => { setEdit(null); load() }} />}
    </div>
  )
}

function EditModal({ row, profiles, sections, onClose }) {
  const [priv, setPriv] = useState(row.priv)
  const [acct, setAcct] = useState({ email: row.priv.account?.email || row.email || '', password: '', is_active: row.priv.account?.is_active ?? true })
  const [profileId, setProfileId] = useState(row.priv.profile_id || '')
  const [over, setOver] = useState({ ...(row.priv.overrides || {}) })
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const base = (profiles.find(p => p.id === profileId) || {}).grants || {}

  async function saveAccount() {
    setBusy(true); setMsg(null)
    try {
      const r = await api.put(`/v1/employees/${row.contact_id}/account`, { email: acct.email, password: acct.password || null, is_active: acct.is_active })
      setPriv(r.data); setAcct(a => ({ ...a, password: '' }))
      setMsg({ ok: 'Compte enregistré' })
    } catch (e) { setMsg({ err: e.response?.data?.detail || 'Erreur' }) } finally { setBusy(false) }
  }

  async function savePrivileges() {
    setBusy(true); setMsg(null)
    try {
      const overrides = Object.fromEntries(Object.entries(over).filter(([, v]) => v))
      await api.put(`/v1/employees/${row.contact_id}/privileges`, { profile_id: profileId || null, overrides })
      onClose()
    } catch (e) { setMsg({ err: e.response?.data?.detail || 'Erreur' }); setBusy(false) }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: '60vw', maxWidth: 'calc(100vw - 32px)', maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 className="modal-title">Privilèges — {row.first_name} {row.last_name}</h3>

        <h4 style={{ margin: '0 0 8px' }}>Compte pour entrer dans ERPCRM</h4>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 6 }}>
          <div className="form-group" style={{ flex: '1 1 240px', margin: 0 }}>
            <label>Courriel de connexion</label>
            <input value={acct.email} onChange={e => setAcct(a => ({ ...a, email: e.target.value }))} />
          </div>
          <div className="form-group" style={{ flex: '1 1 200px', margin: 0 }}>
            <label>{priv.account ? 'Nouveau mot de passe' : 'Mot de passe'}</label>
            <input type="password" autoComplete="new-password" value={acct.password} onChange={e => setAcct(a => ({ ...a, password: e.target.value }))}
              placeholder={priv.account ? 'vide = garder le même' : 'au moins 8 caractères'} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, paddingBottom: 8 }}>
            <input type="checkbox" checked={acct.is_active} onChange={e => setAcct(a => ({ ...a, is_active: e.target.checked }))} /> Actif
          </label>
          <button className="btn-secondary" disabled={busy} onClick={saveAccount}>{priv.account ? 'Enregistrer le compte' : 'Créer le compte'}</button>
        </div>
        {msg && <p style={{ margin: '4px 0 0', fontWeight: 600, color: msg.err ? 'var(--c-on-red)' : 'var(--c-on-green)' }}>{msg.err || msg.ok}</p>}

        <h4 style={{ margin: '18px 0 8px' }}>Profil</h4>
        {priv.account?.administrateur && <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Administrateur : il a tout, quel que soit son profil.</p>}
        <select value={profileId} disabled={!priv.account} onChange={e => setProfileId(e.target.value)} style={{ minWidth: 240 }}>
          <option value="">Aucun profil (rien)</option>
          {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {!priv.account && <span style={{ marginLeft: 10, fontSize: 13, color: 'var(--c-muted)' }}>Crée d'abord son compte.</span>}

        <h4 style={{ margin: '18px 0 4px' }}>Exceptions</h4>
        <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--c-muted)' }}>« Profil » suit son profil ; un autre choix vaut pour lui seulement.</p>
        <PrivilegeGrid sections={sections} value={over} base={base} disabled={!priv.account} onChange={setOver} />

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Fermer</button>
          <button className="btn-primary" disabled={busy || !priv.account} onClick={savePrivileges}>Enregistrer les privilèges</button>
        </div>
      </div>
    </div>
  )
}
