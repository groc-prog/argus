import { Client, GatewayIntentBits, REST, Routes } from 'discord.js';
import { readdir } from 'node:fs/promises';
import logger from '../utilities/logger.js';
import path from 'node:path';
import type { Command, Event } from '../types/discord.js';

export const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Map();

export async function initializeDiscordClient(): Promise<void> {
  if (!process.env.DISCORD_BOT_TOKEN) {
    logger.fatal('No bot token found in environment');
    process.exit(1);
  }

  if (!process.env.DISCORD_CLIENT_ID) {
    logger.fatal('No client ID found in environment');
    process.exit(1);
  }

  try {
    await registerCommandsFromDirectory();
    await registerEventsFromDirectory();

    const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN);
    const commands = Array.from(client.commands.values());

    if (process.env.NODE_ENV === 'development') {
      if (!process.env.DISCORD_TEST_GUILD_ID) {
        logger.fatal('Running in development mode, but did not find test guild ID in environment');
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
    logger.error({ err }, 'Failure during Discord client initialization');
    process.exit(1);
  }
}

async function registerCommandsFromDirectory(): Promise<void> {
  const commandFoldersPath = path.join(import.meta.dirname, 'commands');
  logger.info(`Collecting commands from ${commandFoldersPath}`);

  const commandFolders = await readdir(commandFoldersPath, { withFileTypes: true });
  for (const folder of commandFolders) {
    if (!folder.isDirectory()) continue;

    const commandFiles = await readdir(path.join(commandFoldersPath, folder.name), {
      withFileTypes: true,
    });
    for (const file of commandFiles) {
      if (!file.isFile()) continue;

      const fileParts = file.name.split('.');
      const extension = fileParts.length > 1 ? fileParts.pop() : '';
      if (extension !== 'ts') continue;

      const commandFilePath = path.join(commandFoldersPath, folder.name, file.name);
      logger.debug(`Discovered command at ${commandFilePath}, importing module`);

      const { default: command } = (await import(commandFilePath)) as { default: Command };
      if (typeof command === 'object' && 'data' in command && 'execute' in command) {
        logger.info(`Discovered command ${command.data.name}`);
        client.commands.set(command.data.name, command);
        continue;
      }

      logger.warn(
        `Found command at ${commandFilePath} which does not export required properties, skipping`,
      );
    }
  }
}

async function registerEventsFromDirectory(): Promise<void> {
  const eventFoldersPath = path.join(import.meta.dirname, 'events');
  logger.info(`Collecting events from ${eventFoldersPath}`);

  const eventFolders = await readdir(eventFoldersPath, { withFileTypes: true });
  for (const file of eventFolders) {
    if (!file.isFile()) continue;

    const fileParts = file.name.split('.');
    const extension = fileParts.length > 1 ? fileParts.pop() : '';
    if (extension !== 'ts') continue;

    const eventFilePath = path.join(eventFoldersPath, file.name);
    logger.debug(`Discovered event at ${eventFilePath}, importing module`);

    const { default: event } = (await import(eventFilePath)) as { default: Event };
    if (typeof event === 'object' && 'name' in event && 'execute' in event) {
      logger.info(`Discovered event ${event.name}`);

      if (event.once) client.once(event.name, (...args) => event.execute(...args));
      else client.on(event.name, (...args) => event.execute(...args));

      continue;
    }

    logger.warn(
      `Found event at ${eventFilePath} which does not export required properties, skipping`,
    );
  }
}
