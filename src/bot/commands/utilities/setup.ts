import {
  AutocompleteInteraction,
  bold,
  ChatInputCommandInteraction,
  Collection,
  heading,
  hyperlink,
  inlineCode,
  InteractionContextType,
  Locale,
  MessageFlags,
  quote,
  SlashCommandBuilder,
} from 'discord.js';
import { getLoggerWithCtx } from '../../../utilities/logger';
import Fuse from 'fuse.js';
import { Cron } from 'croner';
import { chatMessage, sendInteractionReply } from '../../../utilities/discord';
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
        .setName('channel')
        .setNameLocalization(Locale.German, 'kanal')
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
        .setDescription('The timezone used for guild notifications')
        .setDescriptionLocalization(
          Locale.German,
          'Die Zeitzone, die bei Server-Benachrichtigungen benutzt wird',
        )
        .setAutocomplete(true),
    )
    .addStringOption((option) =>
      option
        .setName('schedule')
        .setNameLocalization(Locale.German, 'intervall')
        .setDescription(
          'A CRON expression describing the interval in which the bot will post movie updates.',
        )
        .setDescriptionLocalization(
          Locale.German,
          'Ein CRON-Ausdruck, der beschreibt, in welchem Intervall der Bot Film-Updates posten soll.',
        ),
    )
    .addBooleanOption((option) =>
      option
        .setName('enabled')
        .setNameLocalization(Locale.German, 'benachrichtigungen-aktiviert')
        .setDescription('Whether the bot should post movie updates in the server.')
        .setDescriptionLocalization(
          Locale.German,
          'Ob der Bot Film-Updates in dem server posten soll.',
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const channelId = interaction.options.getString('channel');
    const guildNotificationsSchedule = interaction.options.getString('schedule');
    const guildNotificationsEnabled = interaction.options.getBoolean('enabled');
    const partialConfiguration: Partial<BotConfiguration> = {};

    const loggerWithCtx = getLoggerWithCtx(interaction);

    if (guildNotificationsEnabled !== null)
      partialConfiguration.guildNotificationsDisabled = !guildNotificationsEnabled;

    if (typeof guildNotificationsSchedule === 'string') {
      loggerWithCtx.debug('Validating configuration options');
      try {
        const cron = new Cron(guildNotificationsSchedule);
        cron.stop();

        partialConfiguration.guildNotificationsCronSchedule = guildNotificationsSchedule;
      } catch (err) {
        loggerWithCtx.info({ err }, 'Invalid cron expression found, aborting');
        await sendInteractionReply(interaction, replies.cronValidationError, {
          template: {
            cronExpression: guildNotificationsSchedule,
          },
          interaction: {
            flags: MessageFlags.Ephemeral,
          },
        });
        return;
      }
    }

    if (channelId) {
      try {
        loggerWithCtx.debug({ channelId: channelId }, 'Validating channel ID');

        const channel = await interaction.guild?.channels.fetch(channelId);
        const isValidChannel = BotConfigurationModel.isValidChannel(channel);
        if (!isValidChannel) {
          loggerWithCtx.info(
            { channelId: channelId },
            'Channel not found or bot is missing permission, aborting',
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

        partialConfiguration.channelId = channelId;
      } catch (err) {
        loggerWithCtx.error({ err, channelId: channelId }, 'Error while validating channel');
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
        { guildNotificationsCronSchedule: 1 },
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
        updatedConfiguration.guildNotificationsCronSchedule,
        existingConfiguration?.guildNotificationsCronSchedule,
      );

      const guildNotificationChannel = await updatedConfiguration.resolveGuildNotificationChannel();
      await sendInteractionReply(interaction, replies.success, {
        template: {
          setupFinished: !!updatedConfiguration.channelId,
          setupCommand: interaction.commandName,
          guildNotificationChannel: guildNotificationChannel?.name,
          guildNotificationSchedule: updatedConfiguration.guildNotificationsCronSchedule,
          guildNotificationsEnabled: !updatedConfiguration.guildNotificationsDisabled,
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
      case 'channel':
        try {
          loggerWithCtx.info('Getting autocomplete options for channels');

          const guildChannels = (await interaction.guild?.channels.fetch()) ?? new Collection();
          const channelOptions = guildChannels
            .filter(BotConfigurationModel.isValidChannel)
            .map((channel) => ({
              // `null` values are already filtered out in `BotConfigurationModel.isValidChannel` so
              // we can safely assert the values as strings here
              name: channel?.name as string,
              value: channel?.id as string,
            }));

          if (guildChannels.size === 0)
            loggerWithCtx.debug('No channels with sufficient permissions found');
          else loggerWithCtx.debug(`Found ${channelOptions.length} possible channels`);

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
          loggerWithCtx.error({ err }, 'Failed to get autocomplete options for channels');
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
    [Locale.EnglishUS]: chatMessage`
      ${heading(':clapper:  Status Check-In :clapper:')}
      Hey hey! Just checked how everything\'s running — here\'s the scoop :point_down:

      ${bold('Setup Status')}:  ${inlineCode('{{#setupFinished}}DONE{{/setupFinished}}{{^setupFinished}}PENDING{{/setupFinished}}')}
      ${bold('Channel')}:  ${inlineCode('{{#guildNotificationChannel}}{{{guildNotificationChannel}}}{{/guildNotificationChannel}}{{^guildNotificationChannel}}NOT CONFIGURED{{/guildNotificationChannel}}')}
      ${bold('Schedule')}:  ${inlineCode('{{{guildNotificationSchedule}}}')}
      ${bold('Guild Notifications Enabled')}:  ${inlineCode('{{#guildNotificationsEnabled}}YES{{/guildNotificationsEnabled}}{{^guildNotificationsEnabled}}NO{{/guildNotificationsEnabled}}')}
      ${bold('Timezone')}:  {{#timezone}}${inlineCode('{{{timezone}}}')}{{/timezone}}{{^timezone}}${inlineCode('Europe/Vienna')}{{/timezone}}

      {{#setupFinished}}
        ${quote(":tada: Everything's good to go! The bot's ready, the lights are on, and the show is rolling.")}
      {{/setupFinished}}
      {{^setupFinished}}
        ${quote(`:hourglass_flowing_sand: Almost there! Run ${inlineCode('/{{{setupCommand}}}')} to finish setting things up and get the updates rolling. :popcorn:`)}
      {{/setupFinished}}
    `,
    [Locale.German]: chatMessage`
      ${heading(':clapper:  Statuscheck  :clapper:')}
      Hey! Ich hab kurz nachgesehen, wie\'s dem Bot geht — hier die wichtigsten Infos :point_down:

      ${bold('Setup-Status')}:  ${inlineCode('{{#setupFinished}}ERLEDIGT{{/setupFinished}}{{^setupFinished}}AUSSTEHEND{{/setupFinished}}')}
      ${bold('Kanal')}:  ${inlineCode('{{#guildNotificationChannel}}{{{guildNotificationChannel}}}{{/guildNotificationChannel}}{{^guildNotificationChannel}}NICHT KONFIGURIERT{{/guildNotificationChannel}}')}
      ${bold('Zeitplan')}:  ${inlineCode('{{{guildNotificationSchedule}}}')}
      ${bold('Server-Benachrichtigungen Aktiviert')}:  ${inlineCode('{{#guildNotificationsEnabled}}JA{{/guildNotificationsEnabled}}{{^guildNotificationsEnabled}}NEIN{{/guildNotificationsEnabled}}')}
      ${bold('Zeitzone')}:  {{#timezone}}${inlineCode('{{{timezone}}}')}{{/timezone}}{{^timezone}}${inlineCode('Europe/Vienna')}{{/timezone}}

      {{#setupFinished}}
        ${quote(':tada: Alles läuft rund! Der Bot ist bereit, die Lichter sind an — Film ab!')}
      {{/setupFinished}}
      {{^setupFinished}}
        ${quote(`:hourglass_flowing_sand: Fast fertig! Verwende ${inlineCode('/{{{setupCommand}}}')}, um die Einrichtung abzuschließen. Dann geht's los! :popcorn:`)}
      {{/setupFinished}}
    `,
  },
  cronValidationError: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':calendar:  Invalid Schedule  :calendar:')}
      Hmm… looks like the CRON expression you entered (${inlineCode('{{{cronExpression}}}')}) doesn\'t quite add up :thinking:

      You can double-check it with ${hyperlink('this online tool', 'https://crontab.io/validator')} — that should help spot what\'s off.
    `,
    [Locale.German]: chatMessage`
      ${heading(':calendar:  Ungültiger CRON-Ausdruck  :calendar:')}
      Hmm… der angegebene CRON-Ausdruck (${inlineCode('{{{cronExpression}}}')}) scheint nicht ganz zu passen :thinking:

      Du kannst ${hyperlink('dieses Online-Tool', 'https://crontab.io/validator')} verwenden, um den Fehler zu finden.
    `,
  },
  channelValidationError: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':no_entry_sign:  Channel Access Issue  :no_entry_sign:')}
      Uh oh! The bot can\'t reach the channel{{#channelName}} ${inlineCode('{{{channelName}}}')}{{/channelName}}. {{#missingPermissions}}It looks like it\'s missing some permissions.{{/missingPermissions}}{{^missingPermissions}}It might not exist anymore or is currently out of reach.{{/missingPermissions}}

      Mind giving the channel settings a quick check? That should clear things up.
    `,
    [Locale.German]: chatMessage`
      ${heading(':no_entry_sign:  Berechtigungsproblem  :no_entry_sign:')}
      Oh nein! Der Bot kann den Kanal{{#channelName}} ${inlineCode('{{{channelName}}}')}{{/channelName}} nicht erreichen. {{#missingPermissions}}Scheint, als fehlen ihm ein paar Berechtigungen.{{/missingPermissions}}{{^missingPermissions}}Der Kanal existiert vielleicht nicht mehr oder ist momentan nicht erreichbar.{{/missingPermissions}}

      Bitte prüfe kurz die Kanal-Einstellungen, dann sollte alles wieder laufen.
    `,
  },
  error: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':boom:  Oh No! Something Broke  :boom:')}
      Yikes! Something unexpected just happened while processing your request :scream_cat:

      The bot tried its best, but something went off-script.

      ${quote(":rotating_light: Let's give it a moment — try again soon and we'll get the show rolling again!")}
    `,
    [Locale.German]: chatMessage`
      ${heading(':boom:  Och Ne! Irgendwas Ist Am Arsch  :boom:')}
      Uff! Beim Verarbeiten deiner Anfrage ist etwas Unvorhergesehenes passiert :scream_cat:

      Der Bot hat sein Bestes gegeben, aber irgendwas lief nicht nach Plan.

      ${quote(':rotating_light: Gib ihm kurz Zeit — bald läuft die Show wieder!')}
    `,
  },
} as const;
