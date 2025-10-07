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

export function getLoggerWithCtx(
  interaction: ChatInputCommandInteraction | AutocompleteInteraction,
): Logger {
  return logger.child({
    userId: interaction.user.id,
    guildId: interaction.guildId,
    command: interaction.commandName,
  });
}

export default logger;
