import { Bot } from 'grammy';
import { config } from '../config/config.js';
import type { MyContext } from './context.js';

export const bot = new Bot<MyContext>(config.botToken);
