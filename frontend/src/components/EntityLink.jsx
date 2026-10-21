import { useNavigate } from 'react-router-dom'

// Lien vers la fiche d'une compagnie, d'un contact, d'une facture, d'un avoir ou d'un devis (TASK-054, 2026-10-21 :
// « que les infos de compagnie, contact, facture, crédit, devis soient des liens vers leur page pour aller les consulter
// rapidement »). Vrai lien : Ctrl+clic ouvre un nouvel onglet ; un clic ne déclenche pas le clic de la ligne autour.
const PATH = {
  company: id => `/companies/${id}`,
  contact: id => `/contacts/${id}`,
  invoice: id => `/invoices/${id}`,       // ouverte dans la fiche du client (redirection de InvoiceDetail)
  credit: id => `/invoices/${id}`,
  devis: id => `/devis/${id}`,
  ticket: id => `/tickets/${id}`,
}

export default function EntityLink({ kind, id, children, style, title }) {
  const navigate = useNavigate()
  if (!id || !PATH[kind]) return <>{children}</>
  const href = PATH[kind](id)
  return (
    <a href={href} title={title} style={{ color: 'inherit', textDecoration: 'underline', textDecorationColor: 'var(--c-faint)', textUnderlineOffset: 2, cursor: 'pointer', ...style }}
      onClick={e => {
        e.stopPropagation()
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return
        e.preventDefault()
        navigate(href)
      }}>{children}</a>
  )
}

// Liste de factures en liens : « INV-1, INV-2 »
export function InvoiceLinks({ invoices, empty = '—' }) {
  if (!invoices?.length) return <>{empty}</>
  return invoices.map((i, k) => <span key={i.id}>{k ? ', ' : ''}<EntityLink kind="invoice" id={i.id}>{i.number}</EntityLink></span>)
}
