import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DialogProvider } from './context/DialogContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import BeneficiariosPage from './pages/BeneficiariosPage';
import ProgramacionesPage from './pages/ProgramacionesPage';
import EntregasPage from './pages/EntregasPage';
import CisternasPage from './pages/CisternasPage';
import PersonalPage from './pages/PersonalPage';
import MetasPage from './pages/MetasPage';
import CalidadPage from './pages/CalidadPage';
import ValesPage from './pages/ValesPage';
import InformesOficialesPage from './pages/InformesOficialesPage';
import BalanceHidricoPage from './pages/BalanceHidricoPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/metas" element={<ProtectedRoute><MetasPage /></ProtectedRoute>} />
      <Route path="/beneficiarios" element={<ProtectedRoute><BeneficiariosPage /></ProtectedRoute>} />
      <Route path="/vales" element={<ProtectedRoute><ValesPage /></ProtectedRoute>} />
      <Route path="/calidad" element={<ProtectedRoute><CalidadPage /></ProtectedRoute>} />
      <Route path="/programaciones" element={<ProtectedRoute><ProgramacionesPage /></ProtectedRoute>} />
      <Route path="/entregas" element={<ProtectedRoute><EntregasPage /></ProtectedRoute>} />
      <Route path="/informes" element={<ProtectedRoute><InformesOficialesPage /></ProtectedRoute>} />
      <Route path="/balance" element={<ProtectedRoute><BalanceHidricoPage /></ProtectedRoute>} />
      <Route path="/cisternas" element={<ProtectedRoute><CisternasPage /></ProtectedRoute>} />
      <Route path="/personal" element={<ProtectedRoute><PersonalPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <DialogProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </DialogProvider>
  );
}
