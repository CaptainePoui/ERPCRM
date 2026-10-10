// Maison mère et succursales (TASK-002.4, 2026-10-10) : une succursale est une vraie compagnie liée à sa maison mère
// (plusieurs niveaux). Case « Succursale » + choix de la maison mère ; facturée à elle-même, sauf « Facturer à la
// maison mère » (choix parmi ses maisons mères). Alerte quand la téléphonie devra être migrée (deux tenants, ou on
// décoche une succursale qui partage le tenant de sa maison mère).
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import Autocomplete from './Autocomplete'

export function ParentBadge({ companyId }) {
  const [g, setG] = useState(null)
  useEffect(() => {
    setG(null)
    api.get(`/v1/companies/${companyId}/group`).then(r => setG(r.data)).catch(() => {})
    const onChange = e => { if (e.detail === companyId) api.get(`/v1/companies/${companyId}/group`).then(r => setG(r.data)) }
    window.addEventListener('erpcrm-group', onChange)
    return () => window.removeEventListener('erpcrm-group', onChange)
  }, [companyId])
  if (!g?.parent) return null
  return (
    <span style={{ fontSize: 13, color: 'var(--c-muted)', marginLeft: 10 }}>
      Succursale de <Link to={`/companies/${g.parent.id}`} style={{ fontWeight: 700 }}>{g.parent.name}</Link>
    </span>
  )
}

export default function BranchSection({ companyId }) {
  const [g, setG] = useState(null)
  const [companies, setCompanies] = useState([])
  const [isBranch, setIsBranch] = useState(false)
  const [parent, setParent] = useState(null)
  const [billParent, setBillParent] = useState(false)
  const [billTo, setBillTo] = useState('')
  const [chain, setChain] = useState([])           // maisons mères possibles pour la facturation
  const [alert, setAlert] = useState(null)
  const [msg, setMsg] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function fill(d) {
    setG(d)
    setIsBranch(!!d.parent)
    setParent(d.parent ? { id: d.parent.id, label: d.parent.name } : null)
    setBillParent(!!d.bill_to)
    setBillTo(d.bill_to?.id || '')
    setChain(d.ancestors || [])
  }

  useEffect(() => {
    setMsg([]); setError('')
    api.get(`/v1/companies/${companyId}/group`).then(r => fill(r.data))
    api.get('/v1/companies').then(r => setCompanies(r.data.filter(c => c.id !== companyId).map(c => ({ id: c.id, label: c.name, sub: c.city || undefined }))))
  }, [companyId])

  // Maisons mères offertes pour la facturation : celle choisie et les siennes (lues quand la maison mère change)
  useEffect(() => {
    if (!parent) { setChain([]); return }
    if (g?.parent?.id === parent.id) { setChain(g.ancestors); return }
    api.get(`/v1/companies/${parent.id}/group`).then(r => setChain([{ id: parent.id, name: parent.label }, ...r.data.ancestors]))
  }, [parent?.id])   // eslint-disable-line

  async function save(confirm = false) {
    setSaving(true); setError(''); setMsg([])
    const body = {
      parent_company_id: isBranch && parent ? parent.id : null,
      bill_to_company_id: isBranch && parent && billParent ? (billTo || chain[0]?.id || null) : null,
      confirm,
    }
    try {
      const r = await api.put(`/v1/companies/${companyId}/group`, body)
      fill(r.data)
      setMsg(r.data.warnings || [])
      setAlert(null)
      window.dispatchEvent(new CustomEvent('erpcrm-group', { detail: companyId }))
    } catch (e) {
      const d = e.response?.data?.detail
      if (e.response?.status === 409 && d?.alert) setAlert(d.alert)
      else setError(typeof d === 'string' ? d : 'Erreur')
    } finally { setSaving(false) }
  }

  if (!g) return null
  const dirty = (isBranch ? parent?.id || null : null) !== (g.parent?.id || null)
    || (isBranch && billParent ? (billTo || chain[0]?.id || null) : null) !== (g.bill_to?.id || null)
  const box = { background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 12, padding: 20, marginTop: 24 }
  const muted = { fontSize: 13, color: 'var(--c-muted)' }
  return (
    <div style={box}>
      <div className="ifield-section-title" style={{ marginTop: 0 }}>Maison mère et succursales</div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
        <input type="checkbox" checked={isBranch} onChange={e => { setIsBranch(e.target.checked); if (!e.target.checked) { setBillParent(false) } }} />
        Succursale
      </label>

      {isBranch && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 520 }}>
          <Autocomplete label="Maison mère" items={companies} value={parent} onSelect={setParent} placeholder="Rechercher la maison mère…" openOnFocus />
          {parent && (
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={billParent} onChange={e => setBillParent(e.target.checked)} />
                Facturer à la maison mère
              </label>
              {!billParent && <div style={{ ...muted, marginLeft: 24 }}>Facturée à elle-même.</div>}
              {billParent && (
                <select value={billTo || chain[0]?.id || ''} onChange={e => setBillTo(e.target.value)} style={{ marginTop: 6, marginLeft: 24 }}>
                  {chain.map((a, i) => <option key={a.id} value={a.id}>{a.name}{i === 0 ? ' (maison mère directe)' : ''}</option>)}
                </select>
              )}
            </div>
          )}
          {g.tenant_holder && !g.own_tenant && <div style={muted}>Téléphonie : dans le tenant de <Link to={`/companies/${g.tenant_holder.id}`}>{g.tenant_holder.name}</Link>.</div>}
        </div>
      )}

      {(dirty || error) && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn-primary" onClick={() => save(false)} disabled={saving || (isBranch && !parent)}>{saving ? '...' : 'Enregistrer'}</button>
          <button className="btn-secondary" onClick={() => fill(g)} disabled={saving}>Annuler</button>
          {error && <span style={{ color: '#DC2626', fontSize: 13 }}>{error}</span>}
        </div>
      )}
      {msg.map((m, i) => <div key={i} style={{ marginTop: 10, fontSize: 13, color: 'var(--c-on-amber)', background: 'var(--c-tint-amber)', padding: '8px 12px', borderRadius: 8 }}>{m}</div>)}

      {g.branches.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            Succursales ({g.branches.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {g.branches.map(b => (
              <Link key={b.id} to={`/companies/${b.id}`} style={{ padding: '6px 12px', borderRadius: 10, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface-2)', fontWeight: 600, fontSize: 14, opacity: b.is_active ? 1 : 0.55 }}>
                {b.name}
                {b.branches > 0 && <span style={{ ...muted, fontWeight: 500 }}> · {b.branches} succursale{b.branches > 1 ? 's' : ''}</span>}
                {b.billed_here && <span style={{ ...muted, fontWeight: 500 }}> · facturée ici</span>}
              </Link>
            ))}
          </div>
        </div>
      )}

      {alert && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 520 }}>
            <h3 className="modal-title">Téléphonie à migrer</h3>
            <p style={{ fontSize: 14, lineHeight: 1.5, margin: 0 }}>{alert}</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setAlert(null)} disabled={saving}>Annuler</button>
              <button className="btn-primary" onClick={() => save(true)} disabled={saving}>{saving ? '...' : 'Continuer quand même'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
