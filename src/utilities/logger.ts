import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import pino, { type DestinationStream, type Logger } from 'pino';
import path from 'node:path';
import { exists, mkdir, writeFile } from 'node:fs/promises';

const logDirectoryPath = path.join(import.meta.dirname, '..', '..', 'logs');
const logFilePath = path.join(logDirectoryPath, 'app.log');

if (!(await exists(logFilePath))) {
  await mkdir(logDirectoryPath, { recursive: true });
  await writeFile(logFilePath, '');
}

const transport = pino.transport({
  targets: [
    {
      target: 'pino/file',
      options: { destination: logFilePath },
    },
    {
      target: 'pino-pretty',
    },
  ],
}) as unknown as DestinationStream;

const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? 'info',
    formatters: {
      bindings: (bindings) => ({
        ...bindings,
        environment: process.env.NODE_ENV ?? 'unknown',
        bun: Bun.version,
      }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  transport,
);

/**
 * Attaches common context info from the interaction to a new child logger instance.
 * @param {ChatInputCommandInteraction | AutocompleteInteraction} interaction - The interaction the context is taken from.
 * @param {Record<string, unknown>} [ctx] - Optional context which should also be added to the logger.
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
