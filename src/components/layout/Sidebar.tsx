import type { CSSProperties } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../lib/auth/AuthContext';
import type { ProfileRole } from '../../lib/auth/AuthContext';

interface NavItem {
  to: string;
  label: string;
  roles?: ProfileRole[];
  children?: NavItem[];
}

const NAV: NavItem[] = [
  { to: '/', label: 'Resumen' },
  {
    to: '/operaciones',
    label: 'Operaciones',
    children: [
      { to: '/operaciones/transferencias', label: 'Transferencias' },
      { to: '/operaciones/cripto', label: 'Cripto' },
      { to: '/operaciones/efectivo', label: 'Efectivo' },
    ],
  },
  { to: '/clientes', label: 'Clientes' },
  { to: '/tipos-de-cambio', label: 'Tipos de Cambio' },
  { to: '/proveedores', label: 'Proveedores', roles: ['super_admin', 'admin'] },
  { to: '/comisiones', label: 'Comisiones', roles: ['super_admin', 'admin'] },
  { to: '/conciliacion', label: 'Conciliación' },
  { to: '/reportes', label: 'Reportes' },
  { to: '/auditoria', label: 'Auditoría', roles: ['super_admin', 'admin', 'auditor'] },
  { to: '/usuarios', label: 'Usuarios', roles: ['super_admin'] },
];

export function Sidebar() {
  const { profile, signOut } = useAuth();

  const visible = NAV.filter((item) => !item.roles || (profile && item.roles.includes(profile.role)));

  return (
    <aside
      style={{
        width: 240,
        flexShrink: 0,
        background: 'var(--navy-900)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
      }}
    >
      <div style={{ padding: '22px 20px 18px' }}>
        <div style={{ fontSize: 12, letterSpacing: '0.16em', color: 'var(--electric-bright)', fontWeight: 700 }}>EA DIVISAS</div>
        <div style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 2 }}>Operations</div>
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', padding: '4px 12px' }}>
        {visible.map((item) => (
          <div key={item.to} style={{ marginBottom: item.children ? 4 : 2 }}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              style={({ isActive }) => navStyle(isActive, false)}
            >
              {item.label}
            </NavLink>
            {item.children && (
              <div style={{ marginLeft: 10, borderLeft: '1px solid var(--border)', paddingLeft: 4 }}>
                {item.children.map((child) => (
                  <NavLink key={child.to} to={child.to} style={({ isActive }) => navStyle(isActive, true)}>
                    {child.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div style={{ padding: 16, borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{profile?.full_name}</div>
        <div style={{ marginBottom: 10 }}>
          <span className="role-badge">{roleLabel(profile?.role)}</span>
        </div>
        <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', fontSize: 12.5 }} onClick={() => signOut()}>
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}

function navStyle(isActive: boolean, isChild: boolean): CSSProperties {
  return {
    display: 'block',
    padding: isChild ? '7px 12px' : '9px 12px',
    marginBottom: 1,
    borderRadius: 8,
    fontSize: isChild ? 13 : 13.5,
    fontWeight: isActive ? 600 : 500,
    color: isActive ? '#fff' : 'var(--text-dim)',
    background: isActive ? 'var(--electric-dim)' : 'transparent',
  };
}

function roleLabel(role?: ProfileRole) {
  switch (role) {
    case 'super_admin':
      return 'Super Admin';
    case 'admin':
      return 'Admin';
    case 'operador':
      return 'Operador';
    case 'auditor':
      return 'Auditor';
    default:
      return '';
  }
}
