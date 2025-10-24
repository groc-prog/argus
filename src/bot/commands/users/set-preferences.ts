import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  heading,
  italic,
  Locale,
  MessageFlags,
  quote,
  SlashCommandBuilder,
} from 'discord.js';
import { getLoggerWithCtx } from '../../../utilities/logger';
import { UserModel, type User } from '../../../models/user';
import { discordMessage, sendInteractionReply } from '../../../utilities/discord';
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

      loggerWithCtx.info(
        'Updating user configuration with new timezone or creating new record if none exists',
      );
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
      loggerWithCtx.info('Timezone updated successfully');

      await sendInteractionReply(interaction, replies.success, {
        template: {
          timezone,
        },
        interaction: {
          flags: MessageFlags.Ephemeral,
        },
      });
    } catch (err) {
      loggerWithCtx.error({ err }, 'Error during timezone update');
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
    const logger = getLoggerWithCtx(interaction);

    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name === 'timezone') {
      const timezones = Intl.supportedValuesOf('timeZone').map((timezone) => ({
        name: timezone,
        value: timezone,
      }));

      if (focusedOption.value.trim().length === 0) {
        logger.debug('No input to filter yet, returning first 25 options');
        await interaction.respond(timezones.slice(0, 25));
        return;
      }

      logger.debug('Fuzzy searching timezone options');
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
        logger.debug('No input to filter yet, returning first 25 options');
        await interaction.respond(locales.slice(0, 25));
        return;
      }

      logger.debug('Fuzzy searching locale options');
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
    [Locale.EnglishUS]: discordMessage`
      ${heading(':ok_hand:  PREFERENCE UPDATED  :ok_hand:')}
      In a world where precision guides performance… balance has been restored.

      The bot has successfully updated your preferences.
      All related actions will now follow this new configuration.

      ${quote(italic(`The stage adjusts, the timing aligns — the show continues in perfect sync.`))}
    `,
    [Locale.German]: discordMessage`
      ${heading(':ok_hand:  PRÄFERENZEN AKTUALISIERT  :ok_hand:')}
      In einer Welt, in der Präzision die Aufführung bestimmt… wurde das Gleichgewicht wiederhergestellt.

      Der Bot hat deine Präferenzen erfolgreich auf aktualisiert.
      Alle zugehörigen Aktionen folgen nun dieser neuen Konfiguration.

      ${quote(italic(`Die Bühne passt sich an, das Timing stimmt — die Show läuft im perfekten Einklang weiter.`))}
    `,
  },
  error: {
    [Locale.EnglishUS]: discordMessage`
      ${heading(':bangbang:  PREFERENCE UPDATE FAILED  :bangbang:')}
      In a world where precision guides performance… something fell out of tune.

      The bot was unable to update your preferences. A disturbance occurred, and the request could not be completed.

      ${quote(italic(`The system drifts out of sync — please verify your input and try again later.`))}
    `,
    [Locale.German]: discordMessage`
      ${heading(':bangbang:  FEHLGESCHLAGENE PRÄFERENZAKTUALISIERUNG  :bangbang:')}
      In einer Welt, in der Präzision die Aufführung bestimmt… geriet etwas aus dem Takt.

      Der Bot konnte deine Präferenzen nicht aktualisieren. Eine Störung ist aufgetreten, und die Anfrage konnte nicht abgeschlossen werden.

      ${quote(italic(`Das System ist nicht mehr im Einklang — bitte überprüfe deine Eingabe und versuche es später erneut.`))}
    `,
  },
} as const;
