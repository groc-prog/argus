import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  heading,
  Locale,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { getLoggerWithCtx } from '../../../utilities/logger';
import { UserModel, type User } from '../../../models/user';
import { chatMessage, sendInteractionReply } from '../../../utilities/discord';
import Fuse from 'fuse.js';

export default {
  data: new SlashCommandBuilder()
    .setName('set-preferences')
    .setDescription('Sets your preferences (time zone, locale, etc.).')
    .setDescriptionLocalization(Locale.German, 'Setze deine Präferenzen (Zeitzone, Sprache, usw.).')
    .addStringOption((option) =>
      option
        .setName('timezone')
        .setNameLocalization(Locale.German, 'zeitzone')
        .setDescription('Your current timezone')
        .setDescriptionLocalization(Locale.German, 'Deine Zeitzone')
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('locale')
        .setNameLocalization(Locale.German, 'sprache')
        .setDescription('Your preferred locale')
        .setDescriptionLocalization(Locale.German, 'Deine bevorzugte Sprache')
        .setAutocomplete(true),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const loggerWithCtx = getLoggerWithCtx(interaction);

    const timezone = interaction.options.getString('timezone');
    const locale = interaction.options.getString('locale') as Locale | null;

    try {
      if (timezone && !Intl.supportedValuesOf('timeZone').includes(timezone))
        throw new Error('Invalid timezone provided');
      if (locale && !Object.values(Locale).includes(locale))
        throw new Error('Invalid locale provided');

      loggerWithCtx.info('Updating user configuration or creating new record if none exists');
      const updatedPreferences: Partial<Pick<User, 'timezone' | 'locale'>> = {};
      if (timezone) updatedPreferences.timezone = timezone;
      if (locale) updatedPreferences.locale = locale;

      await UserModel.findOneAndUpdate(
        { discordId: interaction.user.id },
        {
          $set: {
            discordId: interaction.user.id,
            ...updatedPreferences,
          },
        },
        { upsert: true },
      );
      loggerWithCtx.info('Configuration updated successfully');

      await sendInteractionReply(interaction, replies.success, {
        template: {
          timezone,
        },
        interaction: {
          flags: MessageFlags.Ephemeral,
        },
      });
    } catch (err) {
      loggerWithCtx.error({ err }, 'Error during configuration update');
      await sendInteractionReply(interaction, replies.error, {
        template: {
          timezone,
        },
        interaction: {
          flags: MessageFlags.Ephemeral,
        },
      });
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    const loggerWithCtx = getLoggerWithCtx(interaction);

    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name === 'timezone') {
      const timezones = Intl.supportedValuesOf('timeZone').map((timezone) => ({
        name: timezone,
        value: timezone,
      }));

      if (focusedOption.value.trim().length === 0) {
        loggerWithCtx.debug('No input to filter yet, returning first 25 options');
        await interaction.respond(timezones.slice(0, 25));
        return;
      }

      loggerWithCtx.debug('Fuzzy searching timezone options');
      const fuse = new Fuse(timezones, {
        keys: ['name'],
      });
      const matches = fuse.search(focusedOption.value);

      await interaction.respond(matches.slice(0, 25).map((match) => match.item));
    } else {
      const locales = Object.values(Locale).map((locale) => ({
        name: locale,
        value: locale,
      }));

      if (focusedOption.value.trim().length === 0) {
        loggerWithCtx.debug('No input to filter yet, returning first 25 options');
        await interaction.respond(locales.slice(0, 25));
        return;
      }

      loggerWithCtx.debug('Fuzzy searching locale options');
      const fuse = new Fuse(locales, {
        keys: ['name'],
      });
      const matches = fuse.search(focusedOption.value);

      await interaction.respond(matches.slice(0, 25).map((match) => match.item));
    }
  },
};

const replies = {
  success: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':ok_hand:  Preferences Updated  :ok_hand:')}
      Your preferences have been updated successfully!
      All related actions will now follow your new setup.
    `,
    [Locale.German]: chatMessage`
      ${heading(':ok_hand:  Einstellungen aktualisiert  :ok_hand:')}
      Deine Präferenzen wurden erfolgreich gespeichert!
      Alle zugehörigen Aktionen folgen jetzt deiner neuen Konfiguration.
    `,
  },
  error: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':boom:  Update Failed  :boom:')}
      Hmm, something went off-script — I couldn't update your preferences this time.
      Please double-check your input and try again later.
    `,
    [Locale.German]: chatMessage`
      ${heading(':boom:  Aktualisierung fehlgeschlagen  :boom:')}
      Hm, da lief wohl etwas nicht nach Plan — ich konnte deine Einstellungen nicht speichern.
      Bitte überprüfe deine Eingaben und versuche es später erneut.
    `,
  },
} as const;
