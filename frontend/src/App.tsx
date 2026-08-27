import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import BeneficiariosPage from './pages/BeneficiariosPage';
import ProgramacionesPage from './pages/ProgramacionesPage';
import EntregasPage from './pages/EntregasPage';
import CisternasPage from './pages/CisternasPage';
import PersonalPage from './pages/PersonalPage';
import MetasPage from './pages/MetasPage';

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
      <Route path="/programaciones" element={<ProtectedRoute><ProgramacionesPage /></ProtectedRoute>} />
      <Route path="/entregas" element={<ProtectedRoute><EntregasPage /></ProtectedRoute>} />
      <Route path="/cisternas" element={<ProtectedRoute><CisternasPage /></ProtectedRoute>} />
      <Route path="/personal" element={<ProtectedRoute><PersonalPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
