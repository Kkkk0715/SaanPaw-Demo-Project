import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useApp } from '@saanpaw/shared';
import { useAuth } from '@/auth';

/**
 * Sidebar and page header. Admin work means jumping between sections, so
 * navigation stays on screen instead of behind a back button.
 */

const NAV = [
  { to: '/', label: 'Dashboard', icon: '▦', end: true },
  { to: '/shelters', label: 'Shelter Approvals', icon: '⛨', badge: 'shelters' as const, end: true },
  { to: '/shelters/manage', label: 'Manage Shelters', icon: '🏠' },
  { to: '/reports', label: 'Report Monitoring', icon: '⚑', badge: 'flags' as const },
  { to: '/system', label: 'System Management', icon: '⚙' },
];

const PAGE_META: Record<string, { title: string; sub: string }> = {
  '/': {
    title: 'Dashboard',
    sub: 'Daily statistics for lost and found reports across San Jose Del Monte',
  },
  '/shelters': {
    title: 'Shelter Approval Management',
    sub: 'Verify permits with the local government before granting system access',
  },
  '/shelters/manage': {
    title: 'Manage Shelters',
    sub: 'View full registration detail, revoke access, or delete any shelter account',
  },
  '/reports': {
    title: 'Report Monitoring',
    sub: 'Review AI-flagged reports, remove false entries, and ban repeat offenders',
  },
  '/system': {
    title: 'System Management',
    sub: 'Configuration, database monitoring, maintenance, and deployment controls',
  },
};

export function Shell({ children }: { children: ReactNode }) {
  const { shelters, flags } = useApp();
  const { signOut } = useAuth();
  const { pathname } = useLocation();

  const counts = {
    shelters: shelters.filter((s) => s.approvalStatus === 'pending').length,
    flags: flags.filter((f) => f.resolution === 'pending').length,
  };

  const meta = PAGE_META[pathname] ?? { title: 'Developer Console', sub: '' };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-mark" aria-hidden>
            🐾
          </div>
          <div>
            <div className="sidebar-title">SaanPaw</div>
            <div className="sidebar-sub">Developer Console</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-heading">Administration</div>
          {NAV.map((item) => {
            const count = item.badge ? counts[item.badge] : 0;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`.trim()}
              >
                <span aria-hidden>{item.icon}</span>
                {item.label}
                {count ? <span className="count">{count}</span> : null}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-avatar" aria-hidden>
            SD
          </div>
          <div className="sidebar-user">
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>System Developer</div>
            <div className="sidebar-sub">dev@saanpaw.ph</div>
          </div>
          <button className="sidebar-signout" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div>
            <h1>{meta.title}</h1>
            {meta.sub ? <p>{meta.sub}</p> : null}
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
