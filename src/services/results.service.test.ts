import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../database/prisma.js';
import { PhotoStatus, UserRole, VotingStatus } from '../generated/prisma/enums.js';
import type { Nomination, Photo, User } from '../generated/prisma/client.js';
import { canViewResults, computeResults } from './results.service.js';

describe('canViewResults — матрица (чистая функция, без БД)', () => {
  const user = (role: UserRole) => ({ role });
  const state = (status: VotingStatus) => ({ status });

  it('ADMIN — доступ в любой фазе', () => {
    for (const status of [VotingStatus.DRAFT, VotingStatus.VIEWING, VotingStatus.VOTING, VotingStatus.FINISHED]) {
      expect(canViewResults(user(UserRole.ADMIN), state(status))).toBe(true);
    }
  });

  it('USER — только после FINISHED', () => {
    expect(canViewResults(user(UserRole.USER), state(VotingStatus.DRAFT))).toBe(false);
    expect(canViewResults(user(UserRole.USER), state(VotingStatus.VIEWING))).toBe(false);
    expect(canViewResults(user(UserRole.USER), state(VotingStatus.VOTING))).toBe(false);
    expect(canViewResults(user(UserRole.USER), state(VotingStatus.FINISHED))).toBe(true);
  });
});

describe('computeResults (integration)', () => {
  const voterIds: string[] = [];
  const photoIds: number[] = [];
  const nominationIds: number[] = [];

  async function makeVoter(telegramId: bigint): Promise<User> {
    const u = await prisma.user.create({ data: { telegramId, role: UserRole.USER } });
    voterIds.push(u.id);
    return u;
  }

  async function makePhoto(name: string, status: PhotoStatus = PhotoStatus.ACTIVE): Promise<Photo> {
    const marker = `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const p = await prisma.photo.create({
      data: { telegramFileId: `file-${marker}`, telegramFileUniqueId: `unique-${marker}`, name, status },
    });
    photoIds.push(p.id);
    return p;
  }

  async function makeNomination(name: string, active = true): Promise<Nomination> {
    const n = await prisma.nomination.create({ data: { name, active } });
    nominationIds.push(n.id);
    return n;
  }

  afterAll(async () => {
    await prisma.vote.deleteMany({ where: { userId: { in: voterIds } } });
    await prisma.nomination.deleteMany({ where: { id: { in: nominationIds } } });
    await prisma.photo.deleteMany({ where: { id: { in: photoIds } } });
    await prisma.user.deleteMany({ where: { id: { in: voterIds } } });
  });

  it('tie-break: при равном числе голосов побеждает photo.id ASC', async () => {
    const nomination = await makeNomination('Результаты — ничья');
    const photoLow = await makePhoto('Фото A');
    const photoHigh = await makePhoto('Фото B');
    const voter = await makeVoter(-9301n);

    // photoHigh.id заведомо больше photoLow.id (создано позже, autoincrement) —
    // при равном количестве голосов (по одному) должен выиграть tie-break photoLow.id ASC.
    await prisma.vote.create({ data: { userId: voter.id, photoId: photoLow.id, nominationId: nomination.id } });

    const voter2 = await makeVoter(-9302n);
    await prisma.vote.create({ data: { userId: voter2.id, photoId: photoHigh.id, nominationId: nomination.id } });

    const results = await computeResults();
    const entry = results.find((r) => r.nomination.id === nomination.id);
    expect(entry).toBeDefined();
    expect(entry!.top.map((t) => t.photo.id)).toEqual([photoLow.id, photoHigh.id]);
    expect(entry!.top.every((t) => t.voteCount === 1)).toBe(true);
  });

  it('берёт только top-2 по количеству голосов', async () => {
    const nomination = await makeNomination('Результаты — top2');
    const photoA = await makePhoto('A');
    const photoB = await makePhoto('B');
    const photoC = await makePhoto('C');

    const voter1 = await makeVoter(-9303n);
    const voter2 = await makeVoter(-9304n);
    const voter3 = await makeVoter(-9305n);

    await prisma.vote.create({ data: { userId: voter1.id, photoId: photoA.id, nominationId: nomination.id } });
    await prisma.vote.create({ data: { userId: voter2.id, photoId: photoA.id, nominationId: nomination.id } });
    await prisma.vote.create({ data: { userId: voter3.id, photoId: photoB.id, nominationId: nomination.id } });
    await prisma.vote.create({ data: { userId: voter1.id, photoId: photoC.id, nominationId: nomination.id } });

    const results = await computeResults();
    const entry = results.find((r) => r.nomination.id === nomination.id);
    expect(entry!.top).toHaveLength(2);
    expect(entry!.top[0].photo.id).toBe(photoA.id);
    expect(entry!.top[0].voteCount).toBe(2);
  });

  it('номинация без голосов возвращает пустой top без ошибки', async () => {
    const nomination = await makeNomination('Результаты — без голосов');
    const results = await computeResults();
    const entry = results.find((r) => r.nomination.id === nomination.id);
    expect(entry).toBeDefined();
    expect(entry!.top).toEqual([]);
  });

  it('деактивированная номинация исключена из результатов', async () => {
    const nomination = await makeNomination('Результаты — деактивирована', false);
    const results = await computeResults();
    expect(results.find((r) => r.nomination.id === nomination.id)).toBeUndefined();
  });

  it('удалённое (DELETED) фото не участвует в результатах, даже если за него голосовали', async () => {
    const nomination = await makeNomination('Результаты — удалённое фото');
    const activePhoto = await makePhoto('Активное фото');
    const deletedPhoto = await makePhoto('Удалённое фото', PhotoStatus.DELETED);
    const voter = await makeVoter(-9306n);

    await prisma.vote.create({ data: { userId: voter.id, photoId: deletedPhoto.id, nominationId: nomination.id } });

    const results = await computeResults();
    const entry = results.find((r) => r.nomination.id === nomination.id);
    expect(entry!.top.map((t) => t.photo.id)).not.toContain(deletedPhoto.id);
    expect(entry!.top.map((t) => t.photo.id)).not.toContain(activePhoto.id);
    expect(entry!.top).toEqual([]);
  });
});
