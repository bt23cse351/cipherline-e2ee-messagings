import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthPages } from './pages/AuthPages';
import { Dashboard } from './pages/Dashboard';

function AppShell() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <p className="text-base font-display font-semibold text-slate-900">CipherLine</p>
          <p className="text-xs text-slate-500">Verifying encrypted session...</p>
        </div>
      </div>
    );
  }

  return user ? <Dashboard /> : <AuthPages />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
