import { Bot } from 'grammy';
import { config } from './config/config.js';
import type { MyContext } from './bot/context.js';
import { attachDbUser, requireRole } from './middleware/permissions.js';
import { UserRole } from './generated/prisma/enums.js';
import { handleStart } from './bot/handlers/start.handler.js';
import {
  handleOpenViewing,
  handleStartVoting,
  handleStopVoting,
} from './bot/commands/voting-state.commands.js';

const bot = new Bot<MyContext>(config.botToken);

bot.use(attachDbUser);

bot.command('start', handleStart);
bot.command('open_viewing', requireRole(UserRole.ADMIN), handleOpenViewing);
bot.command('start_voting', requireRole(UserRole.ADMIN), handleStartVoting);
bot.command('stop_voting', requireRole(UserRole.ADMIN), handleStopVoting);

bot.catch((err) => {
  console.error('Bot error:', err);
});

bot.start();
