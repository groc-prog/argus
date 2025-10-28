import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  heading,
  inlineCode,
  Locale,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { chatMessage, sendInteractionReply } from '../../../utilities/discord';
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
    [Locale.EnglishUS]: chatMessage`
      ${heading(':ok_hand:  Notification Removed  :ok_hand:')}
      The notification ${inlineCode('{{{notificationName}}}')} has been successfully removed. The stage is clear.
    `,
    [Locale.German]: chatMessage`
      ${heading(':ok_hand:  Benachrichtigung Entfernt  :ok_hand:')}
      Die Benachrichtigung ${inlineCode('{{{notificationName}}}')} wurde erfolgreich entfernt. Die Bühne ist frei.
    `,
  },
  notificationNotFound: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':no_entry:  Invalid Notification  :no_entry:')}
      The notification you are trying to remove does not exist or is invalid. Please check the name and try again.
    `,
    [Locale.German]: chatMessage`
      ${heading(':no_entry:  Ungültige Benachrichtigung  :no_entry:')}
      Die Benachrichtigung, die du entfernen möchtest, existiert nicht oder ist ungültig. Bitte überprüfe den Namen und versuche es erneut.
    `,
  },
  error: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':boom:  Notification Removal Failed  :boom:')}
      The bot was unable to remove the notification. Please try again later.
    `,
    [Locale.German]: chatMessage`
      ${heading(':boom:  Fehlgeschlagene Benachrichtigungsentfernung  :boom:')}
      Der Bot konnte die Benachrichtigung nicht entfernen. Bitte versuche es später erneut.
    `,
  },
} as const;
