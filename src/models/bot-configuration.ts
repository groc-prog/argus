import mongoose from 'mongoose';
import logger from '../utilities/logger';
import {
  Guild,
  NewsChannel,
  PermissionFlagsBits,
  StageChannel,
  TextChannel,
  User,
  VoiceChannel,
  type Channel,
  type GuildBasedChannel,
  type PrivateThreadChannel,
  type PublicThreadChannel,
} from 'discord.js';
import { client } from '../bot/client';

const botConfigurationSchema = new mongoose.Schema(
  {
    /** The unique ID of the discord channel the bot will use to broadcast his messages. */
    broadcastChannelId: {
      type: mongoose.SchemaTypes.String,
      unique: true,
    },
    guildId: {
      type: mongoose.SchemaTypes.String,
      index: true,
      unique: true,
      required: true,
    },
    /** A custom schedule for when the bot will broadcast his messages. */
    broadcastCronSchedule: {
      type: mongoose.SchemaTypes.String,
      index: true,
      trim: true,
      required: true,
      default: process.env.NOTIFICATION_SERVICE_GUILD_CRON,
    },
    /** Whether the bot should do scheduled broadcasts for the guild. */
    broadcastsDisabled: {
      type: mongoose.SchemaTypes.Boolean,
      required: true,
      default: true,
    },
    /** Timezone used in broadcast messages. */
    timezone: {
      type: mongoose.SchemaTypes.String,
      required: true,
      default: 'Europe/Vienna',
      enum: Intl.supportedValuesOf('timeZone'),
    },
    /**
     * The unique ID of the discord user who modified the configuration last. Will initialize
     * with the unique ID of the bot.
     */
    lastModifiedBy: {
      type: mongoose.SchemaTypes.String,
      trim: true,
      required: true,
    },
  },
  {
    timestamps: true,
    statics: {
      /**
       * Inserts a bot configurations with the defined channelId and other defaults for the
       * provided guild.
       * @param {string} guildId - The ID of the guild for which the default should be created.
       * @param {string} channelId - The ID of the channel which should be set as the `broadcastChannelId`.
       * @param {string} botId - The user ID of the bot who is creating the configuration.
       * @throws Any errors thrown by `Model.save()`
       */
      createDefaultsForGuild: async (
        guildId: string,
        channelId: string,
        botId: string,
      ): Promise<void> => {
        const loggerWithCtx = logger.child({
          guildId,
          model: BotConfigurationModel.constructor.name,
        });

        loggerWithCtx.info('Creating new default bot configuration');
        const defaultConfiguration = new BotConfigurationModel({
          guildId,
          broadcastChannelId: channelId,
          broadcastCronSchedule: process.env.NOTIFICATION_SERVICE_GUILD_CRON,
          lastModifiedBy: botId,
        });

        await defaultConfiguration.save();
        loggerWithCtx.info(`Default bot configuration ${defaultConfiguration.id} created`);
      },
      /**
       * Checks if the provided channel is a valid channel to be set as the broadcasting channel.
       * @param {GuildBasedChannel | null | undefined} channel - The channel to check.
       * @throws {Error} If the discord.js client is not ready.
       * @returns {boolean} `true` if the channel is valid, otherwise `false`.
       */
      isValidBroadcastChannel(channel: GuildBasedChannel | null | undefined): boolean {
        if (!client.isReady()) throw new Error('Client not initialized yet');
        if (!channel) return false;

        return (
          channel.isTextBased() &&
          !channel.isDMBased() &&
          !!channel.permissionsFor(client.user.id)?.has(PermissionFlagsBits.SendMessages)
        );
      },
    },
    methods: {
      /**
       * Resolves the `Channel` object for the configured broadcast channel.
       * @throws {Error} If the discord.js client is not ready or the API request fails.
       * @returns The resolved channel or `null` if the channel is not available or the bot is missing
       * the required permissions.
       */
      async resolveBroadcastChannel() {
        const loggerWithCtx = logger.child({
          guildId: this.guildId,
          channelId: this.broadcastChannelId,
          model: BotConfigurationModel.constructor.name,
        });

        loggerWithCtx.info('Resolving configured broadcast channel from guild configuration');
        if (!client.isReady()) throw new Error('Client not initialized yet');
        if (!this.broadcastChannelId) {
          loggerWithCtx.debug('No broadcast channel configured');
          return null;
        }

        try {
          let channel: Channel | null;

          loggerWithCtx.debug('Checking cache for channel');
          const cachedChannel = client.channels.cache.get(this.broadcastChannelId);
          if (cachedChannel) channel = cachedChannel;
          else {
            loggerWithCtx.info('Fetching channel from Discord API');
            channel = await client.channels.fetch(this.broadcastChannelId);
          }

          // We can not use the `isValidBroadcastChannel` helper here since it would otherwise result
          // in a circular reference. Thanks mongoose
          const isValidChannel =
            channel?.isTextBased() &&
            !channel.isDMBased() &&
            channel.permissionsFor(client.user.id)?.has(PermissionFlagsBits.SendMessages);

          // Channel might no longer be available, we might be missing some permissions or it might not
          // be a text channel the bot can post to
          if (!isValidChannel) {
            loggerWithCtx.info('Bot is missing permission or channel does not exist');
            return null;
          }

          // Type assertion needed to make sure types like `send` are available
          // This should always be valid since we check for text chats explicitly
          return channel as
            | NewsChannel
            | StageChannel
            | TextChannel
            | PublicThreadChannel
            | PrivateThreadChannel
            | VoiceChannel;
        } catch (err) {
          loggerWithCtx.error({ err }, 'Error while fetching channel');
          throw err;
        }
      },
      /**
       * Resolves the `Guild` object for the guild the configuration belongs to.
       * @throws {Error} If the discord.js client is not ready or the API request fails.
       * @returns The resolved guild or `null` if the guild is not found.
       */
      async resolveGuild() {
        const loggerWithCtx = logger.child({
          guildId: this.guildId,
          model: BotConfigurationModel.constructor.name,
        });

        loggerWithCtx.info('Resolving guild from configuration');
        if (!client.isReady()) throw new Error('Client not initialized yet');

        try {
          let guild: Guild | null;

          loggerWithCtx.debug('Checking cache for guild');
          const cachedGuild = client.guilds.cache.get(this.guildId);
          if (cachedGuild) guild = cachedGuild;
          else {
            loggerWithCtx.info('Fetching guild from Discord API');
            guild = await client.guilds.fetch(this.guildId);
          }

          return guild;
        } catch (err) {
          loggerWithCtx.error({ err }, 'Error while fetching guild');
          throw err;
        }
      },
      /**
       * Resolves the `User` object for the user who last updated the configuration.
       * @throws {Error} If the discord.js client is not ready or the API request fails.
       * @returns The resolved user.
       */
      async resolveLastModifiedUser() {
        const loggerWithCtx = logger.child({
          guildId: this.guildId,
          userId: this.lastModifiedBy,
          model: BotConfigurationModel.constructor.name,
        });

        loggerWithCtx.info('Resolving user who last modified configuration');
        if (!client.isReady()) throw new Error('Client not initialized yet');

        try {
          let user: User;

          loggerWithCtx.debug('Checking cache for user');
          const cachedUser = client.users.cache.get(this.lastModifiedBy);
          if (cachedUser) user = cachedUser;
          else {
            loggerWithCtx.info('Fetching user from Discord API');
            user = await client.users.fetch(this.lastModifiedBy);
          }

          return user;
        } catch (err) {
          loggerWithCtx.error({ err }, 'Error while fetching user');
          throw err;
        }
      },
    },
  },
);

export type BotConfiguration = mongoose.InferSchemaType<typeof botConfigurationSchema> & {
  createdAt: Date;
  updatedAt: Date;
};
export const BotConfigurationModel = mongoose.model('BotConfiguration', botConfigurationSchema);
