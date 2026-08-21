import { useState } from 'react';
import { AuthProvider } from './auth/AuthProvider';
import { useAuth } from './auth/useAuth';
import { useVotingState } from './api/useVotingState';
import { PhotosScreen } from './photos/PhotosScreen';
import { ResultsScreen } from './results/ResultsScreen';
import './App.css';

type Tab = 'photos' | 'results';

function AuthGate() {
  const { status: authStatus, user, error, retry } = useAuth();
  const { status: votingStatus } = useVotingState();
  const [tab, setTab] = useState<Tab>('photos');

  if (authStatus === 'loading') {
    return <p>Авторизация…</p>;
  }

  if (authStatus === 'error') {
    return (
      <div>
        <p role="alert">Ошибка авторизации: {error}</p>
        <button type="button" onClick={retry}>
          Повторить
        </button>
      </div>
    );
  }

  // Вкладки видны только там, где соответствующий экран реально доступен (совпадает
  // с canViewPhotos/canViewResults на бэкенде): ADMIN видит обе всегда, USER — "Фото"
  // только в VIEWING/VOTING, "Результаты" только в FINISHED. Если доступна лишь одна
  // вкладка — переключатель скрывается и активной автоматически становится она
  // (в т.ч. "Результаты" вместо "Фото" сразу после завершения голосования).
  const isAdmin = user?.role === 'ADMIN';
  const canSeePhotos = isAdmin || votingStatus === 'VIEWING' || votingStatus === 'VOTING';
  const canSeeResults = isAdmin || votingStatus === 'FINISHED';
  const visibleTabs: Tab[] = [...(canSeePhotos ? (['photos'] as const) : []), ...(canSeeResults ? (['results'] as const) : [])];
  const activeTab: Tab = visibleTabs.includes(tab) ? tab : (visibleTabs[0] ?? 'photos');

  return (
    <div>
      <p className="role-hint">
        Роль: <code>{user?.role}</code>
      </p>

      {visibleTabs.length > 1 && (
        <nav className="tabs">
          <button type="button" className={activeTab === 'photos' ? 'active' : ''} onClick={() => setTab('photos')}>
            Фото
          </button>
          <button type="button" className={activeTab === 'results' ? 'active' : ''} onClick={() => setTab('results')}>
            Результаты
          </button>
        </nav>
      )}

      {activeTab === 'photos' ? <PhotosScreen votingStatus={votingStatus} /> : <ResultsScreen />}
    </div>
  );
}

function RefreshButton() {
  return (
    <button
      type="button"
      className="refresh-button"
      aria-label="Обновить"
      onClick={() => window.location.reload()}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </svg>
    </button>
  );
}

function App() {
  return (
    <AuthProvider>
      <RefreshButton />
      <AuthGate />
    </AuthProvider>
  );
}

export default App;
