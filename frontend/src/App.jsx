import { useState, useEffect } from 'react'
import DialogHost from './components/Dialog'
import { createBrowserRouter, createRoutesFromElements, RouterProvider, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Login from './pages/Login'
import Layout from './components/Layout'
import ZekoPanel from './components/ZekoPanel'
import Companies from './pages/Companies'
import CompanyDetail from './pages/CompanyDetail'
import Contacts from './pages/Contacts'
import ContactDetail from './pages/ContactDetail'
import Catalogue from './pages/Catalogue'
import CatalogueDetail from './pages/CatalogueDetail'
import Invoices from './pages/Invoices'
import Recurrence from './pages/Recurrence'
import InvoiceDetail from './pages/InvoiceDetail'
import Devis from './pages/Devis'
import DevisDetail from './pages/DevisDetail'
import Tickets from './pages/Tickets'
import TicketDetail from './pages/TicketDetail'
import PurchaseOrderDetail from './pages/PurchaseOrderDetail'
import Commandes from './pages/Commandes'
import Admin from './pages/Admin'
import Portal from './pages/Portal'
import Shop from './pages/Shop'
import RDV from './pages/RDV'
import Privacy from './pages/Privacy'
import { EcomOrderDetail } from './pages/EcomOrders'
import MyAccount from './pages/MyAccount'
import Employees from './pages/Employees'
import Tasks from './pages/Tasks'
import Mail from './pages/Mail'
import Server from './pages/Server'
import Bank from './pages/Bank'
import BankAccountDetail from './pages/BankAccountDetail'
import Taxes from './pages/Taxes'
import { SalesPayments, SalesDeposits } from './pages/Sales'
import { PurchaseVendors, PurchaseExpenses, PurchaseRecurringExpenses, PurchaseBills, PurchaseBillDetail, PurchaseRecurringBills, PurchasePayments, PurchaseCredits, PurchaseOrdersPage } from './pages/Purchases'
import api, { clearToken } from './services/api'
import { setPrivileges, can } from './utils/privileges'
import './App.css'

// Première page permise (TASK-007.4) : Compagnies, sinon la première section que la personne peut voir
function firstPage() {
  const order = [['clients', '/companies'], ['tickets', '/tickets'], ['ventes', '/invoices'], ['achats', '/purchases/bills'],
    ['banque', '/bank'], ['fiscalite', '/taxes'], ['agenda', '/tasks'], ['courriels', '/mail'], ['catalogue', '/catalogue'],
    ['commandes', '/commandes'], ['employes', '/employees'], ['serveur', '/server'], ['administration', '/admin']]
  return (order.find(([s]) => can(s)) || [null, '/settings'])[1]
}

function InternalApp() {
  const location = useLocation()
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user') || sessionStorage.getItem('user')
    return stored ? JSON.parse(stored) : null
  })

  function handleLogin(data) {
    setUser({ id: data.user_id, full_name: data.full_name, role: data.role })
  }

  // Privilèges (TASK-007.4) : relus à chaque ouverture, le menu suit
  const [privsReady, setPrivsReady] = useState(false)
  useEffect(() => {
    if (!user?.id) return
    setPrivsReady(false)
    api.get('/v1/auth/me').then(r => {
      setPrivileges(r.data.privileges)
      setUser(u => ({ ...u, privileges: r.data.privileges, profile: r.data.profile }))
    }).catch(() => {}).finally(() => setPrivsReady(true))
  }, [user?.id])

  function handleLogout() {
    clearToken()
    setUser(null)
  }

  if (!user) return <Login onLogin={handleLogin} />
  // Fenêtre Zéko à part, sans menu (TASK-006.7) : à placer sur un autre écran
  if (location.pathname === '/zeko') return <ZekoPanel standalone onClose={() => window.close()} />

  if (!privsReady) return null
  return (
    <Layout user={user} onLogout={handleLogout}>
      <Routes>
        <Route path="/" element={<Navigate to={firstPage()} replace />} />
        <Route path="/companies" element={<Companies />} />
        <Route path="/companies/new" element={<CompanyDetail isNew />} />
        <Route path="/companies/:id" element={<CompanyDetail />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/contacts/new" element={<ContactDetail isNew />} />
        <Route path="/contacts/:id" element={<ContactDetail />} />
        <Route path="/catalogue" element={<Catalogue />} />
        <Route path="/catalogue/:id" element={<CatalogueDetail />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/recurrence" element={<Recurrence />} />
        <Route path="/invoices/:id" element={<InvoiceDetail />} />
        <Route path="/devis" element={<Devis />} />
        <Route path="/devis/:id" element={<DevisDetail />} />
        <Route path="/tickets" element={<Tickets />} />
        <Route path="/tickets/:id" element={<TicketDetail />} />
        <Route path="/commandes" element={<Commandes />} />
        <Route path="/purchase-orders" element={<Navigate to="/purchases/orders" replace />} />
        <Route path="/purchase-orders/:id" element={<PurchaseOrderDetail />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/ecom-orders" element={<Navigate to="/commandes?tab=web" replace />} />
        <Route path="/ecom-orders/:id" element={<EcomOrderDetail />} />
        <Route path="/settings" element={<MyAccount />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/mail" element={<Mail />} />
        <Route path="/agenda" element={<Tasks defaultView="month" />} />
        <Route path="/server" element={<Server />} />
        <Route path="/bank" element={<Bank />} />
        <Route path="/bank/:id" element={<BankAccountDetail />} />
        <Route path="/taxes" element={<Taxes />} />
        <Route path="/sales/payments" element={<SalesPayments />} />
        <Route path="/sales/deposits" element={<SalesDeposits />} />
        <Route path="/sales/credits" element={<Invoices creditsOnly />} />
        <Route path="/purchases/vendors" element={<PurchaseVendors />} />
        <Route path="/purchases/expenses" element={<PurchaseExpenses />} />
        <Route path="/purchases/recurring-expenses" element={<PurchaseRecurringExpenses />} />
        <Route path="/purchases/bills" element={<PurchaseBills />} />
        <Route path="/purchases/bills/:id" element={<PurchaseBillDetail />} />
        <Route path="/purchases/recurring-bills" element={<PurchaseRecurringBills />} />
        <Route path="/purchases/payments" element={<PurchasePayments />} />
        <Route path="/purchases/credits" element={<PurchaseCredits />} />
        <Route path="/purchases/orders" element={<PurchaseOrdersPage />} />
      </Routes>
    </Layout>
  )
}

const router = createBrowserRouter(createRoutesFromElements(
  <Route>
    <Route path="/portal/*" element={<Portal />} />
    <Route path="/shop/*" element={<Shop />} />
    <Route path="/rdv" element={<RDV />} />
    <Route path="/confidentialite" element={<Privacy />} />
    <Route path="/*" element={<InternalApp />} />
  </Route>
))

export default function App() {
  return <><RouterProvider router={router} /><DialogHost /></>
}
