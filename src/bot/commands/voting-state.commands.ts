import type { MyContext } from '../context.js';
import {
  openViewing,
  startVoting,
  stopVoting,
  nextPhase,
  previousPhase,
  InvalidVotingTransitionError,
} from '../../services/voting-state.service.js';
import { VotingStatus } from '../../generated/prisma/enums.js';

const PHASE_LABELS: Record<VotingStatus, string> = {
  DRAFT: 'Черновик',
  VIEWING: 'Просмотр',
  VOTING: 'Голосование',
  FINISHED: 'Завершено',
};

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

/**
 * Общие /next_phase и /prev_phase (D38) — двигают VotingState по цепочке
 * DRAFT -> VIEWING -> VOTING -> FINISHED в любую сторону, без выбора конкретной
 * команды под конкретный переход. Именованные open_viewing/start_voting/stop_voting
 * остаются как есть — не заменяются, а дополняются.
 */
export async function handleNextPhase(ctx: MyContext): Promise<void> {
  try {
    const state = await nextPhase();
    await ctx.reply(`Фаза: ${PHASE_LABELS[state.status]}.`);
  } catch (err) {
    if (err instanceof InvalidVotingTransitionError && err.from === err.to) {
      await ctx.reply(`Дальше двигаться некуда — уже «${PHASE_LABELS[err.from]}».`);
      return;
    }
    if (!(await replyOnInvalidTransition(ctx, err))) throw err;
  }
}

export async function handlePreviousPhase(ctx: MyContext): Promise<void> {
  try {
    const state = await previousPhase();
    await ctx.reply(`Фаза: ${PHASE_LABELS[state.status]}.`);
  } catch (err) {
    if (err instanceof InvalidVotingTransitionError && err.from === err.to) {
      await ctx.reply(`Раньше двигаться некуда — уже «${PHASE_LABELS[err.from]}».`);
      return;
    }
    if (!(await replyOnInvalidTransition(ctx, err))) throw err;
  }
}
