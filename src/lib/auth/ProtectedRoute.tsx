import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, type ProfileRole } from './AuthContext';

export function ProtectedRoute({ children, roles }: { children: ReactNode; roles?: ProfileRole[] }) {
  const { user, profile, loading } = useAuth();

  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!profile || !profile.active) return <FullScreenLoader message="Tu cuenta no tiene un perfil activo. Contacta a un administrador." />;
  if (roles && !roles.includes(profile.role)) return <Navigate to="/" replace />;

  return <>{children}</>;
}

function FullScreenLoader({ message }: { message?: string }) {
  return (
    <div style={{ height: '100vh', display: 'grid', placeItems: 'center', color: 'var(--text-dim)' }}>
      {message ?? 'Cargando…'}
    </div>
  );
}
