import {
  ChatInputCommandInteraction,
  heading,
  HeadingLevel,
  inlineCode,
  InteractionContextType,
  Locale,
  MessageFlags,
  quote,
  SlashCommandBuilder,
  unorderedList,
} from 'discord.js';
import { chatMessage, sendInteractionReply } from '../../../utilities/discord';
import { getLoggerWithCtx } from '../../../utilities/logger';
import dayjs from 'dayjs';
import { KeywordType, UserModel } from '../../../models/user';
import { FEATURES } from '../../../constants';
import movieFeaturesCommand from '../movies/features';

export default {
  data: new SlashCommandBuilder()
    .setName('notify-me')
    .setDescription('Get notifications about movies.')
    .setDescriptionLocalization(Locale.German, 'Werde über Filme benachrichtigt.')
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
        .setDescription(
          'A `;` separated list of movie titles which make a movie eligible for a notification.',
        )
        .setDescriptionLocalization(
          Locale.German,
          'Eine `;` getrennte Liste von Filmtiteln, die einen Film für eine Benachrichtigung qualifizieren.',
        ),
    )
    .addStringOption((option) =>
      option
        .setName('features')
        .setDescription(
          'A `;` separated list of features which make a movie eligible for a notification.',
        )
        .setDescriptionLocalization(
          Locale.German,
          'Eine `;` getrennte Liste von Features, die einen Film für eine Benachrichtigung qualifizieren.',
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
        .setName('cooldown')
        .setNameLocalization(Locale.German, 'benachrichtigungs-intervall')
        .setDescription(
          'A cooldown (in days) before you will receive another notification. This defaults to 1 day.',
        )
        .setDescriptionLocalization(
          Locale.German,
          'Ein Intervall (in Tagen), in dem du eine Benachrichtigung erhältst. Der Standart ist 1x pro Tag.',
        )
        .setMinValue(1),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const loggerWithCtx = getLoggerWithCtx(interaction);

    const name = interaction.options.getString('name', true);
    const maxDms = interaction.options.getNumber('max-dms');
    const deactivateOnExpiration = interaction.options.getBoolean('deactivate-on-expiration');
    const cooldown = interaction.options.getNumber('cooldown') ?? 1;

    const expiresAt = interaction.options.getString('expiration-date');

    const titles = interaction.options.getString('titles');
    const titlesArr = titles?.split(';').filter((title) => title.length !== 0);

    const features = interaction.options.getString('features');
    const featuresArr = features?.split(';').filter((feature) => feature.length !== 0);

    loggerWithCtx.debug('Validating provided features');
    const omittedFeatures: string[] = [];
    const validFeatures =
      featuresArr
        ?.map((feature) => {
          const match = Object.entries(FEATURES).find((mapping) =>
            mapping[1].has(feature.trim().toLowerCase()),
          );
          if (!match) {
            // Remember omitted features so we can tell them to the user later on
            omittedFeatures.push(feature);
            return null;
          }

          return match[0];
        })
        .filter((feature) => feature !== null) ?? [];

    try {
      loggerWithCtx.info('Getting user record or creating new one if none exist yet');
      const user = await UserModel.findOneAndUpdate(
        { discordId: interaction.user.id },
        {
          $set: {
            discordId: interaction.user.id,
            timezone: 'Europe/Vienna',
          },
        },
        {
          upsert: true,
          new: true,
        },
      );

      const expiresAtUtc = dayjs.utc(expiresAt, 'YYYY-MM-DD', true).startOf('day');

      if ((!titlesArr || titlesArr.length === 0) && validFeatures.length === 0) {
        loggerWithCtx.info('No keywords defined, aborting');
        await sendInteractionReply(interaction, replies.titleFeaturesValidationError, {
          interaction: {
            flags: MessageFlags.Ephemeral,
          },
        });
        return;
      }

      if (expiresAt) {
        loggerWithCtx.debug('Validating expiration date option');
        const isValidDate = expiresAtUtc.isValid() && expiresAtUtc.diff(dayjs.utc()) >= 0;

        if (!isValidDate) {
          loggerWithCtx.info('Invalid expiration date received, aborting');
          await sendInteractionReply(interaction, replies.dateValidationError, {
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
      const exists = await UserModel.findOne(
        { discordId: interaction.user.id, 'notifications.name': name },
        { _id: true },
      );
      if (exists) {
        loggerWithCtx.info('Notification with the same name already exists');
        await sendInteractionReply(interaction, replies.duplicateNotificationError, {
          template: {
            notificationName: name,
          },
          interaction: {
            flags: MessageFlags.Ephemeral,
          },
        });
        return;
      }

      loggerWithCtx.debug(
        `Adding new notification with ${validFeatures.length + (titlesArr?.length ?? 0)} keywords`,
      );
      const notificationEntry = {
        name,
        locale: interaction.locale,
        sentNotifications: maxDms ? 0 : undefined,
        maxDms: maxDms ?? undefined,
        expiresAt: expiresAt ? expiresAtUtc.toDate() : undefined,
        keepAfterExpiration: deactivateOnExpiration ?? undefined,
        cooldown,
        keywords: [
          ...validFeatures.map((value) => ({ type: KeywordType.MovieFeature, value })),
          ...(titlesArr?.map((value) => ({ type: KeywordType.MovieTitle, value })) ?? []),
        ],
      };

      user.notifications.push(notificationEntry);
      await user.save();
      loggerWithCtx.info('Notification created successfully');

      await sendInteractionReply(interaction, replies.success, {
        template: {
          notificationName: name,
          expiresAt: expiresAt ? dayjs(expiresAt).format('YYYY-MM-DD') : undefined,
          maxDms,
          cooldown,
          omittedFeatures,
          hasOmittedFeatures: omittedFeatures.length !== 0,
        },
        interaction: {
          flags: MessageFlags.Ephemeral,
        },
      });
    } catch (err) {
      loggerWithCtx.error({ err }, 'Error while creating new notification');
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
      ${heading(':popcorn:  Notification Created  :popcorn:')}
      The notification ${inlineCode('{{{notificationName}}}')} has been created successfully. You will be notified when I find something.

      {{#cooldown}}You will receive a DM every ${inlineCode('{{{cooldown}}}')} day(s) while active.{{/cooldown}}
      {{#expiresAt}}It will expire on ${inlineCode('{{{expiresAt}}}')}.{{/expiresAt}}
      {{#maxDms}}It will automatically end after ${inlineCode('{{{maxDms}}}')} DM(s).{{/maxDms}}
      {{#hasOmittedFeatures}}
        ${heading(':warning:  Some features were omitted', HeadingLevel.Three)}
        The following features are unknown and have been omitted:
        {{#omittedFeatures}}
          ${unorderedList([inlineCode('{{{.}}}')])}
        {{/omittedFeatures}}
      {{/hasOmittedFeatures}}
    `,
    [Locale.German]: chatMessage`
      ${heading(':popcorn:  Benachrichtigung erstellt  :popcorn:')}
      Die Benachrichtigung ${inlineCode('{{{notificationName}}}')} wurde erfolgreich erstellt. Du wirst benachrichtigt, sobald ich was finde.

      {{#cooldown}}Du erhältst alle ${inlineCode('{{{cooldown}}}')} Tage eine Benachrichtigung, solange sie aktiv ist.{{/cooldown}}
      {{#expiresAt}}Sie läuft am ${inlineCode('{{{expiresAt}}}')} ab.{{/expiresAt}}
      {{#maxDms}}Sie endet automatisch nach ${inlineCode('{{{maxDms}}}')} Benachrichtigungen.{{/maxDms}}
      {{#hasOmittedFeatures}}
        ${heading(':warning:  Einige Features wurden weggelassen', HeadingLevel.Three)}
        Folgende Features sind unbekannt und wurden daher weggelassen:
        {{#omittedFeatures}}
          ${unorderedList([inlineCode('{{{.}}}')])}
        {{/omittedFeatures}}
      {{/hasOmittedFeatures}}
    `,
  },
  dateValidationError: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':calendar:  Date Validation Error  :calendar:')}
      The provided date ${inlineCode('{{{date}}}')} is invalid or has already passed. Please provide a future date in the format ${inlineCode('YYYY-MM-DD')}.
    `,
    [Locale.German]: chatMessage`
      ${heading(':calendar:  Datumsvalidierungsfehler  :calendar:')}
      Das angegebene Datum ${inlineCode('{{{date}}}')} ist ungültig oder liegt in der Vergangenheit. Bitte gib ein zukünftiges Datum im Format ${inlineCode('JJJJ-MM-TT')} an.
    `,
  },
  titleFeaturesValidationError: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':warning:  Keyword Validation Error  :warning:')}
      You must provide at least one ${inlineCode('title')} or valid ${inlineCode('feature')}. Both cannot be empty.

      ${quote(`Pro-tip: You can use the ${inlineCode(`/${movieFeaturesCommand.data.name}`)} command to check which features are valid.`)}
    `,
    [Locale.German]: chatMessage`
      ${heading(':warning:  Schlüsselwortfehler  :warning:')}
      Du musst mindestens einen ${inlineCode('Titel')} oder ein valides ${inlineCode('Schlüsselwort')} angeben. Beides darf nicht leer sein.

      ${quote(`Pro-Tipp: Du kannst den ${inlineCode(`/${movieFeaturesCommand.data.name}`)} Befehl nutzen, um zu nachzusehen, welche Schlüsselwörter verfügbar sind.`)}
    `,
  },
  duplicateNotificationError: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':warning:  Duplicate Notification  :warning:')}
      A notification with the name ${inlineCode('{{{notificationName}}}')} already exists. Please choose a different name.
    `,
    [Locale.German]: chatMessage`
      ${heading(':warning:  Doppelte Benachrichtigung  :warning:')}
      Eine Benachrichtigung mit dem Namen ${inlineCode('{{{notificationName}}}')} existiert bereits. Bitte wähle einen anderen Namen.
    `,
  },
  error: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':boom:  Notification Creation Failed  :boom:')}
      The bot was unable to create the notification. Please try again later.
    `,
    [Locale.German]: chatMessage`
      ${heading(':boom:  Fehlgeschlagene Benachrichtigungserstellung  :boom:')}
      Der Bot konnte die Benachrichtigung nicht erstellen. Bitte versuche es später erneut.
    `,
  },
} as const;
