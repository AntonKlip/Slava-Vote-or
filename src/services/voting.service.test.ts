import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../database/prisma.js';
import { PhotoStatus, UserRole, VotingStatus } from '../generated/prisma/enums.js';
import type { Nomination, Photo, User } from '../generated/prisma/client.js';
import { VOTING_STATE_SINGLETON_ID, stopVoting } from './voting-state.service.js';
import { canVote, castVote, InvalidVoteTargetError, VotingNotAllowedError } from './voting.service.js';

describe('canVote — матрица прав (чистая функция, без БД)', () => {
  const user = (role: UserRole) => ({ role });
  const state = (status: VotingStatus) => ({ status });

  it('DRAFT: недоступно никому, включая ADMIN', () => {
    expect(canVote(user(UserRole.USER), state(VotingStatus.DRAFT), false)).toBe(false);
    expect(canVote(user(UserRole.USER), state(VotingStatus.DRAFT), true)).toBe(false);
    expect(canVote(user(UserRole.ADMIN), state(VotingStatus.DRAFT), false)).toBe(false);
  });

  it('VIEWING: только с VotingPermission или ADMIN', () => {
    expect(canVote(user(UserRole.USER), state(VotingStatus.VIEWING), false)).toBe(false);
    expect(canVote(user(UserRole.USER), state(VotingStatus.VIEWING), true)).toBe(true);
    expect(canVote(user(UserRole.ADMIN), state(VotingStatus.VIEWING), false)).toBe(true);
  });

  it('VOTING: доступно всем, включая ADMIN', () => {
    expect(canVote(user(UserRole.USER), state(VotingStatus.VOTING), false)).toBe(true);
    expect(canVote(user(UserRole.USER), state(VotingStatus.VOTING), true)).toBe(true);
    expect(canVote(user(UserRole.ADMIN), state(VotingStatus.VOTING), false)).toBe(true);
  });

  it('FINISHED: недоступно никому, включая ADMIN', () => {
    expect(canVote(user(UserRole.USER), state(VotingStatus.FINISHED), false)).toBe(false);
    expect(canVote(user(UserRole.USER), state(VotingStatus.FINISHED), true)).toBe(false);
    expect(canVote(user(UserRole.ADMIN), state(VotingStatus.FINISHED), false)).toBe(false);
  });
});

describe('castVote (integration)', () => {
  let plainUser: User;
  let photo: Photo;
  let nomination: Nomination;

  async function setStatus(status: VotingStatus): Promise<void> {
    await prisma.votingState.upsert({
      where: { id: VOTING_STATE_SINGLETON_ID },
      create: { id: VOTING_STATE_SINGLETON_ID, status },
      update: { status, votingStartedAt: null, votingFinishedAt: null },
    });
  }

  beforeAll(async () => {
    plainUser = await prisma.user.create({ data: { telegramId: -9201n, role: UserRole.USER } });
    photo = await prisma.photo.create({
      data: { telegramFileId: 'test-file', telegramFileUniqueId: 'test-file-unique', name: 'Тестовый участник' },
    });
    nomination = await prisma.nomination.create({ data: { name: 'Тестовая номинация' } });
  });

  afterAll(async () => {
    await prisma.vote.deleteMany({ where: { userId: plainUser.id } });
    await prisma.nomination.delete({ where: { id: nomination.id } });
    await prisma.photo.delete({ where: { id: photo.id } });
    await prisma.user.delete({ where: { id: plainUser.id } });
    await setStatus(VotingStatus.DRAFT);
  });

  afterEach(async () => {
    await prisma.vote.deleteMany({ where: { userId: plainUser.id, photoId: photo.id, nominationId: nomination.id } });
  });

  it('записывает голос, когда canVote разрешает (VOTING)', async () => {
    await setStatus(VotingStatus.VOTING);
    const result = await castVote(plainUser, photo.id, nomination.id);
    expect(result.alreadyVoted).toBe(false);
    expect(result.vote.userId).toBe(plainUser.id);
  });

  it('повторный идентичный голос идемпотентен — без второй записи', async () => {
    await setStatus(VotingStatus.VOTING);
    await castVote(plainUser, photo.id, nomination.id);
    const second = await castVote(plainUser, photo.id, nomination.id);
    expect(second.alreadyVoted).toBe(true);

    const count = await prisma.vote.count({
      where: { userId: plainUser.id, photoId: photo.id, nominationId: nomination.id },
    });
    expect(count).toBe(1);
  });

  it('отклоняет голос в DRAFT', async () => {
    await setStatus(VotingStatus.DRAFT);
    await expect(castVote(plainUser, photo.id, nomination.id)).rejects.toThrow(VotingNotAllowedError);
  });

  it('отклоняет голос в VIEWING без VotingPermission', async () => {
    await setStatus(VotingStatus.VIEWING);
    await expect(castVote(plainUser, photo.id, nomination.id)).rejects.toThrow(VotingNotAllowedError);
  });

  it('отклоняет голос после FINISHED', async () => {
    await setStatus(VotingStatus.FINISHED);
    await expect(castVote(plainUser, photo.id, nomination.id)).rejects.toThrow(VotingNotAllowedError);
  });

  it('отклоняет голос за неактивное (DELETED) фото', async () => {
    await setStatus(VotingStatus.VOTING);
    const deletedPhoto = await prisma.photo.create({
      data: {
        telegramFileId: 'deleted-file',
        telegramFileUniqueId: 'deleted-file-unique',
        name: 'Удалённое фото',
        status: PhotoStatus.DELETED,
      },
    });
    await expect(castVote(plainUser, deletedPhoto.id, nomination.id)).rejects.toThrow(InvalidVoteTargetError);
    await prisma.photo.delete({ where: { id: deletedPhoto.id } });
  });

  it('отклоняет голос за неактивную номинацию', async () => {
    await setStatus(VotingStatus.VOTING);
    const inactiveNomination = await prisma.nomination.create({
      data: { name: 'Неактивная номинация', active: false },
    });
    await expect(castVote(plainUser, photo.id, inactiveNomination.id)).rejects.toThrow(InvalidVoteTargetError);
    await prisma.nomination.delete({ where: { id: inactiveNomination.id } });
  });

  it('уникальность голоса гарантирована на уровне БД (UNIQUE(userId, photoId, nominationId))', async () => {
    await setStatus(VotingStatus.VOTING);
    await prisma.vote.create({ data: { userId: plainUser.id, photoId: photo.id, nominationId: nomination.id } });
    await expect(
      prisma.vote.create({ data: { userId: plainUser.id, photoId: photo.id, nominationId: nomination.id } }),
    ).rejects.toThrow();
  });

  it(
    'гонка "голос vs остановка голосования" никогда не даёт двойной/повреждённый результат',
    async () => {
      // Атомарность обеспечивается блокировкой строки VotingState
      // (`SELECT ... FOR UPDATE` в castVote) — какая бы транзакция ни выиграла гонку,
      // вторая видит уже актуальное состояние.
      for (let i = 0; i < 10; i++) {
        const racePhoto = await prisma.photo.create({
          data: { telegramFileId: `race-${i}`, telegramFileUniqueId: `race-unique-${i}`, name: 'Race photo' },
        });
        try {
          await setStatus(VotingStatus.VOTING);

          const [voteOutcome] = await Promise.allSettled([
            castVote(plainUser, racePhoto.id, nomination.id),
            stopVoting(),
          ]);

          if (voteOutcome.status === 'rejected') {
            expect(voteOutcome.reason).toBeInstanceOf(VotingNotAllowedError);
          }

          const voteCount = await prisma.vote.count({
            where: { userId: plainUser.id, photoId: racePhoto.id, nominationId: nomination.id },
          });
          expect(voteCount).toBeLessThanOrEqual(1);
          expect(voteCount).toBe(voteOutcome.status === 'fulfilled' ? 1 : 0);
        } finally {
          // finally — чтобы упавший assert в середине цикла не оставлял мусор в реальной Neon-БД
          await prisma.vote.deleteMany({ where: { photoId: racePhoto.id } });
          await prisma.photo.delete({ where: { id: racePhoto.id } });
        }
      }
    },
    30000,
  );
});
