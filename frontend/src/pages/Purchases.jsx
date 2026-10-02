import { ModulePlaceholder } from './Sales'
import PurchaseOrders from './PurchaseOrders'

// Menu Achats (TASK-044, 2026-10-02) -- structure ; donnees et import Zoho a l'etape suivante
const SOON = 'Module Achats en construction — vos données Zoho (dépenses, factures fournisseurs, récurrences) seront importées à l\'étape suivante.'

export const PurchaseVendors = () => <ModulePlaceholder title="Fournisseurs" newLabel="+ Nouveau fournisseur" columns={['Nom', 'Courriel', 'Téléphone', 'Factures', 'Dû']} note={SOON} />
export const PurchaseExpenses = () => <ModulePlaceholder title="Dépenses" newLabel="+ Nouvelle dépense" columns={['Date', 'Compte de dépense', 'Fournisseur', 'Payé par', 'Taxes', 'Montant']} note={SOON} />
export const PurchaseRecurringExpenses = () => <ModulePlaceholder title="Dépenses périodiques" newLabel="+ Nouvelle dépense périodique" columns={['Nom', 'Fournisseur', 'Fréquence', 'Prochaine', 'Statut', 'Montant']} note={SOON} />
export const PurchaseBills = () => <ModulePlaceholder title="Factures fournisseurs" newLabel="+ Nouvelle facture fournisseur" columns={['Date', 'N°', 'Fournisseur', 'Statut', 'Échéance', 'Montant', 'Solde dû']} note={SOON} />
export const PurchaseRecurringBills = () => <ModulePlaceholder title="Factures fournisseurs périodiques" newLabel="+ Nouvelle facture périodique" columns={['Nom', 'Fournisseur', 'Fréquence', 'Dernière', 'Prochaine', 'Statut', 'Montant']} note={SOON} />
export const PurchasePayments = () => <ModulePlaceholder title="Paiements effectués" newLabel="+ Nouveau paiement" columns={['Date', 'Fournisseur', 'Mode', 'Référence', 'Factures payées', 'Montant']} note={SOON} />
export const PurchaseCredits = () => <ModulePlaceholder title="Avoirs fournisseur" newLabel="+ Nouvel avoir" columns={['Date', 'N°', 'Fournisseur', 'Statut', 'Montant', 'Solde']} note={SOON} />
export const PurchaseOrdersPage = () => <PurchaseOrders />
