import {
  bold,
  Client,
  GatewayIntentBits,
  heading,
  inlineCode,
  Locale,
  quote,
  REST,
  Routes,
} from 'discord.js';
import { readdir } from 'node:fs/promises';
import logger from '../utilities/logger';
import path from 'node:path';
import type { Command, Event } from '../types/discord.js';
import { Cron, scheduledJobs } from 'croner';
import { JobType, type BroadcastJobContext, type JobContext } from '../types/jobs';
import dayjs from 'dayjs';
import { message } from '../utilities/reply';
import movieScreeningsCommand from './commands/movies/screenings';
import { MovieModel } from '../models/movie';
import { BotConfigurationModel } from '../models/bot-configuration';
import Mustache from 'mustache';
import { I18N } from '../models/features';
import { randomUUID } from 'node:crypto';

export const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Map();

client.scheduleBroadcastJob = (cronSchedule: string, guildIds: Set<string>): void => {
  const loggerWithCtx = logger.child({ pattern: cronSchedule, jobType: 'broadcast' });

  const existingJob = scheduledJobs.find(
    (job) =>
      job.getPattern() === cronSchedule &&
      (job.options.context as JobContext | undefined)?.type === JobType.Broadcast,
  );
  if (existingJob) {
    loggerWithCtx.warn('Broadcast job with same pattern already registered');
    return;
  }

  loggerWithCtx.info('Registering new broadcast job');
  new Cron(
    cronSchedule,
    {
      name: randomUUID(),
      context: { type: JobType.Broadcast, guildIds },
      catch: (err, executedJob) => {
        const nextSchedulesInMs = executedJob.msToNext();
        loggerWithCtx.error(
          {
            err,
            nextScheduleAt: nextSchedulesInMs ? dayjs().add(nextSchedulesInMs, 'ms') : 'unknown',
          },
          'Error during broadcast job execution',
        );
      },
    },
    async (job, ctx) => {
      const jobCtx = ctx as BroadcastJobContext;

      loggerWithCtx.debug('Checking for updated guild IDs');
      if (jobCtx.updatedGuildIds) {
        jobCtx.guildIds = jobCtx.updatedGuildIds;
        jobCtx.updatedGuildIds = undefined;
      }

      if (jobCtx.guildIds.size === 0) {
        loggerWithCtx.info('Job has no more guilds to broadcast to, stopping job');
        job.stop();
        return;
      }

      await executeBroadcastJob(jobCtx.guildIds);
    },
  );
  logger.info({ pattern: cronSchedule }, 'New broadcast job scheduled');
};

client.updateBroadcastJob = function updateBroadcastJob(
  guildId: string,
  newCronSchedule: string,
  oldCronSchedule?: string,
): void {
  const loggerWithCtx = logger.child({ guildId, newCronSchedule, oldCronSchedule });

  loggerWithCtx.debug('Checking for job with old cron pattern');
  const oldJob = scheduledJobs.find(
    (job) =>
      job.getPattern() === oldCronSchedule &&
      (job.options.context as JobContext | undefined)?.type === JobType.Broadcast,
  );

  // If the guild has already been registered with a job, we remove it from there
  // We do not modify the guildIds set directly, as the job should handle actually removing it. This way we
  // should not run into any concurrency issues if the job is currently running
  if (oldJob) {
    loggerWithCtx.info('Removing guild from old job');
    const updatedGuildIds = (oldJob.options.context as BroadcastJobContext).updatedGuildIds;
    const currentGuildIds = new Set((oldJob.options.context as BroadcastJobContext).guildIds);

    if (updatedGuildIds) updatedGuildIds.delete(guildId);
    else {
      currentGuildIds.delete(guildId);
      (oldJob.options.context as BroadcastJobContext).updatedGuildIds = currentGuildIds;
    }
  }

  const newJob = scheduledJobs.find(
    (job) =>
      job.getPattern() === newCronSchedule &&
      (job.options.context as JobContext | undefined)?.type === JobType.Broadcast,
  );
  if (newJob) {
    loggerWithCtx.info('Removing guild from old job');
    const updatedGuildIds = (newJob.options.context as BroadcastJobContext).updatedGuildIds;
    const currentGuildIds = new Set((newJob.options.context as BroadcastJobContext).guildIds);

    if (updatedGuildIds) updatedGuildIds.add(guildId);
    else {
      currentGuildIds.add(guildId);
      (newJob.options.context as BroadcastJobContext).updatedGuildIds = currentGuildIds;
    }
  } else {
    this.scheduleBroadcastJob(newCronSchedule, new Set([guildId]));
  }
};

export async function initializeDiscordClient(): Promise<void> {
  if (!process.env.DISCORD_BOT_TOKEN) {
    logger.fatal('No bot token found in environment');
    process.exit(1);
  }

  if (!process.env.DISCORD_CLIENT_ID) {
    logger.fatal('No client ID found in environment');
    process.exit(1);
  }

  if (!process.env.DISCORD_BOT_BROADCAST_CRON) {
    logger.fatal('No default broadcast cron schedule found in environment');
    process.exit(1);
  }

  if (!process.env.DISCORD_BOT_DM_CRON) {
    logger.fatal('No default DM cron schedule found in environment');
    process.exit(1);
  }

  try {
    await registerCommandsFromDirectory();
    await registerEventsFromDirectory();

    const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN);
    const commands = client.commands.values().toArray();

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
    logger.error({ err }, 'Error during Discord client initialization');
    process.exit(1);
  }
}

async function registerCommandsFromDirectory(): Promise<void> {
  const commandFoldersPath = path.join(import.meta.dirname, 'commands');
  logger.debug(`Collecting commands from ${commandFoldersPath}`);

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
  logger.debug(`Collecting events from ${eventFoldersPath}`);

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

async function executeBroadcastJob(guildIds: Set<string>): Promise<void> {
  const loggerWithJobCtx = logger.child({ guildIds: Array.from(guildIds) });

  try {
    loggerWithJobCtx.info('Getting movies for broadcast messages');
    const movies = await MovieModel.find(
      {
        'screenings.0': { $exists: true },
      },
      {
        title: 1,
        ageRating: 1,
        description: 1,
        durationMinutes: 1,
        genres: 1,
        screenings: 1,
      },
    );

    if (movies.length === 0) {
      loggerWithJobCtx.info('No movies with screenings available, skipping');
      return;
    }

    loggerWithJobCtx.info('Executing scheduled broadcast job for guilds');
    for (const guildId of guildIds) {
      const loggerWithGuildCtx = logger.child({ guildId });
      try {
        const configuration = await BotConfigurationModel.findOne({ guildId });
        if (!configuration) {
          loggerWithGuildCtx.warn('Bot configuration for guild not found');
          continue;
        }

        const guild = await configuration.resolveGuild();
        const channel = await configuration.resolveBroadcastChannel();
        if (!channel) {
          loggerWithGuildCtx.warn('Guild channel could not be resolved');
          continue;
        }

        loggerWithGuildCtx.info('Sending broadcast update');
        const usedLocale =
          guild.preferredLocale in messages ? guild.preferredLocale : Locale.EnglishUS;

        for (const movie of movies) {
          const message = Mustache.render(
            (messages.broadcast as Record<Locale, string>)[usedLocale],
            {
              title: movie.title,
              description: movie.description,
              ageRating: movie.ageRating,
              durationMinutes: movie.durationMinutes,
              hasGenres: movie.genres.length !== 0,
              genres: movie.genres.join(', '),
              screenings: movie.screenings
                .map((screening) => ({
                  auditorium: screening.auditorium,
                  features: screening.features
                    .map((feature) => {
                      const translations = I18N[feature];
                      if (!translations) return feature;

                      const featureTranslation = translations[usedLocale];
                      if (!featureTranslation) return feature;
                      return featureTranslation;
                    })
                    .join(', '),
                  hasFeatures: screening.features.length !== 0,
                  startTime: dayjs
                    .utc(screening.startTime)
                    .tz(configuration.timezone)
                    .format('YYYY-MM-DD HH:mm:ss Z'),
                }))
                .slice(0, 5),
              hasMoreScreenings: movie.screenings.length > 5,
            },
          );
          await channel.send({
            content: message,
          });
        }
      } catch (err) {
        loggerWithGuildCtx.error({ err }, 'Failed to broadcast in guild');
      }
    }
  } catch (err) {
    loggerWithJobCtx.error({ err }, 'Failed to execute broadcast job');
  }
}

const messages = {
  broadcast: {
    [Locale.EnglishUS]: message`
      ${heading(':movie_camera:  {{{title}}}')}
      {{#description}}
        {{{description}}}
      {{/description}}

      {{#ageRating}}
        ${bold('Age Rating')}: ${inlineCode('{{{ageRating}}}')}
      {{/ageRating}}
      {{#durationMinutes}}
        ${bold('Duration')}: ${inlineCode('{{durationMinutes}} min')}
      {{/durationMinutes}}
      {{#hasGenres}}
        ${bold('Genres')}: ${inlineCode('{{{genres}}}')}
      {{/hasGenres}}

      ${heading(':hourglass_flowing_sand:  Screenings')}
      {{#screenings}}
        ${bold('Start Time')}: ${inlineCode('{{{startTime}}}')}
        ${bold('Auditorium')}: ${inlineCode('{{{auditorium}}}')}
        {{#hasFeatures}}
          ${bold('Features')}: ${inlineCode('{{{features}}}')}
        {{/hasFeatures}}

      {{/screenings}}
      {{#hasMoreScreenings}}
        ${quote(`You can use the ${inlineCode(`/${movieScreeningsCommand.data.name}`)} command to check when the movie is shown next.`)}
      {{/hasMoreScreenings}}
    `,
    [Locale.German]: message`
      ${heading(':movie_camera:  {{{title}}}')}
      {{#description}}
        {{{description}}}
      {{/description}}

      {{#ageRating}}
        ${bold('Altersfreigabe')}: ${inlineCode('{{{ageRating}}}')}
      {{/ageRating}}
      {{#durationMinutes}}
        ${bold('Dauer')}: ${inlineCode('{{durationMinutes}} min')}
      {{/durationMinutes}}
      {{#hasGenres}}
        ${bold('Genres')}: ${inlineCode('{{{genres}}}')}
      {{/hasGenres}}

      ${heading(':hourglass_flowing_sand:  Vorführungen')}
      {{#screenings}}
        ${bold('Startzeit')}: ${inlineCode('{{{startTime}}}')}
        ${bold('Saal')}: ${inlineCode('{{{auditorium}}}')}
        {{#hasFeatures}}
          ${bold('Features')}: ${inlineCode('{{{features}}}')}
        {{/hasFeatures}}

      {{/screenings}}
      {{#hasMoreScreenings}}
        ${quote(`Du kannst den ${inlineCode(`/${movieScreeningsCommand.data.name}`)} Befehl nutzen, um zu checken, wann die nächste Vorstellung stattfindet.`)}
      {{/hasMoreScreenings}}
    `,
  },
  dm: {
    [Locale.EnglishUS]: message``,
    [Locale.German]: message``,
  },
};
