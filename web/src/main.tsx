import { StrictMode, useMemo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppStoreProvider, useApp, type ApiSession } from '@saanpaw/shared';
import { AuthProvider, useAuth } from '@/auth';
import { API_BASE_URL } from '@/lib/api';
import { Shell } from '@/components/Shell';
import { Banner, Button, Card } from '@/components/ui';
import { LoginPage } from '@/pages/Login';
import { DashboardPage } from '@/pages/Dashboard';
import { ShelterApprovalsPage } from '@/pages/ShelterApprovals';
import { ManageSheltersPage } from '@/pages/ManageShelters';
import { ReportMonitoringPage } from '@/pages/ReportMonitoring';
import { SystemManagementPage } from '@/pages/SystemManagement';
import { applyTokens } from '@/tokens';
import './styles.css';

applyTokens();

/** Feeds the developer token to the data store; signed out, the store keeps its seed data. */
function StoreProvider({ children }: { children: ReactNode }) {
  const { token, signOut } = useAuth();
  const session = useMemo<ApiSession | undefined>(
    () => (token ? { baseUrl: API_BASE_URL, token, role: 'developer', onUnauthorized: signOut } : undefined),
    [token, signOut],
  );
  return <AppStoreProvider session={session}>{children}</AppStoreProvider>;
}

function Console() {
  const { signedIn, signOut } = useAuth();
  const { sync } = useApp();
  if (!signedIn) return <LoginPage />;

  if (sync.status === 'loading') {
    return <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)' }}>Loading console data...</div>;
  }

  if (sync.status === 'error') {
    return (
      <div style={{ maxWidth: 480, margin: '96px auto', padding: 16 }}>
        <Card>
          <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Could not load console data</div>
            <div style={{ color: 'var(--muted)' }}>{sync.error}</div>
            <div className="row">
              <Button onClick={() => void sync.refresh()}>Try again</Button>
              <Button variant="ghost" onClick={signOut}>
                Sign out
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <Shell>
      {sync.error ? (
        <div onClick={sync.clearError} style={{ cursor: 'pointer' }} title="Click to dismiss">
          <Banner tone="danger" title="That change did not go through">
            {sync.error}
          </Banner>
        </div>
      ) : null}
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/shelters" element={<ShelterApprovalsPage />} />
        <Route path="/shelters/manage" element={<ManageSheltersPage />} />
        <Route path="/reports" element={<ReportMonitoringPage />} />
        <Route path="/system" element={<SystemManagementPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <StoreProvider>
        {/* GitHub Pages is static hosting with no server-side rewrite, so a
            refresh on e.g. /reports would 404 with BrowserRouter. HashRouter
            keeps every route after a "#", which the server never sees. */}
        <HashRouter>
          <Console />
        </HashRouter>
      </StoreProvider>
    </AuthProvider>
  </StrictMode>,
);
