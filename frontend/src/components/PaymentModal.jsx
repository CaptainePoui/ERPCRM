import { useState, useEffect } from 'react'
import EntityLink from './EntityLink'
import api from '../services/api'
import Autocomplete from './Autocomplete'
import { C, EMPTY, fmtDate, fmtMoney } from '../pages/Bank'
import { askConfirm } from './Dialog'

// Fiche d'un paiement recu (TASK-005.24 / TASK-042.8, 2026-10-15) : ce qu'il paie, le depot BNC qui le prouve,
// les cheques attaches (Philippe : « on devrait les mettre dans paiement lié au client »). Une facture perdue de
// l'ancien logiciel reste modifiable (client, numero, note). Ne se ferme que par le bouton (jamais au clic exterieur).

const fmtD = d => d ? fmtDate(d + 'T00:00:00') : EMPTY

function errText(e) {
  const d = e.response?.data?.detail
  return Array.isArray(d) ? d.map(x => x.msg).join(' ; ') : (d || 'Erreur')
}

// Les fichiers demandent le jeton : lus en blob puis montres par une adresse locale
function DocThumb({ doc, onOpen }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let u
    api.get(`/v1/payments/documents/${doc.id}/file`, { responseType: 'blob' }).then(r => { u = URL.createObjectURL(r.data); setUrl(u) })
    return () => u && URL.revokeObjectURL(u)
  }, [doc.id])
  if (!url) return <div style={{ width: 260, height: 110, border: `1px solid ${C.border}`, borderRadius: 6 }} />
  if (doc.media_type === 'application/pdf') return <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>{doc.original_name || 'Document PDF'}</a>
  return <img src={url} alt="Chèque" onClick={() => onOpen(url)} style={{ width: 260, borderRadius: 6, border: `1px solid ${C.border}`, cursor: 'zoom-in' }} />
}

export default function PaymentModal({ paymentId, onClose, onChanged }) {
  const [d, setD] = useState(null)
  const [companies, setCompanies] = useState([])
  const [edit, setEdit] = useState(null)        // { company, number, notes } pendant la modification
  const [big, setBig] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = async () => setD((await api.get(`/v1/payments/${paymentId}/detail`)).data)
  useEffect(() => { load() }, [paymentId])
  useEffect(() => { if (edit && !companies.length) api.get('/v1/companies').then(r => setCompanies(r.data.map(c => ({ id: c.id, label: c.name })))) }, [edit])

  async function run(fn) {
    setBusy(true); setError(null)
    try { await fn(); await load(); onChanged && await onChanged() } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }
  async function upload(file) {
    if (!file) return
    const fd = new FormData(); fd.append('file', file); fd.append('kind', 'cheque')
    await run(() => api.post(`/v1/payments/${paymentId}/documents`, fd))
  }

  const row = (label, value) => value ? <div style={{ display: 'flex', gap: 12, fontSize: 13, padding: '3px 0' }}><span style={{ color: C.muted, minWidth: 140 }}>{label}</span><span>{value}</span></div> : null
  const box = { border: `1px solid ${C.border}`, borderRadius: 8, padding: 12 }
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 760, maxWidth: '96vw', maxHeight: '94vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!d ? <div className="loading">Chargement...</div> : <>
          <h3 className="modal-title" style={{ margin: 0 }}>Paiement de {fmtMoney(d.amount)} — <EntityLink kind="company" id={d.company_id}>{d.company_name}</EntityLink></h3>
          <div style={box}>
            {row('Reçu le', fmtD(d.received_at))}
            {row('Mode', d.method_name)}
            {row('Paie', d.lost_invoice
              ? <span><strong>Facture perdue (ancien logiciel){d.lost_invoice_number ? ` #${d.lost_invoice_number}` : ''}</strong> — document non conservé, rien en crédit, aucun effet sur les taxes</span>
              : (d.allocations.length ? d.allocations.map((a, k) => <span key={a.invoice_id}>{k ? ', ' : ''}<EntityLink kind="invoice" id={a.invoice_id}>{a.number}</EntityLink> ({fmtMoney(a.amount)})</span>) : 'Aucune facture'))}
            {row('Dépôt bancaire', d.bank && `${fmtD(d.bank.posted_date)} · ${d.bank.description}${d.bank.payee ? ` — ${d.bank.payee}` : ''} · ${fmtMoney(d.bank.amount)}`)}
            {row('Note', d.notes)}
            {d.lost_invoice && !edit && (
              <button className="btn-secondary" style={{ fontSize: 12, padding: '3px 10px', marginTop: 6 }}
                onClick={() => setEdit({ company: { id: d.company_id, label: d.company_name }, number: d.lost_invoice_number || '', notes: d.notes || '' })}>Modifier</button>
            )}
            {edit && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                <Autocomplete items={companies} value={edit.company} onSelect={c => setEdit(x => ({ ...x, company: c }))} openOnFocus placeholder="Client..." />
                <input placeholder="N° de la facture perdue (si connu)" value={edit.number} onChange={e => setEdit(x => ({ ...x, number: e.target.value }))} />
                <textarea rows={2} placeholder="Note" value={edit.notes} onChange={e => setEdit(x => ({ ...x, notes: e.target.value }))} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-secondary" onClick={() => setEdit(null)}>Annuler</button>
                  <button className="btn-primary" disabled={busy || !edit.company}
                    onClick={() => run(() => api.patch(`/v1/payments/${paymentId}/lost-invoice`, { company_id: edit.company.id, invoice_number: edit.number, notes: edit.notes })).then(() => setEdit(null))}>Enregistrer</button>
                </div>
              </div>
            )}
          </div>

          <div style={box}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Chèques et pièces ({d.documents.length})</div>
              <label className="btn-secondary" style={{ fontSize: 12, padding: '3px 10px', cursor: 'pointer' }}>
                + Ajouter
                <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => { upload(e.target.files[0]); e.target.value = '' }} />
              </label>
            </div>
            {d.documents.length === 0 && <div style={{ fontSize: 13, color: C.faint }}>Aucune pièce attachée.</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {d.documents.map(doc => (
                <div key={doc.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <DocThumb doc={doc} onOpen={setBig} />
                  <button className="btn-secondary" style={{ fontSize: 11, padding: '2px 8px', color: C.red, alignSelf: 'flex-start' }}
                    onClick={async () => await askConfirm('Retirer ce chèque du paiement ? Le fichier sera supprimé.') && run(() => api.delete(`/v1/payments/documents/${doc.id}`))}>Retirer</button>
                </div>
              ))}
            </div>
          </div>

          {error && <div style={{ color: C.red, fontSize: 13 }}>{error}</div>}
          <div className="modal-actions"><button className="btn-secondary" onClick={onClose}>Fermer</button></div>
        </>}
      </div>
      {big && (
        <div className="modal-overlay" style={{ zIndex: 2000 }}>
          <div className="modal-box" style={{ width: 'auto', maxWidth: '96vw', maxHeight: '94vh', overflow: 'auto' }}>
            <img src={big} alt="Chèque" style={{ maxWidth: '90vw', maxHeight: '80vh' }} />
            <div className="modal-actions"><button className="btn-secondary" onClick={() => setBig(null)}>Fermer</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
