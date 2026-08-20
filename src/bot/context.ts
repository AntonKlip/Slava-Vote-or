import type { Context } from 'grammy';
import type { User } from '../generated/prisma/client.js';

export interface MyContext extends Context {
  dbUser?: User;
}
