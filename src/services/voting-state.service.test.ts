import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../database/prisma.js';
import { VotingStatus } from '../generated/prisma/enums.js';
import {
  VOTING_STATE_SINGLETON_ID,
  openViewing,
  startVoting,
  stopVoting,
  nextPhase,
  previousPhase,
  InvalidVotingTransitionError,
} from './voting-state.service.js';

// Оперирует реальной singleton-строкой VotingState (нет тестовой БД, см. DECISIONS.md D4).
// Тесты в этом файле должны выполняться последовательно и не пересекаться по времени
// с другими файлами, трогающими VotingState — обеспечено vitest.config.ts (fileParallelism: false).
async function setStatus(status: VotingStatus): Promise<void> {
  await prisma.votingState.upsert({
    where: { id: VOTING_STATE_SINGLETON_ID },
    create: { id: VOTING_STATE_SINGLETON_ID, status },
    update: { status, votingStartedAt: null, votingFinishedAt: null },
  });
}

describe('voting-state.service — переходы состояний', () => {
  afterAll(async () => {
    await setStatus(VotingStatus.DRAFT);
  });

  it('DRAFT -> VIEWING разрешён', async () => {
    await setStatus(VotingStatus.DRAFT);
    const result = await openViewing();
    expect(result.status).toBe(VotingStatus.VIEWING);
  });

  it('VIEWING -> VOTING разрешён и пишет votingStartedAt', async () => {
    await setStatus(VotingStatus.VIEWING);
    const result = await startVoting();
    expect(result.status).toBe(VotingStatus.VOTING);
    expect(result.votingStartedAt).not.toBeNull();
  });

  it('VOTING -> FINISHED разрешён и пишет votingFinishedAt', async () => {
    await setStatus(VotingStatus.VOTING);
    const result = await stopVoting();
    expect(result.status).toBe(VotingStatus.FINISHED);
    expect(result.votingFinishedAt).not.toBeNull();
  });

  it('FINISHED -> VOTING (повторный старт) отклоняется', async () => {
    await setStatus(VotingStatus.FINISHED);
    await expect(startVoting()).rejects.toThrow(InvalidVotingTransitionError);
  });

  it('FINISHED -> VIEWING отклоняется', async () => {
    await setStatus(VotingStatus.FINISHED);
    await expect(openViewing()).rejects.toThrow(InvalidVotingTransitionError);
  });

  it('повторный startVoting из VOTING (двойной старт) отклоняется', async () => {
    await setStatus(VotingStatus.VOTING);
    await expect(startVoting()).rejects.toThrow(InvalidVotingTransitionError);
  });

  it('пропуск состояния DRAFT -> VOTING отклоняется', async () => {
    await setStatus(VotingStatus.DRAFT);
    await expect(startVoting()).rejects.toThrow(InvalidVotingTransitionError);
  });

  it('previousPhase: FINISHED -> VOTING обнуляет votingFinishedAt, сохраняет votingStartedAt', async () => {
    await setStatus(VotingStatus.VIEWING);
    await startVoting();
    const finished = await stopVoting();
    expect(finished.votingStartedAt).not.toBeNull();

    const result = await previousPhase();
    expect(result.status).toBe(VotingStatus.VOTING);
    expect(result.votingFinishedAt).toBeNull();
    expect(result.votingStartedAt).not.toBeNull();
  });

  it('previousPhase: VOTING -> VIEWING обнуляет votingStartedAt', async () => {
    await setStatus(VotingStatus.VIEWING);
    await startVoting();
    const result = await previousPhase();
    expect(result.status).toBe(VotingStatus.VIEWING);
    expect(result.votingStartedAt).toBeNull();
  });

  it('previousPhase: VIEWING -> DRAFT разрешён', async () => {
    await setStatus(VotingStatus.VIEWING);
    const result = await previousPhase();
    expect(result.status).toBe(VotingStatus.DRAFT);
  });

  it('previousPhase: DRAFT — раньше некуда, отклоняется с from === to', async () => {
    await setStatus(VotingStatus.DRAFT);
    await expect(previousPhase()).rejects.toMatchObject({ from: VotingStatus.DRAFT, to: VotingStatus.DRAFT });
  });

  it('nextPhase: DRAFT -> VIEWING -> VOTING -> FINISHED последовательно', async () => {
    await setStatus(VotingStatus.DRAFT);
    expect((await nextPhase()).status).toBe(VotingStatus.VIEWING);
    expect((await nextPhase()).status).toBe(VotingStatus.VOTING);
    expect((await nextPhase()).status).toBe(VotingStatus.FINISHED);
  });

  it('nextPhase: FINISHED — дальше некуда, отклоняется с from === to', async () => {
    await setStatus(VotingStatus.FINISHED);
    await expect(nextPhase()).rejects.toMatchObject({ from: VotingStatus.FINISHED, to: VotingStatus.FINISHED });
  });
});
