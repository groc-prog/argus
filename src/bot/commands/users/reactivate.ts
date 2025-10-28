import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  heading,
  inlineCode,
  Locale,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { getLoggerWithCtx } from '../../../utilities/logger';
import { UserModel, type User } from '../../../models/user';
import { isValidObjectId, Types } from 'mongoose';
import Fuse from 'fuse.js';
import { chatMessage, sendInteractionReply } from '../../../utilities/discord';
import dayjs from 'dayjs';

export default {
  data: new SlashCommandBuilder()
    .setName('reactivate-notification')
    .setDescription('Reactivate a previously deactivated notification.')
    .setDescriptionLocalization(
      Locale.German,
      'Eine zuvor deaktivierte Benachrichtigung reaktivieren.',
    )
    .addStringOption((option) =>
      option
        .setName('notification')
        .setNameLocalization(Locale.German, 'benachrichtigung')
        .setDescription('The notification to reactivate.')
        .setDescriptionLocalization(
          Locale.German,
          'Die Benachrichtigung, die reaktiviert werden soll.',
        )
        .setRequired(true)
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('expiration-date')
        .setNameLocalization(Locale.German, 'verfallsdatum')
        .setDescription(
          'A date (YYYY-MM-DD) after which the notification will magically disappear.',
        )
        .setDescriptionLocalization(
          Locale.German,
          'Ein Datum (JJJJ-MM-TT), nach dem die Benachrichtigung wie von Zauberhand verschwindet.',
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const notificationEntryIdOrName = interaction.options.getString('notification', true);
    const expiresAt = interaction.options.getString('expiration-date');
    const loggerWithCtx = getLoggerWithCtx(interaction, {
      notificationIdOrName: notificationEntryIdOrName,
    });

    try {
      loggerWithCtx.info('Getting notification');
      const user = await UserModel.findOne({
        discordId: interaction.user.id,
        $or: [
          {
            'notifications._id': isValidObjectId(notificationEntryIdOrName)
              ? new Types.ObjectId(notificationEntryIdOrName)
              : null,
          },
          { 'notifications.name': notificationEntryIdOrName },
        ],
      });

      const isDeactivated = !!user?.notifications.find(
        (entry) =>
          entry._id.toString() === notificationEntryIdOrName ||
          entry.name === notificationEntryIdOrName,
      )?.deactivatedAt;
      if (!user || !isDeactivated) {
        loggerWithCtx.info('No matching notification found');
        await sendInteractionReply(interaction, replies.notificationNotFound, {
          interaction: {
            flags: MessageFlags.Ephemeral,
          },
        });
        return;
      }

      const expiresAtUtc = expiresAt
        ? dayjs.utc(expiresAt, 'YYYY-MM-DD', true).startOf('day')
        : null;
      if (expiresAt) {
        loggerWithCtx.debug('Validating expiration date option');
        const isValidDate = expiresAtUtc?.isValid() && expiresAtUtc.diff(dayjs.utc()) >= 0;

        if (!isValidDate) {
          loggerWithCtx.info('Invalid expiration date received, aborting');
          await sendInteractionReply(interaction, replies.dateValidationError, {
            template: {
              date: expiresAt,
            },
            interaction: {
              flags: MessageFlags.Ephemeral,
            },
          });
          return;
        }
      }

      const entryIndex = user.notifications.findIndex(
        (entry) =>
          entry._id.toString() === notificationEntryIdOrName ||
          entry.name === notificationEntryIdOrName,
      );
      if (entryIndex === -1) {
        loggerWithCtx.info('No matching notification found');
        await sendInteractionReply(interaction, replies.notificationNotFound, {
          interaction: {
            flags: MessageFlags.Ephemeral,
          },
        });
        return;
      }

      const entry = user.notifications[entryIndex] as User['notifications'][number];

      entry.sentDms = entry.maxDms ? 0 : undefined;
      entry.deactivatedAt = undefined;
      entry.lastDmSentAt = undefined;
      entry.expiresAt = expiresAt && expiresAtUtc ? expiresAtUtc.toDate() : undefined;

      user.notifications[entryIndex] = entry;
      loggerWithCtx.info('Saving updated notification');
      await user.save();

      loggerWithCtx.info('Notification reactivated successfully');
      await sendInteractionReply(interaction, replies.success, {
        template: {
          notificationName: entry.name,
        },
        interaction: {
          flags: MessageFlags.Ephemeral,
        },
      });
    } catch (err) {
      loggerWithCtx.error({ err }, 'Error while reactivating notification');
      await sendInteractionReply(interaction, replies.error, {
        interaction: {
          flags: MessageFlags.Ephemeral,
        },
      });
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    const loggerWithCtx = getLoggerWithCtx(interaction);

    const focusedOptionValue = interaction.options.getFocused();

    try {
      loggerWithCtx.info('Aggregating deactivated notification options');
      const user = await UserModel.aggregate<{
        _id: Types.ObjectId;
        notifications: { name: string; _id: Types.ObjectId }[];
      }>()
        .match({
          discordId: interaction.user.id,
          'notifications.deactivatedAt': { $exists: true },
        })
        .project({
          notifications: {
            $map: {
              input: {
                $filter: {
                  input: '$notifications',
                  as: 'notification',
                  cond: { $ne: [{ $ifNull: ['$$notification.deactivatedAt', false] }, false] },
                },
              },
              as: 'notification',
              in: {
                _id: '$$notification._id',
                name: '$$notification.name',
              },
            },
          },
        })
        .limit(1);

      if (user.length === 0) {
        loggerWithCtx.info('No deactivated notifications found');
        await interaction.respond([]);
        return;
      }

      const notificationOptions =
        user[0]?.notifications.map((notification) => ({
          name: notification.name,
          value: notification._id.toString(),
        })) ?? [];

      if (focusedOptionValue.trim().length === 0) {
        loggerWithCtx.debug('No input to filter yet, returning first 25 options');
        await interaction.respond(notificationOptions.slice(0, 25));
        return;
      }

      loggerWithCtx.debug('Fuzzy searching available deactivated notification options');
      const fuse = new Fuse(notificationOptions, {
        keys: ['name'],
      });
      const matches = fuse.search(focusedOptionValue);

      await interaction.respond(matches.slice(0, 25).map((match) => match.item));
    } catch (err) {
      loggerWithCtx.error(
        { err },
        'Failed to get autocomplete options for deactivated notifications',
      );
      await interaction.respond([]);
    }
  },
};

const replies = {
  success: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':popcorn:  Notification Reactivated  :popcorn:')}
      The notification ${inlineCode('{{{notificationName}}}')} is back in action!
      You'll start getting updates again when it's showtime.
    `,
    [Locale.German]: chatMessage`
      ${heading(':popcorn:  Benachrichtigung reaktiviert  :popcorn:')}
      Die Benachrichtigung ${inlineCode('{{{notificationName}}}')} ist wieder aktiv!
      Du erhältst erneut Updates, sobald es soweit ist.
    `,
  },
  dateValidationError: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':calendar:  Invalid Date  :calendar:')}
      The date ${inlineCode('{{{date}}}')} doesn't seem right — it's either invalid or already in the past.
      Please use a future date in the format ${inlineCode('YYYY-MM-DD')}.
    `,
    [Locale.German]: chatMessage`
      ${heading(':calendar:  Ungültiges Datum  :calendar:')}
      Das Datum ${inlineCode('{{{date}}}')} ist entweder ungültig oder liegt in der Vergangenheit.
      Bitte gib ein zukünftiges Datum im Format ${inlineCode('JJJJ-MM-TT')} an.
    `,
  },
  notificationNotFound: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':no_entry:  Notification Not Found  :no_entry:')}
      I couldn't find the notification you're referring to — it may not exist or has already been removed.
    `,
    [Locale.German]: chatMessage`
      ${heading(':no_entry:  Benachrichtigung nicht gefunden  :no_entry:')}
      Ich konnte die angegebene Benachrichtigung nicht finden — sie existiert möglicherweise nicht mehr oder wurde schon gelöscht.
    `,
  },
  error: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':boom:  Reactivation Failed  :boom:')}
      Something went wrong while trying to reactivate your notification.
      It might already be active or missing — please check and try again later.
    `,
    [Locale.German]: chatMessage`
      ${heading(':boom:  Reaktivierung fehlgeschlagen  :boom:')}
      Beim Versuch, die Benachrichtigung zu reaktivieren, ist ein Fehler aufgetreten.
      Sie ist vielleicht schon aktiv oder fehlt — bitte überprüfe sie und versuche es später erneut.
    `,
  },
} as const;
