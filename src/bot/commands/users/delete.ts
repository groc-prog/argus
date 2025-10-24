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
import { discordMessage, sendInteractionReply } from '../../../utilities/discord';
import { UserModel } from '../../../models/user';
import { isValidObjectId, Types } from 'mongoose';
import Fuse from 'fuse.js';
import { getLoggerWithCtx } from '../../../utilities/logger';

export default {
  data: new SlashCommandBuilder()
    .setName('forget-notification')
    .setDescription('Delete a notification from the bots mind, like it was never there...')
    .setDescriptionLocalization(
      Locale.German,
      'Lösch eine Benachrichtigung aus dem Gedächtnis des Bots, als hätte sie nie existiert...',
    )
    .addStringOption((option) =>
      option
        .setName('notification')
        .setNameLocalization(Locale.German, 'benachrichtigung')
        .setDescription('The notification to remove.')
        .setDescriptionLocalization(
          Locale.German,
          'Die Benachrichtigung, die gelöscht werden soll.',
        )
        .setRequired(true)
        .setAutocomplete(true),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const notificationEntryIdOrName = interaction.options.getString('notification', true);
    const loggerWithCtx = getLoggerWithCtx(interaction, {
      notificationIdOrName: notificationEntryIdOrName,
    });

    try {
      loggerWithCtx.info('Removing notification');
      const user = await UserModel.findOneAndUpdate(
        {
          discordId: interaction.user.id,
          $or: [
            {
              'notifications._id': isValidObjectId(notificationEntryIdOrName)
                ? new Types.ObjectId(notificationEntryIdOrName)
                : null,
            },
            { 'notifications.name': notificationEntryIdOrName },
          ],
        },
        {
          $pull: {
            notifications: {
              $or: [
                {
                  _id: isValidObjectId(notificationEntryIdOrName)
                    ? new Types.ObjectId(notificationEntryIdOrName)
                    : null,
                },
                { name: notificationEntryIdOrName },
              ],
            },
          },
        },
        { new: false },
      );

      if (!user) {
        loggerWithCtx.info('No matching notification found');
        await sendInteractionReply(interaction, replies.notificationNotFound, {
          interaction: {
            flags: MessageFlags.Ephemeral,
          },
        });
        return;
      }

      loggerWithCtx.info('Notification removed successfully');
      await sendInteractionReply(interaction, replies.success, {
        template: {
          notificationName: user.notifications.find(
            (entry) =>
              entry._id.toString() === notificationEntryIdOrName ||
              entry.name === notificationEntryIdOrName,
          )?.name,
        },
        interaction: {
          flags: MessageFlags.Ephemeral,
        },
      });
    } catch (err) {
      loggerWithCtx.error({ err }, 'Error while deleting notification');
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
      loggerWithCtx.info('Getting autocomplete options for notifications');
      const user = await UserModel.findOne(
        { discordId: interaction.user.id },
        { 'notifications._id': 1, 'notifications.name': 1 },
      );

      if (!user) {
        loggerWithCtx.info('No notifications found');
        await interaction.respond([]);
        return;
      }

      const notifications = user.notifications.map((entry) => ({
        name: entry.name,
        value: entry._id.toString(),
      }));

      if (focusedOptionValue.trim().length === 0) {
        loggerWithCtx.debug('No input to filter yet, returning first 25 options');
        await interaction.respond(notifications.slice(0, 25));
        return;
      }

      loggerWithCtx.debug('Fuzzy searching available notification options');
      const fuse = new Fuse(notifications, {
        keys: ['name'],
      });
      const matches = fuse.search(focusedOptionValue);

      await interaction.respond(matches.slice(0, 25).map((match) => match.item));
    } catch (err) {
      loggerWithCtx.error({ err }, 'Error while getting autocomplete options for notifications');
      await interaction.respond([]);
    }
  },
};

const replies = {
  success: {
    [Locale.EnglishUS]: discordMessage`
      ${heading(':ok_hand:  NOTIFICATION REMOVED  :ok_hand:')}
      In a world where notifications rise and fall… one has quietly departed.

      The notification ${inlineCode('{{{notificationName}}}')} has been successfully removed. The stage is cleared, and nothing lingers in its place.

      ${quote(italic(`The phantom has vanished. The flow of notifications continues unimpeded.`))}
    `,
    [Locale.German]: discordMessage`
      ${heading(':ok_hand:  BENACHRICHTIGUNG ENTFERNT  :ok_hand:')}
      In einer Welt, in der Benachrichtigungen entstehen und vergehen… ist eine nun still verschwunden.

      Die Benachrichtigung ${inlineCode('{{{notificationName}}}')} wurde erfolgreich entfernt. Die Bühne ist frei, und nichts bleibt an ihrem Platz.

      ${quote(italic(`Der Geist ist verschwunden. Der Fluss der Benachrichtigungen setzt sich ungestört fort.`))}
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
      ${heading(':bangbang:  NOTIFICATION REMOVAL FAILED  :bangbang:')}
      In a world where notifications vanish like shadows… some stubborn phantoms linger.

      The bot was unable to remove the notification. The forces of the universe interfered, and the request could not be completed.

      ${quote(italic(`The stage cannot clear this notification. Please try again later.`))}
    `,
    [Locale.German]: discordMessage`
      ${heading(':bangbang:  FEHLGESCHLAGENE BENACHRICHTIGUNGSENTFERNUNG  :bangbang:')}
      In einer Welt, in der Benachrichtigungen wie Schatten verschwinden… verweilen manche hartnäckigen Geister.

      Der Bot konnte die Benachrichtigung nicht entfernen. Die Kräfte des Universums haben sich eingemischt, und die Anfrage konnte nicht abgeschlossen werden.

      ${quote(italic(`Die Bühne kann diese Benachrichtigung nicht löschen. Bitte versuche es später erneut.`))}
    `,
  },
} as const;
