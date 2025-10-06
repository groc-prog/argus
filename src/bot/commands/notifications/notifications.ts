import {
  bold,
  ChatInputCommandInteraction,
  heading,
  HeadingLevel,
  inlineCode,
  italic,
  Locale,
  MessageFlags,
  quote,
  SlashCommandBuilder,
} from 'discord.js';
import logger from '../../../utilities/logger';
import { message, replyFromTemplate } from '../../../utilities/reply';
import { KeywordType, NotificationModel } from '../../../models/notification';
import dayjs from 'dayjs';

export default {
  data: new SlashCommandBuilder()
    .setName('notifications')
    .setDescription('A complete list of all your notifications.')
    .setDescriptionLocalization(Locale.German, 'Eine Liste aller Benachrichtigungen.'),

  async execute(interaction: ChatInputCommandInteraction) {
    const loggerWithCtx = logger.child({
      userId: interaction.user.id,
      command: interaction.commandName,
    });

    try {
      loggerWithCtx.info('Fetching user notifications');
      const notification = await NotificationModel.findOne(
        { userId: interaction.user.id },
        {
          'entries.name': 1,
          'entries.keywords': 1,
          'entries.sendDms': 1,
          'entries.maxDms': 1,
          'entries.deactivatedAt': 1,
          'entries.lastDmSentAt': 1,
          'entries.expiresAt': 1,
          'entries.dmDayInterval': 1,
        },
      );

      if (!notification) {
        loggerWithCtx.info('No notifications found for user');
        await replyFromTemplate(interaction, replies.noNotifications, {
          interaction: {
            flags: MessageFlags.Ephemeral,
          },
        });
        return;
      }

      loggerWithCtx.info(`Found ${notification.entries.length} notifications`);
      const templateData = notification.entries.map((entry) => ({
        name: entry.name,
        sentDms: entry.sentDms ?? 0,
        maxDms: entry.maxDms,
        lastSent: entry.lastDmSentAt
          ? dayjs(entry.lastDmSentAt).format('YYYY-MM-DD HH:mm:ss')
          : null,
        expiresAt: entry.expiresAt ? dayjs(entry.expiresAt).format('YYYY-MM-DD') : null,
        intervalDays: entry.dmDayInterval,
        keywords: entry.keywords
          .map((keyword) => ({
            isTitleType: keyword.type === KeywordType.MovieTitle,
            value: keyword.value,
          }))
          .sort((a) => (a.isTitleType ? -1 : 1)),
      }));

      await replyFromTemplate(interaction, replies.success, {
        template: {
          entries: templateData,
        },
        interaction: {
          flags: MessageFlags.Ephemeral,
        },
      });
    } catch (err) {
      loggerWithCtx.error({ err }, 'Error while fetching user notifications');
      await replyFromTemplate(interaction, replies.error, {
        interaction: {
          flags: MessageFlags.Ephemeral,
        },
      });
    }
  },
};

const replies = {
  success: {
    [Locale.EnglishUS]: message`
      ${heading(':scroll:  YOUR NOTIFICATIONS  :scroll:')}
      In a world where messages travel like clockwork… your notifications stand ready.

      {{#entries}}
        ${heading('{{{name}}}', HeadingLevel.Two)}

        ${bold('Keywords')}:
        {{#keywords}}
          - ${inlineCode('{{{value}}} {{#isTitleType}}(Title){{/isTitleType}}{{^isTitleType}}(Feature){{/isTitleType}}')}
        {{/keywords}}

        ${bold('Sent')}: ${inlineCode('{{#sentDms}}{{{sentDms}}}{{/sentDms}}{{^sentDms}}0{{/sentDms}}/{{#maxDms}}{{{maxDms}}}{{/maxDms}}{{^maxDms}}∞{{/maxDms}}')}
        ${bold('Last Sent')}: ${inlineCode('{{#lastSent}}{{{lastSent}}}{{/lastSent}}{{^lastSent}}Never{{/lastSent}}')}
        ${bold('Expires At')}: ${inlineCode('{{#expiresAt}}{{{expiresAt}}}{{/expiresAt}}{{^expiresAt}}Never{{/expiresAt}}')}
        ${bold('Interval')}: ${inlineCode('{{{intervalDays}}} day(s)')}

      {{/entries}}

      ${quote(italic(`Each entry stands as a sentinel. Manage them wisely to shape the flow of notifications.`))}
    `,
    [Locale.German]: message`
      ${heading(':scroll:  DEINE BENACHRICHTIGUNGEN  :scroll:')}
      In einer Welt, in der Nachrichten wie Uhrwerke reisen… stehen deine Benachrichtigungen bereit.

      {{#entries}}
        ${heading('{{{name}}}', HeadingLevel.Two)}

        ${bold('Schlüsselwörter')}:
        {{#keywords}}
          - ${inlineCode('{{{value}}} {{#isTitleType}}(Titel){{/isTitleType}}{{^isTitleType}}(Feature){{/isTitleType}}')}
        {{/keywords}}

        ${bold('Gesendet')}: ${inlineCode('{{#sentDms}}{{{sentDms}}}{{/sentDms}}{{^sentDms}}0{{/sentDms}}/{{#maxDms}}{{{maxDms}}}{{/maxDms}}{{^maxDms}}∞{{/maxDms}}')}
        ${bold('Zuletzt gesendet')}: ${inlineCode('{{#lastSent}}{{{lastSent}}}{{/lastSent}}{{^lastSent}}Nie{{/lastSent}}')}
        ${bold('Läuft ab am')}: ${inlineCode('{{#expiresAt}}{{{expiresAt}}}{{/expiresAt}}{{^expiresAt}}Nie{{/expiresAt}}')}
        ${bold('Intervall')}: ${inlineCode('{{{intervalDays}}} Tag(e)')}

      {{/entries}}

      ${quote(italic(`Jeder Eintrag steht wie ein Wächter. Verwalte sie weise, um den Fluss der Benachrichtigungen zu gestalten.`))}
    `,
  },
  noNotifications: {
    [Locale.EnglishUS]: message`
      ${heading(':ghost:  NO NOTIFICATIONS FOUND  :ghost:')}
      In a world where messages echo through time… your list stands silent.

      There are currently no notifications to show. Not a whisper, not a trace — only the faint presence of possibilities yet to come.

      ${quote(italic(`Like a ghost in an empty hall, no notifications linger here. Create one to bring life to the silence.`))}
    `,
    [Locale.German]: message`
      ${heading(':ghost:  KEINE BENACHRICHTIGUNGEN GEFUNDEN  :ghost:')}
      In einer Welt, in der Nachrichten durch die Zeit hallen… bleibt deine Liste still.

      Derzeit gibt es keine Benachrichtigungen anzuzeigen. Kein Flüstern, keine Spur — nur die leise Präsenz von Möglichkeiten, die noch kommen mögen.

      ${quote(italic(`Wie ein Geist in einem leeren Saal verweilen hier keine Benachrichtigungen. Erstelle eine, um das Schweigen zu beleben.`))}
    `,
  },
  error: {
    [Locale.EnglishUS]: message`
      ${heading(':x:  NOTIFICATION LIST ERROR  :x:')}
      In a world where every alert should be accounted for… the scroll of messages remains sealed.

      The bot was unable to retrieve your notifications. Something interfered with the request, and the list could not be delivered.

      ${quote(italic(`Without the list, the story's next chapter stays hidden. Please try again later.`))}
    `,
    [Locale.German]: message`
      ${heading(':x:  FEHLER BEIM ABRUF DER BENACHRICHTIGUNGEN  :x:')}
      In einer Welt, in der jede Warnung gezählt werden sollte… bleibt die Schriftrolle der Nachrichten verschlossen.

      Der Bot konnte deine Benachrichtigungen nicht abrufen. Etwas hat die Anfrage gestört, und die Liste konnte nicht geliefert werden.

      ${quote(italic(`Ohne die Liste bleibt das nächste Kapitel der Geschichte verborgen. Bitte versuche es später erneut.`))}
    `,
  },
} as const;
