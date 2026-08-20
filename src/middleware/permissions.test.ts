import { describe, expect, it, vi } from 'vitest';
import type { MyContext } from '../bot/context.js';
import { requireRole } from './permissions.js';
import { UserRole } from '../generated/prisma/enums.js';

function makeCtx(role?: UserRole): MyContext {
  return {
    dbUser: role ? { role } : undefined,
    reply: vi.fn(),
  } as unknown as MyContext;
}

describe('requireRole (RBAC)', () => {
  it('ADMIN passes an ADMIN-only check', async () => {
    const ctx = makeCtx(UserRole.ADMIN);
    const next = vi.fn();
    await requireRole(UserRole.ADMIN)(ctx, next);
    expect(next).toHaveBeenCalledOnce();
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('USER is blocked from an ADMIN-only check', async () => {
    const ctx = makeCtx(UserRole.USER);
    const next = vi.fn();
    await requireRole(UserRole.ADMIN)(ctx, next);
    expect(next).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledOnce();
  });

  it('missing dbUser is blocked from an ADMIN-only check', async () => {
    const ctx = makeCtx(undefined);
    const next = vi.fn();
    await requireRole(UserRole.ADMIN)(ctx, next);
    expect(next).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledOnce();
  });

  it('USER passes a USER-level check', async () => {
    const ctx = makeCtx(UserRole.USER);
    const next = vi.fn();
    await requireRole(UserRole.USER)(ctx, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('ADMIN also passes a USER-level check (higher rank)', async () => {
    const ctx = makeCtx(UserRole.ADMIN);
    const next = vi.fn();
    await requireRole(UserRole.USER)(ctx, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
