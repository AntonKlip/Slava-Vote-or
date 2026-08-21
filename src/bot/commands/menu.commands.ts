import type { BotCommand } from 'grammy/types';
import type { MyContext } from '../context.js';
import { UserRole } from '../../generated/prisma/enums.js';

export const USER_COMMANDS: BotCommand[] = [
  { command: 'start', description: 'Начать работу с ботом' },
];

export const ADMIN_COMMANDS: BotCommand[] = [
  ...USER_COMMANDS,
  { command: 'open_viewing', description: 'Открыть просмотр фото' },
  { command: 'start_voting', description: 'Начать голосование' },
  { command: 'stop_voting', description: 'Остановить голосование' },
  { command: 'grant_access', description: 'Выдать доступ к голосованию' },
  { command: 'revoke_access', description: 'Отозвать доступ к голосованию' },
  { command: 'add_nomination', description: 'Добавить номинацию' },
  { command: 'list_nominations', description: 'Список номинаций' },
  { command: 'deactivate_nomination', description: 'Деактивировать номинацию' },
  { command: 'list_photos', description: 'Список фото' },
  { command: 'delete_photo', description: 'Удалить фото' },
];

export async function syncCommandsForChat(ctx: MyContext): Promise<void> {
  if (!ctx.chat || !ctx.dbUser) return;

  const commands = ctx.dbUser.role === UserRole.ADMIN ? ADMIN_COMMANDS : USER_COMMANDS;
  await ctx.api.setMyCommands(commands, {
    scope: { type: 'chat', chat_id: ctx.chat.id },
  });
}
