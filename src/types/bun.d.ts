declare module 'bun' {
  interface Env {
    LOG_LEVEL?: string;
    MONGODB_URI: string;
    WEB_SCRAPER_SERVICE_CRON: string;
    NOTIFICATION_SERVICE_GUILD_CRON: string;
    NOTIFICATION_SERVICE_DM_CRON: string;
    NOTIFICATION_SERVICE_NOTIFICATION_CLEANUP_CRON: string;
    DISCORD_CLIENT_ID: string;
    DISCORD_BOT_TOKEN: string;
    DISCORD_TEST_GUILD_ID?: string;
  }
}
