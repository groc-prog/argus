import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  heading,
  inlineCode,
  italic,
  Locale,
  MessageFlags,
  quote,
  SlashCommandBuilder,
} from 'discord.js';
import { getLoggerWithCtx } from '../../../utilities/logger';
import { NotificationModel, type Notification } from '../../../models/notification';
import { isValidObjectId, Types } from 'mongoose';
import Fuse from 'fuse.js';
import { message, replyFromTemplate } from '../../../utilities/reply';
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
    const logger = getLoggerWithCtx(interaction);

    const notificationEntryIdOrName = interaction.options.getString('notification', true);
    const expiresAt = interaction.options.getString('expiration-date');

    try {
      logger.info(`Getting notification ${notificationEntryIdOrName}`);
      const notification = await NotificationModel.findOne({
        userId: interaction.user.id,
        $or: [
          {
            'entries._id': isValidObjectId(notificationEntryIdOrName)
              ? new Types.ObjectId(notificationEntryIdOrName)
              : null,
          },
          { 'entries.name': notificationEntryIdOrName },
        ],
      });

      const isDeactivated = !!notification?.entries.find(
        (entry) =>
          entry._id.toString() === notificationEntryIdOrName ||
          entry.name === notificationEntryIdOrName,
      )?.deactivatedAt;
      if (!notification || !isDeactivated) {
        logger.info(`No notification matching ${notificationEntryIdOrName} found`);
        await replyFromTemplate(interaction, replies.notificationNotFound, {
          interaction: {
            flags: MessageFlags.Ephemeral,
          },
        });
        return;
      }

      const expiresAtUtc = dayjs.utc(expiresAt, 'YYYY-MM-DD', true).startOf('day');
      if (expiresAt) {
        logger.debug('Validating expiration date option');
        const isValidDate = expiresAtUtc.isValid() && expiresAtUtc.diff(dayjs.utc()) >= 0;

        if (!isValidDate) {
          logger.info('Invalid expiration date received, aborting');
          await replyFromTemplate(interaction, replies.dateValidationError, {
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

      const entryIndex = notification.entries.findIndex(
        (entry) =>
          entry._id.toString() === notificationEntryIdOrName ||
          entry.name === notificationEntryIdOrName,
      );
      if (entryIndex === -1) {
        logger.info(`No notification matching ${notificationEntryIdOrName} found`);
        await replyFromTemplate(interaction, replies.notificationNotFound, {
          interaction: {
            flags: MessageFlags.Ephemeral,
          },
        });
        return;
      }

      const entry = notification.entries[entryIndex] as Notification['entries'][number];

      entry.sentDms = entry.maxDms ? 0 : undefined;
      entry.deactivatedAt = undefined;
      entry.lastDmSentAt = undefined;
      entry.expiresAt = expiresAt ? expiresAtUtc.toDate() : undefined;

      notification.entries[entryIndex] = entry;
      await notification.save();

      logger.info('Notification reactivated successfully');
      await replyFromTemplate(interaction, replies.success, {
        template: {
          notificationName: entry.name,
        },
        interaction: {
          flags: MessageFlags.Ephemeral,
        },
      });
    } catch (err) {
      logger.error({ err }, 'Error while deleting user notifications');
      await replyFromTemplate(interaction, replies.error, {
        interaction: {
          flags: MessageFlags.Ephemeral,
        },
      });
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    const logger = getLoggerWithCtx(interaction);

    const focusedOptionValue = interaction.options.getFocused();

    try {
      logger.info('Aggregating deactivated notification options for user');
      const notification = await NotificationModel.aggregate<{
        _id: Types.ObjectId;
        entries: { name: string; _id: Types.ObjectId }[];
      }>()
        .match({
          userId: interaction.user.id,
          'entries.deactivatedAt': { $exists: true },
        })
        .project({
          entries: {
            $map: {
              input: {
                $filter: {
                  input: '$entries',
                  as: 'entry',
                  cond: { $ne: [{ $ifNull: ['$$entry.deactivatedAt', false] }, false] },
                },
              },
              as: 'entry',
              in: {
                _id: '$$entry._id',
                name: '$$entry.name',
              },
            },
          },
        })
        .limit(1);

      if (notification.length === 0) {
        logger.info('No deactivated notifications for user found');
        await interaction.respond([]);
        return;
      }

      const notificationOptions =
        notification[0]?.entries.map((notification) => ({
          name: notification.name,
          value: notification._id.toString(),
        })) ?? [];

      if (focusedOptionValue.trim().length === 0) {
        logger.debug('No input to filter yet, returning first 25 options');
        await interaction.respond(notificationOptions.slice(0, 25));
        return;
      }

      logger.debug('Fuzzy searching available deactivated notification options');
      const fuse = new Fuse(notificationOptions, {
        keys: ['name'],
      });
      const matches = fuse.search(focusedOptionValue);

      await interaction.respond(matches.slice(0, 25).map((match) => match.item));
    } catch (err) {
      logger.error({ err }, 'Failed to get autocomplete options for deactivated notifications');
      await interaction.respond([]);
    }
  },
};

const replies = {
  success: {
    [Locale.EnglishUS]: message`
      ${heading(':popcorn:  NOTIFICATION REACTIVATED  :popcorn:')}
      In a world where silence reigned… a signal has returned to life.

      The notification ${inlineCode('{{{notificationName}}}')} has been successfully reactivated.
      Once more, it will stand watch and deliver its messages when the time is right.

      ${quote(italic(`The lights flicker back on — the show continues.`))}
    `,
    [Locale.German]: message`
      ${heading(':popcorn:  BENACHRICHTIGUNG REAKTIVIERT  :popcorn:')}
      In einer Welt, in der die Stille herrschte… ist ein Signal zum Leben zurückgekehrt.

      Die Benachrichtigung ${inlineCode('{{{notificationName}}}')} wurde erfolgreich reaktiviert.
      Sie wacht erneut und sendet ihre Nachrichten, wenn der Moment gekommen ist.

      ${quote(italic(`Die Lichter flackern wieder auf — die Show geht weiter.`))}
    `,
  },
  dateValidationError: {
    [Locale.EnglishUS]: message`
      ${heading(':calendar:  DATE VALIDATION ERROR  :calendar:')}
      In a world where time marches on relentlessly… some dates cannot be honored.

      The provided date ${inlineCode('{{{date}}}')} is either invalid or has already passed. Please provide a future date in the format ${inlineCode('YYYY-MM-DD')}.

      ${quote(italic(`The bot cannot travel back in time. Adjust the date and try again to keep the story moving.`))}
    `,
    [Locale.German]: message`
      ${heading(':calendar:  DATUMSVALIDIERUNGSFEHLER  :calendar:')}
      In einer Welt, in der die Zeit unerbittlich voranschreitet… können einige Daten nicht beachtet werden.

      Das angegebene Datum ${inlineCode('{{{date}}}')} ist entweder ungültig oder liegt bereits in der Vergangenheit. Bitte gib ein zukünftiges Datum im Format ${inlineCode('JJJJ-MM-TT')} an.

      ${quote(italic(`Der Bot kann nicht in die Vergangenheit reisen. Passe das Datum an und versuche es erneut, damit die Geschichte weitergeht.`))}
    `,
  },
  notificationNotFound: {
    [Locale.EnglishUS]: message`
      ${heading(':no_entry:  INVALID NOTIFICATION  :no_entry:')}
      In a world where every signal must be real… some shadows cannot be touched.

      The notification you are trying to remove does not exist or is invalid. Ensure you are referencing a valid notification.

      ${quote(italic(`The stage cannot remove what is not there. Check your notification and try again.`))}
    `,
    [Locale.German]: message`
      ${heading(':no_entry:  UNGÜLTIGE BENACHRICHTIGUNG  :no_entry:')}
      In einer Welt, in der jedes Signal real sein muss… können manche Schatten nicht berührt werden.

      Die Benachrichtigung, die du entfernen möchtest, existiert nicht oder ist ungültig. Stelle sicher, dass du eine gültige Benachrichtigung referenzierst.

      ${quote(italic(`Die Bühne kann nicht entfernen, was nicht existiert. Überprüfe deine Benachrichtigung und versuche es erneut.`))}
    `,
  },
  error: {
    [Locale.EnglishUS]: message`
      ${heading(':x:  NOTIFICATION REACTIVATION FAILED  :x:')}
      In a world where silence was meant to end… the signal refused to rise.

      The bot attempted to reactivate the notification, but something went wrong.
      It may already be active, missing, or the system simply lost its spark.

      ${quote(italic(`The gears turned, but the current never flowed. Please verify the notification and try again.`))}
    `,
    [Locale.German]: message`
      ${heading(':x:  FEHLGESCHLAGENE BENACHRICHTIGUNGSREAKTIVIERUNG  :x:')}
      In einer Welt, in der die Stille enden sollte… weigerte sich das Signal, zu erwachen.

      Der Bot hat versucht, die Benachrichtigung zu reaktivieren, aber etwas ist schiefgelaufen.
      Sie ist möglicherweise bereits aktiv, fehlt, oder das System hat seinen Funken verloren.

      ${quote(italic(`Die Zahnräder drehten sich, doch der Strom floss nicht. Bitte überprüfe die Benachrichtigung und versuche es erneut.`))}
    `,
  },
} as const;
