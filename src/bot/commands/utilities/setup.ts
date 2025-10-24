import {
  AutocompleteInteraction,
  bold,
  ChatInputCommandInteraction,
  Collection,
  heading,
  hyperlink,
  inlineCode,
  InteractionContextType,
  italic,
  Locale,
  MessageFlags,
  quote,
  SlashCommandBuilder,
} from 'discord.js';
import { getLoggerWithCtx } from '../../../utilities/logger';
import Fuse from 'fuse.js';
import { Cron } from 'croner';
import { discordMessage, sendInteractionReply } from '../../../utilities/discord';
import { BotConfigurationModel, type BotConfiguration } from '../../../models/bot-configuration';
import NotificationService from '../../../services/notifications';

export default {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure the bot to your specific needs.')
    .setDescriptionLocalization(
      Locale.German,
      'Konfiguriere den Bot so wie es dir am besten passt.',
    )
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option
        .setName('broadcast-channel')
        .setNameLocalization(Locale.German, 'broadcast-kanal')
        .setDescription('Text channel where movie updates should be posted.')
        .setDescriptionLocalization(
          Locale.German,
          'Kanal in dem Film-Updates gepostet werden sollen.',
        )
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('timezone')
        .setNameLocalization(Locale.German, 'zeitzone')
        .setDescription('The timezone used for broadcasts')
        .setDescriptionLocalization(Locale.German, 'Die Zeitzone, die bei Broadcasts benutzt wird')
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('broadcast-schedule')
        .setNameLocalization(Locale.German, 'benachrichtigungs-interval')
        .setDescription(
          'A CRON expression describing the interval in which the bot will post movie updates.',
        )
        .setDescriptionLocalization(
          Locale.German,
          'Ein CRON-Ausdruck, der beschreibt, in welchem Interval der Bot Film-Updates posten soll.',
        ),
    )
    .addBooleanOption((option) =>
      option
        .setName('broadcasts-enabled')
        .setNameLocalization(Locale.German, 'benachrichtigungen-aktiviert')
        .setDescription('Whether the bot should post movie updates in the server.')
        .setDescriptionLocalization(
          Locale.German,
          'Ob der Bot Film-Updates in dem server posten soll.',
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const broadcastChannelId = interaction.options.getString('broadcast-channel');
    const broadcastScheduleCron = interaction.options.getString('broadcast-schedule');
    const broadcastsEnabled = interaction.options.getBoolean('broadcasts-enabled');
    const partialConfiguration: Partial<BotConfiguration> = {};

    const loggerWithCtx = getLoggerWithCtx(interaction);

    if (broadcastsEnabled !== null) partialConfiguration.broadcastsDisabled = !broadcastsEnabled;

    if (typeof broadcastScheduleCron === 'string') {
      loggerWithCtx.debug('Validating configuration options');
      try {
        const cron = new Cron(broadcastScheduleCron);
        cron.stop();

        partialConfiguration.broadcastCronSchedule = broadcastScheduleCron;
      } catch (err) {
        loggerWithCtx.info({ err }, 'Invalid cron expression found, aborting');
        await sendInteractionReply(interaction, replies.cronValidationError, {
          template: {
            cronExpression: broadcastScheduleCron,
          },
          interaction: {
            flags: MessageFlags.Ephemeral,
          },
        });
        return;
      }
    }

    if (broadcastChannelId) {
      try {
        loggerWithCtx.debug({ channelId: broadcastChannelId }, 'Validating broadcast channel ID');

        const channel = await interaction.guild?.channels.fetch(broadcastChannelId);
        const isValidChannel = BotConfigurationModel.isValidBroadcastChannel(channel);
        if (!isValidChannel) {
          loggerWithCtx.info(
            { channelId: broadcastChannelId },
            'Broadcast channel not found or bot is missing permission, aborting',
          );
          await sendInteractionReply(interaction, replies.channelValidationError, {
            template: {
              channelName: channel?.name,
              missingPermissions: !isValidChannel,
            },
            interaction: {
              flags: MessageFlags.Ephemeral,
            },
          });
          return;
        }

        partialConfiguration.broadcastChannelId = broadcastChannelId;
      } catch (err) {
        loggerWithCtx.error(
          { err, channelId: broadcastChannelId },
          'Error while validating broadcast channel',
        );
        await sendInteractionReply(interaction, replies.channelValidationError, {
          interaction: {
            flags: MessageFlags.Ephemeral,
          },
        });
        return;
      }
    }

    try {
      const guildId = interaction.guild?.id;
      if (!guildId) {
        loggerWithCtx.error('Guild ID not defined in interaction');
        throw new Error('Guild ID not defined');
      }

      loggerWithCtx.info({ guildId }, 'Getting bot configuration for guild ID');
      const existingConfiguration = await BotConfigurationModel.findOne(
        { guildId: guildId },
        { broadcastCronSchedule: 1 },
      );

      loggerWithCtx.info('Updating bot configuration with upsert');
      const updatedConfiguration = await BotConfigurationModel.findOneAndUpdate(
        { guildId: guildId },
        {
          $set: {
            ...partialConfiguration,
            lastModifiedBy: interaction.user.id,
          },
        },
        {
          upsert: true,
          new: true,
        },
      );
      loggerWithCtx.info('Bot configuration successfully updated');

      const messagingService = NotificationService.getInstance();
      messagingService.updateGuildJob(
        guildId,
        updatedConfiguration.broadcastCronSchedule,
        existingConfiguration?.broadcastCronSchedule,
      );

      const broadcastChannel = await updatedConfiguration.resolveBroadcastChannel();
      await sendInteractionReply(interaction, replies.success, {
        template: {
          setupFinished: !!updatedConfiguration.broadcastChannelId,
          setupCommand: interaction.commandName,
          broadcastChannel: broadcastChannel?.name,
          broadcastSchedule: updatedConfiguration.broadcastCronSchedule,
          broadcastsEnabled: !updatedConfiguration.broadcastsDisabled,
          timezone: updatedConfiguration.timezone,
        },
      });
    } catch (err) {
      loggerWithCtx.error({ err }, 'Error during configuration update');
      await sendInteractionReply(interaction, replies.error, {
        interaction: {
          flags: MessageFlags.Ephemeral,
        },
      });
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    const loggerWithCtx = getLoggerWithCtx(interaction);
    const focusedOptionValue = interaction.options.getFocused(true);

    switch (focusedOptionValue.name) {
      case 'broadcast-channel':
        try {
          loggerWithCtx.info('Getting autocomplete options for broadcast channels');

          const guildChannels = (await interaction.guild?.channels.fetch()) ?? new Collection();
          const channelOptions = guildChannels
            .filter(BotConfigurationModel.isValidBroadcastChannel)
            .map((channel) => ({
              // `null` values are already filtered out in `BotConfigurationModel.isValidBroadcastChannel` so
              // we can safely assert the values as strings here
              name: channel?.name as string,
              value: channel?.id as string,
            }));

          if (guildChannels.size === 0)
            loggerWithCtx.debug('No channels with sufficient permissions found');
          else loggerWithCtx.debug(`Found ${channelOptions.length} possible broadcast channels`);

          if (focusedOptionValue.value.trim().length === 0) {
            loggerWithCtx.debug('No input to filter yet, returning first 25 options');
            await interaction.respond(channelOptions.slice(0, 25));
            return;
          }

          loggerWithCtx.debug('Fuzzy searching available channel options');
          const fuse = new Fuse(channelOptions, {
            keys: ['name'],
          });
          const searchResult = fuse.search(focusedOptionValue.value);
          const matchedOptions = searchResult.map((result) => result.item);
          await interaction.respond(matchedOptions);
        } catch (err) {
          loggerWithCtx.error({ err }, 'Failed to get autocomplete options for broadcast channels');
          await interaction.respond([]);
        }
        break;
      case 'timezone':
        loggerWithCtx.info('Getting autocomplete options for timezones');

        const timezones = Intl.supportedValuesOf('timeZone').map((timezone) => ({
          name: timezone,
          value: timezone,
        }));

        if (focusedOptionValue.value.trim().length === 0) {
          loggerWithCtx.debug('No input to filter yet, returning first 25 options');
          await interaction.respond(timezones.slice(0, 25));
          return;
        }

        loggerWithCtx.debug('Fuzzy searching timezone options');
        const fuse = new Fuse(timezones, {
          keys: ['name'],
        });
        const matches = fuse.search(focusedOptionValue.value);

        await interaction.respond(matches.slice(0, 25).map((match) => match.item));
        break;
      default:
        await interaction.respond([]);
    }
  },
};

const replies = {
  success: {
    [Locale.EnglishUS]: discordMessage`
      ${heading(':loudspeaker:  SYSTEM STATUS REPORT  :loudspeaker:')}
      In a realm where every action matters… the bot triumphs once more.

      ${bold('Setup Status')}:  ${inlineCode('{{#setupFinished}}DONE{{/setupFinished}}{{^setupFinished}}PENDING{{/setupFinished}}')}
      ${bold('Broadcast Channel')}:  ${inlineCode('{{#broadcastChannel}}{{{broadcastChannel}}}{{/broadcastChannel}}{{^broadcastChannel}}NOT CONFIGURED{{/broadcastChannel}}')}
      ${bold('Broadcast Schedule')}:  ${inlineCode('{{{broadcastSchedule}}}')}
      ${bold('Broadcasts Enabled')}:  ${inlineCode('{{#broadcastsEnabled}}YES{{/broadcastsEnabled}}{{^broadcastsEnabled}}NO{{/broadcastsEnabled}}')}
      ${bold('Timezone')}:  ${inlineCode('{{{timezone}}}')}

      {{#setupFinished}}
        ${quote(italic('The stage is illuminated, the gears are aligned, and the show goes on without delay.'))}
      {{/setupFinished}}
      {{^setupFinished}}
        ${quote(italic(`The stage is dark. Configure the bot with ${inlineCode('/{{{setupCommand}}}')} to bring the show to life.`))}
      {{/setupFinished}}
    `,
    [Locale.German]: discordMessage`
      ${heading(':loudspeaker:  SYSTEMSTATUSBERICHT  :loudspeaker:')}
      In einem Reich, in dem jede Handlung zählt… triumphiert der Bot erneut.

      ${bold('Setup-Status')}:  ${inlineCode('{{#setupFinished}}ERLEDIGT{{/setupFinished}}{{^setupFinished}}AUSSTEHEND{{/setupFinished}}')}
      ${bold('Broadcast-Kanal')}:  ${inlineCode('{{#broadcastChannel}}{{{broadcastChannel}}}{{/broadcastChannel}}{{^broadcastChannel}}NICHT KONFIGURIERT{{/broadcastChannel}}')}
      ${bold('Broadcast-Zeitplan')}:  ${inlineCode('{{{broadcastSchedule}}}')}
      ${bold('Broadcasts Aktiviert')}:  ${inlineCode('{{#broadcastsEnabled}}JA{{/broadcastsEnabled}}{{^broadcastsEnabled}}NEIN{{/broadcastsEnabled}}')}
      ${bold('Zeitzone')}:  ${inlineCode('{{{timezone}}}')}

      {{#setupFinished}}
        ${quote(italic('Die Bühne ist erleuchtet, alle Zahnräder greifen ineinander, und die Show geht ohne Verzögerung weiter.'))}
      {{/setupFinished}}
      {{^setupFinished}}
        ${quote(italic(`Die Bühne ist dunkel. Verwende ${inlineCode('/{{{setupCommand}}}')}, um die Show zum Leben zu erwecken.`))}
      {{/setupFinished}}
    `,
  },
  cronValidationError: {
    [Locale.EnglishUS]: discordMessage`
      ${heading(':calendar:  SYSTEM ALERT  :calendar:')}
      In a world where everything seems ready… fate intervenes.

      The provided CRON expression ${inlineCode('{{{cronExpression}}}')} is invalid and can thus not be processed. You can use ${hyperlink('this online tool', 'https://crontab.io/validator')} to help you find the issue.

      ${quote(italic(`The bot is prepared, yet the universe conspires.`))}
    `,
    [Locale.German]: discordMessage`
      ${heading(':calendar:  SYSTEMALARM  :calendar:')}
      In einer Welt, in der alles bereit scheint… greift das Schicksal ein.

      Der angegebene CRON-Ausdruck ist invalide und kann daher nicht verarbeitet werden. Du kannst ${hyperlink('dieses Online-Tool', 'https://crontab.io/validator')} benutzen, um deinen Fehler zu finden.

      ${quote(italic(`Der Bot ist bereit, doch das Universum spielt nicht mit.`))}
    `,
  },
  channelValidationError: {
    [Locale.EnglishUS]: discordMessage`
      ${heading(':no_entry:  CHANNEL ACCESS ERROR  :no_entry:')}
      In a world where all paths should be clear… barriers arise.

      The bot cannot access the specified channel {{#channelName}}${inlineCode('{{{channelName}}}')}{{/channelName}}{{#missingPermissions}} due to missing permissions{{/missingPermissions}}{{^missingPermissions}}, it may not exist or is unreachable{{/missingPermissions}}. Please verify the channel settings and permissions.

      ${quote(italic(`The stage is set, yet the doors remain closed. Only once the path is clear can the show continue.`))}
    `,
    [Locale.German]: discordMessage`
      ${heading(':no_entry:  KANALZUGRIFFSFEHLER  :no_entry:')}
      In einer Welt, in der alle Wege frei sein sollten… tauchen Hindernisse auf.

      Der Bot kann auf den angegebenen Kanal {{#channelName}}${inlineCode('{{{channelName}}}')}{{/channelName}}{{#missingPermissions}} aufgrund fehlender Berechtigungen nicht zugreifen{{/missingPermissions}}{{^missingPermissions}}, er existiert möglicherweise nicht oder ist nicht erreichbar{{/missingPermissions}}. Bitte überprüfe die Kanal-Einstellungen und Berechtigungen.

      ${quote(italic(`Die Bühne ist bereitet, doch die Türen bleiben verschlossen. Erst wenn der Weg frei ist, kann die Show weitergehen.`))}
    `,
  },
  error: {
    [Locale.EnglishUS]: discordMessage`
      ${heading(':bangbang:  UNEXPECTED ERROR  :bangbang:')}
      In a world where plans unfold perfectly… chaos strikes unexpectedly.

      An unexpected error occurred while processing your request. The bot tried its best, but fate had other plans.

      ${quote(italic(`The show cannot continue at the moment. Please try again later.`))}
    `,
    [Locale.German]: discordMessage`
      ${heading(':bangbang:  UNERWARTETER FEHLER  :bangbang:')}
      In einer Welt, in der alles nach Plan verläuft… schlägt das Chaos unvermittelt zu.

      Beim Verarbeiten deiner Anfrage ist ein unerwarteter Fehler aufgetreten. Der Bot hat sein Bestes versucht, doch das Schicksal hatte andere Pläne.

      ${quote(italic(`Die Show kann momentan nicht fortgesetzt werden. Bitte versuche es später erneut.`))}
    `,
  },
} as const;
