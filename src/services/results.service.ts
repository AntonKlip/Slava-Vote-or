import { prisma } from '../database/prisma.js';
import { PhotoStatus, UserRole, VotingStatus } from '../generated/prisma/enums.js';
import type { Nomination, Photo, User, VotingState } from '../generated/prisma/client.js';
import { listActive as listActiveNominations } from './nomination.service.js';

export interface ResultEntry {
  photo: Photo;
  voteCount: number;
}

export interface NominationResult {
  nomination: Nomination;
  top: ResultEntry[];
}

const TOP_N = 2;

/**
 * ADMIN — доступ в любой фазе; USER — только после FINISHED (PRODUCT_SPEC.md "Результаты").
 * Отдельная матрица от canVote/canViewPhotos — не совпадает ни с одной из них.
 */
export function canViewResults(user: Pick<User, 'role'>, votingState: Pick<VotingState, 'status'>): boolean {
  if (user.role === UserRole.ADMIN) return true;
  return votingState.status === VotingStatus.FINISHED;
}

/**
 * TOP-2 по каждой активной номинации, tie-break — photo.id ASC (PRODUCT_SPEC.md).
 * Удалённые (DELETED) фото не участвуют в подсчёте — их голоса остаются в БД (D12),
 * но не отображаются в результатах, как и в списках (PRODUCT_SPEC.md "Добавление фотографии").
 */
export async function computeResults(): Promise<NominationResult[]> {
  const nominations = await listActiveNominations();
  if (nominations.length === 0) return [];

  const grouped = await prisma.vote.groupBy({
    by: ['nominationId', 'photoId'],
    where: { nominationId: { in: nominations.map((n) => n.id) } },
    _count: { _all: true },
  });

  const photoIds = [...new Set(grouped.map((g) => g.photoId))];
  const photos =
    photoIds.length > 0
      ? await prisma.photo.findMany({ where: { id: { in: photoIds }, status: PhotoStatus.ACTIVE } })
      : [];
  const photoById = new Map(photos.map((p) => [p.id, p]));

  return nominations.map((nomination) => {
    const top = grouped
      .filter((g) => g.nominationId === nomination.id)
      .map((g) => ({ photo: photoById.get(g.photoId), voteCount: g._count._all }))
      .filter((entry): entry is ResultEntry => entry.photo !== undefined)
      .sort((a, b) => b.voteCount - a.voteCount || a.photo.id - b.photo.id)
      .slice(0, TOP_N);

    return { nomination, top };
  });
}
