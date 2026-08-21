import { useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import type { VotingStateResponse, VotingStatus } from './types';

/**
 * Только для UX-подсказок (заголовок фазы и т.п.) — не источник истины для доступа.
 * Реальный гейт canViewPhotos/canVote/canViewResults проверяется только сервером,
 * фронтенд реагирует на 403 конкретных запросов, а не решает сам по этому статусу.
 */
export function useVotingState(): { status: VotingStatus | null; error: string | null } {
  const { api } = useAuth();
  const [status, setStatus] = useState<VotingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .requestJson<VotingStateResponse>('/api/voting-state')
      .then((r) => setStatus(r.status))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Не удалось получить статус голосования');
      });
  }, [api]);

  return { status, error };
}
