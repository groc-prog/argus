import mongoose from 'mongoose';
import logger from '../utilities/logger';

const botConfigurationSchema = new mongoose.Schema(
  {
    /**
     * The unique ID of the discord channel the bot will use to broadcast his messages.
     */
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
    /**
     * A custom schedule for when the bot will broadcast his messages.
     */
    broadcastCronSchedule: {
      type: mongoose.SchemaTypes.String,
      trim: true,
      index: true,
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
       *
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
        logger.info({ guildId }, 'Creating new default bot configuration');
        const defaultConfiguration = new BotConfigurationModel({
          guildId,
          broadcastChannelId: channelId,
          broadcastCronSchedule: process.env.DISCORD_BOT_BROADCAST_CRON,
          lastModifiedBy: botId,
        });

        await defaultConfiguration.save();
        logger.info(
          { guildId, configurationId: defaultConfiguration.id as string },
          'Default bot configuration created',
        );
      },
    },
  },
);

export type BotConfiguration = mongoose.InferSchemaType<typeof botConfigurationSchema> & {
  createdAt: Date;
  updatedAt: Date;
};
export const BotConfigurationModel = mongoose.model('BotConfiguration', botConfigurationSchema);
