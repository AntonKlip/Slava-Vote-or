import { useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { useAuthorizedImage } from '../api/useAuthorizedImage';
import type { ApiError } from '../api/client';
import type { Nomination, PhotoListItem } from '../api/types';

type VoteState = 'idle' | 'loading' | 'voted' | 'alreadyVoted' | 'forbidden' | 'invalid' | 'error';

interface VoteResponse {
  alreadyVoted: boolean;
}

const VOTE_LABEL: Record<VoteState, string> = {
  idle: '',
  loading: '…',
  voted: ' ✓',
  alreadyVoted: ' (уже проголосовали)',
  forbidden: ' — недоступно сейчас',
  invalid: ' — невалидный выбор',
  error: ' — ошибка, попробуйте ещё раз',
};

export function PhotoCard({ photo, nominations }: { photo: PhotoListItem; nominations: Nomination[] }) {
  const { api } = useAuth();
  const imageUrl = useAuthorizedImage(photo.imageUrl);
  const [voteState, setVoteState] = useState<Record<number, VoteState>>({});

  function vote(nominationId: number) {
    setVoteState((s) => ({ ...s, [nominationId]: 'loading' }));
    api
      .requestJson<VoteResponse>('/api/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId: photo.id, nominationId }),
      })
      .then((res) => {
        // alreadyVoted — идемпотентный успех (D25), не ошибка: та же ветка UI, что и voted, другая подпись.
        setVoteState((s) => ({ ...s, [nominationId]: res.alreadyVoted ? 'alreadyVoted' : 'voted' }));
      })
      .catch((err: unknown) => {
        const apiErr = err as ApiError;
        const next: VoteState = apiErr.status === 403 ? 'forbidden' : apiErr.status === 400 ? 'invalid' : 'error';
        setVoteState((s) => ({ ...s, [nominationId]: next }));
      });
  }

  return (
    <div className="photo-card">
      <div className="photo-card-image">
        {imageUrl ? <img src={imageUrl} alt={photo.name} /> : <div className="photo-card-placeholder" />}
      </div>
      <p className="photo-card-name">{photo.name}</p>
      <div className="photo-card-votes">
        {nominations.map((nomination) => {
          const state = voteState[nomination.id] ?? 'idle';
          const locked = state === 'loading' || state === 'voted' || state === 'alreadyVoted';
          return (
            <button key={nomination.id} type="button" disabled={locked} onClick={() => vote(nomination.id)}>
              {nomination.name}
              {VOTE_LABEL[state]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
