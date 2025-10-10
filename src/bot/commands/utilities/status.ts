import {
  bold,
  ChatInputCommandInteraction,
  heading,
  inlineCode,
  InteractionContextType,
  italic,
  Locale,
  quote,
  SlashCommandBuilder,
  subtext,
} from 'discord.js';
import { message, replyFromTemplate } from '../../../utilities/reply';
import { getLoggerWithCtx } from '../../../utilities/logger';
import { BotConfigurationModel } from '../../../models/bot-configuration';
import dayjs from 'dayjs';
import setupCommand from './setup';

export default {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Reveals the current system status and setup of the bot.')
    .setDescriptionLocalization(
      Locale.German,
      'Zeigt den aktuellen Systemstatus und Setup-Status des Bots.',
    )
    .setContexts(InteractionContextType.Guild),

  async execute(interaction: ChatInputCommandInteraction) {
    const logger = getLoggerWithCtx(interaction);

    try {
      logger.info('Fetching bot configuration from database');
      const configuration = await BotConfigurationModel.findOne({ guildId: interaction.guildId });
      if (!configuration || !configuration.broadcastChannelId) {
        logger.info('No bot configuration found for guild');
        await replyFromTemplate(interaction, replies.success, {
          template: {
            latency: dayjs().diff(dayjs(interaction.createdAt), 'ms'),
            setupCommand: setupCommand.data.name,
          },
        });
        return;
      }

      const broadcastChannel = await configuration.resolveBroadcastChannel();
      if (!broadcastChannel) {
        logger.debug('No broadcast channel defined for bot configuration yet');
        await replyFromTemplate(interaction, replies.success, {
          template: {
            latency: dayjs().diff(dayjs(interaction.createdAt), 'ms'),
            setupCommand: setupCommand.data.name,
          },
        });
        return;
      }

      const user = await configuration.resolveLastModifiedUser();
      await replyFromTemplate(interaction, replies.success, {
        template: {
          latency: dayjs().diff(dayjs(interaction.createdAt), 'ms'),
          setupFinished: true,
          broadcastChannel: broadcastChannel.name,
          broadcastSchedule: configuration.broadcastCronSchedule,
          lastModifiedBy: user.displayName,
          setupCommand: setupCommand.data.name,
          broadcastsEnabled: !configuration.broadcastsDisabled,
        },
      });
    } catch (err) {
      logger.error({ err }, 'Error during command execution');
      await replyFromTemplate(interaction, replies.error, {
        template: {
          latency: dayjs().diff(dayjs(interaction.createdAt), 'ms'),
        },
      });
    }
  },
};

const replies = {
  success: {
    [Locale.EnglishUS]: message`
      ${heading(':loudspeaker:  SYSTEM STATUS REPORT  :loudspeaker:')}
      In a world where milliseconds matter, this bot answers the call…

      ${bold('Latency')}:  ${inlineCode('{{{latency}}} ms')}
      ${bold('Setup Status')}:  ${inlineCode('{{#setupFinished}}DONE{{/setupFinished}}{{^setupFinished}}PENDING{{/setupFinished}}')}
      ${bold('Broadcast Channel')}:  ${inlineCode('{{#broadcastChannel}}{{{broadcastChannel}}}{{/broadcastChannel}}{{^broadcastChannel}}NOT CONFIGURED{{/broadcastChannel}}')}
      ${bold('Broadcast Schedule')}:  ${inlineCode('{{#broadcastSchedule}}{{{broadcastSchedule}}}{{/broadcastSchedule}}{{^broadcastSchedule}}NOT CONFIGURED{{/broadcastSchedule}}')}
      ${bold('Broadcasts Enabled')}:  ${inlineCode('{{#broadcastsEnabled}}YES{{/broadcastsEnabled}}{{^broadcastsEnabled}}NO{{/broadcastsEnabled}}')}
      {{#lastModifiedBy}}
        ${subtext(`Configured by:  ${inlineCode('{{{lastModifiedBy}}}')}`)}
      {{/lastModifiedBy}}

      {{#setupFinished}}
        ${quote(italic('The connection is strong. The show goes on without delay.'))}
      {{/setupFinished}}
      {{^setupFinished}}
        ${quote(italic(`The stage is dark. Configure the bot with ${inlineCode('/{{{setupCommand}}}')} to bring the show to life.`))}
      {{/setupFinished}}
    `,
    [Locale.German]: message`
      ${heading(':loudspeaker:  SYSTEMSTATUSBERICHT  :loudspeaker:')}
      In einer Welt, in der jede Millisekunden zählt, antwortet dieser Bot seiner Bestimmung…

      ${bold('Latenz')}:  ${inlineCode('{{{latency}}} ms')}
      ${bold('Setup-Status')}:  ${inlineCode('{{#setupFinished}}ERLEDIGT{{/setupFinished}}{{^setupFinished}}AUSSTEHEND{{/setupFinished}}')}
      ${bold('Broadcast-Kanal')}:  ${inlineCode('{{#broadcastChannel}}{{{broadcastChannel}}}{{/broadcastChannel}}{{^broadcastChannel}}NICHT KONFIGURIERT{{/broadcastChannel}}')}
      ${bold('Broadcast-Zeitplan')}:  ${inlineCode('{{#broadcastSchedule}}{{{broadcastSchedule}}}{{/broadcastSchedule}}{{^broadcastSchedule}}NICHT KONFIGURIERT{{/broadcastSchedule}}')}
      ${bold('Broadcasts Aktiviert')}:  ${inlineCode('{{#broadcastsEnabled}}JA{{/broadcastsEnabled}}{{^broadcastsEnabled}}NEIN{{/broadcastsEnabled}}')}
      {{#lastModifiedBy}}
        ${subtext('Konfiguriert von')}:  ${inlineCode('{{{lastModifiedBy}}}')}
      {{/lastModifiedBy}}

      {{#setupFinished}}
        ${quote(italic('Die Verbindung ist stark. Die Show geht ohne Verzögerung weiter.'))}
      {{/setupFinished}}
      {{^setupFinished}}
        ${quote(italic(`Die Bühne ist dunkel. Verwende ${inlineCode('/{{{setupCommand}}}')}, um die Show zum Leben zu erwecken.`))}
      {{/setupFinished}}
    `,
  },
  error: {
    [Locale.EnglishUS]: message`
      ${heading(':loudspeaker:  SYSTEM STATUS REPORT  :loudspeaker:')}
      In a world where configuration is incomplete… one server awaits a hero.

      ${bold('Latency')}:  ${inlineCode('{{{latency}}} ms')}
      ${bold('Setup Status')}:  ${inlineCode('(no response)')}
      ${bold('Broadcast Channel')}:  ${inlineCode('(no response)')}
      ${bold('Broadcast Schedule')}:  ${inlineCode('(no response)')}

      ${quote(italic(`The lights went out, the show is over. The bot ran into a issue, please try again later.`))}
    `,
    [Locale.German]: message`
      ${heading(':loudspeaker:  SYSTEMSTATUSBERICHT  :loudspeaker:')}
      In einer Welt, in der die Konfiguration unvollständig ist… wartet ein Server auf einen Helden.

      ${bold('Latenz')}:  ${inlineCode('{{{latency}}} ms')}
      ${bold('Setup-Status')}:  ${inlineCode('(keine Antwort)')}
      ${bold('Broadcast-Kanal')}:  ${inlineCode('(keine Antwort)')}
      ${bold('Broadcast-Zeitplan')}:  ${inlineCode('(keine Antwort)')}

      ${quote(italic(`Lichter aus, die Show ist vorbei. Der Bot hatte ein Problem, bitte versuche es später erneut.`))}
    `,
  },
} as const;
