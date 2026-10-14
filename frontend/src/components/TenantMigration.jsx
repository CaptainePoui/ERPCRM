// Serveur -> Migration (TASK-051, 2026-10-10) : deplacer des postes et des numeros d'un tenant a un autre, comme un
// technicien. On coche les postes et les numeros qui partent ; chaque groupe et reglage : laisser, deplacer ou copier
// (copier = les deux restent actifs, l'ancien sans les postes partis, le nouveau avec eux) ; chaque poste et numero garde
// son adresse 911 (Philippe, 2026-10-14) ; apercu, puis Migrer. L'historique d'appels reste dans l'ancien tenant, marque
// « migre ». Une maison mere sans tenant est offerte comme arrivee : son tenant est cree a la migration.
import { useEffect, useMemo, useState } from 'react'
import api from '../services/api'

const ACTIONS = [['leave', 'Laisser'], ['move', 'Déplacer'], ['copy', 'Copier']]

export default function TenantMigration() {
  const [tenants, setTenants] = useState([])
  const [src, setSrc] = useState('')
  const [dst, setDst] = useState('')
  const [inv, setInv] = useState(null)
  const [dests, setDests] = useState([])
  const [exts, setExts] = useState({})        // id -> { on, new_number }
  const [dids, setDids] = useState({})        // id -> { on }
  const [objs, setObjs] = useState({})        // kind -> { id: action }
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { api.get('/v1/migration/tenants').then(r => setTenants(r.data)) }, [])
  function loadSource(id) {
    setInv(null); setExts({}); setDids({}); setObjs({}); setPreview(null); setResult(null); setError('')
    if (id) api.get(`/v1/migration/inventory/${id}`).then(r => setInv(r.data)).catch(e => setError(e.response?.data?.detail || 'SIPV injoignable'))
  }
  useEffect(() => {
    loadSource(src); setDst(''); setDests([])
    if (src) api.get(`/v1/migration/destinations/${src}`).then(r => setDests(r.data))
  }, [src])

  const payload = useMemo(() => {
    const extensions = Object.entries(exts).filter(([, v]) => v.on).map(([id, v]) => ({ id, new_number: v.new_number || undefined }))
    const didIds = Object.entries(dids).filter(([, v]) => v.on).map(([id]) => id)
    return { source_company_id: src, dest_company_id: dst, extensions, dids: didIds, objects: objs }
  }, [exts, dids, objs, src, dst])

  // Tout changement de choix efface l'apercu : il faut le revoir avant de migrer
  useEffect(() => { setPreview(null) }, [payload])

  async function doPreview() {
    setBusy(true); setError(''); setResult(null)
    try { setPreview((await api.post('/v1/migration/preview', payload)).data) }
    catch (e) { setError(typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'Erreur') }
    finally { setBusy(false) }
  }
  // Migrer sans avoir a ouvrir l'apercu (Philippe, 2026-10-10) : il est fait tout seul ; conflits -> montres, sinon confirmation
  async function startMigrate() {
    setBusy(true); setError(''); setResult(null)
    try {
      const p = (await api.post('/v1/migration/preview', payload)).data
      setPreview(p)
      if (p.ok) setConfirm(true)
    } catch (e) { setError(typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'Erreur') }
    finally { setBusy(false) }
  }
  async function doExecute() {
    setBusy(true); setError('')
    try {
      const r = await api.post('/v1/migration/execute', payload)
      setResult(r.data); setConfirm(false); setPreview(null)
      loadSource(src)
      setResult(r.data)
    } catch (e) {
      const d = e.response?.data?.detail
      setConfirm(false)
      if (d?.conflicts) setPreview({ ok: false, steps: d.steps || [], warnings: d.warnings || [], conflicts: d.conflicts })
      else setError(typeof d === 'string' ? d : 'Erreur')
    } finally { setBusy(false) }
  }

  const box = { background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: 'var(--c-shadow)' }
  const h = { fontSize: 15, fontWeight: 800, margin: '0 0 12px' }
  const muted = { fontSize: 13, color: 'var(--c-muted)' }
  const th = { textAlign: 'left', padding: '8px 10px', fontSize: 12, fontWeight: 700, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap' }
  const td = { padding: '8px 10px', borderBottom: '1px solid var(--c-border)', fontSize: 14, verticalAlign: 'middle' }
  const nOn = Object.values(exts).filter(v => v.on).length + Object.values(dids).filter(v => v.on).length

  return (
    <div>
      <div style={box}>
        <h3 style={h}>Migration de tenant</h3>
        <p style={{ ...muted, margin: '0 0 14px' }}>
          Déplace des postes et des numéros d'un tenant à un autre. Rien ne bouge avant « Migrer » ; une copie de la base du
          serveur téléphonique est faite juste avant. L'historique d'appels reste dans l'ancien tenant, marqué « migré ».
        </p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ minWidth: 260 }}>
            <label>Tenant de départ</label>
            <select value={src} onChange={e => setSrc(e.target.value)}>
              <option value="">— Choisir —</option>
              {tenants.map(t => <option key={t.company_id} value={t.company_id}>{t.account_number} — {t.name}</option>)}
            </select>
          </div>
          <div style={{ fontSize: 22, color: 'var(--c-faint)', paddingBottom: 6 }}>→</div>
          <div className="form-group" style={{ minWidth: 260 }}>
            <label>Tenant d'arrivée</label>
            <select value={dst} onChange={e => setDst(e.target.value)}>
              <option value="">— Choisir —</option>
              {dests.map(t => <option key={t.company_id} value={t.company_id}>{t.account_number} — {t.name}{t.new_tenant ? ' (maison mère, tenant créé à la migration)' : ''}</option>)}
            </select>
          </div>
        </div>
        {error && <div style={{ color: '#DC2626', fontSize: 13, marginTop: 10 }}>{error}</div>}
      </div>

      {src && !inv && !error && <div className="loading">Lecture du tenant…</div>}

      {inv && (
        <>
          <div style={box}>
            <h3 style={h}>Postes qui partent</h3>
            {inv.extensions.length === 0 ? <div style={muted}>Aucun poste.</div> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['', 'Poste', 'Nom', 'Téléphone', 'Messages vocaux', '911', 'Nouveau numéro'].map(x => <th key={x} style={th}>{x}</th>)}</tr></thead>
                  <tbody>
                    {inv.extensions.map(e => {
                      const v = exts[e.id] || {}
                      const set = patch => setExts(p => ({ ...p, [e.id]: { ...v, ...patch } }))
                      return (
                        <tr key={e.id} style={{ background: v.on ? 'var(--brand-bg)' : undefined }}>
                          <td style={td}><input type="checkbox" checked={!!v.on} onChange={x => set({ on: x.target.checked })} aria-label={`Migrer le poste ${e.extension}`} /></td>
                          <td style={{ ...td, fontWeight: 700 }}>{e.extension}</td>
                          <td style={td}>{e.name}</td>
                          <td style={td}>{e.phone ? 'Provisionné' : <span style={muted}>—</span>}</td>
                          <td style={td}>{e.voicemail_messages || <span style={muted}>0</span>}</td>
                          <td style={{ ...td, ...muted }}>{e.e911?.text || '—'}</td>
                          <td style={td}>{v.on && <input value={v.new_number ?? ''} placeholder={e.extension} onChange={x => set({ new_number: x.target.value })} style={{ width: 80, fontSize: 13 }} />}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={box}>
            <h3 style={h}>Numéros qui partent</h3>
            {inv.dids.length === 0 ? <div style={muted}>Aucun numéro.</div> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['', 'Numéro', 'Note', 'Destination', '911'].map(x => <th key={x} style={th}>{x}</th>)}</tr></thead>
                  <tbody>
                    {inv.dids.map(d => {
                      const v = dids[d.id] || {}
                      const set = patch => setDids(p => ({ ...p, [d.id]: { ...v, ...patch } }))
                      return (
                        <tr key={d.id} style={{ background: v.on ? 'var(--brand-bg)' : undefined }}>
                          <td style={td}><input type="checkbox" checked={!!v.on} onChange={x => set({ on: x.target.checked })} aria-label={`Migrer le numéro ${d.number}`} /></td>
                          <td style={{ ...td, fontWeight: 700, whiteSpace: 'nowrap' }}>{d.number}</td>
                          <td style={td}>{d.label || <span style={muted}>—</span>}</td>
                          <td style={{ ...td, ...muted }}>{d.destination_type}{d.destination ? ` : ${d.destination}` : ''}</td>
                          <td style={{ ...td, ...muted }}>{d.e911?.text || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={box}>
            <h3 style={h}>Groupes et réglages</h3>
            <p style={{ ...muted, margin: '0 0 12px' }}>
              Laisser : reste ici (les postes qui partent en sont retirés). Déplacer : part au complet. Copier : les deux restent
              actifs — l'ancien sans les postes qui partent, le nouveau avec eux.
            </p>
            {Object.keys(inv.objects).length === 0 && <div style={muted}>Rien d'autre dans ce tenant.</div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))', gap: 12 }}>
              {Object.entries(inv.objects).map(([kind, o]) => (
                <div key={kind} style={{ border: '1px solid var(--c-border)', borderRadius: 12, padding: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{o.label}</div>
                  {o.items.map(it => {
                    const val = objs[kind]?.[it.id] || 'leave'
                    return (
                      <div key={it.id} style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--c-border)', flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{it.name}</div>
                          {it.members.length > 0 && <div style={{ ...muted, fontSize: 12 }}>{it.members.join(', ')}</div>}
                        </div>
                        <div role="radiogroup" aria-label={it.name} style={{ display: 'flex', gap: 4 }}>
                          {ACTIONS.filter(([a]) => a !== 'copy' || o.copyable).map(([a, l]) => (
                            <button key={a} type="button" aria-pressed={val === a}
                              onClick={() => setObjs(p => ({ ...p, [kind]: { ...(p[kind] || {}), [it.id]: a } }))}
                              style={{ padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                                border: `1px solid ${val === a ? 'var(--brand)' : 'var(--c-border-strong)'}`,
                                background: val === a ? 'var(--brand)' : 'var(--c-surface)', color: val === a ? '#fff' : 'var(--c-text-2)' }}>{l}</button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...box, position: 'sticky', bottom: 12 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn-secondary" onClick={doPreview} disabled={busy || !dst}>{busy && !confirm ? '…' : 'Voir l\'aperçu'}</button>
              <button className="btn-primary" onClick={startMigrate} disabled={busy || !dst || nOn + Object.values(objs).flatMap(o => Object.values(o)).filter(a => a !== 'leave').length === 0}>Migrer</button>
              <span style={muted}>{nOn} élément(s) coché(s){!dst ? ' — choisissez le tenant d\'arrivée' : ''}{preview && !preview.ok ? ' — réglez les conflits' : ''}</span>
            </div>
            {preview && (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '45vh', overflowY: 'auto' }}>
                {preview.conflicts.map((c, i) => <div key={'c' + i} style={{ background: 'var(--c-tint-red)', color: 'var(--c-on-red)', padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>✕ {c}</div>)}
                {preview.warnings.map((w, i) => <div key={'w' + i} style={{ background: 'var(--c-tint-amber)', color: 'var(--c-on-amber)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>⚠ {w}</div>)}
                {preview.steps.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.6 }}>
                    {preview.steps.map((s, i) => <li key={'s' + i} style={{ listStyle: s.startsWith('  ') ? 'circle' : 'disc', marginLeft: s.startsWith('  ') ? 16 : 0 }}>{s.trim()}</li>)}
                  </ul>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {result && (
        <div style={{ ...box, borderColor: '#059669' }}>
          <h3 style={{ ...h, color: '#059669' }}>Migration faite</h3>
          <ul style={{ margin: '0 0 10px', paddingLeft: 20, fontSize: 13, lineHeight: 1.6 }}>
            {result.steps.map((s, i) => <li key={i}>{s.trim()}</li>)}
          </ul>
          <div style={muted}>{result.cdr_marked} appel(s) de l'historique marqués « migré ». Copie de la base du serveur : {result.backup}</div>
          {(result.after || []).map((a, i) => <div key={i} style={{ marginTop: 8, background: 'var(--c-tint-amber)', color: 'var(--c-on-amber)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>⚠ {a}</div>)}
          {result.warnings.length > 0 && <div style={{ ...muted, marginTop: 8 }}>À vérifier : {result.warnings.join(' · ')}</div>}
        </div>
      )}

      {confirm && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 520 }}>
            <h3 className="modal-title">Migrer maintenant ?</h3>
            <p style={{ fontSize: 14, lineHeight: 1.5, margin: 0 }}>
              {preview?.steps.filter(s => !s.startsWith('  ')).length} étape(s). Les téléphones des postes migrés vont redémarrer et
              prendre leur nouvel identifiant. Une copie de la base du serveur téléphonique est faite juste avant.
            </p>
            {preview?.warnings.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                {preview.warnings.map((w, i) => <div key={i} style={{ background: 'var(--c-tint-amber)', color: 'var(--c-on-amber)', padding: '6px 10px', borderRadius: 8, fontSize: 13 }}>⚠ {w}</div>)}
              </div>
            )}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setConfirm(false)} disabled={busy}>Annuler</button>
              <button className="btn-primary" onClick={doExecute} disabled={busy}>{busy ? 'Migration…' : 'Migrer'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
