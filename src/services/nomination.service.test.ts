import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../database/prisma.js';
import { createNomination, deactivate, listActive } from './nomination.service.js';

// Оперирует реальной Neon-БД (нет тестовой БД, см. DECISIONS.md D4/D30) —
// все созданные номинации отслеживаются и удаляются в afterAll.
describe('nomination.service (integration)', () => {
  const createdIds: string[] = [];

  afterAll(async () => {
    await prisma.nomination.deleteMany({ where: { id: { in: createdIds } } });
  });

  async function makeNomination(name: string) {
    const nomination = await createNomination({ name });
    createdIds.push(nomination.id);
    return nomination;
  }

  it('createNomination создаёт активную номинацию', async () => {
    const nomination = await makeNomination('Тест — активная');
    expect(nomination.active).toBe(true);
    expect(nomination.name).toBe('Тест — активная');
  });

  it('listActive отсортирован по sortOrder ASC', async () => {
    const a = await makeNomination('Тест — сортировка A');
    const b = await makeNomination('Тест — сортировка B');

    const result = await listActive();
    const ids = result.map((n) => n.id);
    expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id));
  });

  it('deactivate убирает номинацию из listActive, повторный deactivate не падает', async () => {
    const nomination = await makeNomination('Тест — деактивация');
    await deactivate(nomination.id);

    const result = await listActive();
    expect(result.map((n) => n.id)).not.toContain(nomination.id);

    await expect(deactivate(nomination.id)).resolves.not.toThrow();
  });

  it('sortOrder монотонно растёт и не переиспользуется после деактивации (MAX+1, не COUNT(active))', async () => {
    const first = await makeNomination('Тест — sortOrder 1');
    const second = await makeNomination('Тест — sortOrder 2');
    await deactivate(second.id);
    const third = await makeNomination('Тест — sortOrder 3');

    expect(second.sortOrder).toBeGreaterThan(first.sortOrder);
    expect(third.sortOrder).toBeGreaterThan(second.sortOrder);
  });
});
