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
import logger from '../../../utilities/logger';
import { NotificationModel } from '../../../models/notification';
import { message, replyFromTemplate } from '../../../utilities/reply';
import Fuse from 'fuse.js';

export default {
  data: new SlashCommandBuilder()
    .setName('set-timezone')
    .setDescription('Sets your current time zone.')
    .setDescriptionLocalization(Locale.German, 'Setze deine derzeitige Zeitzone.')
    .addStringOption((option) =>
      option
        .setName('timezone')
        .setDescription('Your current timezone')
        .setDescriptionLocalization(Locale.German, 'Deine Zeitzone')
        .setRequired(true)
        .setAutocomplete(true),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const loggerWithCtx = logger.child({
      userId: interaction.user.id,
      command: interaction.commandName,
    });

    const timezone = interaction.options.getString('timezone', true);

    try {
      if (!Intl.supportedValuesOf('timeZone').includes(timezone))
        throw new Error('Invalid timezone provided');

      loggerWithCtx.info('Updating user notification with new timezone');
      await NotificationModel.findOneAndUpdate(
        { userId: interaction.user.id },
        {
          $set: {
            userId: interaction.user.id,
            timezone,
          },
        },
        { upsert: true },
      );
      loggerWithCtx.info('Timezone updated successfully');

      await replyFromTemplate(interaction, replies.success, {
        template: {
          timezone,
        },
        interaction: {
          flags: MessageFlags.Ephemeral,
        },
      });
    } catch (err) {
      loggerWithCtx.error({ err }, 'Error during timezone update');
      await replyFromTemplate(interaction, replies.error, {
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
    const loggerWithCtx = logger.child({ command: interaction.commandName });

    const focusedOptionValue = interaction.options.getFocused();
    const timezones = Intl.supportedValuesOf('timeZone').map((timezone) => ({
      name: timezone,
      value: timezone,
    }));

    if (focusedOptionValue.trim().length === 0) {
      loggerWithCtx.debug('No input to filter yet, returning first 25 options');
      await interaction.respond(timezones.slice(0, 25));
      return;
    }

    const fuse = new Fuse(timezones, {
      keys: ['name'],
    });
    const matches = fuse.search(focusedOptionValue);

    await interaction.respond(matches.slice(0, 25).map((match) => match.item));
  },
};

const replies = {
  success: {
    [Locale.EnglishUS]: message`
      ${heading(':hourglass:  TIMEZONE UPDATED  :hourglass:')}
      In a world where timing is everything… the clock now beats in harmony.

      The bot has successfully updated your timezone to ${inlineCode('{{{timezone}}}')}. All schedules will now follow this time reference.

      ${quote(italic(`The stage lights shift, the cues align — the show will go on at the right time.`))}
    `,
    [Locale.German]: message`
      ${heading(':hourglass:  ZEITZONE AKTUALISIERT  :hourglass:')}
      In einer Welt, in der Timing alles ist… schlägt die Uhr nun im Einklang.

      Der Bot hat deine Zeitzone erfolgreich auf ${inlineCode('{{{timezone}}}')} aktualisiert. Alle Zeitpläne folgen nun dieser Zeitangabe.

      ${quote(italic(`Die Bühnenlichter wechseln, die Einsätze stimmen — die Show wird zur richtigen Zeit fortgesetzt.`))}
    `,
  },
  error: {
    [Locale.EnglishUS]: message`
      ${heading(':x:  TIMEZONE UPDATE FAILED  :x:')}
      In a world where timing is everything… the clock refuses to be tamed.

      The bot was unable to update the timezone to ${inlineCode('{{{timezone}}}')}. The forces of the universe interfered, and the request could not be completed.

      ${quote(italic(`The show cannot sync without the correct time. Please verify the timezone and try again later.`))}
    `,
    [Locale.German]: message`
      ${heading(':x:  FEHLGESCHLAGENE ZEITZONENAKTUALISIERUNG  :x:')}
      In einer Welt, in der Timing alles ist… weigert sich die Uhr gezähmt zu werden.

      Der Bot konnte die Zeitzone nicht auf ${inlineCode('{{{timezone}}}')} aktualisieren. Die Kräfte des Universums haben sich eingemischt, und die Anfrage konnte nicht abgeschlossen werden.

      ${quote(italic(`Die Show kann ohne die richtige Zeit nicht synchronisiert werden. Bitte überprüfe die Zeitzone und versuche es später erneut.`))}
    `,
  },
} as const;
