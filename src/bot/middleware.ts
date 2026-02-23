import { Context, NextFunction } from 'grammy';
import { ensureUser, getUser, isSubscribed, User } from '../db/queries';

export interface BotContext extends Context {
  user: User;
  isSub: boolean;
}

/**
 * Middleware: auto-register user on every message, attach user info to context.
 */
export async function userMiddleware(ctx: BotContext, next: NextFunction): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const user = ensureUser(from.id, from.username, from.first_name);
  ctx.user = user;
  ctx.isSub = isSubscribed(user);

  await next();
}
