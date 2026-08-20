import type { MyContext } from '../context.js';
import {
  openViewing,
  startVoting,
  stopVoting,
  InvalidVotingTransitionError,
} from '../../services/voting-state.service.js';

async function replyOnInvalidTransition(ctx: MyContext, err: unknown): Promise<boolean> {
  if (err instanceof InvalidVotingTransitionError) {
    await ctx.reply(`Невозможно выполнить переход из ${err.from} в ${err.to}.`);
    return true;
  }
  return false;
}

export async function handleOpenViewing(ctx: MyContext): Promise<void> {
  try {
    await openViewing();
    await ctx.reply('Просмотр открыт.');
  } catch (err) {
    if (!(await replyOnInvalidTransition(ctx, err))) throw err;
  }
}

export async function handleStartVoting(ctx: MyContext): Promise<void> {
  try {
    await startVoting();
    await ctx.reply('Голосование запущено.');
  } catch (err) {
    if (!(await replyOnInvalidTransition(ctx, err))) throw err;
  }
}

export async function handleStopVoting(ctx: MyContext): Promise<void> {
  try {
    await stopVoting();
    await ctx.reply('Голосование остановлено.');
  } catch (err) {
    if (!(await replyOnInvalidTransition(ctx, err))) throw err;
  }
}
