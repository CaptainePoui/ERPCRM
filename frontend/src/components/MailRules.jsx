// Règles des courriels, comme celles d'Outlook (TASK-006.22, Philippe 2026-11-02 : « on peut choisir juste l'expéditeur ou
// le titre ou plein d'autres options, et on peut même en choisir plusieurs ; on pourrait aussi choisir de les mettre lus
// ou de les déplacer... dans un autre dossier » ; « quand on crée une règle et qu'il y en a plusieurs, il nous demande si
// on veut le faire sur tous les anciens aussi »). Appliquées par le programme à l'arrivée (core/mail_rules.py).
// La fenêtre ne se ferme que par ses boutons.
import { useEffect, useRef, useState } from 'react'
import api from '../services/api'
import Autocomplete from './Autocomplete'
import { askConfirm } from './Dialog'
import { RecipientInput } from './MailCompose'

const EMPTY = { name: '', match: 'toutes', conditions: [{ champ: 'expediteur', op: 'contient', valeur: '' }],
                actions: { compagnie_id: null, contact_id: null, lu: false, a_jeter: false, dossier: null, arreter: true, repondre: null }, is_active: true }
const REPLY = { actif: true, a: 'expediteur', cc: '', cc_client: false, boite_id: '', objet: 'RE: {objet}', texte: '', mode: 'envoyer' }
const fmt = d => d ? new Date(d).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

// Dictionnaire des variables de la réponse automatique (Philippe 2026-11-02 : « ajoute une liste avec les explications,
// comme un dictionnaire, avec la recherche pour trouver ce qu'on veut ») : la liste vient du serveur (mail_autoreply.VARIABLES)
function VarDictionary({ variables, onInsert }) {
  const [q, setQ] = useState('')
  const norm = t => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const shown = (variables || []).filter(v => !q.trim() || [v.code, v.nom, v.explication, v.exemple].some(x => norm(x).includes(norm(q.trim()))))
  return (
    <div style={{ border: '1px solid var(--c-border)', borderRadius: 6, margin: '4px 0 8px' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 8px', borderBottom: '1px solid var(--c-border)' }}>
        <span style={{ fontWeight: 600 }}>Variables</span>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher (ex. client, montant, date)…" style={{ flex: 1, fontSize: 13, padding: '4px 8px' }} />
      </div>
      <div style={{ maxHeight: 170, overflowY: 'auto' }}>
        {shown.map(v => (
          <div key={v.code} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '6px 8px', borderBottom: '1px solid var(--c-surface-3)' }}>
            <code style={{ fontWeight: 700, minWidth: 96 }}>{v.code}</code>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{v.nom}</div>
              <div style={{ color: 'var(--c-muted)', fontSize: 12 }}>{v.explication}</div>
              <div style={{ color: 'var(--c-faint)', fontSize: 12 }}>ex. : {v.exemple}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: '1px 8px' }} onClick={() => onInsert('texte', v.code)}>+ texte</button>
              <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: '1px 8px' }} onClick={() => onInsert('objet', v.code)}>+ objet</button>
            </div>
          </div>
        ))}
        {!shown.length && <div style={{ padding: 8, color: 'var(--c-faint)', fontSize: 12 }}>Aucune variable ne correspond. Elles sont : {(variables || []).map(v => v.code).join(', ')}.</div>}
      </div>
    </div>
  )
}

export function MailRuleEditor({ initial, onClose, onSaved }) {
  const [r, setR] = useState(() => ({ ...EMPTY, ...(initial || {}), actions: { ...EMPTY.actions, ...(initial?.actions || {}) },
                                      conditions: initial?.conditions?.length ? initial.conditions : EMPTY.conditions }))
  const [opts, setOpts] = useState(null)
  const [companies, setCompanies] = useState([])
  const [contacts, setContacts] = useState([])
  const [company, setCompany] = useState(initial?.actions?.compagnie_id ? { id: initial.actions.compagnie_id, label: initial.compagnie || '' } : null)
  const [contact, setContact] = useState(initial?.actions?.contact_id ? { id: initial.actions.contact_id, label: initial.contact || '' } : null)
  const [move, setMove] = useState(initial?.actions?.a_jeter ? 'jeter' : initial?.actions?.dossier ? 'dossier' : '')
  const [prev, setPrev] = useState(null)
  const [boxes, setBoxes] = useState([])
  const [askOld, setAskOld] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const timer = useRef(null)
  const refs = { texte: useRef(null), objet: useRef(null) }
  // Variable mise là où est le curseur dans le texte ou l'objet (sinon à la fin)
  function insertVar(field, code) {
    const el = refs[field].current, cur = (rp?.[field]) || ''
    const at = el && document.activeElement === el ? el.selectionStart : (el?.dataset.pos ? Number(el.dataset.pos) : cur.length)
    setRp(field, cur.slice(0, at) + code + cur.slice(at))
    setTimeout(() => { if (el) { el.focus(); el.setSelectionRange(at + code.length, at + code.length) } }, 0)
  }
  const keepPos = e => { e.target.dataset.pos = e.target.selectionStart }

  useEffect(() => {
    api.get('/v1/mail/rules/options').then(x => setOpts(x.data))
    api.get('/v1/mail/senders').then(x => setBoxes(x.data.boxes || [])).catch(() => setBoxes([]))
    api.get('/v1/companies').then(x => setCompanies(x.data))
    api.get('/v1/contacts').then(x => setContacts(x.data))
  }, [])
  const body = () => ({ ...r, actions: { ...r.actions, compagnie_id: company?.id || null, contact_id: contact?.id || null,
                                         a_jeter: move === 'jeter', dossier: move === 'dossier' ? (r.actions.dossier || '') : null } })
  // Aperçu : combien de courriels déjà reçus répondent (rien n'est changé)
  useEffect(() => {
    clearTimeout(timer.current)
    if (!r.conditions.some(c => c.op === 'existe' || (c.valeur || '').trim())) { setPrev(null); return }
    timer.current = setTimeout(() => api.post('/v1/mail/rules/preview', { ...body(), name: r.name || 'aperçu' })
      .then(x => setPrev(x.data)).catch(() => setPrev(null)), 500)
    return () => clearTimeout(timer.current)
  }, [JSON.stringify(r.conditions), r.match])

  const setCond = (i, k, v) => setR(x => ({ ...x, conditions: x.conditions.map((c, j) => j === i ? { ...c, [k]: v, ...(k === 'champ' && v !== 'piece_jointe' && c.op === 'existe' ? { op: 'contient' } : {}) } : c) }))
  const setAct = (k, v) => setR(x => ({ ...x, actions: { ...x.actions, [k]: v } }))
  const rp = r.actions.repondre
  const setRp = (k, v) => setAct('repondre', { ...(rp || REPLY), [k]: v })
  const companyItems = companies.map(c => ({ id: c.id, label: c.name, sub: c.account_number, search: [c.legal_name, c.account_number] }))
  const contactItems = contacts.filter(c => !company || (c.companies || []).some(co => co.company_id === company.id))
    .map(c => ({ id: c.id, label: `${c.first_name} ${c.last_name}`.trim(), sub: c.email || c.companies?.[0]?.company_name || '' }))

  async function save(applyOld) {
    setSaving(true); setErr('')
    try {
      const b = { ...body(), apply_existing: !!applyOld }
      const x = initial?.id ? await api.put(`/v1/mail/rules/${initial.id}`, b) : await api.post('/v1/mail/rules', b)
      onSaved(x.data)
    } catch (e) { setErr(e.response?.data?.detail || 'Erreur'); setAskOld(false) } finally { setSaving(false) }
  }
  // « Il y en a plusieurs » : demander si la règle passe aussi sur les anciens (elle passera sur tous les prochains)
  // Modifier une règle : « Enregistrer » enregistre tout de suite (Philippe 2026-11-02 : « quand on modifie une règle, il
  // faudrait un sauvegarder la règle ») ; à la création, la question des anciens reste
  const trySave = () => (!initial?.id && prev?.count > 0 ? setAskOld(true) : save(false))
  const oldNote = r.actions.repondre?.actif ? ' (classer, lu, déplacer ; la réponse automatique ne part jamais pour les anciens)' : ''

  const row = { display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }
  const sel = { padding: '6px 8px', fontSize: 13 }
  if (!opts) return null
  return (
    <div className="modal-overlay" style={{ zIndex: 320 }}>
      <div className="modal-box" style={{ maxWidth: 760, width: 'min(760px, calc(100vw - 32px))' }} onClick={e => e.stopPropagation()}>
        <h3 className="modal-title">{initial?.id ? 'Modifier la règle' : 'Nouvelle règle des courriels'}</h3>
        <div className="form-group">
          <label className="ifield-label">Nom de la règle</label>
          <input value={r.name} onChange={e => setR(x => ({ ...x, name: e.target.value }))} placeholder="ex. Rapports Patio Design → Construction Nationale" style={{ width: '100%' }} />
        </div>

        <div className="ifield-section-title" style={{ marginTop: 10 }}>Quand un courriel arrive et que…</div>
        <div style={{ ...row, fontSize: 13 }}>
          <label><input type="radio" checked={r.match === 'toutes'} onChange={() => setR(x => ({ ...x, match: 'toutes' }))} /> toutes les conditions sont vraies</label>
          <label style={{ marginLeft: 12 }}><input type="radio" checked={r.match === 'une'} onChange={() => setR(x => ({ ...x, match: 'une' }))} /> au moins une est vraie</label>
        </div>
        {r.conditions.map((c, i) => (
          <div key={i} style={row}>
            <select value={c.champ} onChange={e => setCond(i, 'champ', e.target.value)} style={sel}>
              {Object.entries(opts.champs).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select value={c.op} onChange={e => setCond(i, 'op', e.target.value)} style={sel}>
              {Object.entries(opts.ops).filter(([k]) => k !== 'existe' || c.champ === 'piece_jointe').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            {c.op !== 'existe' && <input value={c.valeur} onChange={e => setCond(i, 'valeur', e.target.value)} placeholder="texte" style={{ flex: 1, minWidth: 180, ...sel }} />}
            {r.conditions.length > 1 && <button type="button" className="btn-secondary" style={{ padding: '4px 10px' }} title="Retirer cette condition"
              onClick={() => setR(x => ({ ...x, conditions: x.conditions.filter((_, j) => j !== i) }))}>✕</button>}
          </div>
        ))}
        <button type="button" className="btn-secondary" style={{ fontSize: 12, padding: '3px 10px' }}
          onClick={() => setR(x => ({ ...x, conditions: [...x.conditions, { champ: 'objet', op: 'contient', valeur: '' }] }))}>+ Ajouter une condition</button>
        {prev && (
          <div style={{ fontSize: 13, marginTop: 8, color: 'var(--c-muted)' }}>
            {prev.count === 0 ? 'Aucun courriel déjà reçu ne répond à ces conditions.' : `${prev.count} courriel${prev.count > 1 ? 's' : ''} déjà reçu${prev.count > 1 ? 's' : ''} répond${prev.count > 1 ? 'ent' : ''} à ces conditions, par exemple :`}
            {prev.sample.map(s => <div key={s.id} style={{ fontSize: 12, marginLeft: 10 }}>· {fmt(s.sent_at)} — {s.from} — {s.subject}{s.manual ? ' (classé à la main : gardé)' : ''}</div>)}
          </div>
        )}

        <div className="ifield-section-title" style={{ marginTop: 14 }}>Alors…</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Autocomplete label="Classer dans la compagnie" items={companyItems} value={company} onSelect={setCompany} placeholder="(ne pas classer)" />
          <Autocomplete label="et le contact (facultatif)" items={contactItems} value={contact} onSelect={setContact} placeholder="(aucun)" openOnFocus={!!company} />
        </div>
        <div style={{ ...row, fontSize: 13, marginTop: 6 }}>
          <label><input type="checkbox" checked={!!r.actions.lu} onChange={e => setAct('lu', e.target.checked)} /> Marquer comme lu</label>
        </div>
        <div style={{ ...row, fontSize: 13 }}>
          <label><input type="radio" checked={move === ''} onChange={() => setMove('')} /> Le laisser dans la boîte de réception</label>
          <label style={{ marginLeft: 10 }}><input type="radio" checked={move === 'jeter'} onChange={() => setMove('jeter')} /> Le mettre dans « À jeter »</label>
          <label style={{ marginLeft: 10 }}><input type="radio" checked={move === 'dossier'} onChange={() => setMove('dossier')} /> Le déplacer dans le dossier</label>
          {move === 'dossier' && <>
            <input list="mail-rule-folders" value={r.actions.dossier || ''} onChange={e => setAct('dossier', e.target.value)} placeholder="nom du dossier (créé s'il n'existe pas)" style={{ minWidth: 220, ...sel }} />
            <datalist id="mail-rule-folders">{opts.dossiers.map(d => <option key={d} value={d} />)}</datalist>
          </>}
        </div>
        <div style={{ ...row, fontSize: 13, marginTop: 4 }}>
          <label><input type="checkbox" checked={!!rp?.actif} onChange={e => setAct('repondre', e.target.checked ? { ...REPLY, ...(rp || {}), actif: true, boite_id: rp?.boite_id || boxes[0]?.id || '' } : null)} /> Répondre automatiquement</label>
        </div>
        {rp?.actif && (
          <div style={{ border: '1px solid var(--c-border)', borderRadius: 8, padding: 10, margin: '2px 0 8px 22px', fontSize: 13 }}>
            <div style={row}>
              <span style={{ width: 90 }}>De</span>
              <select value={rp.boite_id} onChange={e => setRp('boite_id', e.target.value)} style={sel}>
                <option value="">— choisir la boîte —</option>
                {boxes.map(b => <option key={b.id} value={b.id}>{b.email}{b.personal ? ' (personnelle)' : ''}</option>)}
              </select>
            </div>
            <div style={row}>
              <span style={{ width: 90 }}>À</span>
              <label><input type="radio" checked={rp.a === 'expediteur'} onChange={() => setRp('a', 'expediteur')} /> l'expéditeur</label>
              <label style={{ marginLeft: 10 }}><input type="radio" checked={rp.a === 'client'} onChange={() => setRp('a', 'client')} /> l'adresse des factures du client du courriel</label>
            </div>
            <div style={row}>
              <span style={{ width: 90 }}>Cc</span>
              <RecipientInput value={rp.cc || ''} onChange={v => setRp('cc', v)} options={[]} placeholder="adresses en copie (facultatif)" style={{ flex: 1, ...sel }} />
            </div>
            <div style={{ ...row, marginLeft: 96 }}>
              <label><input type="checkbox" checked={!!rp.cc_client} onChange={e => setRp('cc_client', e.target.checked)} /> aussi en Cc : l'adresse des factures du client</label>
            </div>
            <div style={row}>
              <span style={{ width: 90 }}>Objet</span>
              <input ref={refs.objet} value={rp.objet || ''} onChange={e => setRp('objet', e.target.value)} onBlur={keepPos} style={{ flex: 1, ...sel }} />
            </div>
            <textarea ref={refs.texte} onBlur={keepPos} value={rp.texte || ''} onChange={e => setRp('texte', e.target.value)} rows={5} placeholder="ex. Bonjour, merci pour votre paiement. Pour vos prochains virements Interac, utilisez facturation@simpleip.tel."
              style={{ width: '100%', fontSize: 13, padding: 8, boxSizing: 'border-box' }} />
            <div style={{ fontSize: 12, color: 'var(--c-faint)', margin: '2px 0 0' }}>Le courriel reçu est cité sous la réponse. Variables à mettre dans l'objet ou le texte :</div>
            <VarDictionary variables={opts.variables} onInsert={insertVar} />
            <div style={row}>
              <label><input type="radio" checked={rp.mode !== 'preparer'} onChange={() => setRp('mode', 'envoyer')} /> L'envoyer tout de suite</label>
              <label style={{ marginLeft: 10 }}><input type="radio" checked={rp.mode === 'preparer'} onChange={() => setRp('mode', 'preparer')} /> La préparer : je l'envoie en un clic (cloche, « À vérifier »)</label>
            </div>
            <div style={{ fontSize: 12, color: 'var(--c-faint)' }}>
              Seulement pour les courriels qui arrivent (jamais les anciens). Jamais vers une adresse sans réponse (noreply, notify…) ni vers nos boîtes ;
              une réponse par jour au plus par client ; vers le client : elle attend que le courriel soit classé dans sa fiche (règle, adresse ou Zéko), sinon elle va dans « À vérifier ».
            </div>
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--c-faint)' }}>Un courriel classé à la main n'est jamais reclassé par une règle.</div>

        {err && <div style={{ color: '#DC2626', fontSize: 13, marginTop: 8 }}>{err}</div>}
        {askOld ? (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: 'var(--c-tint-blue)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
              {prev.count} courriel{prev.count > 1 ? 's' : ''} déjà reçu{prev.count > 1 ? 's' : ''} répond{prev.count > 1 ? 'ent' : ''} à cette règle. La règle passera sur tous les prochains : l'appliquer aussi aux anciens{oldNote} ?
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button className="btn-secondary" disabled={saving} onClick={() => setAskOld(false)}>Retour</button>
              <button className="btn-secondary" disabled={saving} onClick={() => save(false)}>Enregistrer (seulement les prochains)</button>
              <button className="btn-primary" disabled={saving} onClick={() => save(true)}>{saving ? '…' : `Enregistrer et appliquer aux ${prev.count} anciens`}</button>
            </div>
          </div>
        ) : (
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>Annuler</button>
            {initial?.id && prev?.count > 0 && <button className="btn-secondary" onClick={() => save(true)} disabled={saving}
              title={`Enregistre la règle, puis la passe sur les courriels déjà reçus${oldNote}`}>Enregistrer et appliquer aux {prev.count} anciens</button>}
            <button className="btn-primary" onClick={trySave} disabled={saving}>{saving ? '…' : 'Enregistrer'}</button>
          </div>
        )}
      </div>
    </div>
  )
}

function applied(a) {
  if (!a) return ''
  const bits = [a.classes && `${a.classes} classé${a.classes > 1 ? 's' : ''}`, a.lus && `${a.lus} marqué${a.lus > 1 ? 's' : ''} lu${a.lus > 1 ? 's' : ''}`,
                a.a_jeter && `${a.a_jeter} mis dans « À jeter »`, a.deplaces && `${a.deplaces} à déplacer (au prochain passage de la boîte)`,
                a.garde_a_la_main && `${a.garde_a_la_main} gardé${a.garde_a_la_main > 1 ? 's' : ''} (classé${a.garde_a_la_main > 1 ? 's' : ''} à la main)`].filter(Boolean)
  return `Anciens courriels : ${bits.join(', ') || 'rien à changer'}.`
}

export default function MailRulesPanel() {
  const [rows, setRows] = useState(null)
  const [edit, setEdit] = useState(undefined)      // undefined = fermé, null = nouvelle, objet = modification
  const [msg, setMsg] = useState('')
  const load = () => api.get('/v1/mail/rules').then(x => setRows(x.data))
  useEffect(() => { load() }, [])
  async function act(fn) { setMsg(''); try { await fn() } catch (e) { setMsg(e.response?.data?.detail || 'Erreur') } load() }
  const actionsText = r => [r.compagnie && `classer dans ${r.compagnie}${r.contact ? ` (${r.contact})` : ''}`, r.actions.lu && 'marquer lu',
                            r.actions.a_jeter && 'mettre dans « À jeter »', r.actions.dossier && `déplacer dans « ${r.actions.dossier} »`,
                            r.actions.repondre?.actif && `répondre ${r.actions.repondre.a === 'client' ? 'au client' : 'à l\'expéditeur'}${r.actions.repondre.mode === 'preparer' ? ' (préparée)' : ''}`].filter(Boolean).join(', ')
  if (!rows) return <div className="loading">Chargement...</div>
  return (
    <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 12, padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--c-text)', margin: 0 }}>Règles des courriels</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" title="Zéko regarde tes courriels avec toi et propose des règles"
            onClick={() => window.dispatchEvent(new CustomEvent('zeko-ask', { detail: 'Regarde avec moi mes courriels des 90 derniers jours et propose-moi des règles' }))}>Z  Revoir mes courriels avec Zéko</button>
          <button className="btn-primary" onClick={() => setEdit(null)}>+ Nouvelle règle</button>
        </div>
      </div>
      <p style={{ fontSize: 13, color: 'var(--c-muted)', marginBottom: 14 }}>
        Comme les règles d'Outlook : appliquées dès qu'un courriel arrive, avant le classement par adresse et avant Zéko. La première règle de la liste qui répond s'applique (▲▼ pour l'ordre).
        Un courriel classé à la main n'est jamais reclassé. Désactive une règle si elle fait une erreur ; les courriels déjà traités restent où ils sont.
      </p>
      {msg && <div style={{ fontSize: 13, color: msg.startsWith('Anciens') ? 'var(--c-on-green)' : '#DC2626', marginBottom: 10 }}>{msg}</div>}
      {rows.length === 0 && <div className="empty-tab">Aucune règle. « + Nouvelle règle », ou « Toujours faire ça ? » dans un courriel classé, ou demande-le à Zéko.</div>}
      {rows.map((r, i) => (
        <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderTop: i ? '1px solid var(--c-border)' : 'none', opacity: r.is_active ? 1 : 0.55 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <button className="btn-secondary" style={{ padding: '0 6px', fontSize: 11 }} disabled={i === 0} title="Monter" onClick={() => act(() => api.post(`/v1/mail/rules/${r.id}/move`, { dir: 'up' }))}>▲</button>
            <button className="btn-secondary" style={{ padding: '0 6px', fontSize: 11 }} disabled={i === rows.length - 1} title="Descendre" onClick={() => act(() => api.post(`/v1/mail/rules/${r.id}/move`, { dir: 'down' }))}>▼</button>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}{r.source === 'zeko' && <span style={{ fontSize: 11, marginLeft: 8, color: 'var(--brand)' }}>créée par Zéko</span>}</div>
            <div style={{ fontSize: 13, color: 'var(--c-muted)' }}>Si {r.description} → {actionsText(r) || '—'}</div>
            <div style={{ fontSize: 12, color: 'var(--c-faint)' }}>{r.hits ? `${r.hits} fois · dernière : ${fmt(r.last_hit_at)}` : 'Pas encore utilisée'}</div>
          </div>
          <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={r.is_active} onChange={e => act(() => api.put(`/v1/mail/rules/${r.id}/active`, { is_active: e.target.checked }))} /> Active
          </label>
          <button className="btn-secondary" style={{ fontSize: 12 }} title="Passer la règle sur les courriels déjà reçus"
            onClick={async () => { if (await askConfirm(`Appliquer « ${r.name} » aux courriels déjà reçus ? (un courriel classé à la main est gardé)`)) { setMsg(''); try { const x = await api.post(`/v1/mail/rules/${r.id}/apply-existing`); setMsg(applied(x.data)) } catch (e) { setMsg(e.response?.data?.detail || 'Erreur') } load() } }}>Aux anciens</button>
          <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => setEdit(r)}>Modifier</button>
          <button onClick={async () => { if (await askConfirm(`Supprimer la règle « ${r.name} » ? Les courriels déjà traités restent où ils sont.`)) act(() => api.delete(`/v1/mail/rules/${r.id}`)) }}
            style={{ color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>Supprimer</button>
        </div>
      ))}
      {edit !== undefined && <MailRuleEditor initial={edit} onClose={() => setEdit(undefined)}
        onSaved={x => { setEdit(undefined); setMsg(x.applied ? applied(x.applied) : ''); load() }} />}
    </div>
  )
}
