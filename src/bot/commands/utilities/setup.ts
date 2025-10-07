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
import { message, replyFromTemplate } from '../../../utilities/reply';
import { BotConfigurationModel, type BotConfiguration } from '../../../models/bot-configuration';

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
        .setName('broadcast-schedule')
        .setNameLocalization(Locale.German, 'broadcast-zeitplan')
        .setDescription(
          'A CRON expression describing the interval in which the bot will post movie updates.',
        )
        .setDescriptionLocalization(
          Locale.German,
          'Ein CRON-Ausdruck, der beschreibt, in welchem Interval der Bot Film-Updates posten soll.',
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const broadcastChannelId = interaction.options.getString('broadcast-channel');
    const broadcastScheduleCron = interaction.options.getString('broadcast-schedule');
    const partialConfiguration: Partial<BotConfiguration> = {};

    const logger = getLoggerWithCtx(interaction);

    if (typeof broadcastScheduleCron === 'string') {
      logger.info('Validating configuration options');
      try {
        const cron = new Cron(broadcastScheduleCron);
        cron.stop();

        partialConfiguration.broadcastCronSchedule = broadcastScheduleCron;
      } catch (err) {
        logger.info({ err }, 'Invalid cron expression found, aborting');
        await replyFromTemplate(interaction, replies.cronValidationError, {
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
        logger.info({ channelId: broadcastChannelId }, 'Validating broadcast channel ID');

        const channel = await interaction.guild?.channels.fetch(broadcastChannelId);
        const isValidChannel = BotConfigurationModel.isValidBroadcastChannel(channel);
        if (!isValidChannel) {
          logger.info(
            { channelId: broadcastChannelId },
            'Broadcast channel not found or bot is missing permission, aborting',
          );
          await replyFromTemplate(interaction, replies.channelValidationError, {
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
        logger.error(
          { err, channelId: broadcastChannelId },
          'Error while validating broadcast channel',
        );
        await replyFromTemplate(interaction, replies.channelValidationError, {
          interaction: {
            flags: MessageFlags.Ephemeral,
          },
        });
        return;
      }
    }

    try {
      logger.info('Updating bot configuration with upsert');
      const updatedConfiguration = await BotConfigurationModel.findOneAndUpdate(
        { guildId: interaction.guild?.id },
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
      logger.info('Bot configuration successfully updated');

      await replyFromTemplate(interaction, replies.success, {
        template: {
          setupFinished: !!updatedConfiguration.broadcastChannelId,
          setupCommand: interaction.commandName,
          broadcastChannel: await updatedConfiguration.resolveBroadcastChannel(),
          broadcastSchedule: updatedConfiguration.broadcastCronSchedule,
        },
      });
    } catch (err) {
      logger.error({ err }, 'Error during configuration update');
      await replyFromTemplate(interaction, replies.error, {
        interaction: {
          flags: MessageFlags.Ephemeral,
        },
      });
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    const logger = getLoggerWithCtx(interaction);

    try {
      logger.info('Getting autocomplete options for broadcast channels');
      const focusedOptionValue = interaction.options.getFocused();

      const guildChannels = (await interaction.guild?.channels.fetch()) ?? new Collection();
      const channelOptions = guildChannels
        .filter(BotConfigurationModel.isValidBroadcastChannel)
        .map((channel) => ({
          // `null` values are already filtered out in `BotConfigurationModel.isValidBroadcastChannel` so
          // we can safely assert the values as strings here
          name: channel?.name as string,
          value: channel?.id as string,
        }));

      if (guildChannels.size === 0) logger.info('No channels with sufficient permissions found');
      else logger.info(`Found ${channelOptions.length} possible broadcast channels`);

      if (focusedOptionValue.trim().length === 0) {
        logger.debug('No input to filter yet, returning first 25 options');
        await interaction.respond(channelOptions.slice(0, 25));
        return;
      }

      logger.debug('Fuzzy searching available channel options');
      const fuse = new Fuse(channelOptions, {
        keys: ['name'],
      });

      const searchResult = fuse.search(focusedOptionValue);
      const matchedOptions = searchResult.map((result) => result.item);
      await interaction.respond(matchedOptions);
    } catch (err) {
      logger.error({ err }, 'Failed to get autocomplete options for broadcast channels');
      await interaction.respond([]);
    }
  },
};

const replies = {
  success: {
    [Locale.EnglishUS]: message`
      ${heading(':loudspeaker:  SYSTEM STATUS REPORT  :loudspeaker:')}
      In a realm where every action matters… the bot triumphs once more.

      ${bold('Setup Status')}:  ${inlineCode('{{#setupFinished}}DONE{{/setupFinished}}{{^setupFinished}}PENDING{{/setupFinished}}')}
      ${bold('Broadcast Channel')}:  ${inlineCode('{{#broadcastChannel}}{{{broadcastChannel}}}{{/broadcastChannel}}{{^broadcastChannel}}NOT CONFIGURED{{/broadcastChannel}}')}
      ${bold('Broadcast Schedule')}:  ${inlineCode('{{{broadcastSchedule}}}')}

      {{#setupFinished}}
        ${quote(italic('The stage is illuminated, the gears are aligned, and the show goes on without delay.'))}
      {{/setupFinished}}
      {{^setupFinished}}
        ${quote(italic(`The stage is dark. Configure the bot with ${inlineCode('/{{{setupCommand}}}')} to bring the show to life.`))}
      {{/setupFinished}}
    `,
    [Locale.German]: message`
      ${heading(':loudspeaker:  SYSTEMSTATUSBERICHT  :loudspeaker:')}
      In einem Reich, in dem jede Handlung zählt… triumphiert der Bot erneut.

      ${bold('Setup-Status')}:  ${inlineCode('{{#setupFinished}}ERLEDIGT{{/setupFinished}}{{^setupFinished}}AUSSTEHEND{{/setupFinished}}')}
      ${bold('Broadcast-Kanal')}:  ${inlineCode('{{#broadcastChannel}}{{{broadcastChannel}}}{{/broadcastChannel}}{{^broadcastChannel}}NICHT KONFIGURIERT{{/broadcastChannel}}')}
      ${bold('Broadcast-Zeitplan')}:  ${inlineCode('{{{broadcastSchedule}}}')}

      {{#setupFinished}}
        ${quote(italic('Die Bühne ist erleuchtet, alle Zahnräder greifen ineinander, und die Show geht ohne Verzögerung weiter.'))}
      {{/setupFinished}}
      {{^setupFinished}}
        ${quote(italic(`Die Bühne ist dunkel. Verwende ${inlineCode('/{{{setupCommand}}}')}, um die Show zum Leben zu erwecken.`))}
      {{/setupFinished}}
    `,
  },
  cronValidationError: {
    [Locale.EnglishUS]: message`
      ${heading(':bangbang:  SYSTEM ALERT  :bangbang:')}
      In a world where everything seems ready… fate intervenes.

      The provided CRON expression ${inlineCode('{{{cronExpression}}}')} is invalid and can thus not be processed. You can use ${hyperlink('this online tool', 'https://crontab.io/validator')} to help you find the issue.

      ${quote(italic(`The bot is prepared, yet the universe conspires.`))}
    `,
    [Locale.German]: message`
      ${heading(':bangbang:  SYSTEMALARM  :bangbang:')}
      In einer Welt, in der alles bereit scheint… greift das Schicksal ein.

      Der angegebene CRON-Ausdruck ist invalide und kann daher nicht verarbeitet werden. Du kannst ${hyperlink('dieses Online-Tool', 'https://crontab.io/validator')} benutzen, um deinen Fehler zu finden.

      ${quote(italic(`Der Bot ist bereit, doch das Universum spielt nicht mit.`))}
    `,
  },
  channelValidationError: {
    [Locale.EnglishUS]: message`
      ${heading(':no_entry:  CHANNEL ACCESS ERROR  :no_entry:')}
      In a world where all paths should be clear… barriers arise.

      The bot cannot access the specified channel {{#channelName}}${inlineCode('{{{channelName}}}')}{{/channelName}}{{#missingPermissions}} due to missing permissions{{/missingPermissions}}{{^missingPermissions}}, it may not exist or is unreachable{{/missingPermissions}}. Please verify the channel settings and permissions.

      ${quote(italic(`The stage is set, yet the doors remain closed. Only once the path is clear can the show continue.`))}
    `,
    [Locale.German]: message`
      ${heading(':no_entry:  KANALZUGRIFFSFEHLER  :no_entry:')}
      In einer Welt, in der alle Wege frei sein sollten… tauchen Hindernisse auf.

      Der Bot kann auf den angegebenen Kanal {{#channelName}}${inlineCode('{{{channelName}}}')}{{/channelName}}{{#missingPermissions}} aufgrund fehlender Berechtigungen nicht zugreifen{{/missingPermissions}}{{^missingPermissions}}, er existiert möglicherweise nicht oder ist nicht erreichbar{{/missingPermissions}}. Bitte überprüfe die Kanal-Einstellungen und Berechtigungen.

      ${quote(italic(`Die Bühne ist bereitet, doch die Türen bleiben verschlossen. Erst wenn der Weg frei ist, kann die Show weitergehen.`))}
    `,
  },
  error: {
    [Locale.EnglishUS]: message`
      ${heading(':x:  UNEXPECTED ERROR  :x:')}
      In a world where plans unfold perfectly… chaos strikes unexpectedly.

      An unexpected error occurred while processing your request. The bot tried its best, but fate had other plans.

      ${quote(italic(`The show cannot continue at the moment. Please try again later.`))}
    `,
    [Locale.German]: message`
      ${heading(':x:  UNERWARTETER FEHLER  :x:')}
      In einer Welt, in der alles nach Plan verläuft… schlägt das Chaos unvermittelt zu.

      Beim Verarbeiten deiner Anfrage ist ein unerwarteter Fehler aufgetreten. Der Bot hat sein Bestes versucht, doch das Schicksal hatte andere Pläne.

      ${quote(italic(`Die Show kann momentan nicht fortgesetzt werden. Bitte versuche es später erneut.`))}
    `,
  },
} as const;
