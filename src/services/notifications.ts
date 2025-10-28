import { Locale, heading, bold, inlineCode, quote, User } from 'discord.js';
import { chatMessage } from '../utilities/discord';
import Singleton from '../utilities/singleton';
import movieScreeningsCommand from '../bot/commands/movies/screenings';
import { BotConfigurationModel } from '../models/bot-configuration';
import { Cron, scheduledJobs } from 'croner';
import { randomUUID } from 'node:crypto';
import dayjs from 'dayjs';
import { MovieModel, type Movie } from '../models/movie';
import Mustache from 'mustache';
import { I18N } from '../constants';
import { KeywordType, UserModel } from '../models/user';
import Fuse from 'fuse.js';
import { client } from '../bot/client';
import type { Types } from 'mongoose';

enum JobType {
  Guild,
}

interface JobContext {
  type: JobType;
}

interface GuildJobContext extends JobContext {
  guildIds: Set<string>;
  updatedGuildIds?: Set<string>;
}

interface AggregatedUser {
  _id: Types.ObjectId;
  discordId: string;
  timezone: string;
  locale: Locale;
  notifications: {
    _id: Types.ObjectId;
    name: string;
    keywords: { type: KeywordType; value: string; _id: Types.ObjectId }[];
  }[];
}

interface AggregatedMovie {
  _id: Types.ObjectId;
  title: Movie['title'];
  description: Movie['description'];
  durationMinutes: Movie['durationMinutes'];
  genres: Movie['genres'];
  ageRating: Movie['ageRating'];
  screenings: Pick<Movie['screenings'][0], 'features' | 'startTime' | 'auditorium'>[];
  features: string[];
}

interface MatchedMovie {
  movie: Omit<AggregatedMovie, '_id'>;
  keywords: {
    notificationName: string;
    notificationId: Types.ObjectId;
    type: KeywordType;
    value: string;
  }[];
}

export default class NotificationService extends Singleton {
  private messageTemplates = {
    guildAnnouncementThread: {
      [Locale.EnglishUS]: 'Movie updates from {{{date}}}',
      [Locale.German]: 'Film-Updates von {{{date}}}',
    },
    guildMessageAnnouncement: {
      [Locale.EnglishUS]: chatMessage`
        ${heading(":loudspeaker:  ATTENTION PLEASE — Today's movie updates are in!  :loudspeaker:")}
        Just checked the theatre and we've got the latest on what's playing today :popcorn:
        Scroll through, pick your favorites, and maybe plan a movie night — I've got your back with all the showtimes.
      `,
      [Locale.German]: chatMessage`
        ${heading(':loudspeaker:  ACHTUNG — Die heutigen Film-Updates sind da!  :loudspeaker:')}
        Hab gerade im Kino nachgeschaut und wir haben die neuesten Infos, was heute läuft :popcorn:
        Scroll dich durch, such dir deine Favoriten aus und plan vielleicht einen Kinoabend — ich hab die Showtimes für dich im Blick.
      `,
    },
    guildMessageMovie: {
      [Locale.EnglishUS]: chatMessage`
        ${heading(':popcorn:  {{{title}}}  :popcorn:')}
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

        ${heading(':clapper:  Screenings')}
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
      [Locale.German]: chatMessage`
        ${heading(':popcorn:  {{{title}}}  :popcorn:')}
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

        ${heading(':clapper:  Vorführungen')}
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
    dmMessageAnnouncement: {
      [Locale.EnglishUS]: chatMessage`
        ${heading(":loudspeaker:  ATTENTION PLEASE — I've got your movie alert(s)!  :loudspeaker:")}
        Don't miss it — grab your popcorn and enjoy the show! :popcorn:
      `,
      [Locale.German]: chatMessage`
        ${heading(':loudspeaker:  ACHTUNG — deine Film-Benachrichtigung(en) ist/sind da!  :loudspeaker:')}
        Nicht verpassen — schnapp dir Popcorn und viel Spaß beim Film! :popcorn:
      `,
    },
    dmMessageMovie: {
      [Locale.EnglishUS]: chatMessage`
        ${heading(':popcorn:  {{{title}}}  :popcorn:')}
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

        The next earliest screening is at ${inlineCode('{{{earliestScreening}}}')}. Use the ${inlineCode('/{{{screeningCommandName}}}')} to get more info on upcoming screenings.

        ${quote(`This movie was matched by the notification(s) ${inlineCode('{{{matchedNotifications}}}')}.`)}
      `,
      [Locale.German]: chatMessage`
        ${heading(':popcorn:  {{{title}}}  :popcorn:')}
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

        Die nächste Vorführung ist am ${inlineCode('{{{earliestScreening}}}')}. Du kannst den ${inlineCode('/{{{screeningCommandName}}}')} Befehl nutzen, um mehr über anstehende Vorführungen zu erfahren.

        ${quote(`Dieser Film wurde mit den Benachrichigung(en) ${inlineCode('{{{matchedNotifications}}}')} gefunden.`)}
      `,
    },
  };

  /**
   * Registers all guild schedules and schedules the service to send DM's to users with notifications based on the
   * `NOTIFICATION_SERVICE_DM_CRON` environment variable.
   * @async
   */
  async run(): Promise<void> {
    try {
      this.serviceLogger.info(
        { model: BotConfigurationModel.constructor.name },
        'Aggregating guild IDs grouped by cron schedule for initial job registration',
      );
      const aggregatedNotificationSchedules = await BotConfigurationModel.aggregate<{
        _id: string;
        guildIds: string[];
      }>()
        .match({
          guildNotificationsDisabled: false,
        })
        .group({
          _id: '$guildNotificationsCronSchedule',
          guildIds: {
            $addToSet: '$guildId',
          },
        });

      const jobGroups = aggregatedNotificationSchedules.map((group) => ({
        cron: group._id,
        guildIds: new Set(group.guildIds),
      }));

      this.serviceLogger.debug(`Scheduling ${jobGroups.length} guild jobs`);
      for (const group of jobGroups) {
        this.scheduleGuildJob(group.cron, group.guildIds);
      }

      this.serviceLogger.info('Scheduling DM job');
      new Cron(
        process.env.NOTIFICATION_SERVICE_DM_CRON,
        {
          name: 'send-dm',
          catch: (err, executedJob) => {
            const nextSchedulesInMs = executedJob.msToNext();
            this.serviceLogger.error(
              {
                err,
                nextScheduleAt: nextSchedulesInMs
                  ? dayjs().add(nextSchedulesInMs, 'ms')
                  : 'unknown',
              },
              'Error during DM job execution',
            );
          },
        },
        async () => {
          await this.executeDmJob();
        },
      );

      this.serviceLogger.info('Scheduling notification cleanup job');
      new Cron(
        process.env.NOTIFICATION_SERVICE_NOTIFICATION_CLEANUP_CRON,
        {
          name: 'cleanup-notifications',
          catch: (err, executedJob) => {
            const nextSchedulesInMs = executedJob.msToNext();
            this.serviceLogger.error(
              {
                err,
                nextScheduleAt: nextSchedulesInMs
                  ? dayjs().add(nextSchedulesInMs, 'ms')
                  : 'unknown',
              },
              'Error during notification cleanup job execution',
            );
          },
        },
        async () => {
          await this.executeNotificationCleanupJob();
        },
      );
    } catch (err) {
      this.serviceLogger.error({ err }, 'Failed to schedule jobs');
    }
  }

  /**
   * Removes the guild ID from the old CRON schedule (if defined) and moves it to the new CRON schedule. The
   * change will only take effect in the next job run.
   * @param {string} guildId - The guild ID to update the CRON schedule for.
   * @param {string} newCronSchedule - The new CRON schedule the guild should follow.
   * @param {string} [oldCronSchedule] - The old CRON schedule of the guild, if it had one.
   */
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
      this.scheduleGuildJob(newCronSchedule, new Set([guildId]));
    }
  }

  private scheduleGuildJob(cron: string, guildIds: Set<string>): void {
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

    loggerWithCtx.info('Registering new guild job');
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
              job: `send-guild-message (${executedJob.getPattern()})`,
              nextScheduleAt: nextSchedulesInMs ? dayjs().add(nextSchedulesInMs, 'ms') : 'unknown',
            },
            'Error during guild job execution',
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
          loggerWithCtx.info('Job has no more guilds to notify, stopping job');
          job.stop();
          return;
        }

        await this.executeGuildJob(jobCtx.guildIds);
      },
    );
    loggerWithCtx.info('New guild job scheduled');
  }

  private async executeNotificationCleanupJob(): Promise<void> {
    try {
      const now = dayjs.utc().toDate();

      this.serviceLogger.info(
        'Removing all expired notifications without `keepAfterExpiration` flag',
      );
      const removedResult = await UserModel.updateMany({}, [
        {
          $set: {
            notifications: {
              $filter: {
                input: '$notifications',
                as: 'n',
                cond: {
                  $not: {
                    $and: [
                      {
                        $or: [
                          { $eq: ['$$n.keepAfterExpiration', false] },
                          { $eq: ['$$n.keepAfterExpiration', null] },
                        ],
                      },
                      {
                        $or: [
                          { $lte: ['$$n.expiresAt', now] },
                          { $gte: ['$$n.sentDms', '$$n.maxDms'] },
                        ],
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      ]);
      this.serviceLogger.info(`Removed notifications for ${removedResult.modifiedCount} users`);

      this.serviceLogger.info(
        'Deactivating all expired notifications with `keepAfterExpiration` flag',
      );
      const deactivatedResult = await UserModel.updateMany({}, [
        {
          $set: {
            notifications: {
              $map: {
                input: '$notifications',
                as: 'notification',
                in: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$$notification.keepAfterExpiration', true] },
                        {
                          $or: [
                            { $lt: ['$$notification.expiresAt', now] },
                            { $gte: ['$$notification.sentDms', '$$notification.maxDms'] },
                          ],
                        },
                        { $not: [{ $ifNull: ['$$notification.deactivatedAt', false] }] },
                      ],
                    },
                    {
                      $mergeObjects: ['$$notification', { deactivatedAt: now }],
                    },
                    '$$notification',
                  ],
                },
              },
            },
          },
        },
      ]);

      this.serviceLogger.info(
        `Deactivated notifications for ${deactivatedResult.modifiedCount} users`,
      );
    } catch (err) {
      this.serviceLogger.error({ err }, 'Failed to execute notification cleanup job');
    }
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

      loggerWithJobCtx.info(`Notifying ${guildIds.size} guilds about movie updates`);
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
      loggerWithGuildCtx.info('Getting bot configuration for guild');
      const configuration = await BotConfigurationModel.findOne({ guildId });
      if (!configuration) {
        loggerWithGuildCtx.warn('Bot configuration for guild not found');
        return;
      }

      const guild = await configuration.resolveGuild();
      const channel = await configuration.resolveGuildNotificationChannel();
      if (!channel) {
        loggerWithGuildCtx.warn('Guild channel could not be resolved');
        return;
      }

      loggerWithGuildCtx.info('Sending messages to guild channel');
      const usedLocale =
        guild.preferredLocale in this.messageTemplates.guildMessageMovie
          ? guild.preferredLocale
          : Locale.EnglishUS;

      loggerWithGuildCtx.debug('Sending announcement message');
      const announcementMessage = await channel.send({
        content:
          this.messageTemplates.guildMessageAnnouncement[
            usedLocale as keyof typeof this.messageTemplates.guildMessageAnnouncement
          ],
      });

      loggerWithGuildCtx.info('Creating new thread for movie updates and sending updates');
      const announcementThread = await announcementMessage.startThread({
        name: Mustache.render(
          this.messageTemplates.guildAnnouncementThread[
            usedLocale as keyof typeof this.messageTemplates.guildAnnouncementThread
          ],
          {
            date: dayjs.utc().format('YYYY-MM-DD HH:mm:ss'),
          },
        ),
      });
      for (const movie of movies) {
        loggerWithGuildCtx.debug('Replying to announcement message with movie update');
        await announcementThread.send({
          content: this.compileGuildMessage(movie, usedLocale, configuration.timezone),
        });
      }
      loggerWithGuildCtx.info(`${movies.length + 1} messages send`);
      await announcementThread.edit({ locked: true, archived: true });
    } catch (err) {
      loggerWithGuildCtx.error({ err }, 'Failed to send message to guild channel');
    }
  }

  private compileGuildMessage(movie: Movie, locale: Locale, timezone: string): string {
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
          startTime: dayjs.utc(screening.startTime).tz(timezone).format('YYYY-MM-DD HH:mm:ss'),
        }))
        .slice(0, 5),
      hasMoreScreenings: movie.screenings.length > 5,
    };

    return Mustache.render(
      this.messageTemplates.guildMessageMovie[
        locale as keyof typeof this.messageTemplates.guildMessageMovie
      ],
      ctx,
    );
  }

  private async executeDmJob(): Promise<void> {
    const now = dayjs.utc().toDate();

    try {
      this.serviceLogger.info("Aggregating user and notification ID's");
      // Fetch all users which have at least one notification which has not reached the max. number of
      // sent notifications, is not deactivated, not expired and not on cooldown
      const aggregatedUsers = await UserModel.aggregate<AggregatedUser>()
        .project({
          _id: 1,
          discordId: 1,
          locale: 1,
          timezone: 1,
          notifications: {
            $filter: {
              input: '$notifications',
              as: 'notification',
              cond: {
                $and: [
                  {
                    $or: [
                      {
                        $and: [
                          {
                            $or: [
                              { $eq: ['$$notification.maxDms', null] },
                              { $not: '$$notification.maxDms' },
                            ],
                          },
                          {
                            $or: [
                              { $eq: ['$$notification.sentDms', null] },
                              { $not: '$$notification.sentDms' },
                            ],
                          },
                        ],
                      },
                      {
                        $expr: { $lt: ['$$notification.sentDms', '$$notification.maxDms'] },
                      },
                    ],
                  },
                  {
                    $or: [
                      { $eq: ['$$notification.deactivatedAt', null] },
                      { $not: '$$notification.deactivatedAt' },
                    ],
                  },
                  {
                    $or: [
                      { $eq: ['$$notification.expiresAt', null] },
                      { $not: '$$notification.expiresAt' },
                      { $gt: ['$$notification.expiresAt', now] },
                    ],
                  },
                  {
                    $or: [
                      { $eq: ['$$notification.lastDmSentAt', null] },
                      { $not: '$$notification.lastDmSentAt' },
                      {
                        $lt: [
                          '$$notification.lastDmSentAt',
                          {
                            $dateSubtract: {
                              startDate: now,
                              unit: 'day',
                              amount: { $ifNull: ['$$notification.cooldown', 1] },
                            },
                          },
                        ],
                      },
                    ],
                  },
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
          discordId: 1,
          locale: 1,
          timezone: 1,
          notifications: {
            $map: {
              input: '$notifications',
              as: 'notification',
              in: {
                _id: '$$notification._id',
                name: '$$notification.name',
                keywords: '$$notification.keywords',
              },
            },
          },
        });

      if (aggregatedUsers.length !== 0)
        this.serviceLogger.info(`Found ${aggregatedUsers.length} users to check`);
      else {
        this.serviceLogger.info('No users to send notifications to, skipping');
        return;
      }

      this.serviceLogger.info('Aggregating movies');
      // Get all movies which have screenings available. Since the free tier of MongoDB does not
      // provide fuzzy searching, we have to do it in memory. This means we have to load all available
      // movies and then search them afterwards
      const aggregatedMovies = await MovieModel.aggregate<AggregatedMovie>()
        .match({ 'screenings.0': { $exists: true } })
        .project({
          title: 1,
          description: 1,
          durationMinutes: 1,
          genres: 1,
          ageRating: 1,
          futureScreenings: {
            $filter: {
              input: '$screenings',
              as: 's',
              cond: { $gte: ['$$s.startTime', now] },
            },
          },
        })
        .match({ 'futureScreenings.0': { $exists: true } })
        .project({
          _id: 1,
          title: 1,
          description: 1,
          durationMinutes: 1,
          genres: 1,
          ageRating: 1,
          screenings: {
            $map: {
              input: '$futureScreenings',
              as: 's',
              in: {
                features: '$$s.features',
                startTime: '$$s.startTime',
                auditorium: '$$s.auditorium',
              },
            },
          },
          features: {
            $reduce: {
              input: '$futureScreenings',
              initialValue: [],
              in: { $setUnion: ['$$value', '$$this.features'] },
            },
          },
        });

      if (aggregatedMovies.length !== 0)
        this.serviceLogger.info(`Found ${aggregatedMovies.length} movies to check`);
      else {
        this.serviceLogger.info('Found no movies to check, skipping');
        return;
      }

      for (const aggregatedUser of aggregatedUsers) {
        const notificationIdsToUpdate = await this.sendDm(aggregatedUser, aggregatedMovies);

        if (notificationIdsToUpdate.length === 0)
          this.serviceLogger.info('No notifications to update');
        else await this.updateNotifications(aggregatedUser._id, notificationIdsToUpdate);
      }
    } catch (err) {
      this.serviceLogger.error({ err }, 'Failed to execute job');
    }
  }

  private async sendDm(user: AggregatedUser, movies: AggregatedMovie[]): Promise<Types.ObjectId[]> {
    const loggerWithUserCtx = this.serviceLogger.child({
      jobType: JobType.Guild,
      userId: user.discordId,
      notificationCount: user.notifications.length,
    });

    try {
      loggerWithUserCtx.debug('Checking cache for user');
      let resolvedUser: User;

      const cachedUser = client.users.cache.get(user.discordId);
      if (cachedUser) resolvedUser = cachedUser;
      else {
        loggerWithUserCtx.info('Fetching user from Discord API');
        resolvedUser = await client.users.fetch(user.discordId);
      }

      const matches: Record<string, MatchedMovie> = {};
      const fuse = new Fuse(movies, {
        keys: ['title'],
        threshold: 0.3,
      });

      loggerWithUserCtx.info('Searching movies for keyword matches');
      const keywords = user.notifications.flatMap((notification) =>
        notification.keywords.map((keyword) => ({
          type: keyword.type,
          value: keyword.value,
          notificationName: notification.name,
          notificationId: notification._id,
        })),
      );

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
              const existingMatch = matches[result.item._id.toString()];
              if (existingMatch) {
                loggerWithKeywordCtx.debug(
                  'Movie matched by keyword was already matched by another keyword, adding current keyword to movie keywords',
                );
                existingMatch.keywords.push(keyword);
                continue;
              }

              loggerWithKeywordCtx.debug(`Adding new match for movie ${result.item.title}`);
              matches[result.item._id.toString()] = {
                movie: result.item,
                keywords: [keyword],
              };
            }
            break;
          case KeywordType.MovieFeature:
            for (const movie of movies) {
              if (!movie.features.includes(keyword.value)) continue;

              loggerWithKeywordCtx.info(`Found feature match for movie ${movie.title}`);
              const existingMatch = matches[movie._id.toString()];
              if (existingMatch) {
                loggerWithKeywordCtx.debug(
                  'Movie matched by keyword was already matched by another keyword, adding current keyword to movie keywords',
                );
                existingMatch.keywords.push(keyword);
                continue;
              }

              loggerWithKeywordCtx.debug(`Adding new match for movie ${movie.title}`);
              matches[movie._id.toString()] = {
                movie,
                keywords: [keyword],
              };
            }
            break;
          default:
            loggerWithKeywordCtx.warn(
              `Encountered unknown keyword type '${keyword.type as string}', skipping`,
            );
            break;
        }
      }

      const matchedMovies = Object.values(matches);
      if (matchedMovies.length === 0) {
        loggerWithUserCtx.info('No matches for users notifications found, skipping');
        return [];
      }

      loggerWithUserCtx.info(`Found ${matchedMovies.length} matches in total, sending messages`);
      loggerWithUserCtx.debug('Sending announcement message');
      const announcementMessage = await resolvedUser.send({
        content:
          this.messageTemplates.dmMessageAnnouncement[
            user.locale as keyof typeof this.messageTemplates.dmMessageAnnouncement
          ],
      });

      for (const matchedMovie of matchedMovies) {
        // If feature keywords have been defined, filter screenings for only the ones matching those keywords
        const featureKeywords = keywords.filter(
          (keyword) => keyword.type === KeywordType.MovieFeature,
        );
        if (featureKeywords.length > 0) {
          loggerWithUserCtx.debug('Filtering screenings based on feature keywords');
          matchedMovie.movie.screenings = matchedMovie.movie.screenings.filter((screening) =>
            featureKeywords.every((keyword) => screening.features.includes(keyword.value)),
          );
        }

        loggerWithUserCtx.debug('Replying to announcement message with movie update');
        await announcementMessage.reply({
          content: this.compileDmMessage(matchedMovie, user.locale, user.timezone),
        });
      }

      return matchedMovies.flatMap((matchedMovie) =>
        matchedMovie.keywords.flatMap((keyword) => keyword.notificationId),
      );
    } catch (err) {
      loggerWithUserCtx.error({ err }, 'Failed to check user notifications');
      return [];
    }
  }

  private compileDmMessage(matchedMovie: MatchedMovie, locale: Locale, timezone: string): string {
    const ctx = {
      title: matchedMovie.movie.title,
      description: matchedMovie.movie.description,
      ageRating: matchedMovie.movie.ageRating,
      durationMinutes: matchedMovie.movie.durationMinutes,
      hasGenres: matchedMovie.movie.genres.length !== 0,
      genres: matchedMovie.movie.genres.join(', '),
      earliestScreening: dayjs
        .utc(matchedMovie.movie.screenings[0]?.startTime)
        .tz(timezone)
        .format('YYYY-MM-DD HH:mm:ss'),
      screeningCommandName: movieScreeningsCommand.data.name,
      matchedNotifications: matchedMovie.keywords
        .map((keyword) => keyword.notificationName)
        .join(', '),
    };

    return Mustache.render(
      this.messageTemplates.dmMessageMovie[
        locale as keyof typeof this.messageTemplates.dmMessageMovie
      ],
      ctx,
    );
  }

  private async updateNotifications(
    userId: Types.ObjectId,
    notificationIds: Types.ObjectId[],
  ): Promise<void> {
    const loggerWithUserCtx = this.serviceLogger.child({ userId: userId.toString() });

    try {
      loggerWithUserCtx.info('Updating counter for sent notifications');
      await UserModel.updateOne(
        { _id: userId },
        {
          $inc: { 'notifications.$[notification].sentDms': 1 },
          $set: { 'notifications.$[notification].lastDmSentAt': dayjs().utc().toDate() },
        },
        {
          arrayFilters: [{ 'notification._id': { $in: notificationIds } }],
        },
      );
      loggerWithUserCtx.info('Notifications updated');
    } catch (err) {
      loggerWithUserCtx.error({ err }, 'Failed to update sent notification counter');
    }
  }
}
