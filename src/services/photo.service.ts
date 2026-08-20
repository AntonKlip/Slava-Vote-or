import { prisma } from '../database/prisma.js';
import { PhotoStatus } from '../generated/prisma/enums.js';
import type { Photo } from '../generated/prisma/client.js';

export interface CreatePhotoInput {
  telegramFileId: string;
  telegramFileUniqueId: string;
  name: string;
}

export async function createPhoto(input: CreatePhotoInput): Promise<Photo> {
  return prisma.photo.create({ data: input });
}

const DEFAULT_PAGE_SIZE = 20;

export interface ListActivePhotosParams {
  skip?: number;
  take?: number;
}

export interface ListActivePhotosResult {
  items: Photo[];
  total: number;
}

/**
 * Порядок фиксирован (createdAt ASC, id ASC — id как tie-breaker при
 * одинаковом createdAt) и должен переиспользоваться будущим Phase 7 API
 * без переопределения, см. ARCHITECTURE.md.
 */
export async function listActive(params: ListActivePhotosParams = {}): Promise<ListActivePhotosResult> {
  const { skip = 0, take = DEFAULT_PAGE_SIZE } = params;
  const where = { status: PhotoStatus.ACTIVE };

  const [items, total] = await Promise.all([
    prisma.photo.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip,
      take,
    }),
    prisma.photo.count({ where }),
  ]);

  return { items, total };
}

export async function getById(id: string): Promise<Photo | null> {
  return prisma.photo.findUnique({ where: { id } });
}

export async function softDelete(id: string): Promise<Photo> {
  return prisma.photo.update({ where: { id }, data: { status: PhotoStatus.DELETED } });
}
