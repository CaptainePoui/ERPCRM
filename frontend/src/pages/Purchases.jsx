import PurchaseOrders from './PurchaseOrders'

// Menu Achats (TASK-044) -- pages dans pages/purchases/
export { default as PurchaseVendors } from './purchases/Vendors'
export { PurchaseExpenses, PurchaseRecurringExpenses } from './purchases/Expenses'
export { PurchaseBills, PurchaseBillDetail, PurchaseRecurringBills } from './purchases/Bills'
export { PurchasePayments } from './purchases/Payments'
export { PurchaseCredits } from './purchases/Credits'
export const PurchaseOrdersPage = () => <PurchaseOrders />
