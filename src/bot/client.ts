import { Client, GatewayIntentBits, REST, Routes, type ClientEvents } from 'discord.js';
import logger from '../utilities/logger';
import commands from './commands';
import events from './events';

export const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Map();

function registerCommandsFromDirectory(): void {
  logger.debug('Collecting commands');
  for (const command of commands) {
    client.commands.set(command.data.name, command);
  }
}

function registerEventsFromDirectory(): void {
  logger.debug('Collecting commands');
  for (const event of events) {
    const eventName = event.name as keyof ClientEvents;
    const executeFn = event.execute as (...args: unknown[]) => unknown;

    if ('once' in event && event.once) client.once(eventName, (...args) => executeFn(...args));
    else client.on(eventName, (...args) => executeFn(...args));
  }
}

/**
 * Initializes the Discord client by registering all commands/events from the `bot/commands` and `bot/events`
 * directories.
 * In development mode, will only register the commands and events for the guild ID defined in the
 * `DISCORD_TEST_GUILD_ID` environment variable.
 */
export async function initializeDiscordClient(): Promise<void> {
  try {
    registerCommandsFromDirectory();
    registerEventsFromDirectory();

    const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN);
    const commands = client.commands.values().toArray();

    if (process.env.NODE_ENV === 'development') {
      if (!process.env.DISCORD_TEST_GUILD_ID) {
        logger.error('Running in development mode, but did not find test guild ID in environment');
        process.exit(1);
      }

      logger.warn(
        `Refreshing ${client.commands.size} (/) commands in test guild ${process.env.DISCORD_TEST_GUILD_ID}`,
      );
      await rest.put(
        Routes.applicationGuildCommands(
          process.env.DISCORD_CLIENT_ID,
          process.env.DISCORD_TEST_GUILD_ID,
        ),
        { body: commands.map((command) => command.data.toJSON()) },
      );
    } else {
      logger.info(`Refreshing ${client.commands.size} global (/) commands`);
      await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), {
        body: commands.map((command) => command.data.toJSON()),
      });
    }
    logger.info(`Refreshed ${client.commands.size} (/) commands`);

    logger.info('Logging in with bot token');
    await client.login(process.env.DISCORD_BOT_TOKEN);
  } catch (err) {
    logger.error({ err }, 'Error during Discord client initialization');
    process.exit(1);
  }
}
