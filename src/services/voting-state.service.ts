import { prisma } from '../database/prisma.js';
import { VotingStatus } from '../generated/prisma/enums.js';
import type { VotingState } from '../generated/prisma/client.js';

const SINGLETON_ID = 'singleton';

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

  const data: { status: VotingStatus; votingStartedAt?: Date; votingFinishedAt?: Date } = {
    status: target,
  };
  if (target === VotingStatus.VOTING) data.votingStartedAt = new Date();
  if (target === VotingStatus.FINISHED) data.votingFinishedAt = new Date();

  const { count } = await prisma.votingState.updateMany({
    where: { id: SINGLETON_ID, status: current.status },
    data,
  });

  if (count === 0) {
    const actual = await getOrCreateVotingState();
    throw new InvalidVotingTransitionError(actual.status, target);
  }

  return getOrCreateVotingState();
}

export const openViewing = (): Promise<VotingState> => transitionTo(VotingStatus.VIEWING);
export const startVoting = (): Promise<VotingState> => transitionTo(VotingStatus.VOTING);
export const stopVoting = (): Promise<VotingState> => transitionTo(VotingStatus.FINISHED);
