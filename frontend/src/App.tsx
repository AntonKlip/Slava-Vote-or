import { useState } from 'react';
import { AuthProvider } from './auth/AuthProvider';
import { useAuth } from './auth/useAuth';
import { PhotosScreen } from './photos/PhotosScreen';
import { ResultsScreen } from './results/ResultsScreen';
import './App.css';

type Tab = 'photos' | 'results';

function AuthGate() {
  const { status, user, error, retry } = useAuth();
  const [tab, setTab] = useState<Tab>('photos');

  if (status === 'loading') {
    return <p>Авторизация…</p>;
  }

  if (status === 'error') {
    return (
      <div>
        <p role="alert">Ошибка авторизации: {error}</p>
        <button type="button" onClick={retry}>
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="role-hint">
        Роль: <code>{user?.role}</code>
      </p>

      <nav className="tabs">
        <button type="button" className={tab === 'photos' ? 'active' : ''} onClick={() => setTab('photos')}>
          Фото
        </button>
        <button type="button" className={tab === 'results' ? 'active' : ''} onClick={() => setTab('results')}>
          Результаты
        </button>
      </nav>

      {tab === 'photos' ? <PhotosScreen /> : <ResultsScreen />}
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

export default App;
