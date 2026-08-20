import { prisma } from '../database/prisma.js';
import { VotingStatus } from '../generated/prisma/enums.js';
import { Prisma, type VotingState } from '../generated/prisma/client.js';

export const VOTING_STATE_SINGLETON_ID = 'singleton';
const SINGLETON_ID = VOTING_STATE_SINGLETON_ID;

export class InvalidVotingTransitionError extends Error {
  constructor(
    public readonly from: VotingStatus,
    public readonly to: VotingStatus,
  ) {
    super(`Недопустимый переход: ${from} -> ${to}`);
    this.name = 'InvalidVotingTransitionError';
  }
}

export const ALLOWED_TRANSITIONS: Record<VotingStatus, VotingStatus | null> = {
  [VotingStatus.DRAFT]: VotingStatus.VIEWING,
  [VotingStatus.VIEWING]: VotingStatus.VOTING,
  [VotingStatus.VOTING]: VotingStatus.FINISHED,
  [VotingStatus.FINISHED]: null,
};

export async function getOrCreateVotingState(): Promise<VotingState> {
  return prisma.votingState.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID },
    update: {},
  });
}

async function transitionTo(target: VotingStatus): Promise<VotingState> {
  const current = await getOrCreateVotingState();

  if (ALLOWED_TRANSITIONS[current.status] !== target) {
    throw new InvalidVotingTransitionError(current.status, target);
  }

  // Таймстемп пишется через NOW() внутри того же UPDATE, а не new Date() в JS до вызова:
  // при конкурентной блокировке строки (см. castVote в voting.service.ts, "FOR UPDATE")
  // этот запрос может провести время в очереди на лок — JS-таймстемп, вычисленный заранее,
  // оказался бы менее точным, чем момент фактического выполнения UPDATE в Postgres.
  const timestampColumn =
    target === VotingStatus.VOTING ? 'votingStartedAt' : target === VotingStatus.FINISHED ? 'votingFinishedAt' : null;
  const timestampSet = timestampColumn ? Prisma.sql`, "${Prisma.raw(timestampColumn)}" = NOW()` : Prisma.empty;

  const count = await prisma.$executeRaw`
    UPDATE "VotingState"
    SET status = ${target}::"VotingStatus"${timestampSet}
    WHERE id = ${SINGLETON_ID} AND status = ${current.status}::"VotingStatus"
  `;

  if (count === 0) {
    const actual = await getOrCreateVotingState();
    throw new InvalidVotingTransitionError(actual.status, target);
  }

  return getOrCreateVotingState();
}

export const openViewing = (): Promise<VotingState> => transitionTo(VotingStatus.VIEWING);
export const startVoting = (): Promise<VotingState> => transitionTo(VotingStatus.VOTING);
export const stopVoting = (): Promise<VotingState> => transitionTo(VotingStatus.FINISHED);
