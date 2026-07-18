import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Layout from './components/Layout'
import Companies from './pages/Companies'
import CompanyDetail from './pages/CompanyDetail'
import Contacts from './pages/Contacts'
import ContactDetail from './pages/ContactDetail'
import Catalogue from './pages/Catalogue'
import CatalogueDetail from './pages/CatalogueDetail'
import Invoices from './pages/Invoices'
import InvoiceDetail from './pages/InvoiceDetail'
import Tickets from './pages/Tickets'
import TicketDetail from './pages/TicketDetail'
import PurchaseOrders from './pages/PurchaseOrders'
import PurchaseOrderDetail from './pages/PurchaseOrderDetail'
import Admin from './pages/Admin'
import Portal from './pages/Portal'
import Shop from './pages/Shop'
import { EcomOrderList, EcomOrderDetail } from './pages/EcomOrders'
import Settings from './pages/Settings'
import Employees from './pages/Employees'
import Tasks from './pages/Tasks'
import { clearToken } from './services/api'
import './App.css'

function InternalApp() {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user') || sessionStorage.getItem('user')
    return stored ? JSON.parse(stored) : null
  })

  function handleLogin(data) {
    setUser({ id: data.user_id, full_name: data.full_name, role: data.role })
  }

  function handleLogout() {
    clearToken()
    setUser(null)
  }

  if (!user) return <Login onLogin={handleLogin} />

  return (
    <Layout user={user} onLogout={handleLogout}>
      <Routes>
        <Route path="/" element={<Navigate to="/companies" replace />} />
        <Route path="/companies" element={<Companies />} />
        <Route path="/companies/new" element={<CompanyDetail isNew />} />
        <Route path="/companies/:id" element={<CompanyDetail />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/contacts/new" element={<ContactDetail isNew />} />
        <Route path="/contacts/:id" element={<ContactDetail />} />
        <Route path="/catalogue" element={<Catalogue />} />
        <Route path="/catalogue/:id" element={<CatalogueDetail />} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/invoices/:id" element={<InvoiceDetail />} />
        <Route path="/tickets" element={<Tickets />} />
        <Route path="/tickets/:id" element={<TicketDetail />} />
        <Route path="/purchase-orders" element={<PurchaseOrders />} />
        <Route path="/purchase-orders/:id" element={<PurchaseOrderDetail />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/ecom-orders" element={<EcomOrderList />} />
        <Route path="/ecom-orders/:id" element={<EcomOrderDetail />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/agenda" element={<Tasks defaultView="month" />} />
      </Routes>
    </Layout>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/portal/*" element={<Portal />} />
        <Route path="/shop/*" element={<Shop />} />
        <Route path="/*" element={<InternalApp />} />
      </Routes>
    </BrowserRouter>
  )
}
