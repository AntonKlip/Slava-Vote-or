import { useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { useVotingState } from '../api/useVotingState';
import { PhotoCard } from './PhotoCard';
import type { ApiError } from '../api/client';
import type { ForbiddenBody, Nomination, NominationsResponse, PhotosResponse, VotingStatus } from '../api/types';

const PAGE_SIZE = 12;

function forbiddenMessage(votingStatus: VotingStatus | undefined): string {
  if (votingStatus === 'DRAFT') return 'Голосование ещё не открыто.';
  if (votingStatus === 'FINISHED') return 'Голосование завершено — доступны только результаты.';
  return 'Просмотр фото сейчас недоступен.';
}

export function PhotosScreen() {
  const { api } = useAuth();
  const { status: votingStatus } = useVotingState();

  const [skip, setSkip] = useState(0);
  const [photos, setPhotos] = useState<PhotosResponse | null>(null);
  const [nominations, setNominations] = useState<Nomination[]>([]);
  const [forbidden, setForbidden] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- сброс состояния перед fetch-on-dependency-change (skip меняется по клику пагинации)
    setLoading(true);
    setForbidden(null);
    setError(null);

    Promise.all([
      api.requestJson<PhotosResponse>(`/api/photos?skip=${skip}&take=${PAGE_SIZE}`),
      api.requestJson<NominationsResponse>('/api/nominations'),
    ])
      .then(([photosRes, nominationsRes]) => {
        setPhotos(photosRes);
        setNominations(nominationsRes.items);
      })
      .catch((err: unknown) => {
        const apiErr = err as ApiError;
        if (apiErr.status === 403) {
          const body = apiErr.body as ForbiddenBody | null;
          setForbidden(forbiddenMessage(body?.votingStatus));
          return;
        }
        setError(err instanceof Error ? err.message : 'Не удалось загрузить фото.');
      })
      .finally(() => setLoading(false));
  }, [api, skip]);

  if (loading && !photos) {
    return <p>Загрузка фото…</p>;
  }

  if (forbidden) {
    return <p>{forbidden}</p>;
  }

  if (error) {
    return <p role="alert">{error}</p>;
  }

  if (!photos) {
    return null;
  }

  const hasPrev = skip > 0;
  const hasNext = skip + PAGE_SIZE < photos.total;

  return (
    <div>
      {votingStatus && <p className="phase-hint">Фаза голосования: {votingStatus}</p>}

      {nominations.length > 0 && (
        <p className="nominations-hint">Номинации: {nominations.map((n) => n.name).join(', ')}</p>
      )}

      <div className="photo-grid">
        {photos.items.map((photo) => (
          <PhotoCard key={photo.id} photo={photo} nominations={nominations} />
        ))}
      </div>

      <div className="pagination">
        <button type="button" disabled={!hasPrev} onClick={() => setSkip((s) => Math.max(0, s - PAGE_SIZE))}>
          Назад
        </button>
        <span>
          {skip + 1}–{Math.min(skip + PAGE_SIZE, photos.total)} из {photos.total}
        </span>
        <button type="button" disabled={!hasNext} onClick={() => setSkip((s) => s + PAGE_SIZE)}>
          Вперёд
        </button>
      </div>
    </div>
  );
}
