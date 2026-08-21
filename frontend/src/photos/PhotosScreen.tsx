import { useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { PhotoCard } from './PhotoCard';
import type { ApiError } from '../api/client';
import type {
  ForbiddenBody,
  MyVotesResponse,
  Nomination,
  NominationsResponse,
  PhotosResponse,
  VotingStatus,
} from '../api/types';
import { VOTING_STATUS_LABELS } from '../api/types';

const PAGE_SIZE = 12;

function forbiddenMessage(votingStatus: VotingStatus | undefined): string {
  if (votingStatus === 'DRAFT') return 'Голосование ещё не открыто.';
  if (votingStatus === 'FINISHED') return 'Голосование завершено — доступны только результаты.';
  return 'Просмотр фото сейчас недоступен.';
}

export function PhotosScreen({ votingStatus }: { votingStatus: VotingStatus | null }) {
  const { api } = useAuth();

  const [skip, setSkip] = useState(0);
  const [photos, setPhotos] = useState<PhotosResponse | null>(null);
  const [nominations, setNominations] = useState<Nomination[]>([]);
  const [votesByPhoto, setVotesByPhoto] = useState<Map<number, Set<number>>>(new Map());
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
      api.requestJson<MyVotesResponse>('/api/votes/mine'),
    ])
      .then(([photosRes, nominationsRes, myVotesRes]) => {
        setPhotos(photosRes);
        setNominations(nominationsRes.items);
        const byPhoto = new Map<number, Set<number>>();
        for (const v of myVotesRes.items) {
          const set = byPhoto.get(v.photoId) ?? new Set<number>();
          set.add(v.nominationId);
          byPhoto.set(v.photoId, set);
        }
        setVotesByPhoto(byPhoto);
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
      {votingStatus && <p className="phase-hint">Фаза голосования: {VOTING_STATUS_LABELS[votingStatus]}</p>}

      {nominations.length > 0 && (
        <p className="nominations-hint">Номинации: {nominations.map((n) => n.name).join(', ')}</p>
      )}

      <div className="photo-grid">
        {photos.items.map((photo) => (
          <PhotoCard
            key={photo.id}
            photo={photo}
            nominations={nominations}
            votedNominationIds={votesByPhoto.get(photo.id)}
          />
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
