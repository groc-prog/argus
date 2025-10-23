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
import { UserModel, type User } from '../../../models/user';
import { isValidObjectId, Types } from 'mongoose';
import Fuse from 'fuse.js';
import { discordMessage, sendInteractionReply } from '../../../utilities/discord';
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

      const expiresAtUtc = dayjs.utc(expiresAt, 'YYYY-MM-DD', true).startOf('day');
      if (expiresAt) {
        loggerWithCtx.debug('Validating expiration date option');
        const isValidDate = expiresAtUtc.isValid() && expiresAtUtc.diff(dayjs.utc()) >= 0;

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
      entry.expiresAt = expiresAt ? expiresAtUtc.toDate() : undefined;

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
          userId: interaction.user.id,
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
    [Locale.EnglishUS]: discordMessage`
      ${heading(':popcorn:  NOTIFICATION REACTIVATED  :popcorn:')}
      In a world where silence reigned… a signal has returned to life.

      The notification ${inlineCode('{{{notificationName}}}')} has been successfully reactivated.
      Once more, it will stand watch and deliver its messages when the time is right.

      ${quote(italic(`The lights flicker back on — the show continues.`))}
    `,
    [Locale.German]: discordMessage`
      ${heading(':popcorn:  BENACHRICHTIGUNG REAKTIVIERT  :popcorn:')}
      In einer Welt, in der die Stille herrschte… ist ein Signal zum Leben zurückgekehrt.

      Die Benachrichtigung ${inlineCode('{{{notificationName}}}')} wurde erfolgreich reaktiviert.
      Sie wacht erneut und sendet ihre Nachrichten, wenn der Moment gekommen ist.

      ${quote(italic(`Die Lichter flackern wieder auf — die Show geht weiter.`))}
    `,
  },
  dateValidationError: {
    [Locale.EnglishUS]: discordMessage`
      ${heading(':calendar:  DATE VALIDATION ERROR  :calendar:')}
      In a world where time marches on relentlessly… some dates cannot be honored.

      The provided date ${inlineCode('{{{date}}}')} is either invalid or has already passed. Please provide a future date in the format ${inlineCode('YYYY-MM-DD')}.

      ${quote(italic(`The bot cannot travel back in time. Adjust the date and try again to keep the story moving.`))}
    `,
    [Locale.German]: discordMessage`
      ${heading(':calendar:  DATUMSVALIDIERUNGSFEHLER  :calendar:')}
      In einer Welt, in der die Zeit unerbittlich voranschreitet… können einige Daten nicht beachtet werden.

      Das angegebene Datum ${inlineCode('{{{date}}}')} ist entweder ungültig oder liegt bereits in der Vergangenheit. Bitte gib ein zukünftiges Datum im Format ${inlineCode('JJJJ-MM-TT')} an.

      ${quote(italic(`Der Bot kann nicht in die Vergangenheit reisen. Passe das Datum an und versuche es erneut, damit die Geschichte weitergeht.`))}
    `,
  },
  notificationNotFound: {
    [Locale.EnglishUS]: discordMessage`
      ${heading(':no_entry:  INVALID NOTIFICATION  :no_entry:')}
      In a world where every signal must be real… some shadows cannot be touched.

      The notification you are trying to remove does not exist or is invalid. Ensure you are referencing a valid notification.

      ${quote(italic(`The stage cannot remove what is not there. Check your notification and try again.`))}
    `,
    [Locale.German]: discordMessage`
      ${heading(':no_entry:  UNGÜLTIGE BENACHRICHTIGUNG  :no_entry:')}
      In einer Welt, in der jedes Signal real sein muss… können manche Schatten nicht berührt werden.

      Die Benachrichtigung, die du entfernen möchtest, existiert nicht oder ist ungültig. Stelle sicher, dass du eine gültige Benachrichtigung referenzierst.

      ${quote(italic(`Die Bühne kann nicht entfernen, was nicht existiert. Überprüfe deine Benachrichtigung und versuche es erneut.`))}
    `,
  },
  error: {
    [Locale.EnglishUS]: discordMessage`
      ${heading(':x:  NOTIFICATION REACTIVATION FAILED  :x:')}
      In a world where silence was meant to end… the signal refused to rise.

      The bot attempted to reactivate the notification, but something went wrong.
      It may already be active, missing, or the system simply lost its spark.

      ${quote(italic(`The gears turned, but the current never flowed. Please verify the notification and try again.`))}
    `,
    [Locale.German]: discordMessage`
      ${heading(':x:  FEHLGESCHLAGENE BENACHRICHTIGUNGSREAKTIVIERUNG  :x:')}
      In einer Welt, in der die Stille enden sollte… weigerte sich das Signal, zu erwachen.

      Der Bot hat versucht, die Benachrichtigung zu reaktivieren, aber etwas ist schiefgelaufen.
      Sie ist möglicherweise bereits aktiv, fehlt, oder das System hat seinen Funken verloren.

      ${quote(italic(`Die Zahnräder drehten sich, doch der Strom floss nicht. Bitte überprüfe die Benachrichtigung und versuche es erneut.`))}
    `,
  },
} as const;
