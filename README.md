# argus

A small TypeScript Discord bot that watches my local cinema's schedule and notifies me about upcoming movies and notifications for movies I want to watch.

## Motivation

Watching movies is great. Watching them on the big screens is even better. But keeping track of all the movies one wants to watch is already a lot of work. It is even more work if the cinema's website is painstakingly slow to load (really, WTF are they even doing that the page takes 5-10s to become responsive).

After a few weeks I got tired of constantly keeping an eye out for interesting/upcoming movies, so I just automated it. There really is not anything more to it.

## What this project is

Argus is a self-hosted Discord bot built with TypeScript. It contains three main parts:
- a web scraper that extracts movie and screening data from a cinema website (using Puppeteer)
- a persistence layer (MongoDB via Mongoose) that stores movies, screenings and user notifications
- a notification service that posts messages to Discord servers and user DM's in scheduled jobs.

## Technology stack

- Runtime: [Bun](https://bun.com/)
- Language: TypeScript
- Discord integration: discord.js
- Web scraping: Puppeteer
- Database: MongoDB with Mongoose

## How to run locally

1. Install dependencies with Bun:

```bash
bun install
```

2. Provide the required environment variables (for example, a local `.env` file). Ensure MongoDB is reachable and your Discord bot is configured with the correct intents and permissions.

3. Start the bot:

```bash
bun run start
```
