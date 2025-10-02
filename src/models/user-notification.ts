import { Locale } from 'discord.js';
import mongoose from 'mongoose';

export enum KeywordType {
  MovieTitle = 'title',
  MovieFeature = 'feature',
}

const keywordSchema = new mongoose.Schema({
  /**
   * The type of keyword, from which the resulting fuzzy search is inferred.
   */
  type: {
    type: mongoose.SchemaTypes.String,
    required: true,
    enum: Object.values(KeywordType),
  },
  /**
   * The value to try to match when fuzzy searching existing records.
   */
  value: {
    type: mongoose.SchemaTypes.String,
    required: true,
  },
});

const notificationSchema = new mongoose.Schema(
  {
    keywords: [keywordSchema],
    /**
     * The number of notifications already sent to the user. Used to check when the bot should
     * stop notifying the user about movies matching the entries keywords. Incremented each
     * time a notification is send. Will be `undefined` if `maxNotifications` is not set.
     */
    sentNotifications: mongoose.SchemaTypes.Number,
    /**
     * The maximum number of notifications the user should receive for this notification. After the
     * maximum number of notifications is reached, the notification is removed.
     */
    maxNotifications: mongoose.SchemaTypes.Number,
    /**
     * UTC timestamp of when the last notification was sent.
     */
    lastNotificationSentAt: mongoose.SchemaTypes.Date,
    /**
     * Date (12:00AM UTC) of when the notification should expire. Once expired, the notification
     * will be removed.
     */
    expiresAt: mongoose.SchemaTypes.Date,
  },
  {
    timestamps: true,
  },
);

const userNotificationSchema = new mongoose.Schema(
  {
    /**
     * The unique ID of the user who will receive notifications.
     */
    userId: {
      type: mongoose.SchemaTypes.String,
      required: true,
      unique: true,
      index: true,
    },
    /**
     * The locale in which the notification will be. This value is not inferred by the users settings
     * (as this is not exposed in the discord API) but rather from the guild in which he creates the
     * notification.
     */
    locale: {
      type: mongoose.SchemaTypes.String,
      required: true,
      enum: Object.values(Locale),
    },
    notifications: [notificationSchema],
  },
  {
    timestamps: true,
  },
);

export type UserNotification = mongoose.InferSchemaType<typeof userNotificationSchema>;
export const UserNotificationModel = mongoose.model('UserNotification', userNotificationSchema);
