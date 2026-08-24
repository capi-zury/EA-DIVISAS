import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute } from './lib/auth/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { CryptoModulePage } from './pages/operations/CryptoModulePage';
import { TransfersModulePage } from './pages/operations/TransfersModulePage';
import { CashModulePage } from './pages/operations/CashModulePage';
import { ClientsPage } from './pages/ClientsPage';
import { ExchangeRatesPage } from './pages/ExchangeRatesPage';
import { ProvidersPage } from './pages/ProvidersPage';
import { CommissionsPage } from './pages/CommissionsPage';
import { ReconciliationPage } from './pages/ReconciliationPage';
import { ReportsPage } from './pages/ReportsPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { UsersPage } from './pages/UsersPage';

function Protected({ children, roles }: { children: ReactNode; roles?: ('super_admin' | 'admin' | 'operador' | 'auditor')[] }) {
  return (
    <ProtectedRoute roles={roles}>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Protected><DashboardPage /></Protected>} />
      <Route path="/operaciones/transferencias" element={<Protected><TransfersModulePage /></Protected>} />
      <Route path="/operaciones/cripto" element={<Protected><CryptoModulePage /></Protected>} />
      <Route path="/operaciones/efectivo" element={<Protected><CashModulePage /></Protected>} />
      <Route path="/clientes" element={<Protected><ClientsPage /></Protected>} />
      <Route path="/tipos-de-cambio" element={<Protected><ExchangeRatesPage /></Protected>} />
      <Route path="/proveedores" element={<Protected roles={['super_admin', 'admin']}><ProvidersPage /></Protected>} />
      <Route path="/comisiones" element={<Protected roles={['super_admin', 'admin']}><CommissionsPage /></Protected>} />
      <Route path="/conciliacion" element={<Protected><ReconciliationPage /></Protected>} />
      <Route path="/reportes" element={<Protected><ReportsPage /></Protected>} />
      <Route path="/auditoria" element={<Protected roles={['super_admin', 'admin', 'auditor']}><AuditLogPage /></Protected>} />
      <Route path="/usuarios" element={<Protected roles={['super_admin']}><UsersPage /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
