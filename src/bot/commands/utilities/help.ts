import {
  AutocompleteInteraction,
  bold,
  ChatInputCommandInteraction,
  heading,
  HeadingLevel,
  hyperlink,
  inlineCode,
  italic,
  Locale,
  MessageFlags,
  quote,
  SlashCommandBuilder,
  unorderedList,
} from 'discord.js';
import { client } from '../../client';
import statusCommand from '../utilities/status';
import setupCommand from '../utilities/setup';
import addNotificationCommand from '../notifications/add';
import listNotificationCommand from '../notifications/notifications';
import setTimezoneCommand from '../notifications/set-timezone';
import movieFeaturesCommand from '../movies/features';
import { message, replyFromTemplate } from '../../../utilities/reply';
import Fuse from 'fuse.js';
import logger from '../../../utilities/logger';

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
      await replyFromTemplate(interaction, replies[command] as typeof replies.unknown, {
        template: {
          botName: client.user?.displayName,
        },
        interaction: {
          flags: MessageFlags.Ephemeral,
        },
      });
    } else {
      await replyFromTemplate(interaction, replies.unknown, {
        interaction: {
          flags: MessageFlags.Ephemeral,
        },
      });
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    const loggerWithCtx = logger.child({ command: interaction.commandName });

    const focusedOptionValue = interaction.options.getFocused();
    const commands = client.commands
      .values()
      .map((command) => ({ name: command.data.name, value: command.data.name }))
      .toArray();

    if (focusedOptionValue.trim().length === 0) {
      loggerWithCtx.debug('No input to filter yet, returning first 25 options');
      await interaction.respond(commands.slice(0, 25));
      return;
    }

    loggerWithCtx.debug('Fuzzy searching available channel options');

    const fuse = new Fuse(commands, {
      keys: ['name'],
    });
    const matches = fuse.search(focusedOptionValue);

    await interaction.respond(matches.slice(0, 25).map((match) => match.item));
  },
};

const replies = {
  [statusCommand.data.name]: {
    [Locale.EnglishUS]: message`
      ${heading(':information_source:  STATUS GUIDE  :information_source:')}
      ${bold('Command')}:  ${inlineCode(`/${statusCommand.data.name}`)}
      ${bold('Purpose')}:  ${inlineCode('Show the current system status and setup of the bot')}

      ${heading('Use this command to', HeadingLevel.Three)}
      ${unorderedList([
        `Check the current ${inlineCode('latency')} between the bot and Discord.`,
        `See whether the bot setup has been completed or is still ${inlineCode('pending')}.`,
        `View the currently configured ${inlineCode('broadcast channel')} for guild notifications.`,
        `View the ${inlineCode('broadcast schedule')} the bot is using (if configured).`,
        `Find out who last modified the bot configuration.`,
      ])}

      If setup has not been completed, you'll see a message guiding you to run the ${inlineCode(`/${setupCommand.data.name}`)} command.

      ${quote(italic("Use this command whenever you're unsure if the bot is ready to broadcast or if something looks off."))}
    `,
    [Locale.German]: message`
      ${heading(':information_source:  STATUS-GUIDE  :information_source:')}
      ${bold('Befehl')}:  ${inlineCode(`/${statusCommand.data.name}`)}
      ${bold('Zweck')}:  ${inlineCode('Zeigt den aktuellen Systemstatus und Setup-Status des Bots an')}

      ${heading('Du kannst diesen Befehl verwenden, um', HeadingLevel.Three)}
      ${unorderedList([
        `Die aktuelle ${inlineCode('Latenz')} zwischen Bot und Discord abzufragen.`,
        `Zu sehen, ob das Setup des Bots abgeschlossen ist oder noch ${inlineCode('ausstehend')} ist.`,
        `Den aktuell konfigurierten ${inlineCode('Broadcast-Kanal')} für Server-Benachrichtigungen anzuzeigen.`,
        `Den ${inlineCode('Broadcast-Zeitplan')} einzusehen, den der Bot verwendet (falls konfiguriert).`,
        `Herauszufinden, wer die Bot-Konfiguration zuletzt geändert hat.`,
      ])}

      Wenn das Setup noch nicht abgeschlossen ist, erhältst du einen Hinweis, den Befehl ${inlineCode(`/${setupCommand.data.name}`)} auszuführen.

      ${quote(italic('Verwende diesen Befehl immer dann, wenn du prüfen möchtest, ob der Bot bereit für Broadcasts ist oder etwas nicht stimmt.'))}
    `,
  },
  [setupCommand.data.name]: {
    [Locale.EnglishUS]: message`
      ${heading(':information_source:  SETUP GUIDE  :information_source:')}

      ${bold('Command')}:  ${inlineCode(`/${setupCommand.data.name}`)}
      ${bold('Purpose')}:  ${inlineCode('Configure the bot for broadcasts')}

      ${heading('Use this command to', HeadingLevel.Three)}
      ${unorderedList([
        `Select the ${inlineCode('broadcast channel')} where messages will be posted`,
        `Define the ${inlineCode('broadcast schedule')} with a valid CRON expression`,
        'Save your settings so the bot can operate automatically',
      ])}

      ${heading('What the heck is CRON?!?!', HeadingLevel.Three)}
      That's a good question! ${hyperlink('CRON expressions', 'https://en.wikipedia.org/wiki/Cron#Cron_expression')} are a way to define a recurring schedule with a standard format. Although it is commonly used in IT, it's also somewhat user friendly and there are many online tools ${hyperlink('like this one', 'https://crontab.io/validator')} which can help you define the CRON expression you want.
    `,
    [Locale.German]: message`
      ${heading(':information_source:  SETUP-GUIDE  :information_source:')}

      ${bold('Befehl')}:  ${inlineCode(`/${setupCommand.data.name}`)}
      ${bold('Zweck')}:  ${inlineCode('Bot für Übertragungen konfigurieren')}

      ${heading('Du kannst diesen Befehl verwendet, um', HeadingLevel.Three)}
      ${unorderedList([
        `Den ${inlineCode('Broadcast-Kanal')} auszuwählen, in dem Nachrichten gesendet werden`,
        `Den ${inlineCode('Broadcast-Zeitplan')} mit einem gültigen CRON-Ausdruck festzulegen`,
        'Deine Einstellungen zu speichern, damit der Bot automatisch arbeiten kann',
      ])}

      ${heading('Was zum Teufel ist CRON?!?!', HeadingLevel.Three)}
      Gute Frage! ${hyperlink('CRON-Ausdrücke', 'https://de.wikipedia.org/wiki/Cron#Beispiele')} sind eine Möglichkeit, einen wiederkehrenden Zeitplan in einem standardisierten Format festzulegen. Obwohl CRON vor allem in der IT verwendet wird, ist es trotzdem einigermaßen benutzerfreundlich, und es gibt viele Online-Tools ${hyperlink('wie dieses hier', 'https://crontab.io/validator')} , die dir dabei helfen, den gewünschten CRON-Ausdruck zu erstellen.
    `,
  },
  [addNotificationCommand.data.name]: {
    [Locale.EnglishUS]: message`
      ${heading(':information_source:  NOTIFICATION GUIDE  :information_source:')}
      In a world where new movies appear every day… this command keeps you in the spotlight.

      ${bold('Command')}:  ${inlineCode(`/${addNotificationCommand.data.name}`)}
      ${bold('Purpose')}:  ${inlineCode('Create new movie notifications')}

      ${heading('Use this command to', HeadingLevel.Three)}
      ${unorderedList([
        `Create a notification by giving it a unique ${inlineCode('name')}`,
        `Define one (or multiple) movie titles or features for which to look out for while checking movies. All available features can be viewed with the /${movieFeaturesCommand.data.name} command.`,
        `Optionally set an ${inlineCode('expirationd ate')} date (YYYY-MM-DD) to let {{{botName}}} handle the deletion of this notification if that date is reached.`,
        `Optionally set a ${inlineCode("max. number of DM's")} limit to prevent {{{botName}}} from notifying you after a given number of DM's have been sent.`,
        `Optionally set flag to ${inlineCode('deactivate the entry when expired')} rather than deleting it. Deactivated notifications can later be reactivated.`,
      ])}

      ${heading('How movie title and feature filtering works', HeadingLevel.Three)}
      You can define one or more keywords per notification. When you want to define more than one movie title or feature, you can provide a semicolon separated list of keywords. All keywords are ${bold('not')} case-sensitive and will always ${bold('be used together')}.
      {{{botName}}} will use these keywords to perform a ${inlineCode('fuzzy search')} across all movies which are currently shown. If he finds a match, you get a notification which will include some basic details about the movie.

      For example, if you create a notification for a movie title called ${inlineCode('duNne')} with a feature called ${inlineCode('3D')}, {{{botName}}} will keep a lookout for movies where the title approximately matches ${inlineCode('duNne')} and is in ${inlineCode('3D')}. If {{{botName}}} finds one, you will receive a DM.

      ${quote(`In case you have never heard of ${hyperlink('fuzzy search', 'https://en.wikipedia.org/wiki/Approximate_string_matching')}, it basically allows you to define a not-so-correct keyword. It will still notify you about possible matches, not only exact ones.`)}
    `,
    [Locale.German]: message`
      ${heading(':information_source:  BENACHRICHTIGUNGS-GUIDE  :information_source:')}
      In einer Welt, in der jeden Tag neue Filme erscheinen … hält dich dieser Befehl im Rampenlicht.

      ${bold('Befehl')}:  ${inlineCode(`/${addNotificationCommand.data.name}`)}
      ${bold('Zweck')}:  ${inlineCode('Neue Filmbenachrichtigungen anlegen')}

      ${heading('Du kannst diesen Befehl verwendet, um', HeadingLevel.Three)}
      ${unorderedList([
        `Eine Benachrichtigung zu erstellen, indem du ihr einen eindeutigen ${inlineCode('Namen')} gibst`,
        `Einen oder mehrere Filmtitel oder Features festzulegen, nach denen beim Filmen gesucht werden soll. Alle verfügbaren Features können mit dem Befehl /${movieFeaturesCommand.data.name} angezeigt werden.`,
        `Optional ein ${inlineCode('Verfallsdatum')} (JJJJ-MM-TT) festlegen, damit {{{botName}}} diese Benachrichtigung automatisch löscht, sobald das Datum erreicht ist.`,
        `Optional eine ${inlineCode('maximale Anzahl')} an Benachrichtigungen festzulegen, um zu verhindern, dass {{{botName}}} dich nach einer bestimmten Anzahl gesendeter Benachrichtigungen weiterhin informiert.`,
        `Optional die Benachrichtigung ${inlineCode('deaktivieren anstatt zu löschen')}. Deaktivierte Benachrichtigungen können jederzeit wieder aktiviert werden.`,
      ])}

      ${heading('So funktioniert das Suchen nach Filmtiteln und Features', HeadingLevel.Three)}
      Du kannst pro Benachrichtigung ein oder mehrere Schlüsselwörter festlegen. Wenn du mehr als einen Filmtitel oder ein Feature definieren möchtest, kannst du eine durch Semikolons getrennte Liste von Schlüsselwörtern angeben. Alle Schlüsselwörter sind ${bold('nicht')} groß-/kleinschreibungsabhängig und werden ${bold('immer zusammen genutzt')}.
      {{{botName}}} verwendet diese Schlüsselwörter, um eine ${inlineCode('unscharfe Suche')} über alle aktuell gezeigten Filme durchzuführen. Wenn er einen Treffer findet, erhältst du eine Benachrichtigung mit einigen Basisinformationen zum Film.

      Zum Beispiel: Wenn du eine Benachrichtigung für einen Filmtitel namens ${inlineCode('duNne')} mit einem Merkmal ${inlineCode('3D')} erstellst, wird {{{botName}}} nach Filmen suchen, deren Titel ungefähr ${inlineCode('duNne')} entspricht und die in ${inlineCode('3D')} sind.
      Wenn {{{botName}}} einen findet, erhältst du eine Direktnachricht.

      ${quote(`Falls du noch nie von ${hyperlink('unscharfer Suche', 'https://de.wikipedia.org/wiki/Unscharfe_Suche')} gehört hast: Sie ermöglicht es dir, ein nicht ganz korrektes Schlüsselwort zu definieren. Du wirst trotzdem über mögliche Treffer benachrichtigt, nicht nur über exakte.`)}
    `,
  },
  [listNotificationCommand.data.name]: {
    [Locale.EnglishUS]: message`
      ${heading(':information_source:  LIST NOTIFICATIONS  :information_source:')}
      In a world where every notification is a beacon… this command reveals them all.

      ${bold('Command')}:  ${inlineCode(`/${listNotificationCommand.data.name}`)}
      ${bold('Purpose')}:  ${inlineCode('Display all your active notifications')}

      Use this command to:
      ${unorderedList([
        'See all notifications you have created',
        `Review each notification's ${inlineCode('name')} and it's ${inlineCode('keywords')}`,
        'Check how many times each has been sent, when the last notification was triggered, and any expiration dates',
        `Understand the sending ${inlineCode('interval')} for each notification`,
      ])}
    `,
    [Locale.German]: message`
      ${heading(':information_source:  BENACHRICHTIGUNGEN AUFLISTEN  :information_source:')}
      In einer Welt, in der jede Benachrichtigung ein Signal ist… zeigt dir dieser Befehl alles auf.

      ${bold('Befehl')}:  ${inlineCode(`/${listNotificationCommand.data.name}`)}
      ${bold('Zweck')}:  ${inlineCode('Zeige alle aktiven Benachrichtigungen an')}

      Verwende diesen Befehl, um:
      ${unorderedList([
        'Alle von dir erstellten Benachrichtigungen zu sehen',
        `Den ${inlineCode('Name')} und die ${inlineCode('Schlüsselwörter')} jeder Benachrichtigung zu überprüfen`,
        'Zu sehen, wie oft jede bereits gesendet wurde, wann die letzte Benachrichtigung ausgelöst wurde und ob ein Ablaufdatum besteht',
        `Das Sende-${inlineCode('Intervall')} jeder Benachrichtigung zu verstehen`,
      ])}
    `,
  },
  [setTimezoneCommand.data.name]: {
    [Locale.EnglishUS]: message`
      ${heading(':information_source:  SET TIMEZONE GUIDE  :information_source:')}
      ${bold('Command')}:  ${inlineCode(`/${setTimezoneCommand.data.name}`)}
      ${bold('Purpose')}:  ${inlineCode('Sets your current timezone for later use')}

      ${heading('Use this command to', HeadingLevel.Three)}
      ${unorderedList([
        `Set your current timezone so the bot can correctly handle notifications and other movie updates. If no timezone is defined, defaults to ${inlineCode('Europe/Vienna')}.`,
      ])}

      ${quote(italic('You should always make sure that you have the correct timezone set, otherwise some things might not behave as expected.'))}
    `,
    [Locale.German]: message`
      ${heading(':information_source:  ZEITZONEN-GUIDE  :information_source:')}
      ${bold('Befehl')}:  ${inlineCode(`/${setTimezoneCommand.data.name}`)}
      ${bold('Zweck')}:  ${inlineCode('Legt deine aktuelle Zeitzone für die spätere Verwendung fest')}

      ${heading('Verwende diesen Befehl, um', HeadingLevel.Three)}
      ${unorderedList([
        `Deine aktuelle Zeitzone festzulegen, damit der Bot Benachrichtigungen und andere Film-Updates korrekt handhaben kann. Wenn keine Zeitzone definiert ist, wird standardmäßig ${inlineCode('Europe/Vienna')} verwendet.`,
      ])}

      ${quote(italic('Du solltest immer sicherstellen, dass du die richtige Zeitzone eingestellt hast, da sonst manche Dinge möglicherweise nicht wie erwartet funktionieren.'))}
    `,
  },
  unknown: {
    [Locale.EnglishUS]: message`
      ${heading(':x:  UNKNOWN COMMAND  :x:')}
      In a world where every command has a purpose… you've discovered uncharted territory.

      The command you entered could not be found. Double-check the name and try again.

      ${quote(italic('The path you tried to walk does not exist. Try a known command instead.'))}
    `,

    [Locale.German]: message`
      ${heading(':x:  UNBEKANNTER BEFEHL  :x:')}
      In einer Welt, in der jeder Befehl seinen Platz hat … bist du ins Unbekannte vorgedrungen.

      Der von dir eingegebene Befehl konnte nicht gefunden werden. Überprüfe den Namen und versuche es erneut.

      ${quote(italic('Der Weg, den du gehen wolltest, existiert nicht. Versuche stattdessen einen bekannten Befehl.'))}
    `,
  },
} as const;
