import { Locale } from 'discord.js';
import mongoose from 'mongoose';

export enum KeywordType {
  MovieTitle = 'title',
  MovieFeature = 'feature',
}

const keywordSchema = new mongoose.Schema({
  /** The type of keyword, from which the resulting fuzzy search is inferred. */
  type: {
    type: mongoose.SchemaTypes.String,
    required: true,
    enum: Object.values(KeywordType),
  },
  /** The value to try to match when fuzzy searching existing records. */
  value: {
    type: mongoose.SchemaTypes.String,
    required: true,
  },
});

const notificationSchema = new mongoose.Schema(
  {
    name: {
      type: mongoose.SchemaTypes.String,
      required: true,
      index: true,
      trim: true,
    },
    keywords: {
      type: [keywordSchema],
      validate: [(val: unknown[]) => val.length !== 0, '{PATH} must contain at least one element'],
    },
    /**
     * The number of DM's already sent to the user. Used to check when the bot should
     * stop sending DM's to the user about movies matching the entries keywords. Incremented each
     * time a DM is send. Will be `undefined` if `maxDms` is not set.
     */
    sentDms: {
      type: mongoose.SchemaTypes.Number,
      min: 0,
    },
    /**
     * The maximum number of DM's the user should receive for this notification. After the
     * maximum number of DM's is reached, the notification is removed.
     */
    maxDms: {
      type: mongoose.SchemaTypes.Number,
      min: 0,
    },
    /**
     * By default, a entry will be deleted if it either expires or the max. number of notifications have
     * been sent. If this flag gets set to `true`, the notification will be deactivated rather than deleted.
     */
    keepAfterExpiration: {
      type: mongoose.SchemaTypes.Boolean,
      index: true,
    },
    /** UTC timestamp of when the entry was deactivated. */
    deactivatedAt: mongoose.SchemaTypes.Date,
    /** The interval (in days) in which a DM is sent. */
    dmDayInterval: {
      type: mongoose.SchemaTypes.Number,
      min: 0,
      default: 1,
      required: true,
    },
    /** UTC timestamp of when the last DM was sent. */
    lastDmSentAt: mongoose.SchemaTypes.Date,
    /** Date (12:00AM UTC) of when the entry should expire. */
    expiresAt: mongoose.SchemaTypes.Date,
  },
  {
    timestamps: true,
  },
);

const userSchema = new mongoose.Schema(
  {
    /** The unique Discord ID of the user who will receive notifications. */
    discordId: {
      type: mongoose.SchemaTypes.String,
      required: true,
      unique: true,
      index: true,
    },
    /** Timezone which will be used in DM's for date conversion of movies. */
    timezone: {
      type: mongoose.SchemaTypes.String,
      required: true,
      default: 'Europe/Vienna',
      enum: Intl.supportedValuesOf('timeZone'),
    },
    /**
     * The locale in which the DM will be.
     */
    locale: {
      type: mongoose.SchemaTypes.String,
      required: true,
      default: Locale.EnglishUS,
      enum: Object.values(Locale),
    },
    notifications: {
      type: [notificationSchema],
      validate: {
        validator: (notifications: mongoose.InferSchemaType<typeof notificationSchema>[]) => {
          const names = notifications.map((notification) => notification.name);
          return names.length === new Set(names).size;
        },
        message: 'Duplicate `name` values are not allowed in notifications.',
      },
    },
  },
  {
    timestamps: true,
  },
);

export type User = mongoose.InferSchemaType<typeof userSchema>;
export type Notification = mongoose.InferSchemaType<typeof notificationSchema>;
export const UserModel = mongoose.model('User', userSchema);
