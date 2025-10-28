import {
  bold,
  ChatInputCommandInteraction,
  heading,
  HeadingLevel,
  inlineCode,
  Locale,
  MessageFlags,
  SlashCommandBuilder,
  unorderedList,
} from 'discord.js';
import { getLoggerWithCtx } from '../../../utilities/logger';
import { chatMessage, sendInteractionReply } from '../../../utilities/discord';
import { KeywordType, UserModel } from '../../../models/user';
import dayjs from 'dayjs';

export default {
  data: new SlashCommandBuilder()
    .setName('notifications')
    .setDescription('A complete list of all your notifications.')
    .setDescriptionLocalization(Locale.German, 'Eine Liste aller Benachrichtigungen.')
    .addNumberOption((option) =>
      option
        .setName('page')
        .setNameLocalization(Locale.German, 'seite')
        .setDescription('The page to get. Defaults to 1.')
        .setDescriptionLocalization(
          Locale.German,
          'Die Seite, die angezeigt werden soll. Verwendet 1 wenn nicht definiert.',
        )
        .setMinValue(1),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const loggerWithCtx = getLoggerWithCtx(interaction);
    const page = interaction.options.getNumber('page');

    const usedPage = (page ?? 1) - 1;
    const pageSize = 10;

    try {
      loggerWithCtx.info('Getting notifications');
      const user = await UserModel.findOne(
        { discordId: interaction.user.id },
        {
          'notifications.name': 1,
          'notifications.keywords': 1,
          'notifications.sentDms': 1,
          'notifications.maxDms': 1,
          'notifications.deactivatedAt': 1,
          'notifications.lastDmSentAt': 1,
          'notifications.expiresAt': 1,
          'notifications.cooldown': 1,
        },
      );

      if (!user || user.notifications.length === 0) {
        loggerWithCtx.info('No notifications found for user');
        await sendInteractionReply(interaction, replies.noNotifications, {
          interaction: {
            flags: MessageFlags.Ephemeral,
          },
        });
        return;
      }

      loggerWithCtx.info(
        `Found ${user.notifications.length} notifications, preparing template data`,
      );
      const templateData = user.notifications
        .map((entry) => ({
          name: entry.name,
          sentDms: entry.sentDms ?? 0,
          maxDms: entry.maxDms,
          lastSent: entry.lastDmSentAt
            ? dayjs(entry.lastDmSentAt).format('YYYY-MM-DD HH:mm:ss')
            : null,
          expiresAt: entry.expiresAt ? dayjs(entry.expiresAt).format('YYYY-MM-DD') : null,
          intervalDays: entry.cooldown,
          deactivated: !!entry.deactivatedAt,
          keywords: entry.keywords
            .map((keyword) => ({
              isTitleType: keyword.type === KeywordType.MovieTitle,
              value: keyword.value,
            }))
            .sort((a) => (a.isTitleType ? -1 : 1)),
        }))
        .slice(usedPage * pageSize, pageSize)
        .sort((notification) => (notification.deactivated ? 1 : -1));

      if (templateData.length === 0) {
        await sendInteractionReply(interaction, replies.noNotificationsForPage, {
          interaction: {
            flags: MessageFlags.Ephemeral,
          },
        });
        return;
      }

      await sendInteractionReply(interaction, replies.success, {
        template: {
          entries: templateData,
        },
        interaction: {
          flags: MessageFlags.Ephemeral,
        },
      });
    } catch (err) {
      loggerWithCtx.error({ err }, 'Error while getting notifications');
      await sendInteractionReply(interaction, replies.error, {
        interaction: {
          flags: MessageFlags.Ephemeral,
        },
      });
    }
  },
};

const replies = {
  success: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':popcorn:  Your Notifications  :popcorn:')}
      Your notifications are queued and ready.
      {{#entries}}
        ${heading('{{#deactivated}}:no_bell:{{/deactivated}}{{^deactivated}}:mega:{{/deactivated}}  {{{name}}}', HeadingLevel.Two)}

        ${bold('Sent')}: ${inlineCode('{{#sentDms}}{{{sentDms}}}{{/sentDms}}{{^sentDms}}0{{/sentDms}}/{{#maxDms}}{{{maxDms}}}{{/maxDms}}{{^maxDms}}∞{{/maxDms}}')}
        ${bold('Last Sent')}: ${inlineCode('{{#lastSent}}{{{lastSent}}}{{/lastSent}}{{^lastSent}}Never{{/lastSent}}')}
        ${bold('Expires At')}: ${inlineCode('{{#expiresAt}}{{{expiresAt}}}{{/expiresAt}}{{^expiresAt}}Never{{/expiresAt}}')}
        ${bold('Interval')}: ${inlineCode('{{{intervalDays}}} day(s)')}
        ${bold('Keywords')}:
        {{#keywords}}
          ${unorderedList([inlineCode('{{{value}}} {{#isTitleType}}(Title){{/isTitleType}}{{^isTitleType}}(Feature){{/isTitleType}}')])}
        {{/keywords}}
      {{/entries}}
    `,
    [Locale.German]: chatMessage`
      ${heading(':popcorn:  Deine Benachrichtigungen  :popcorn:')}
      Deine Benachrichtigungen sind bereit.
      {{#entries}}
        ${heading('{{#deactivated}}:no_bell:{{/deactivated}}{{^deactivated}}:mega:{{/deactivated}}  {{{name}}}', HeadingLevel.Two)}

        ${bold('Gesendet')}: ${inlineCode('{{#sentDms}}{{{sentDms}}}{{/sentDms}}{{^sentDms}}0{{/sentDms}}/{{#maxDms}}{{{maxDms}}}{{/maxDms}}{{^maxDms}}∞{{/maxDms}}')}
        ${bold('Zuletzt gesendet')}: ${inlineCode('{{#lastSent}}{{{lastSent}}}{{/lastSent}}{{^lastSent}}Nie{{/lastSent}}')}
        ${bold('Läuft ab am')}: ${inlineCode('{{#expiresAt}}{{{expiresAt}}}{{/expiresAt}}{{^expiresAt}}Nie{{/expiresAt}}')}
        ${bold('Intervall')}: ${inlineCode('{{{intervalDays}}} Tag(e)')}
        ${bold('Schlüsselwörter')}:
        {{#keywords}}
          ${unorderedList([inlineCode('{{{value}}} {{#isTitleType}}(Titel){{/isTitleType}}{{^isTitleType}}(Feature){{/isTitleType}}')])}
        {{/keywords}}
      {{/entries}}
    `,
  },
  noNotifications: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':ghost:  No Notifications Yet  :ghost:')}
      You have no notifications at the moment. Create one to start receiving updates :tickets:
    `,
    [Locale.German]: chatMessage`
      ${heading(':ghost:  Keine Benachrichtigungen  :ghost:')}
      Momentan hast du keine Benachrichtigungen. Erstelle eine, um Updates zu erhalten :tickets:
    `,
  },
  noNotificationsForPage: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':empty_nest:  No Notifications On This Page  :empty_nest:')}
      This page does not contain any notifications. Create more to fill this page :tickets:
    `,
    [Locale.German]: chatMessage`
      ${heading(':empty_nest:  Keine Benachrichtigungen Auf Dieser Seite  :empty_nest:')}
      Momentan hast du keine Benachrichtigungen auf dieser Seite. Erstelle mehr, um auch diese Seite zu füllen :tickets:
    `,
  },
  error: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':boom:  Notification List Error  :boom:')}
      Couldn't fetch your notifications. Please try again shortly.
    `,
    [Locale.German]: chatMessage`
      ${heading(':boom:  Fehler beim Abrufen  :boom:')}
      Deine Benachrichtigungen konnten nicht abgerufen werden. Bitte versuche es gleich nochmal.
    `,
  },
} as const;
