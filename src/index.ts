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
import { handleGrantAccess, handleRevokeAccess } from './bot/commands/voting-permission.commands.js';

const bot = new Bot<MyContext>(config.botToken);

bot.use(attachDbUser);

bot.command('start', handleStart);
bot.command('open_viewing', requireRole(UserRole.ADMIN), handleOpenViewing);
bot.command('start_voting', requireRole(UserRole.ADMIN), handleStartVoting);
bot.command('stop_voting', requireRole(UserRole.ADMIN), handleStopVoting);
bot.command('grant_access', requireRole(UserRole.ADMIN), handleGrantAccess);
bot.command('revoke_access', requireRole(UserRole.ADMIN), handleRevokeAccess);

bot.catch((err) => {
  console.error('Bot error:', err);
});

bot.start();
