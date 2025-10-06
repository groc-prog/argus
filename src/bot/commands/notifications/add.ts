import {
  ChatInputCommandInteraction,
  heading,
  inlineCode,
  InteractionContextType,
  italic,
  Locale,
  MessageFlags,
  quote,
  SlashCommandBuilder,
} from 'discord.js';
import { message, replyFromTemplate } from '../../../utilities/reply';
import logger from '../../../utilities/logger';
import dayjs from 'dayjs';
import { KeywordType, NotificationModel } from '../../../models/notification';

export default {
  data: new SlashCommandBuilder()
    .setName('notify-me')
    .setDescription('Get notifications about movies. Use without options for more information.')
    .setDescriptionLocalization(
      Locale.German,
      'Werde über Filme benachrichtigt. Kann ohne Optionen für mehr Infos genutzt werden.',
    )
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('A name which uniquely identifies this notification.')
        .setDescriptionLocalization(
          Locale.German,
          'Ein Name, der diese Benachrichtigung eindeutig identifiziert.',
        )
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('expiration-date')
        .setNameLocalization(Locale.German, 'verfallsdatum')
        .setDescription(
          'A date (YYYY-MM-DD) after which the notification will magically disappear.',
        )
        .setDescriptionLocalization(
          Locale.German,
          'Ein Datum (JJJJ-MM-TT), nach dem die Benachrichtigung wie von Zauberhand verschwindet.',
        ),
    )
    .addNumberOption((option) =>
      option
        .setName('max-dms')
        .setNameLocalization(Locale.German, 'max-benachrichtigungen')
        .setDescription("The max. number of DM's after which it will magically disappear.")
        .setDescriptionLocalization(
          Locale.German,
          'Die max. Anzahl an Benachrichtigungen, nach denene sie wie von Zauberhand verschwindet.',
        )
        .setMinValue(1),
    )
    .addStringOption((option) =>
      option
        .setName('titles')
        .setNameLocalization(Locale.German, 'titel')
        .setDescription('A list of movie titles which make a movie eligible for a notification.')
        .setDescriptionLocalization(
          Locale.German,
          'Eine Liste von Filmtiteln, die einen Film für eine Benachrichtigung qualifizieren.',
        ),
    )
    .addStringOption((option) =>
      option
        .setName('features')
        .setDescription('A list of features which make a movie eligible for a notification.')
        .setDescriptionLocalization(
          Locale.German,
          'Eine Liste von Features, die einen Film für eine Benachrichtigung qualifizieren.',
        ),
    )
    .addBooleanOption((option) =>
      option
        .setName('deactivate-on-expiration')
        .setNameLocalization(Locale.German, 'bei-ablauf-deaktivieren')
        .setDescription('Deactivate the notification when expired rather than deleting it.')
        .setDescriptionLocalization(
          Locale.German,
          'Benachrichtigung bei Ablauf deaktivieren, anstatt sie zu löschen.',
        ),
    )
    .addNumberOption((option) =>
      option
        .setName('notification-interval')
        .setNameLocalization(Locale.German, 'benachrichtigungs-intervall')
        .setDescription(
          'A interval (in days) in which you will receive a notification. This defaults to 1x per day.',
        )
        .setDescriptionLocalization(
          Locale.German,
          'Ein Intervall (in Tagen), in dem du eine Benachrichtigung erhältst. Der Standart ist 1x pro Tag.',
        )
        .setMinValue(1),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const loggerWithCtx = logger.child({
      userId: interaction.user.id,
      command: interaction.commandName,
    });

    const name = interaction.options.getString('name', true);
    const maxDms = interaction.options.getNumber('max-dms');
    const deactivateOnExpiration = interaction.options.getBoolean('deactivate-on-expiration');
    const dmDayInterval = interaction.options.getNumber('notification-interval') ?? 1;

    const expiresAt = interaction.options.getString('expiration-date');

    const titles = interaction.options.getString('titles');
    const titlesArr = titles?.split(';').filter((title) => title.length !== 0);

    const features = interaction.options.getString('features');
    const featuresArr = features?.split(';').filter((feature) => feature.length !== 0);

    try {
      const notification = await NotificationModel.findOneAndUpdate(
        { userId: interaction.user.id },
        {
          $set: {
            userId: interaction.user.id,
            timezone: 'Europe/Vienna',
          },
        },
        {
          upsert: true,
          new: true,
        },
      );

      const expiresAtUtc = dayjs(expiresAt, 'YYYY-MM-DD', true).tz(notification.timezone).utc();

      if ((!titlesArr || titlesArr.length === 0) && (!featuresArr || featuresArr.length === 0)) {
        loggerWithCtx.info('No keywords defined, aborting');
        await replyFromTemplate(interaction, replies.titleFeaturesValidationError, {
          interaction: {
            flags: MessageFlags.Ephemeral,
          },
        });
      }

      if (expiresAt) {
        loggerWithCtx.info('Validating expiration date option');
        const isValidDate =
          expiresAtUtc.isValid() && expiresAtUtc.startOf('day').diff(dayjs.utc()) >= 0;

        if (!isValidDate) {
          loggerWithCtx.info('Invalid expiration date received, aborting');
          await replyFromTemplate(interaction, replies.dateValidationError, {
            template: {
              date: expiresAt,
            },
            interaction: {
              flags: MessageFlags.Ephemeral,
            },
          });
          return;
        }
      }

      loggerWithCtx.info('Checking if notification with same name already exists');
      const exists = await NotificationModel.findOne(
        { userId: interaction.user.id, 'notifications.name': name },
        { _id: true },
      );
      if (exists) {
        loggerWithCtx.info('Notification with the same name already exists');
        await replyFromTemplate(interaction, replies.duplicateNotificationError, {
          template: {
            notificationName: name,
          },
          interaction: {
            flags: MessageFlags.Ephemeral,
          },
        });
        return;
      }

      loggerWithCtx.info(
        `Adding new notification with ${(featuresArr?.length ?? 0) + (titlesArr?.length ?? 0)}`,
      );
      const notificationEntry = {
        name,
        locale: interaction.locale,
        sentNotifications: maxDms ? 0 : undefined,
        maxDms: maxDms ?? undefined,
        expiresAt: expiresAt ? expiresAtUtc.startOf('day').toDate() : undefined,
        keepAfterExpiration: deactivateOnExpiration ?? undefined,
        dmDayInterval,
        keywords: [
          ...(featuresArr?.map((value) => ({ type: KeywordType.MovieFeature, value })) ?? []),
          ...(titlesArr?.map((value) => ({ type: KeywordType.MovieTitle, value })) ?? []),
        ],
      };

      notification.entries.push(notificationEntry);
      await notification.save();
      loggerWithCtx.info('Notification created successfully');

      await replyFromTemplate(interaction, replies.success, {
        template: {
          notificationName: name,
          expiresAt: expiresAt ? dayjs(expiresAt).format('YYYY-MM-DD') : undefined,
          maxDms,
          dmDayInterval,
        },
        interaction: {
          flags: MessageFlags.Ephemeral,
        },
      });
    } catch (err) {
      loggerWithCtx.error({ err }, 'Error during notification creation');
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
    ${heading(':popcorn:  NOTIFICATION CREATED  :popcorn:')}
    In a world where anticipation meets precision… a new signal rises.

    The notification ${inlineCode('{{{notificationName}}}')} has been created successfully.
    {{#dmDayInterval}}You will receive ${inlineCode('{{{dmDayInterval}}}x')} DM(s) per day as long as the notification is active.{{/dmDayInterval}}
    {{#expiresAt}}It will expire on ${inlineCode('{{{expiresAt}}}')}.{{/expiresAt}}
    {{#maxDms}}It will automatically end after ${inlineCode('{{{maxDms}}}')} DM's.{{/maxDms}}

    ${quote(italic(`The beacon is lit. You will be notified when the moment arrives.`))}
  `,
    [Locale.German]: message`
    ${heading(':popcorn:  BENACHRICHTIGUNG ERSTELLT  :popcorn:')}
    In einer Welt, in der Erwartung auf Präzision trifft… erhebt sich ein neues Signal.

    Die Benachrichtigung ${inlineCode('{{{notificationName}}}')} wurde erfolgreich erstellt.
    {{#dmDayInterval}}Du erhältst ${inlineCode('{{{dmDayInterval}}}x')} Benachrichtigung(en) per Tag, solange sie aktiv ist.{{/dmDayInterval}}
    {{#expiresAt}}Sie läuft am ${inlineCode('{{{expiresAt}}}')} ab.{{/expiresAt}}
    {{#maxDms}}Sie endet automatisch nach ${inlineCode('{{{maxDms}}}')} Benachrichtigungen.{{/maxDms}}

    ${quote(italic(`Das Signal ist gesetzt. Du wirst benachrichtigt, sobald der Moment gekommen ist.`))}
  `,
  },
  dateValidationError: {
    [Locale.EnglishUS]: message`
      ${heading(':calendar:  DATE VALIDATION ERROR  :calendar:')}
      In a world where time marches on relentlessly… some dates cannot be honored.

      The provided date ${inlineCode('{{{date}}}')} is either invalid or has already passed. Please provide a future date in the format ${inlineCode('YYYY-MM-DD')}.

      ${quote(italic(`The bot cannot travel back in time. Adjust the date and try again to keep the story moving.`))}
    `,
    [Locale.German]: message`
      ${heading(':calendar:  DATUMSVALIDIERUNGSFEHLER  :calendar:')}
      In einer Welt, in der die Zeit unerbittlich voranschreitet… können einige Daten nicht beachtet werden.

      Das angegebene Datum ${inlineCode('{{{date}}}')} ist entweder ungültig oder liegt bereits in der Vergangenheit. Bitte gib ein zukünftiges Datum im Format ${inlineCode('JJJJ-MM-TT')} an.

      ${quote(italic(`Der Bot kann nicht in die Vergangenheit reisen. Passe das Datum an und versuche es erneut, damit die Geschichte weitergeht.`))}
    `,
  },
  titleFeaturesValidationError: {
    [Locale.EnglishUS]: message`
      ${heading(':warning:  KEYWORD VALIDATION ERROR  :warning:')}
      In a world where choices define destiny… nothing cannot be an option.

      You must provide at least one ${inlineCode('title')} or one ${inlineCode('feature')}. Both cannot be empty. The bot needs a spark to know what to watch for.

      ${quote(italic(`The stage is empty without guidance. Fill in at least one title or feature to bring the show to life.`))}
    `,
    [Locale.German]: message`
      ${heading(':warning:  SCHLÜSSELWORTFEHLER  :warning:')}
      In einer Welt, in der Entscheidungen das Schicksal bestimmen… kann nichts nicht gewählt werden.

      Du musst mindestens einen ${inlineCode('Titel')} oder ein ${inlineCode('Feature')} angeben. Beides darf nicht leer sein. Der Bot benötigt einen Funken, um zu wissen, worauf er achten soll.

      ${quote(italic(`Die Bühne bleibt leer ohne Vorgaben. Gib mindestens einen Titel oder ein Feature ein, um die Show zum Leben zu erwecken.`))}
    `,
  },
  duplicateNotificationError: {
    [Locale.EnglishUS]: message`
      ${heading(':warning:  DUPLICATE NOTIFICATION  :warning:')}
      In a world where every name must be unique… echoes are not allowed.

      A notification with the name ${inlineCode('{{{notificationName}}}')} already exists. Please choose a different name to avoid confusion in the cosmos of alerts.

      ${quote(italic(`The bot cannot conjure two identical signals. Rename your notification to continue the story.`))}
    `,
    [Locale.German]: message`
      ${heading(':warning:  DOPPELTE BENACHRICHTIGUNG  :warning:')}
      In einer Welt, in der jeder Name einzigartig sein muss… sind Echos nicht erlaubt.

      Eine Benachrichtigung mit dem Namen ${inlineCode('{{{notificationName}}}')} existiert bereits. Bitte wähle einen anderen Namen, um Verwirrung im Kosmos der Benachrichtigungen zu vermeiden.

      ${quote(italic(`Der Bot kann keine zwei identischen Signale erzeugen. Benenne deine Benachrichtigung um, um die Geschichte fortzusetzen.`))}
    `,
  },
  error: {
    [Locale.EnglishUS]: message`
      ${heading(':x:  NOTIFICATION CREATION FAILED  :x:')}
      In a world where plans are made… sometimes magic slips through our fingers.

      The bot was unable to create the notification. The forces of the universe interfered, and the request could not be completed.

      ${quote(italic(`The story cannot advance without this notification. Please try again later.`))}
    `,
    [Locale.German]: message`
      ${heading(':x:  FEHLGESCHLAGENE BENACHRICHTIGUNGSERSTELLUNG  :x:')}
      In einer Welt, in der Pläne geschmiedet werden… entgleitet manchmal die Magie unseren Fingern.

      Der Bot konnte die Benachrichtigung nicht erstellen. Die Kräfte des Universums haben sich eingemischt, und die Anfrage konnte nicht abgeschlossen werden.

      ${quote(italic(`Die Geschichte kann ohne diese Benachrichtigung nicht fortgesetzt werden. Bitte versuche es später erneut.`))}
    `,
  },
} as const;
