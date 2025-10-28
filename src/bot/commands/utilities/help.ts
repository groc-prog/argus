import {
  AutocompleteInteraction,
  bold,
  ChatInputCommandInteraction,
  heading,
  HeadingLevel,
  hyperlink,
  inlineCode,
  Locale,
  MessageFlags,
  quote,
  SlashCommandBuilder,
  unorderedList,
} from 'discord.js';
import { client } from '../../client';
import statusCommand from '../utilities/status';
import setupCommand from '../utilities/setup';
import addNotificationCommand from '../users/add';
import listNotificationCommand from '../users/notifications';
import deleteNotificationCommand from '../users/delete';
import setPreferencesCommand from '../users/set-preferences';
import reactivateNotificationCommand from '../users/reactivate';
import movieFeaturesCommand from '../movies/features';
import movieDetailsCommand from '../movies/details';
import movieScreeningsCommand from '../movies/screenings';
import { chatMessage, sendInteractionReply } from '../../../utilities/discord';
import Fuse from 'fuse.js';
import { getLoggerWithCtx } from '../../../utilities/logger';

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Additional usage information for all commands.')
    .setDescriptionLocalization(
      Locale.German,
      'Zusätzliche Verwendungsinformationen für alle Befehle.',
    )
    .addStringOption((option) =>
      option
        .setName('command')
        .setNameLocalization(Locale.German, 'befehl')
        .setDescription('The command you need help with.')
        .setDescriptionLocalization(Locale.German, 'Der Befehl, bei dem du Hilfe benötigst')
        .setRequired(true)
        .setAutocomplete(true),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const command = interaction.options.getString('command', true);

    if (command in replies) {
      await sendInteractionReply(interaction, replies[command] as typeof replies.unknown, {
        template: {
          botName: client.user?.displayName,
        },
        interaction: {
          flags: MessageFlags.Ephemeral,
        },
      });
    } else {
      await sendInteractionReply(interaction, replies.unknown, {
        interaction: {
          flags: MessageFlags.Ephemeral,
        },
      });
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    const logger = getLoggerWithCtx(interaction);

    const focusedOptionValue = interaction.options.getFocused();
    const commands = client.commands
      .values()
      .filter((command) => command.data.name !== this.data.name)
      .map((command) => ({ name: command.data.name, value: command.data.name }))
      .toArray();

    if (focusedOptionValue.trim().length === 0) {
      logger.debug('No input to filter yet, returning first 25 options');
      await interaction.respond(commands.slice(0, 25));
      return;
    }

    logger.debug('Fuzzy searching available channel options');
    const fuse = new Fuse(commands, {
      keys: ['name'],
    });
    const matches = fuse.search(focusedOptionValue);

    await interaction.respond(matches.slice(0, 25).map((match) => match.item));
  },
};

const replies = {
  [statusCommand.data.name]: {
    [Locale.EnglishUS]: chatMessage`
    ${heading(':beginner:  Bot Status  :beginner:')}
    ${bold('Command')}:  ${inlineCode(`/${statusCommand.data.name}`)}
    ${bold('Purpose')}:  ${inlineCode('Show the current system status and setup of the bot')}

    ${heading('Use this command to', HeadingLevel.Three)}
    ${unorderedList([
      `Check the current ${inlineCode('latency')} between the bot and Discord.`,
      `See whether the bot setup has been completed or is still ${inlineCode('pending')}.`,
      `View the currently configured ${inlineCode('channel')} for guild notifications.`,
      `View the ${inlineCode('schedule')} the bot is using for guild notifications (if configured).`,
      `Find out who last modified the bot configuration.`,
    ])}

    ${quote(`If setup has not been completed, you'll see a note telling you to run ${inlineCode(`/${setupCommand.data.name}`)}.`)}
  `,
    [Locale.German]: chatMessage`
    ${heading(':beginner:  Bot-Status  :beginner:')}
    ${bold('Befehl')}:  ${inlineCode(`/${statusCommand.data.name}`)}
    ${bold('Zweck')}:  ${inlineCode('Zeigt den aktuellen Systemstatus und Setup-Status des Bots an')}

    ${heading('Du kannst diesen Befehl verwenden, um', HeadingLevel.Three)}
    ${unorderedList([
      `Die aktuelle ${inlineCode('Latenz')} zwischen Bot und Discord abzufragen.`,
      `Zu sehen, ob das Setup des Bots abgeschlossen ist oder noch ${inlineCode('ausstehend')} ist.`,
      `Den aktuell konfigurierten ${inlineCode('Kanal')} für Server-Benachrichtigungen anzuzeigen.`,
      `Den ${inlineCode('Zeitplan')} für Benachrichtigungen einzusehen, den der Bot verwendet (falls konfiguriert).`,
      `Herauszufinden, wer die Bot-Konfiguration zuletzt geändert hat.`,
    ])}

    ${quote(`Wenn das Setup noch nicht abgeschlossen ist, bekommst du einen Hinweis, ${inlineCode(`/${setupCommand.data.name}`)} auszuführen.`)}
  `,
  },
  [setupCommand.data.name]: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':beginner:  Setup  :beginner:')}

      ${bold('Command')}:  ${inlineCode(`/${setupCommand.data.name}`)}
      ${bold('Purpose')}:  ${inlineCode('Configure the bot')}

      ${heading('Use this command to', HeadingLevel.Three)}
      ${unorderedList([
        `Select the ${inlineCode('channel')} where messages will be posted.`,
        `Define the ${inlineCode('notification schedule')} with a valid CRON expression.`,
        'Save your settings so the bot can operate automatically',
      ])}

      ${heading('What is CRON?', HeadingLevel.Three)}
      ${inlineCode('CRON expressions')} are a compact way to define recurring schedules. If you need help building one, try ${hyperlink('this validator', 'https://crontab.io/validator')} or read the basics ${hyperlink('here', 'https://en.wikipedia.org/wiki/Cron#Cron_expression')}.
    `,
    [Locale.German]: chatMessage`
      ${heading(':beginner:  Setup  :beginner:')}

      ${bold('Befehl')}:  ${inlineCode(`/${setupCommand.data.name}`)}
      ${bold('Zweck')}:  ${inlineCode('Bot für Übertragungen konfigurieren')}

      ${heading('Du kannst diesen Befehl verwendet, um', HeadingLevel.Three)}
      ${unorderedList([
        `Den ${inlineCode('Kanal')} auszuwählen, in dem Nachrichten gesendet werden`,
        `Den ${inlineCode('Benachrichtigungs-Zeitplan')} mit einem gültigen CRON-Ausdruck festzulegen`,
        'Deine Einstellungen zu speichern, damit der Bot automatisch arbeiten kann',
      ])}

      ${heading('Was ist CRON?', HeadingLevel.Three)}
      ${hyperlink('CRON-Ausdrücke', 'https://de.wikipedia.org/wiki/Cron#Beispiele')} sind ein kompaktes Format für wiederkehrende Zeitpläne. Hilfe beim Erstellen findest du z.B. bei ${hyperlink('https://crontab.io/validator', 'https://crontab.io/validator')}.
    `,
  },
  [addNotificationCommand.data.name]: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':beginner:  New Notification  :beginner:')}
      ${bold('Command')}:  ${inlineCode(`/${addNotificationCommand.data.name}`)}
      ${bold('Purpose')}:  ${inlineCode('Create new movie notifications')}

      ${heading('Use this command to', HeadingLevel.Three)}
      ${unorderedList([
        `Create a notification by giving it a unique ${inlineCode('name')}`,
        `Define one (or multiple) movie titles or features to watch for. See all features with ${inlineCode(`/${movieFeaturesCommand.data.name}`)}.`,
      ])}

      ${heading('How title & feature filtering works', HeadingLevel.Three)}
      Add one or more keywords per notification. For multiple entries, separate them with semicolons. Keywords are ${bold('not')} case-sensitive and are matched ${bold('together')}.
      {{{botName}}} runs a ${inlineCode('fuzzy search')} across currently shown movies and DMs you if there’s a match.

      Example: if you create a notification for ${inlineCode('duNne')} with feature ${inlineCode('3D')}, {{{botName}}} will look for titles roughly matching ${inlineCode('duNne')} that also have ${inlineCode('3D')}. If found, you get a DM.
    `,
    [Locale.German]: chatMessage`
      ${heading(':beginner:  Neue Benachrichtigung  :beginner:')}
      ${bold('Befehl')}:  ${inlineCode(`/${addNotificationCommand.data.name}`)}
      ${bold('Zweck')}:  ${inlineCode('Neue Filmbenachrichtigungen anlegen')}

      ${heading('Du kannst diesen Befehl verwendet, um', HeadingLevel.Three)}
      ${unorderedList([
        `Eine Benachrichtigung zu erstellen, indem du ihr einen eindeutigen ${inlineCode('Namen')} gibst`,
        `Einen oder mehrere Filmtitel oder Features festzulegen, nach denen gesucht werden soll. Alle Features siehst du mit ${inlineCode(`/${movieFeaturesCommand.data.name}`)}.`,
      ])}

      ${heading('So funktioniert das Filtern nach Titeln & Features', HeadingLevel.Three)}
      Gib ein oder mehrere Schlüsselwörter pro Benachrichtigung an. Mehrere Einträge trennst du mit Semikolons. Schlüsselwörter sind ${bold('nicht')} case-sensitive und werden ${bold('zusammen')} verwendet.
      {{{botName}}} nutzt eine ${inlineCode('unscharfe Suche')} über aktuell gezeigte Filme und schickt dir eine DM, wenn was passt.

      Beispiel: Erstellst du eine Benachrichtigung für ${inlineCode('duNne')} + ${inlineCode('3D')}, sucht {{{botName}}} nach Titeln, die ungefähr ${inlineCode('duNne')} entsprechen und ${inlineCode('3D')} haben. Gefunden = DM an dich.
    `,
  },
  [listNotificationCommand.data.name]: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':beginner:  Your Notifications  :beginner:')}
      ${bold('Command')}:  ${inlineCode(`/${listNotificationCommand.data.name}`)}
      ${bold('Purpose')}:  ${inlineCode('Display all your active notifications')}

      ${heading('Use this command to', HeadingLevel.Three)}
      ${unorderedList([
        'See all notifications you have created.',
        `Review each notification's ${inlineCode('name')} and its ${inlineCode('keywords')}.`,
        'Check how many times each has been sent, when the last notification was triggered, and any expiration dates.',
        `Understand the sending ${inlineCode('interval')} for each notification.`,
      ])}
    `,
    [Locale.German]: chatMessage`
      ${heading(':beginner:  Deine Benachrichtigungen  :beginner:')}
      ${bold('Befehl')}:  ${inlineCode(`/${listNotificationCommand.data.name}`)}
      ${bold('Zweck')}:  ${inlineCode('Zeige alle aktiven Benachrichtigungen an')}

      ${heading('Verwende diesen Befehl, um', HeadingLevel.Three)}
      ${unorderedList([
        'Alle von dir erstellten Benachrichtigungen zu sehen.',
        `Den ${inlineCode('Name')} und die ${inlineCode('Schlüsselwörter')} jeder Benachrichtigung zu überprüfen.`,
        'Zu sehen, wie oft jede bereits gesendet wurde, wann die letzte Benachrichtigung ausgelöst wurde und ob ein Ablaufdatum besteht.',
        `Das Sende-${inlineCode('Intervall')} jeder Benachrichtigung zu verstehen.`,
      ])}
    `,
  },
  [deleteNotificationCommand.data.name]: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':beginner:  Delete Notification  :beginner:')}
      ${bold('Command')}:  ${inlineCode(`/${deleteNotificationCommand.data.name}`)}
      ${bold('Purpose')}:  ${inlineCode('Remove an existing notification')}

      ${heading('Use this command to', HeadingLevel.Three)}
      ${unorderedList([
        'Remove a notification that is no longer needed.',
        'Keep your notifications organized and relevant.',
        'Ensure that only the notifications you want continue to trigger.',
      ])}
    `,
    [Locale.German]: chatMessage`
      ${heading(':beginner:  beanchrichtigung Löschen  :beginner:')}
      ${bold('Befehl')}:  ${inlineCode(`/${deleteNotificationCommand.data.name}`)}
      ${bold('Zweck')}:  ${inlineCode('Eine bestehende Benachrichtigung entfernen')}

      ${heading('Verwende diesen Befehl, um', HeadingLevel.Three)}
      ${unorderedList([
        'Eine Benachrichtigung zu entfernen, die nicht mehr benötigt wird.',
        'Deine Benachrichtigungen organisiert und relevant zu halten.',
        'Sicherzustellen, dass nur die gewünschten Benachrichtigungen weiterhin ausgelöst werden.',
      ])}
    `,
  },
  [reactivateNotificationCommand.data.name]: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':beginner:  Reactivate Notification  :beginner:')}
      ${bold('Command')}:  ${inlineCode(`/${reactivateNotificationCommand.data.name}`)}
      ${bold('Purpose')}:  ${inlineCode('Reactivates a previously deactivated notification')}

      ${heading('Use this command to', HeadingLevel.Three)}
      ${unorderedList([
        'Restore a deactivated notification.',
        'Resume receiving messages for an existing setup.',
        'Bring back a notification that once fell silent.',
      ])}
    `,
    [Locale.German]: chatMessage`
      ${heading(':beginner:  Beanchrichtigung Reaktivieren  :beginner:')}
      ${bold('Befehl')}:  ${inlineCode(`/${reactivateNotificationCommand.data.name}`)}
      ${bold('Zweck')}:  ${inlineCode('Reaktiviert eine zuvor deaktivierte Benachrichtigung')}

      ${heading('Verwende diesen Befehl, um', HeadingLevel.Three)}
      ${unorderedList([
        'Eine deaktivierte Benachrichtigung wiederherzustellen.',
        'Den Empfang von Nachrichten für eine bestehende Konfiguration fortzusetzen.',
        'Eine Benachrichtigung zurückzubringen, die einst verstummte.',
      ])}
    `,
  },
  [setPreferencesCommand.data.name]: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':beginner:  Set Preferences  :beginner:')}
      ${bold('Command')}:  ${inlineCode(`/${setPreferencesCommand.data.name}`)}
      ${bold('Purpose')}:  ${inlineCode('Sets your preferences (timezone, locale, etc.) for later use')}

      ${heading('Use this command to', HeadingLevel.Three)}
      ${unorderedList([
        `Set your current timezone so the bot can correctly handle notifications and other movie updates. If no timezone is defined, defaults to ${inlineCode('Europe/Vienna')}.`,
        `Set your locale so the bot can communicate with you. If no locale is defined, defaults to ${inlineCode(Locale.EnglishUS)}.`,
      ])}

      Make sure your timezone is correct so notifications come at the right time.
    `,
    [Locale.German]: chatMessage`
      ${heading(':beginner:  Präferenzen Setzen  :beginner:')}
      ${bold('Befehl')}:  ${inlineCode(`/${setPreferencesCommand.data.name}`)}
      ${bold('Zweck')}:  ${inlineCode('Legt deine Präferenzen (Zeitzone, Sprache, uws.) für die spätere Verwendung fest')}

      ${heading('Verwende diesen Befehl, um', HeadingLevel.Three)}
      ${unorderedList([
        `Deine aktuelle Zeitzone festzulegen, damit der Bot Benachrichtigungen und andere Film-Updates korrekt handhaben kann. Wenn keine Zeitzone definiert ist, wird standardmäßig ${inlineCode('Europe/Vienna')} verwendet.`,
        `Deine Sprache festzulegen, damit der Bot sich mit dir verständigen kann. Wenn keine Sprache definiert ist, wird standardmäßig ${inlineCode(Locale.EnglishUS)} verwendet.`,
      ])}

      Stelle sicher, dass deine Zeitzone stimmt, damit Benachrichtigungen zur richtigen Zeit kommen.
    `,
  },
  [movieFeaturesCommand.data.name]: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':beginner:  Supported Movie Features  :beginner:')}
      ${bold('Command')}:  ${inlineCode(`/${movieFeaturesCommand.data.name}`)}
      ${bold('Purpose')}:  ${inlineCode('Display all known movie features recognized by the bot')}

      ${heading('Use this command to', HeadingLevel.Three)}
      ${unorderedList([
        'Discover all features that can be used when creating notifications.',
        `Learn which ${inlineCode('features')} make a movie eligible for alerts.`,
        'Ensure you are using valid and recognized feature names.',
        `Get inspiration for customizing your ${inlineCode(`/${addNotificationCommand.data.name}`)} notifications.`,
      ])}
    `,
    [Locale.German]: chatMessage`
      ${heading(':beginner:  Unterstützte Schlüsselwörter  :beginner:')}
      ${bold('Befehl')}:  ${inlineCode(`/${movieFeaturesCommand.data.name}`)}
      ${bold('Zweck')}:  ${inlineCode('Zeigt alle vom Bot erkannten Film-Features an')}

      ${heading('Verwende diesen Befehl, um', HeadingLevel.Three)}
      ${unorderedList([
        'Alle Features zu entdecken, die beim Erstellen von Benachrichtigungen verwendet werden können.',
        `Zu erfahren, welche ${inlineCode('Features')} einen Film für Benachrichtigungen qualifizieren.`,
        'Sicherzustellen, dass du gültige und erkannte Feature-Namen verwendest.',
        `Inspiration für die Anpassung deiner ${inlineCode(`/${addNotificationCommand.data.name}`)}-Benachrichtigungen zu erhalten.`,
      ])}
    `,
  },
  [movieDetailsCommand.data.name]: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':beginner:  Movie Details  :beginner:')}
      ${bold('Command')}:  ${inlineCode(`/${movieDetailsCommand.data.name}`)}
      ${bold('Purpose')}:  ${inlineCode('Show detailed information about a specific movie.')}

      ${heading('Use this command to', HeadingLevel.Three)}
      ${unorderedList([
        'Discover the description, genres, and age rating of a movie.',
        'See its total runtime in minutes.',
      ])}

      Use ${inlineCode(`/${movieScreeningsCommand.data.name}`)} to check upcoming showtimes.
    `,
    [Locale.German]: chatMessage`
      ${heading(':beginner:  Filmdetails  :beginner:')}
      ${bold('Befehl')}:  ${inlineCode(`/${movieDetailsCommand.data.name}`)}
      ${bold('Zweck')}:  ${inlineCode('Zeige detaillierte Informationen zu einem bestimmten Film an.')}

      ${heading('Verwende diesen Befehl, um', HeadingLevel.Three)}
      ${unorderedList([
        'Die Beschreibung, Genres und Altersfreigabe eines Films zu entdecken.',
        'Die Gesamtlaufzeit in Minuten zu sehen.',
      ])}

      Nutze ${inlineCode(`/${movieScreeningsCommand.data.name}`)}, um die nächsten Vorführungen zu prüfen.
    `,
  },
  [movieScreeningsCommand.data.name]: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':beginner:  Movie Screenings  :beginner:')}
      ${bold('Command')}:  ${inlineCode(`/${movieScreeningsCommand.data.name}`)}
      ${bold('Purpose')}:  ${inlineCode('Display all scheduled screenings for a specific movie.')}

      ${heading('Use this command to', HeadingLevel.Three)}
      ${unorderedList([
        'See when and where a movie will be shown.',
        'Check the exact start time of each screening.',
        'Find out which auditorium hosts the screening.',
        'Review extra features of each screening, like 3D or Dolby Atmos.',
      ])}
    `,
    [Locale.German]: chatMessage`
      ${heading(':beginner:  Filmvorstellungen  :beginner:')}
      ${bold('Befehl')}:  ${inlineCode(`/${movieScreeningsCommand.data.name}`)}
      ${bold('Zweck')}:  ${inlineCode('Zeige alle geplanten Vorstellungen eines bestimmten Films an.')}

      ${heading('Verwende diesen Befehl, um', HeadingLevel.Three)}
      ${unorderedList([
        'Zu sehen, wann und wo ein Film gezeigt wird.',
        'Die genaue Startzeit jeder Vorstellung einzusehen.',
        'Herauszufinden, in welchem Saal die Vorstellung stattfindet.',
        'Zusätzliche Features der Vorstellung zu prüfen, wie 3D oder Dolby Atmos.',
      ])}
    `,
  },
  unknown: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':boom:  Unknown Command  :boom:')}
      I couldn't find that command — double-check the name and try one of the known commands.
    `,
    [Locale.German]: chatMessage`
      ${heading(':boom:  Unbekannter Befehl  :boom:')}
      Der eingegebene Befehl wurde nicht gefunden. Überprüfe den Namen und versuche einen bekannten Befehl.
    `,
  },
} as const;
