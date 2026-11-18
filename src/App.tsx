import { Lock } from 'lucide-react';
import { VaultUnlockModal } from './components/VaultUnlockModal';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthPages } from './pages/AuthPages';
import { Dashboard } from './pages/Dashboard';

function AppContent() {
  const { user, initializing } = useAuth();

  if (initializing) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3 text-slate-600">
        <div className="h-10 w-10 rounded-xl bg-teal-700 text-white flex items-center justify-center">
          <Lock className="h-5 w-5" />
        </div>
        <p className="text-xs font-medium">Restoring encrypted session...</p>
      </div>
    );
  }

  if (!user) {
    return <AuthPages />;
  }

  return (
    <>
      <Dashboard />
      <VaultUnlockModal />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
