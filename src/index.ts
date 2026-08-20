import { Bot } from 'grammy';
import { config } from './config/config.js';

const bot = new Bot(config.botToken);

bot.command('start', async (ctx) => {
  await ctx.reply('pong');
});

bot.catch((err) => {
  console.error('Bot error:', err);
});

bot.start();
