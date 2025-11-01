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
import { chatMessage, sendInteractionReply } from '../../../utilities/discord';
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
    const loggerWithCtx = getLoggerWithCtx(interaction);

    try {
      loggerWithCtx.info('Fetching bot configuration from database');
      const configuration = await BotConfigurationModel.findOne({ guildId: interaction.guildId });
      if (!configuration || !configuration.channelId) {
        loggerWithCtx.info('No bot configuration found for guild');
        await sendInteractionReply(interaction, replies.success, {
          template: {
            latency: dayjs().diff(dayjs(interaction.createdAt), 'ms'),
            setupCommand: setupCommand.data.name,
          },
        });
        return;
      }

      const guildNotificationChannel = await configuration.resolveGuildNotificationChannel();
      const user = await configuration.resolveLastModifiedUser();

      await sendInteractionReply(interaction, replies.success, {
        template: {
          latency: dayjs().diff(dayjs(interaction.createdAt), 'ms'),
          setupFinished: true,
          guildNotificationChannel: guildNotificationChannel?.name,
          guildNotificationSchedule: configuration.guildNotificationsCronSchedule,
          lastModifiedBy: user.displayName,
          setupCommand: setupCommand.data.name,
          guildNotificationsEnabled: !configuration.guildNotificationsDisabled,
          timezone: configuration.timezone,
        },
      });
    } catch (err) {
      loggerWithCtx.error({ err }, 'Error during status check');
      await sendInteractionReply(interaction, replies.error, {
        template: {
          latency: dayjs().diff(dayjs(interaction.createdAt), 'ms'),
        },
      });
    }
  },
};

const replies = {
  success: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':clapper:  Status Check-In  :clapper:')}
      Hey there! Just did a quick systems check — here\'s what\'s up :point_down:

      ${bold('Latency')}:  ${inlineCode('{{{latency}}} ms')}
      ${bold('Setup Status')}:  ${inlineCode('{{#setupFinished}}DONE{{/setupFinished}}{{^setupFinished}}PENDING{{/setupFinished}}')}
      ${bold('Channel')}:  ${inlineCode('{{#guildNotificationChannel}}{{{guildNotificationChannel}}}{{/guildNotificationChannel}}{{^guildNotificationChannel}}NOT CONFIGURED{{/guildNotificationChannel}}')}
      ${bold('Schedule')}:  ${inlineCode('{{#guildNotificationSchedule}}{{{guildNotificationSchedule}}}{{/guildNotificationSchedule}}{{^guildNotificationSchedule}}NOT CONFIGURED{{/guildNotificationSchedule}}')}
      ${bold('Guild Notifications Enabled')}:  ${inlineCode('{{#guildNotificationsEnabled}}YES{{/guildNotificationsEnabled}}{{^guildNotificationsEnabled}}NO{{/guildNotificationsEnabled}}')}
      ${bold('Timezone')}:  {{#timezone}}${inlineCode('{{{timezone}}}')}{{/timezone}}{{^timezone}}${inlineCode('Europe/Vienna')}{{/timezone}}

      {{#lastModifiedBy}}
        ${subtext(`(Last tweaked by ${inlineCode('{{{lastModifiedBy}}}')})`)}
      {{/lastModifiedBy}}

      {{#setupFinished}}
        ${quote(italic(":tada: Everything's running smooth! We're good to roll — no lag on the red carpet."))}
      {{/setupFinished}}
      {{^setupFinished}}
        ${quote(italic(`:hourglass_flowing_sand: Almost ready! Use ${inlineCode('/{{{setupCommand}}}')} to finish setup so we can start showing off those movies! :popcorn:`))}
      {{/setupFinished}}
    `,
    [Locale.German]: chatMessage`
      ${heading(':clapper:  Statuscheck  :clapper:')}
      Hey! Ich hab kurz nachgesehen, wie\'s dem Bot geht — hier sind die Details :point_down:

      ${bold('Latenz')}:  ${inlineCode('{{{latency}}} ms')}
      ${bold('Setup-Status')}:  ${inlineCode('{{#setupFinished}}ERLEDIGT{{/setupFinished}}{{^setupFinished}}AUSSTEHEND{{/setupFinished}}')}
      ${bold('Kanal')}:  ${inlineCode('{{#guildNotificationChannel}}{{{guildNotificationChannel}}}{{/guildNotificationChannel}}{{^guildNotificationChannel}}NICHT KONFIGURIERT{{/guildNotificationChannel}}')}
      ${bold('Zeitplan')}:  ${inlineCode('{{#guildNotificationSchedule}}{{{guildNotificationSchedule}}}{{/guildNotificationSchedule}}{{^guildNotificationSchedule}}NICHT KONFIGURIERT{{/guildNotificationSchedule}}')}
      ${bold('Server-Benachrichtigungen Aktiviert')}:  ${inlineCode('{{#guildNotificationsEnabled}}JA{{/guildNotificationsEnabled}}{{^guildNotificationsEnabled}}NEIN{{/guildNotificationsEnabled}}')}
      ${bold('Zeitzone')}:  {{#timezone}}${inlineCode('{{{timezone}}}')}{{/timezone}}{{^timezone}}${inlineCode('Europe/Vienna')}{{/timezone}}

      {{#lastModifiedBy}}
        ${subtext(`(Zuletzt geändert von ${inlineCode('{{{lastModifiedBy}}}')})`)}
      {{/lastModifiedBy}}

      {{#setupFinished}}
        ${quote(':tada: Alles läuft rund! Bereit für die nächste Filmvorstellung.')}
      {{/setupFinished}}
      {{^setupFinished}}
        ${quote(`:hourglass_flowing_sand: Fast fertig! Verwende ${inlineCode('/{{{setupCommand}}}')}, um die Einrichtung abzuschließen. Dann geht's richtig los! :popcorn:`)}
      {{/setupFinished}}
    `,
  },
  error: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':clapper:  Status Check-In  :clapper:')}
      Uh oh :scream_cat: looks like something went off-script while checking the system.

      ${bold('Latency')}:  ${inlineCode('{{{latency}}} ms')}
      ${bold('Setup Status')}:  ${inlineCode('(no response)')}
      ${bold('Channel')}:  ${inlineCode('(no response)')}
      ${bold('Schedule')}:  ${inlineCode('(no response)')}
      ${bold('Timezone')}:  ${inlineCode('(no response)')}

      ${quote(italic(':rotating_light: The bot hit a snag! Give it a bit and try again — the show must go on soon.'))}
    `,
    [Locale.German]: chatMessage`
      ${heading(':clapper:  Statuscheck  :clapper:')}
      Oops :scream_cat: beim Systemcheck ist wohl was schiefgelaufen.

      ${bold('Latenz')}:  ${inlineCode('{{{latency}}} ms')}
      ${bold('Setup-Status')}:  ${inlineCode('(keine Antwort)')}
      ${bold('Kanal')}:  ${inlineCode('(keine Antwort)')}
      ${bold('Zeitplan')}:  ${inlineCode('(keine Antwort)')}
      ${bold('Zeitzone')}:  ${inlineCode('(keine Antwort)')}

      ${quote(italic(":rotating_light: Der Bot hatte ein kleines Problem! Warte kurz und versuch's dann nochmal — die Show geht bald weiter."))}
    `,
  },
} as const;
