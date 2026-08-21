import { useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { useAuthorizedImage } from '../api/useAuthorizedImage';
import type { ApiError } from '../api/client';
import type { ForbiddenBody, ResultItem, ResultPhoto, ResultsResponse, VotingStatus } from '../api/types';

function forbiddenMessage(votingStatus: VotingStatus | undefined): string {
  if (votingStatus && votingStatus !== 'FINISHED') {
    return 'Результаты будут доступны после завершения голосования.';
  }
  return 'Результаты сейчас недоступны.';
}

function ResultPhotoThumb({ photo }: { photo: ResultPhoto }) {
  const imageUrl = useAuthorizedImage(photo.imageUrl);
  return (
    <div className="result-photo">
      <div className="photo-card-image">
        {imageUrl ? <img src={imageUrl} alt={photo.name} /> : <div className="photo-card-placeholder" />}
      </div>
      <p className="photo-card-name">{photo.name}</p>
    </div>
  );
}

export function ResultsScreen() {
  const { api } = useAuth();
  const [items, setItems] = useState<ResultItem[] | null>(null);
  const [forbidden, setForbidden] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- fetch-on-mount, стандартный паттерн этого экрана (см. PhotosScreen)
    setLoading(true);
    setForbidden(null);
    setError(null);

    api
      .requestJson<ResultsResponse>('/api/results')
      .then((res) => setItems(res.items))
      .catch((err: unknown) => {
        const apiErr = err as ApiError;
        if (apiErr.status === 403) {
          const body = apiErr.body as ForbiddenBody | null;
          setForbidden(forbiddenMessage(body?.votingStatus));
          return;
        }
        setError(err instanceof Error ? err.message : 'Не удалось загрузить результаты.');
      })
      .finally(() => setLoading(false));
  }, [api]);

  if (loading && !items) {
    return <p>Загрузка результатов…</p>;
  }

  if (forbidden) {
    return <p>{forbidden}</p>;
  }

  if (error) {
    return <p role="alert">{error}</p>;
  }

  if (!items) {
    return null;
  }

  if (items.length === 0) {
    return <p>Номинаций пока нет.</p>;
  }

  return (
    <div className="results-list">
      {items.map((item) => (
        <div key={item.nomination.id} className="result-nomination">
          <h3>{item.nomination.name}</h3>
          {item.top.length === 0 ? (
            <p>Голосов пока нет.</p>
          ) : (
            <div className="result-photos">
              {item.top.map((photo) => (
                <ResultPhotoThumb key={photo.id} photo={photo} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
