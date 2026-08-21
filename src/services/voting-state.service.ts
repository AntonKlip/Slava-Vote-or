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

/**
 * Зеркало ALLOWED_TRANSITIONS для отката на шаг назад (D38) — возможность вернуть
 * ошибочно продвинутую фазу без ручного вмешательства в БД.
 */
export const PREVIOUS_TRANSITIONS: Record<VotingStatus, VotingStatus | null> = {
  [VotingStatus.DRAFT]: null,
  [VotingStatus.VIEWING]: VotingStatus.DRAFT,
  [VotingStatus.VOTING]: VotingStatus.VIEWING,
  [VotingStatus.FINISHED]: VotingStatus.VOTING,
};

export async function getOrCreateVotingState(): Promise<VotingState> {
  return prisma.votingState.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID },
    update: {},
  });
}

/**
 * votingStartedAt/votingFinishedAt держат инвариант "непусто ⇔ фаза дошла до VOTING/FINISHED
 * хотя бы раз за текущий проход". Идя вперёд, штамп проставляется при входе в фазу; идя
 * назад (D38), штамп фазы, которую только что покинули, обнуляется — иначе после отката
 * FINISHED -> VOTING висел бы votingFinishedAt как будто голосование всё ещё завершено.
 * NOW()/NULL пишутся внутри того же UPDATE, а не в JS до вызова: при конкурентной блокировке
 * строки (см. castVote в voting.service.ts, "FOR UPDATE") запрос может ждать снятия лока,
 * и JS-таймстемп, вычисленный заранее, оказался бы менее точным, чем момент UPDATE в Postgres.
 */
function timestampSql(from: VotingStatus, to: VotingStatus): Prisma.Sql {
  if (to === VotingStatus.VOTING && from === VotingStatus.VIEWING) return Prisma.sql`, "votingStartedAt" = NOW()`;
  if (to === VotingStatus.FINISHED) return Prisma.sql`, "votingFinishedAt" = NOW()`;
  if (from === VotingStatus.FINISHED) return Prisma.sql`, "votingFinishedAt" = NULL`;
  if (from === VotingStatus.VOTING) return Prisma.sql`, "votingStartedAt" = NULL`;
  return Prisma.empty;
}

async function transitionTo(target: VotingStatus, allowed: Record<VotingStatus, VotingStatus | null>): Promise<VotingState> {
  const current = await getOrCreateVotingState();

  if (allowed[current.status] !== target) {
    throw new InvalidVotingTransitionError(current.status, target);
  }

  const timestampSet = timestampSql(current.status, target);

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

export const openViewing = (): Promise<VotingState> => transitionTo(VotingStatus.VIEWING, ALLOWED_TRANSITIONS);
export const startVoting = (): Promise<VotingState> => transitionTo(VotingStatus.VOTING, ALLOWED_TRANSITIONS);
export const stopVoting = (): Promise<VotingState> => transitionTo(VotingStatus.FINISHED, ALLOWED_TRANSITIONS);

/**
 * Шаг вперёд/назад по цепочке DRAFT -> VIEWING -> VOTING -> FINISHED без явной целевой
 * фазы — для команд /next_phase и /prev_phase (D38). Бросает
 * InvalidVotingTransitionError(from, from) (одинаковые from/to — сигнал "шага в этом
 * направлении не существует"), если уже в крайней фазе цепочки в эту сторону.
 */
export async function nextPhase(): Promise<VotingState> {
  const current = await getOrCreateVotingState();
  const target = ALLOWED_TRANSITIONS[current.status];
  if (!target) {
    throw new InvalidVotingTransitionError(current.status, current.status);
  }
  return transitionTo(target, ALLOWED_TRANSITIONS);
}

export async function previousPhase(): Promise<VotingState> {
  const current = await getOrCreateVotingState();
  const target = PREVIOUS_TRANSITIONS[current.status];
  if (!target) {
    throw new InvalidVotingTransitionError(current.status, current.status);
  }
  return transitionTo(target, PREVIOUS_TRANSITIONS);
}
