import { prisma } from '../database/prisma.js';
import type { VotingPermission } from '../generated/prisma/client.js';

export async function grantPermission(userId: string, grantedBy: string): Promise<VotingPermission> {
  return prisma.votingPermission.upsert({
    where: { userId },
    create: { userId, grantedBy },
    update: { grantedBy },
  });
}

export async function revokePermission(userId: string): Promise<void> {
  await prisma.votingPermission.deleteMany({ where: { userId } });
}

export async function hasVotingPermission(userId: string): Promise<boolean> {
  const permission = await prisma.votingPermission.findUnique({ where: { userId } });
  return permission !== null;
}
