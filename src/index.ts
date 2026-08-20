import { Bot } from 'grammy';
import { config } from './config/config.js';
import type { MyContext } from './bot/context.js';
import { attachDbUser } from './middleware/permissions.js';
import { handleStart } from './bot/handlers/start.handler.js';

const bot = new Bot<MyContext>(config.botToken);

bot.use(attachDbUser);

bot.command('start', handleStart);

bot.catch((err) => {
  console.error('Bot error:', err);
});

bot.start();
