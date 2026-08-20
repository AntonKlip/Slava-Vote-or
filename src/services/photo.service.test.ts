import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../database/prisma.js';
import { PhotoStatus, UserRole } from '../generated/prisma/enums.js';
import type { Nomination, User } from '../generated/prisma/client.js';
import { createPhoto, getById, listActive, softDelete } from './photo.service.js';

// Оперирует реальной Neon-БД (нет тестовой БД, см. DECISIONS.md D4/D30) —
// все созданные фото отслеживаются и удаляются в afterAll.
describe('photo.service (integration)', () => {
  const createdPhotoIds: string[] = [];

  afterAll(async () => {
    await prisma.photo.deleteMany({ where: { id: { in: createdPhotoIds } } });
  });

  async function makePhoto(name: string) {
    const marker = `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const photo = await createPhoto({
      telegramFileId: `file-${marker}`,
      telegramFileUniqueId: `unique-${marker}`,
      name,
    });
    createdPhotoIds.push(photo.id);
    return photo;
  }

  it('createPhoto создаёт фото со статусом ACTIVE', async () => {
    const photo = await makePhoto('Иван');
    expect(photo.status).toBe(PhotoStatus.ACTIVE);
    expect(photo.name).toBe('Иван');
  });

  it('listActive не возвращает status: DELETED', async () => {
    const active = await makePhoto('Активный участник');
    const toDelete = await makePhoto('Удалённый участник');
    await softDelete(toDelete.id);

    const result = await listActive({ take: 1000 });
    const ids = result.items.map((p) => p.id);
    expect(ids).toContain(active.id);
    expect(ids).not.toContain(toDelete.id);
  });

  it('listActive отсортирован детерминированно (createdAt ASC, id ASC)', async () => {
    const first = await makePhoto('Порядок 1');
    const second = await makePhoto('Порядок 2');

    const result = await listActive({ take: 1000 });
    const firstIndex = result.items.findIndex((p) => p.id === first.id);
    const secondIndex = result.items.findIndex((p) => p.id === second.id);

    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(secondIndex).toBeGreaterThan(firstIndex);
  });

  it('пагинация: skip/take и total корректны', async () => {
    const baseline = await listActive({ take: 1 });
    const baseTotal = baseline.total;

    const p1 = await makePhoto('Страница 1');
    const p2 = await makePhoto('Страница 2');
    const p3 = await makePhoto('Страница 3');

    const after = await listActive({ take: 1000 });
    expect(after.total).toBe(baseTotal + 3);

    const page = await listActive({ skip: baseTotal, take: 3 });
    expect(page.items.map((p) => p.id)).toEqual([p1.id, p2.id, p3.id]);
  });

  it('getById возвращает фото по id и null для несуществующего', async () => {
    const photo = await makePhoto('Проверка getById');
    expect((await getById(photo.id))?.id).toBe(photo.id);
    expect(await getById('does-not-exist')).toBeNull();
  });

  it('softDelete переводит фото в статус DELETED', async () => {
    const photo = await makePhoto('Для удаления');
    const deleted = await softDelete(photo.id);
    expect(deleted.status).toBe(PhotoStatus.DELETED);
  });
});

describe('photo.service — softDelete не трогает связанные Vote', () => {
  let user: User;
  let nomination: Nomination;
  let photoId: string;
  let voteId: string;

  beforeAll(async () => {
    user = await prisma.user.create({ data: { telegramId: -9201n, role: UserRole.USER } });
    nomination = await prisma.nomination.create({ data: { name: 'Тестовая номинация (photo.service)' } });
    const photo = await createPhoto({
      telegramFileId: 'file-vote-test',
      telegramFileUniqueId: 'unique-vote-test',
      name: 'Фото с голосом',
    });
    photoId = photo.id;
    const vote = await prisma.vote.create({
      data: { userId: user.id, photoId: photo.id, nominationId: nomination.id },
    });
    voteId = vote.id;
  });

  afterAll(async () => {
    await prisma.vote.deleteMany({ where: { id: voteId } });
    await prisma.photo.deleteMany({ where: { id: photoId } });
    await prisma.nomination.deleteMany({ where: { id: nomination.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  });

  it('после softDelete связанный Vote остаётся в БД', async () => {
    await softDelete(photoId);
    const vote = await prisma.vote.findUnique({ where: { id: voteId } });
    expect(vote).not.toBeNull();
  });
});
