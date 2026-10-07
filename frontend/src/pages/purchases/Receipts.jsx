// Recus deposes (TASK-044.1) : depot de PDF, images ou ZIP -> lecture + IA locale + verifications du
// programme -> depense creee (fichier joint) ou « A verifier » (lecture pre-remplie, recu affiche a cote).
import { useState, useEffect, useRef } from 'react'
import api from '../../services/api'
import { C, EMPTY, fmtMoney, fmtD, th, thR, td, tdR, headRow, Card, Modal, Field, VendorPicker, CategorySelect, useRefs, errText } from './common'

export const LINE_CLASSES = [
  ['materiel_taxable', 'Matériel taxable'], ['materiel_non_taxable', 'Matériel non taxable'],
  ['service_taxable', 'Service taxable'], ['service_non_taxable', 'Service non taxable'],
  ['frais_fournisseur', 'Frais de fournisseur'], ['assurance', 'Assurance'],
  ['frais_bancaires', 'Frais bancaires et de carte'], ['repas_representation', 'Repas et représentation (taxes réclamables à 50 %)'],
  ['salaires_commissions', 'Salaires, commissions et sous-traitants'], ['versement_gouvernement', 'Versement au gouvernement'],
]
const TAXABLE_BY_DEFAULT = { materiel_taxable: true, service_taxable: true, frais_fournisseur: true, repas_representation: true }
const STATUS = {
  pending: ['En file', C.muted], reading: ['Lecture du document…', '#2563EB'], analyzing: ['Analyse par l\'IA…', '#6D28D9'],
  created: ['Dépense créée', C.green], review: ['À vérifier', '#D97706'], failed: ['Échec', C.red], duplicate: ['Doublon', C.faint],
}

// Ouvre le fichier original (requete authentifiee -> adresse locale du navigateur)
export async function openReceipt(id) {
  const r = await api.get(`/v1/purchases/receipts/${id}/file`, { responseType: 'blob' })
  window.open(URL.createObjectURL(r.data), '_blank')
}

function ReceiptPreview({ id, filename }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let u
    api.get(`/v1/purchases/receipts/${id}/file`, { responseType: 'blob' }).then(r => { u = URL.createObjectURL(r.data); setUrl(u) })
    return () => u && URL.revokeObjectURL(u)
  }, [id])
  if (!url) return <div style={{ color: C.muted, fontSize: 13 }}>Chargement du reçu…</div>
  return /\.pdf$/i.test(filename)
    ? <iframe title="reçu" src={url} style={{ width: '100%', height: '70vh', border: `1px solid ${C.border}`, borderRadius: 8 }} />
    : /\.(jpe?g|png|gif|webp|bmp)$/i.test(filename)
      ? <img alt="reçu" src={url} style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', border: `1px solid ${C.border}`, borderRadius: 8 }} />
      : <a href={url} target="_blank" rel="noreferrer">Ouvrir {filename}</a>
}

function groupLines(lines) {
  const out = {}
  for (const l of lines) {
    const k = `${l.classe}|${l.taxable}`
    out[k] = out[k] || { description: '', classe: l.classe, taxable: l.taxable, montant: 0 }
    out[k].montant = Math.round((out[k].montant + (parseFloat(l.montant) || 0)) * 100) / 100
  }
  return Object.values(out).filter(l => l.montant !== 0).map(l => ({ ...l, montant: l.montant.toFixed(2) }))
}

function ReviewModal({ doc, onClose, onDone }) {
  const refs = useRefs()
  const x = doc.extracted || {}
  const [f, setF] = useState({
    fournisseur: x.fournisseur || '', vendor_id: null, date: x.date || '', numero: x.numero || '',
    prix_taxes_incluses: !!x.prix_taxes_incluses, sous_total: x.sous_total ?? '', tps: x.tps ?? 0, tvq: x.tvq ?? 0, total: x.total ?? '',
    category_id: null, compte: x.compte || '',
    // Une ligne par classe, pas par article (Philippe, 2026-10-07)
    lignes: x.lignes?.length ? groupLines(x.lignes) : [{ description: '', classe: 'materiel_taxable', taxable: true, montant: '' }],
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {   // compte lu par l'IA -> compte de depense existant
    const c = refs.categories.find(c => c.name.toLowerCase() === (f.compte || '').toLowerCase())
    if (c && !f.category_id) setF(v => ({ ...v, category_id: c.id }))
  }, [refs.categories])
  const setLine = (i, k, v) => setF({ ...f, lignes: f.lignes.map((l, j) => j === i ? { ...l, [k]: v, ...(k === 'classe' ? { taxable: !!TAXABLE_BY_DEFAULT[v] } : {}) } : l) })
  const sum = f.lignes.reduce((s, l) => s + (parseFloat(l.montant) || 0), 0)

  async function save() {
    setError('')
    if (!f.fournisseur.trim() && !f.vendor_id) { setError('Fournisseur requis'); return }
    if (!f.date || !(parseFloat(f.total) > 0)) { setError('Date et total requis'); return }
    setSaving(true)
    try {
      const r = await api.post(`/v1/purchases/receipts/${doc.id}/create`, {
        fournisseur: f.fournisseur || (refs.vendors.find(v => v.id === f.vendor_id)?.name ?? ''), vendor_id: f.vendor_id, date: f.date, numero: f.numero || null,
        prix_taxes_incluses: f.prix_taxes_incluses, sous_total: f.sous_total === '' ? null : parseFloat(f.sous_total),
        tps: parseFloat(f.tps) || 0, tvq: parseFloat(f.tvq) || 0, total: parseFloat(f.total), category_id: f.category_id,
        lignes: f.lignes.filter(l => l.montant !== '').map(l => ({ description: l.description, classe: l.classe, taxable: !!l.taxable, montant: parseFloat(l.montant) })),
      })
      onDone(r.data)
    } catch (e) { setError(errText(e)); setSaving(false) }
  }

  return (
    <Modal title={`À vérifier — ${doc.filename}`} width={1180} actions={<>
      <button className="btn-secondary" onClick={onClose}>Annuler</button>
      <button className="btn-primary" disabled={saving} onClick={save}>Créer la dépense</button>
    </>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(420px, 1.3fr)', gap: 16 }}>
        <ReceiptPreview id={doc.id} filename={doc.filename} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {doc.checks?.length > 0 && (
            <div style={{ fontSize: 12, background: '#F9FAFB', borderRadius: 8, padding: '8px 10px' }}>
              {doc.checks.map((c, i) => <div key={i} style={{ color: c.ok ? C.green : C.red }}>{c.ok ? '✓' : '✗'} {c.label}</div>)}
            </div>
          )}
          <div className="form-grid">
            <Field label={`Fournisseur lu : ${x.fournisseur || EMPTY}`}><input value={f.fournisseur} onChange={e => setF({ ...f, fournisseur: e.target.value, vendor_id: null })} /></Field>
            <VendorPicker label="ou fournisseur existant" vendors={refs.vendors} value={f.vendor_id} onCreated={refs.reload} onChange={vid => setF({ ...f, vendor_id: vid })} />
            <Field label="Date *"><input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></Field>
            <Field label="N° de facture"><input value={f.numero} onChange={e => setF({ ...f, numero: e.target.value })} /></Field>
          </div>
          <Field label="Compte de dépense"><CategorySelect categories={refs.categories} value={f.category_id} onChange={v => setF({ ...f, category_id: v })} /></Field>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={headRow}><th style={th}>Classe</th><th style={th}>Note</th><th style={thR}>Montant</th><th style={th}>Taxable</th><th style={th}></th></tr></thead>
              <tbody>
                {f.lignes.map((l, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={td}><select value={l.classe} onChange={e => setLine(i, 'classe', e.target.value)}>{LINE_CLASSES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></td>
                    <td style={td}><input value={l.description || ''} style={{ width: '100%' }} onChange={e => setLine(i, 'description', e.target.value)} /></td>
                    <td style={tdR}><input type="number" step="0.01" value={l.montant} style={{ width: 90, textAlign: 'right' }} onChange={e => setLine(i, 'montant', e.target.value)} /></td>
                    <td style={td}><input type="checkbox" checked={!!l.taxable} onChange={e => setLine(i, 'taxable', e.target.checked)} /></td>
                    <td style={td}>{f.lignes.length > 1 && <button className="inv-del-btn" onClick={() => setF({ ...f, lignes: f.lignes.filter((_, j) => j !== i) })}>✕</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn-secondary" style={{ fontSize: 12, marginTop: 6 }} onClick={() => setF({ ...f, lignes: [...f.lignes, { description: '', classe: 'materiel_taxable', taxable: true, montant: '' }] })}>+ Ligne</button>
          </div>
          <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={f.prix_taxes_incluses} onChange={e => setF({ ...f, prix_taxes_incluses: e.target.checked })} /> Les prix des lignes incluent déjà les taxes
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            <Field label={`Sous-total (lignes : ${sum.toFixed(2)})`}><input type="number" step="0.01" value={f.sous_total} onChange={e => setF({ ...f, sous_total: e.target.value })} /></Field>
            <Field label="TPS payée"><input type="number" step="0.01" value={f.tps} onChange={e => setF({ ...f, tps: e.target.value })} /></Field>
            <Field label="TVQ payée"><input type="number" step="0.01" value={f.tvq} onChange={e => setF({ ...f, tvq: e.target.value })} /></Field>
            <Field label="Total *"><input type="number" step="0.01" value={f.total} onChange={e => setF({ ...f, total: e.target.value })} /></Field>
          </div>
          {error && <div style={{ color: C.red, fontSize: 13 }}>{error}</div>}
        </div>
      </div>
    </Modal>
  )
}

export function ReceiptDrop({ onExpenseCreated }) {
  const [docs, setDocs] = useState([])
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reviewing, setReviewing] = useState(null)
  const [showDone, setShowDone] = useState(false)
  const inputRef = useRef()
  const load = () => api.get('/v1/purchases/receipts').then(r => setDocs(r.data))
  useEffect(() => { load() }, [])
  const working = docs.some(d => ['pending', 'reading', 'analyzing'].includes(d.status))
  useEffect(() => {
    if (!working) return
    const h = setInterval(async () => { await load(); onExpenseCreated?.() }, 15000)
    return () => clearInterval(h)
  }, [working])

  async function upload(files) {
    if (!files?.length) return
    setBusy(true); setError('')
    const fd = new FormData()
    ;[...files].forEach(f => fd.append('files', f))
    try { await api.post('/v1/purchases/receipts', fd); await load() } catch (e) { setError(errText(e, 'Dépôt impossible')) }
    setBusy(false)
  }
  async function act(d, what) {
    try {
      if (what === 'retry') await api.post(`/v1/purchases/receipts/${d.id}/retry`)
      if (what === 'delete') { if (!confirm(`Retirer « ${d.filename} » ?`)) return; await api.delete(`/v1/purchases/receipts/${d.id}`) }
      await load()
    } catch (e) { alert(errText(e)) }
  }
  const open = docs.filter(d => d.status !== 'created')
  const done = docs.filter(d => d.status === 'created')
  const shown = showDone ? docs : open
  const eta = s => s < 60 ? `${s} s` : `${Math.ceil(s / 60)} min`

  return (
    <div style={{ marginBottom: 16 }}>
      <div onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files) }} onClick={() => inputRef.current?.click()}
        style={{ border: `2px dashed ${over ? C.link : C.border}`, background: over ? '#EFF6FF' : '#FAFAFA', borderRadius: 10, padding: '16px', textAlign: 'center', cursor: 'pointer', fontSize: 13, color: C.muted }}>
        {busy ? 'Dépôt…' : <>Glissez vos reçus et factures ici (PDF, photos JPEG/PNG, ZIP…) ou <span style={{ color: C.link }}>choisissez des fichiers</span> — l'IA locale les lit et crée les dépenses ; ce qui ne balance pas au cent près attend « À vérifier ».</>}
        <input ref={inputRef} type="file" multiple style={{ display: 'none' }} onChange={e => { upload(e.target.files); e.target.value = '' }} />
      </div>
      {error && <div style={{ color: C.red, fontSize: 13, marginTop: 6 }}>{error}</div>}
      {docs.length > 0 && (
        <Card style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
            <strong style={{ fontSize: 13 }}>Reçus déposés {open.length > 0 && `— ${open.length} à traiter ou en cours`}</strong>
            <label style={{ fontSize: 12, color: C.muted, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> Afficher aussi les dépenses créées ({done.length})
            </label>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={headRow}>
                <th style={th}>Fichier déposé</th><th style={th}>État</th><th style={th}>Fournisseur et date lus</th>
                <th style={thR}>Total lu</th><th style={thR}>Actions</th>
              </tr></thead>
              <tbody>
                {shown.slice(0, 200).map(d => {
                  const [sl, sc] = STATUS[d.status] || [d.status, C.muted]
                  const x = d.extracted
                  return (
                    <tr key={d.id} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={td}><span style={{ color: C.link, cursor: 'pointer' }} onClick={() => openReceipt(d.id)}>{d.filename}</span>{d.from_zip && <div style={{ fontSize: 11, color: C.faint }}>de {d.from_zip}</div>}</td>
                      <td style={{ ...td, color: sc, fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>
                        {sl}{d.queue_position ? ` (n° ${d.queue_position} — environ ${eta(d.eta_seconds)})` : ''}
                        {d.error && <div style={{ fontWeight: 400, color: C.muted }}>{d.error}</div>}
                      </td>
                      <td style={{ ...td, fontSize: 12, color: C.muted }}>{x ? `${x.fournisseur || '?'} · ${x.date ? fmtD(x.date) : '?'}` : ''}</td>
                      <td style={{ ...tdR, fontWeight: 600 }}>{x?.total != null ? fmtMoney(x.total) : ''}</td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {d.status === 'review' && <button className="btn-primary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => setReviewing(d)}>Vérifier</button>}
                        {d.status === 'failed' && <button className="btn-secondary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => act(d, 'retry')}>Réessayer</button>}
                        {d.status === 'failed' && <button className="btn-secondary" style={{ padding: '3px 10px', fontSize: 12, marginLeft: 4 }} onClick={() => setReviewing(d)}>Saisir</button>}
                        {['failed', 'duplicate', 'review'].includes(d.status) && <button type="button" onClick={() => act(d, 'delete')} style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 12, marginLeft: 6 }}>Retirer</button>}
                      </td>
                    </tr>
                  )
                })}
                {!shown.length && <tr><td colSpan={5} style={{ ...td, color: C.faint, textAlign: 'center' }}>Tout est traité.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {reviewing && <ReviewModal doc={reviewing} onClose={() => setReviewing(null)} onDone={async () => { setReviewing(null); await load(); onExpenseCreated?.() }} />}
    </div>
  )
}
