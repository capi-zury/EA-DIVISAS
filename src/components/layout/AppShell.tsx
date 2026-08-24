import { useState, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar open={mobileOpen} onNavigate={() => setMobileOpen(false)} />
      {mobileOpen && <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="mobile-topbar">
          <button
            aria-label="Abrir menú"
            onClick={() => setMobileOpen(true)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text)', padding: 6, cursor: 'pointer' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div style={{ fontSize: 12, letterSpacing: '0.16em', color: 'var(--electric-bright)', fontWeight: 700 }}>EA DIVISAS</div>
          <div style={{ width: 34 }} />
        </div>

        <main className="app-main" style={{ flex: 1, padding: '28px 32px', maxWidth: 1400, margin: '0 auto', width: '100%' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
