import mongoose from 'mongoose';

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
  },
);

export type BotConfiguration = mongoose.InferSchemaType<typeof botConfigurationSchema>;
export const BotConfigurationModel = mongoose.model('BotConfiguration', botConfigurationSchema);
