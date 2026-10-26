import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { CasesListPage } from './pages/CasesListPage';
import { CaseDetailPage } from './pages/CaseDetailPage';
import { ContactsPage } from './pages/ContactsPage';
import { SearchPage } from './pages/SearchPage';
import { GraphPage } from './pages/GraphPage';
import { MapPage } from './pages/MapPage';
import { CalendarPage } from './pages/CalendarPage';
import { PortfolioPage } from './pages/PortfolioPage';
import { EditorialProjectDetailPage } from './pages/EditorialProjectDetailPage';
import { SecuritySettingsPage } from './pages/SecuritySettingsPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppShell } from './components/AppShell';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route
        path="/cases"
        element={
          <ProtectedRoute>
            <CasesListPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/cases/:caseId"
        element={
          <ProtectedRoute>
            <CaseDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/contacts"
        element={
          <ProtectedRoute>
            <ContactsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/search"
        element={
          <ProtectedRoute>
            <AppShell activeRail="search"><SearchPage /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/graph"
        element={
          <ProtectedRoute>
            <AppShell activeNav="graph"><GraphPage /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/map"
        element={
          <ProtectedRoute>
            <AppShell activeRail="map"><MapPage /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/calendar"
        element={
          <ProtectedRoute>
            <AppShell activeRail="calendar"><CalendarPage /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/portfolio"
        element={
          <ProtectedRoute>
            <AppShell activeNav="portfolio"><PortfolioPage /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/editorial-projects/:projectId"
        element={
          <ProtectedRoute>
            <AppShell activeNav="portfolio"><EditorialProjectDetailPage /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/security"
        element={
          <ProtectedRoute>
            <AppShell activeRail="security"><SecuritySettingsPage /></AppShell>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/cases" replace />} />
    </Routes>
  );
}
