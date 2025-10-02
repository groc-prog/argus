import pino from 'pino';
import pretty from 'pino-pretty';

export default pino(
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
