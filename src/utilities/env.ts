import logger from './logger';

export function ensureEnvironmentConfigured(): void {
  if (!process.env.MONGODB_URI) {
    logger.error(`No MongoDB URI in environment`);
    process.exit(1);
  }
  if (!process.env.DISCORD_BOT_TOKEN) {
    logger.fatal('No bot token found in environment');
    process.exit(1);
  }
  if (!process.env.DISCORD_CLIENT_ID) {
    logger.fatal('No client ID found in environment');
    process.exit(1);
  }
  if (!process.env.BROADCAST_SERVICE_DM_CRON) {
    logger.fatal('No default broadcast DM cron schedule found in environment');
    process.exit(1);
  }
  if (!process.env.BROADCAST_SERVICE_GUILD_CRON) {
    logger.fatal('No default broadcast guild cron schedule found in environment');
    process.exit(1);
  }
}
