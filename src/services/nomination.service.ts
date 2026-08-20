import { prisma } from '../database/prisma.js';
import type { Nomination } from '../generated/prisma/client.js';

export interface CreateNominationInput {
  name: string;
  description?: string;
}

/**
 * sortOrder = MAX(sortOrder) + 1 среди всех номинаций (не только активных),
 * 0 если номинаций ещё нет. Не через COUNT(active) — после деактивации счётчик
 * активных уменьшился бы и мог выдать уже занятое значение sortOrder;
 * MAX+1 монотонно растёт и не переиспользует значения (см. DECISIONS.md D31).
 */
export async function createNomination(input: CreateNominationInput): Promise<Nomination> {
  const last = await prisma.nomination.findFirst({ orderBy: { sortOrder: 'desc' } });
  const sortOrder = last ? last.sortOrder + 1 : 0;

  return prisma.nomination.create({
    data: { name: input.name, description: input.description, sortOrder },
  });
}

export async function listActive(): Promise<Nomination[]> {
  return prisma.nomination.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function deactivate(id: string): Promise<Nomination> {
  return prisma.nomination.update({ where: { id }, data: { active: false } });
}
