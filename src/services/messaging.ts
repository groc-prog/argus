import { Locale, heading, bold, inlineCode, quote, User } from 'discord.js';
import { discordMessage } from '../utilities/discord';
import Singleton from './singleton';
import movieScreeningsCommand from '../bot/commands/movies/screenings';
import { BotConfigurationModel } from '../models/bot-configuration';
import { Cron, scheduledJobs } from 'croner';
import { randomUUID } from 'node:crypto';
import dayjs from 'dayjs';
import { MovieModel, type Movie } from '../models/movie';
import Mustache from 'mustache';
import { I18N } from '../models/features';
import { KeywordType, UserModel } from '../models/user';
import Fuse from 'fuse.js';
import { client } from '../bot/client';

enum JobType {
  Guild,
  Dm,
}

interface JobContext {
  type: JobType;
}

interface GuildJobContext extends JobContext {
  guildIds: Set<string>;
  updatedGuildIds?: Set<string>;
}

interface AggregatedGuilds {
  _id: string;
  guildIds: string[];
}

interface AggregatedUser {
  userId: string;
  notifications: { name: string; keywords: { type: KeywordType; value: string } }[];
}

interface AggregatedMovie {
  _id: string;
  title: string;
  features: string[];
  earliestScreening: Date;
}

interface MatchedMovie {
  movie: Omit<AggregatedMovie, '_id'>;
  keywords: AggregatedUser['notifications'][0]['keywords'][];
}

export default class MessagingService extends Singleton {
  private messageTemplate = {
    [Locale.EnglishUS]: discordMessage`
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
    [Locale.German]: discordMessage`
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
  };

  async start(): Promise<void> {
    this.serviceLogger.debug('Scheduling jobs');

    try {
      this.serviceLogger.info(
        { model: BotConfigurationModel.constructor.name },
        'Aggregating guild IDs grouped by cron schedule',
      );
      const aggregated = await BotConfigurationModel.aggregate<AggregatedGuilds>()
        .match({
          broadcastsDisabled: false,
        })
        .group({
          _id: '$broadcastCronSchedule',
          guildIds: {
            $addToSet: '$guildId',
          },
        });

      const groups = aggregated.map((group) => ({
        cron: group._id,
        guildIds: new Set(group.guildIds),
      }));

      this.serviceLogger.debug('Scheduling guild jobs');
      for (const group of groups) {
        this.scheduleGuildMessage(group.cron, group.guildIds);
      }

      this.serviceLogger.debug('Scheduling DM job');
      new Cron(
        process.env.BROADCAST_SERVICE_DM_CRON,
        {
          name: randomUUID(),
          context: { type: JobType.Dm },
          catch: (err, executedJob) => {
            const nextSchedulesInMs = executedJob.msToNext();
            this.serviceLogger.error(
              {
                err,
                jobType: JobType.Dm,
                nextScheduleAt: nextSchedulesInMs
                  ? dayjs().add(nextSchedulesInMs, 'ms')
                  : 'unknown',
              },
              'Error during job execution',
            );
          },
        },
        async () => {
          await this.executeDmJob();
        },
      );
    } catch (err) {
      this.serviceLogger.error({ err }, 'Failed to schedule jobs');
    }
  }

  updateGuildJob(guildId: string, newCronSchedule: string, oldCronSchedule?: string): void {
    const loggerWithCtx = this.serviceLogger.child({
      guildId,
      newCronSchedule,
      oldCronSchedule,
      jobType: JobType.Guild,
    });

    loggerWithCtx.debug('Checking for job with old cron pattern');
    const oldJob = scheduledJobs.find(
      (job) =>
        job.getPattern() === oldCronSchedule &&
        (job.options.context as JobContext | undefined)?.type === JobType.Guild,
    );

    // If the guild has already been registered with a job, we remove it from there
    // We do not modify the guildIds set directly, as the job should handle actually removing it. This way we
    // should not run into any concurrency issues if the job is currently running
    if (oldJob) {
      loggerWithCtx.info('Removing guild ID from old job');
      const updatedGuildIds = (oldJob.options.context as GuildJobContext).updatedGuildIds;
      const currentGuildIds = new Set((oldJob.options.context as GuildJobContext).guildIds);

      if (updatedGuildIds) updatedGuildIds.delete(guildId);
      else {
        currentGuildIds.delete(guildId);
        (oldJob.options.context as GuildJobContext).updatedGuildIds = currentGuildIds;
      }
    }

    const newJob = scheduledJobs.find(
      (job) =>
        job.getPattern() === newCronSchedule &&
        (job.options.context as JobContext | undefined)?.type === JobType.Guild,
    );
    if (newJob) {
      loggerWithCtx.info('Adding guild ID to new job');
      const updatedGuildIds = (newJob.options.context as GuildJobContext).updatedGuildIds;
      const currentGuildIds = new Set((newJob.options.context as GuildJobContext).guildIds);

      if (updatedGuildIds) updatedGuildIds.add(guildId);
      else {
        currentGuildIds.add(guildId);
        (newJob.options.context as GuildJobContext).updatedGuildIds = currentGuildIds;
      }
    } else {
      this.scheduleGuildMessage(newCronSchedule, new Set([guildId]));
    }
  }

  private scheduleGuildMessage(cron: string, guildIds: Set<string>): void {
    const loggerWithCtx = this.serviceLogger.child({ pattern: cron, jobType: JobType.Guild });

    const existingJob = scheduledJobs.find(
      (job) =>
        job.getPattern() === cron &&
        (job.options.context as JobContext | undefined)?.type === JobType.Guild,
    );
    if (existingJob) {
      loggerWithCtx.warn('Job with same pattern already registered, skipping');
      return;
    }

    loggerWithCtx.info('Registering new job');
    new Cron(
      cron,
      {
        name: randomUUID(),
        context: { type: JobType.Guild, guildIds },
        catch: (err, executedJob) => {
          const nextSchedulesInMs = executedJob.msToNext();
          loggerWithCtx.error(
            {
              err,
              nextScheduleAt: nextSchedulesInMs ? dayjs().add(nextSchedulesInMs, 'ms') : 'unknown',
            },
            'Error during job execution',
          );
        },
      },
      async (job, ctx) => {
        const jobCtx = ctx as GuildJobContext;

        loggerWithCtx.debug('Checking for updated guild IDs');
        if (jobCtx.updatedGuildIds) {
          jobCtx.guildIds = jobCtx.updatedGuildIds;
          jobCtx.updatedGuildIds = undefined;
        }

        if (jobCtx.guildIds.size === 0) {
          loggerWithCtx.info('Job has no more guilds to guild to, stopping job');
          job.stop();
          return;
        }

        await this.executeGuildJob(jobCtx.guildIds);
      },
    );
    loggerWithCtx.info('New job scheduled');
  }

  private async executeGuildJob(guildIds: Set<string>): Promise<void> {
    const loggerWithJobCtx = this.serviceLogger.child({
      guildIds: Array.from(guildIds),
      jobType: JobType.Guild,
    });

    try {
      loggerWithJobCtx.info('Getting movies with screenings available');
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

      loggerWithJobCtx.info('Executing scheduled job for guilds');
      for (const guildId of guildIds) {
        await this.sendGuildMessage(guildId, movies);
      }
    } catch (err) {
      loggerWithJobCtx.error({ err }, 'Failed to execute job');
    }
  }

  private async sendGuildMessage(guildId: string, movies: Movie[]): Promise<void> {
    const loggerWithGuildCtx = this.serviceLogger.child({ guildId });

    try {
      const configuration = await BotConfigurationModel.findOne({ guildId });
      if (!configuration) {
        loggerWithGuildCtx.warn('Bot configuration for guild not found');
        return;
      }

      const guild = await configuration.resolveGuild();
      const channel = await configuration.resolveBroadcastChannel();
      if (!channel) {
        loggerWithGuildCtx.warn('Guild channel could not be resolved');
        return;
      }

      loggerWithGuildCtx.info('Sending message to guild channel');
      const usedLocale =
        guild.preferredLocale in this.messageTemplate ? guild.preferredLocale : Locale.EnglishUS;

      for (const movie of movies) {
        await channel.send({
          content: this.renderMessage(movie, usedLocale, configuration.timezone),
        });
      }
    } catch (err) {
      loggerWithGuildCtx.error({ err }, 'Failed to send message to guild channel');
    }
  }

  private async executeDmJob(): Promise<void> {
    const now = dayjs.utc();
    const loggerWithJobCtx = this.serviceLogger.child({
      jobType: JobType.Dm,
    });

    try {
      loggerWithJobCtx.info("Aggregating user and notification ID's");
      // Fetch all users which have at least one notification which has not reached the max. number of
      // sent notifications, is not deactivated, not expired and not on cooldown
      const aggregatedUsers = await UserModel.aggregate<AggregatedUser>()
        .project({
          userId: '$discordId',
          notifications: {
            $filter: {
              input: '$notifications',
              as: 'notification',
              cond: {
                $and: [
                  {
                    $or: [
                      { $lt: ['$$notification.sentDms', '$$notification.maxDms'] },
                      { $eq: ['$$notification.maxDms', null] },
                      { $eq: ['$$notification.maxDms', undefined] },
                    ],
                  },
                  {
                    $or: [
                      { $eq: ['$$notification.deactivatedAt', null] },
                      { $eq: ['$$notification.deactivatedAt', undefined] },
                    ],
                  },
                  {
                    $or: [
                      { $eq: ['$$notification.lastDmSentAt', null] },
                      { $eq: ['$$notification.lastDmSentAt', undefined] },
                      {
                        $lt: [
                          '$$notification.lastDmSentAt',
                          {
                            $dateSubtract: {
                              startDate: now,
                              unit: 'day',
                              amount: '$$notification.dmDayInterval',
                            },
                          },
                        ],
                      },
                    ],
                  },
                  { $lt: ['$$notification.expiresAt', now] },
                ],
              },
            },
          },
        })
        .match({
          'notifications.0': { $exists: true },
        })
        .project({
          _id: 1,
          userId: 1,
          notifications: {
            $map: {
              input: '$notifications',
              as: 'notification',
              in: {
                name: '$$notification.name',
                keywords: '$$notification.keywords',
              },
            },
          },
        });
      if (aggregatedUsers.length !== 0)
        loggerWithJobCtx.info(`Found ${aggregatedUsers.length} users to check`);
      else {
        loggerWithJobCtx.info('No users to send notifications to, skipping');
        return;
      }

      loggerWithJobCtx.info('Aggregating movies');
      // Get all movies which have screenings available. Since the free tier of MongoDB does not
      // provide fuzzy searching, we have to do it in memory. This means we have to load all available
      // movies and then search them afterwards
      const aggregatedMovies = await MovieModel.aggregate<AggregatedMovie>()
        .match({
          'screenings.0': { $exists: true },
        })
        .unwind('$screenings')
        .group({
          _id: '$_id',
          title: { $first: '$title' },
          features: { $addToSet: '$screenings.features' },
          earliestScreening: { $min: '$screenings.startTime' },
        })
        .project({
          _id: 1,
          title: 1,
          features: {
            $reduce: {
              input: '$features',
              initialValue: [],
              in: { $setUnion: ['$$value', '$$this'] },
            },
          },
          earliestScreening: 1,
        });

      if (aggregatedMovies.length !== 0)
        loggerWithJobCtx.info(`Found ${aggregatedMovies.length} movies to check`);
      else {
        loggerWithJobCtx.info('Found no movies to check, skipping');
        return;
      }

      for (const aggregatedUser of aggregatedUsers) {
        await this.sendDm(aggregatedUser, aggregatedMovies);
      }
    } catch (err) {
      loggerWithJobCtx.error({ err }, 'Failed to execute job');
    }
  }

  private async sendDm(user: AggregatedUser, movies: AggregatedMovie[]): Promise<void> {
    const loggerWithUserCtx = this.serviceLogger.child({
      jobType: JobType.Guild,
      userId: user.userId,
      notificationCount: user.notifications.length,
    });

    try {
      loggerWithUserCtx.debug('Checking cache for user');
      let resolvedUser: User;

      const cachedUser = client.users.cache.get(user.userId);
      if (cachedUser) resolvedUser = cachedUser;
      else {
        loggerWithUserCtx.info('Fetching user from Discord API');
        resolvedUser = await client.users.fetch(user.userId);
      }

      const matches: Record<string, MatchedMovie> = {};
      const fuse = new Fuse(movies, {
        keys: ['title'],
      });

      loggerWithUserCtx.info('Searching movies for keyword matches');
      const keywords = user.notifications.flatMap((notification) => notification.keywords);

      for (const keyword of keywords) {
        const loggerWithKeywordCtx = loggerWithUserCtx.child({
          keywordType: keyword.type,
          keywordValue: keyword.value,
        });

        switch (keyword.type) {
          case KeywordType.MovieTitle:
            loggerWithKeywordCtx.debug('Running fuzzy search on movie title');
            const searchResults = fuse.search(keyword.value);

            loggerWithKeywordCtx.info(`Found ${searchResults.length} match(es) for keyword`);
            for (const result of searchResults) {
              const existingMatch = matches[result.item._id];
              if (existingMatch) {
                loggerWithKeywordCtx.debug(
                  'Movie matched by keyword was already matched by another keyword, adding current keyword to movie keywords',
                );
                existingMatch.keywords.push(keyword);
                continue;
              }

              loggerWithKeywordCtx.debug(`Adding new match for movie ${result.item.title}`);
              matches[result.item._id] = {
                movie: result.item,
                keywords: [keyword],
              };
            }
            break;
          case KeywordType.MovieFeature:
            for (const movie of movies) {
              if (!movie.features.includes(keyword.value)) continue;

              loggerWithKeywordCtx.info(`Found match for movie ${movie.title}`);
              const existingMatch = matches[movie._id];
              if (existingMatch) {
                loggerWithKeywordCtx.debug(
                  'Movie matched by keyword was already matched by another keyword, adding current keyword to movie keywords',
                );
                existingMatch.keywords.push(keyword);
                continue;
              }

              loggerWithKeywordCtx.debug(`Adding new match for movie ${movie.title}`);
              matches[movie._id] = {
                movie,
                keywords: [keyword],
              };
            }
            break;
          default:
            loggerWithKeywordCtx.warn('Encountered unknown keyword type, skipping');
            break;
        }
      }

      const matchedMovies = Object.values(matches);
      if (matchedMovies.length === 0) {
        loggerWithUserCtx.info('No matches for users notifications found, skipping');
        return;
      }

      loggerWithUserCtx.info(`Found ${matchedMovies.length} matches in total, sending messages`);
      for (const movie of matchedMovies) {
        console.log(movie, resolvedUser);
        // await resolvedUser.send({
        //   content: this.renderMessage(movie, user.)
        // });
      }
    } catch (err) {
      loggerWithUserCtx.error({ err }, 'Failed to check user notifications');
    }
  }

  private renderMessage(movie: Movie, locale: Locale, timezone: string): string {
    const ctx = {
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

              const featureTranslation = translations[locale];
              if (!featureTranslation) return feature;
              return featureTranslation;
            })
            .join(', '),
          hasFeatures: screening.features.length !== 0,
          startTime: dayjs.utc(screening.startTime).tz(timezone).format('YYYY-MM-DD HH:mm:ss Z'),
        }))
        .slice(0, 5),
      hasMoreScreenings: movie.screenings.length > 5,
    };

    return Mustache.render(this.messageTemplate[locale as keyof typeof this.messageTemplate], ctx);
  }
}
