import { prisma } from '../database/prisma.js';
import { PhotoStatus, UserRole, VotingStatus } from '../generated/prisma/enums.js';
import type { User, Vote, VotingState } from '../generated/prisma/client.js';
import { VOTING_STATE_SINGLETON_ID } from './voting-state.service.js';
import { hasVotingPermission } from './voting-permission.service.js';

export class VotingNotAllowedError extends Error {
  constructor() {
    super('Голосование сейчас недоступно для этого пользователя.');
    this.name = 'VotingNotAllowedError';
  }
}

export class InvalidVoteTargetError extends Error {
  constructor(public readonly target: 'photo' | 'nomination') {
    super(`Указанное ${target === 'photo' ? 'фото' : 'номинация'} недоступно для голосования.`);
    this.name = 'InvalidVoteTargetError';
  }
}

/**
 * Единственная точка истины для права голоса. Чистая функция — не обращается к БД,
 * чтобы матрицу DRAFT/VIEWING/VOTING/FINISHED x ADMIN/permission можно было
 * протестировать без подключения к базе.
 */
export function canVote(
  user: Pick<User, 'role'>,
  votingState: Pick<VotingState, 'status'>,
  hasPermission: boolean,
): boolean {
  switch (votingState.status) {
    case VotingStatus.VOTING:
      return true;
    case VotingStatus.VIEWING:
      return hasPermission || user.role === UserRole.ADMIN;
    case VotingStatus.DRAFT:
    case VotingStatus.FINISHED:
      return false;
  }
}

export async function canUserVoteNow(user: User): Promise<boolean> {
  const votingState = await prisma.votingState.upsert({
    where: { id: VOTING_STATE_SINGLETON_ID },
    create: { id: VOTING_STATE_SINGLETON_ID },
    update: {},
  });
  const hasPermission = await hasVotingPermission(user.id);
  return canVote(user, votingState, hasPermission);
}

export interface CastVoteResult {
  vote: Vote;
  alreadyVoted: boolean;
}

/**
 * Атомарная запись голоса. Строка VotingState блокируется (`SELECT ... FOR UPDATE`)
 * на время транзакции, поэтому конкурентный переход состояния (например stopVoting)
 * не может "проскочить" между проверкой canVote и записью голоса — UPDATE из
 * voting-state.service ждёт снятия блокировки той же строки.
 */
export async function castVote(user: User, photoId: number, nominationId: number): Promise<CastVoteResult> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ status: VotingStatus }[]>`
      SELECT status FROM "VotingState" WHERE id = ${VOTING_STATE_SINGLETON_ID} FOR UPDATE
    `;
    const status = rows[0]?.status ?? VotingStatus.DRAFT;

    const permission = await tx.votingPermission.findUnique({ where: { userId: user.id } });
    if (!canVote(user, { status }, permission !== null)) {
      throw new VotingNotAllowedError();
    }

    const photo = await tx.photo.findUnique({ where: { id: photoId } });
    if (!photo || photo.status !== PhotoStatus.ACTIVE) {
      throw new InvalidVoteTargetError('photo');
    }

    const nomination = await tx.nomination.findUnique({ where: { id: nominationId } });
    if (!nomination || !nomination.active) {
      throw new InvalidVoteTargetError('nomination');
    }

    const existing = await tx.vote.findUnique({
      where: { userId_photoId_nominationId: { userId: user.id, photoId, nominationId } },
    });
    if (existing) {
      return { vote: existing, alreadyVoted: true as const };
    }

    const vote = await tx.vote.create({ data: { userId: user.id, photoId, nominationId } });
    return { vote, alreadyVoted: false as const };
  });
}
