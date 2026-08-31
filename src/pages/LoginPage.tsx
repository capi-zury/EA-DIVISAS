import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth/AuthContext';

export function LoginPage() {
  const { user, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) setError('Correo o contraseña incorrectos.');
  }

  return (
    <div style={{ height: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="card" style={{ width: 380, maxWidth: '100%' }}>
        <div style={{ marginBottom: 22, textAlign: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', marginBottom: 12 }}>
            <img src="/ea-divisas-logo.jpg" alt="EA Divisas" style={{ width: '100%', maxWidth: 240, objectFit: 'contain', display: 'block', margin: '0 auto' }} />
          </div>
          <h1 style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-dim)', letterSpacing: '0.04em' }}>Sistema de Operaciones</h1>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Correo</label>
            <input id="email" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          {error && (
            <div className="field" style={{ color: 'var(--red)', fontSize: 13 }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} disabled={submitting}>
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
