declare module 'bun' {
  interface Env {
    LOG_LEVEL?: string;
    WEB_SCRAPER_SERVICE_CRON?: string;
  }
}
