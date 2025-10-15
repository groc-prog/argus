import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import pino, { type Logger } from 'pino';
import pretty from 'pino-pretty';

const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? 'info',
    formatters: {
      bindings: (bindings) => ({
        ...bindings,
        environment: process.env.NODE_ENV ?? 'unknown',
        bun: Bun.version,
      }),
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pretty({
    colorize: true,
  }),
);

/**
 * Attaches common context info from the interaction to a new child logger instance.
 * @param {ChatInputCommandInteraction | AutocompleteInteraction} interaction - The interaction the
 * context is taken from.
 * @param {Record<string, unknown>} [ctx] - Optional context which should also be added to the
 * logger.
 * @returns {Logger} A new child logger with the attached context.
 */
export function getLoggerWithCtx(
  interaction: ChatInputCommandInteraction | AutocompleteInteraction,
  ctx: Record<string, unknown> = {},
): Logger {
  return logger.child({
    ...ctx,
    userId: interaction.user.id,
    guildId: interaction.guildId,
    command: interaction.commandName,
  });
}

export default logger;
