// Fusionner deux fiches (TASK-003.4, 2026-10-26) : contact ou compagnie. On choisit l'autre fiche (les semblables
// d'abord), on compare : pour chaque champ différent, la valeur gardée (l'autre va dans les anciennes coordonnées) ;
// la liste de ce qui passera sur la fiche gardée ; les raisons qui empêchent la fusion. Ne se ferme que par ses boutons.
import { useEffect, useState } from 'react'
import api from '../services/api'
import { askConfirm } from './Dialog'

export default function MergeModal({ kind, id, name, onClose, onDone }) {
  const contact = kind === 'contact'
  const base = contact ? '/v1/contacts' : '/v1/companies'
  const [sugg, setSugg] = useState([])
  const [q, setQ] = useState('')
  const [found, setFound] = useState([])
  const [other, setOther] = useState(null)          // { id, nom }
  const [swap, setSwap] = useState(false)           // garder l'autre fiche plutôt que celle-ci
  const [prev, setPrev] = useState(null)
  const [choices, setChoices] = useState({})
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { api.get(`${base}/${id}/merge-suggestions`).then(r => setSugg(r.data)).catch(() => {}) }, [id])
  useEffect(() => {
    const t = q.trim()
    if (t.length < 2) { setFound([]); return }
    const h = setTimeout(() => api.get('/v1/search', { params: { q: t } })
      .then(r => setFound(r.data.filter(x => x.type === kind && x.id !== id).slice(0, 8))).catch(() => setFound([])), 250)
    return () => clearTimeout(h)
  }, [q])
  const keepId = swap ? other?.id : id
  const dropId = swap ? id : other?.id
  useEffect(() => {
    if (!other) { setPrev(null); return }
    setPrev(null); setErr(''); setChoices({})
    api.get(`${base}/${keepId}/merge/${dropId}`).then(r => setPrev(r.data)).catch(e => setErr(e.response?.data?.detail || 'Erreur'))
  }, [other, swap])

  async function go() {
    const lines = prev.deplace.map(d => `• ${d.nombre} ${d.quoi}`)
    if (!(await askConfirm(`Fusionner ?\nOn garde : ${prev.garde}\n${prev.autre} disparaît ; ce qui la concernait passe sur la fiche gardée :\n${lines.join('\n') || '• rien d\'autre'}\nUne fusion ne se défait pas.`, { okLabel: 'Fusionner', danger: true }))) return
    setBusy(true); setErr('')
    try {
      const r = await api.post(`${base}/${keepId}/merge`, { other_id: dropId, choices })
      onDone(r.data.id)
    } catch (e) { setErr(e.response?.data?.detail || 'Fusion impossible'); setBusy(false) }
  }

  const pick = (x) => { setOther({ id: x.id, nom: x.nom || x.label }); setQ(''); setFound([]) }
  const row = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderTop: '1px solid var(--c-border)', fontSize: 13 }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: '60vw', maxWidth: 'calc(100vw - 32px)', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>
        <h3 className="modal-title">Fusionner {contact ? 'ce contact' : 'cette compagnie'} — {name}</h3>

        {!other && <>
          {sugg.length > 0 && <>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Fiches semblables</div>
            <div style={{ border: '1px solid var(--c-border)', borderRadius: 8, marginBottom: 14 }}>
              {sugg.map((s, i) => (
                <div key={s.id} style={{ ...row, borderTop: i ? row.borderTop : 'none' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{s.nom}{s.actif ? '' : ' (inactif)'}</div>
                    <div style={{ fontSize: 12, color: 'var(--c-muted)' }}>{[s.compagnies, s.courriel, s.raison].filter(Boolean).join(' · ')}</div>
                  </div>
                  <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => pick(s)}>Choisir</button>
                </div>
              ))}
            </div>
          </>}
          <div className="form-group" style={{ position: 'relative' }}>
            <label>{sugg.length ? 'Ou chercher une autre fiche' : 'Chercher l\'autre fiche'}</label>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={contact ? 'Nom, courriel…' : 'Nom de la compagnie…'} />
            {found.length > 0 && (
              <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 20, background: 'var(--c-surface)', border: '1px solid var(--c-border-strong)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,.15)' }}>
                {found.map(f => (
                  <div key={f.id} onClick={() => pick(f)} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--c-surface-3)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--c-surface-3)'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                    {f.label}{f.sub && <span style={{ color: 'var(--c-faint)', fontSize: 12 }}> · {f.sub}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>}

        {other && !prev && !err && <p style={{ color: 'var(--c-muted)' }}>Comparaison…</p>}
        {other && prev && <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 240, fontSize: 14 }}>
              On garde <strong>{prev.garde}</strong><br />
              <span style={{ color: 'var(--c-muted)' }}>{prev.autre} disparaît</span>
            </div>
            <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setSwap(s => !s)}>⇄ Garder l'autre fiche</button>
            <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => { setOther(null); setSwap(false) }}>Choisir une autre fiche</button>
          </div>

          {prev.conflits.length > 0 && <>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Champs différents : la valeur à garder</div>
            <div style={{ border: '1px solid var(--c-border)', borderRadius: 8, marginBottom: 6 }}>
              {prev.conflits.map((c, i) => (
                <div key={c.champ} style={{ ...row, borderTop: i ? row.borderTop : 'none', flexWrap: 'wrap' }}>
                  <div style={{ width: 130, color: 'var(--c-muted)' }}>{c.libelle}</div>
                  {[['garde', c.garde], ['autre', c.autre]].map(([k, v]) => (
                    <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 200px', minWidth: 0, cursor: 'pointer' }}>
                      <input type="radio" name={c.champ} checked={(choices[c.champ] || 'garde') === k} onChange={() => setChoices(x => ({ ...x, [c.champ]: k }))} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--c-muted)' }}>Le nom, le courriel ou le téléphone non gardé va dans les anciennes coordonnées de la fiche : il reste cherchable.</p>
          </>}

          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Ce qui passe sur la fiche gardée</div>
          <ul style={{ margin: '0 0 12px', paddingLeft: 20, fontSize: 13 }}>
            {prev.deplace.length === 0 && <li style={{ color: 'var(--c-muted)' }}>Rien d'autre que la fiche elle-même</li>}
            {prev.deplace.map(d => <li key={d.quoi}>{d.nombre} {d.quoi}</li>)}
          </ul>

          {prev.bloque.length > 0 && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--c-tint-red)', color: 'var(--c-on-red)', fontSize: 13, marginBottom: 12 }}>
              <strong>Fusion impossible pour l'instant :</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>{prev.bloque.map(b => <li key={b}>{b}</li>)}</ul>
            </div>
          )}
        </>}
        {err && <p style={{ color: 'var(--c-on-red)', fontWeight: 600 }}>{err}</p>}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" disabled={!prev || prev.bloque.length > 0 || busy} onClick={go}>{busy ? 'Fusion…' : 'Fusionner'}</button>
        </div>
      </div>
    </div>
  )
}
