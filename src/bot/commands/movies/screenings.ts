import {
  AutocompleteInteraction,
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
import { discordMessage, sendInteractionReply } from '../../../utilities/discord';
import { getLoggerWithCtx } from '../../../utilities/logger';
import { MovieModel } from '../../../models/movie';
import { isValidObjectId } from 'mongoose';
import { I18N } from '../../../models/features';
import { UserModel } from '../../../models/user';
import dayjs from 'dayjs';

export default {
  data: new SlashCommandBuilder()
    .setName('movie-screenings')
    .setDescription('View all available screening schedules for a given movie.')
    .setDescriptionLocalization(
      Locale.German,
      'Zeigt dir alle Vorstellungen für einen beliebigen Film an.',
    )
    .addStringOption((option) =>
      option
        .setName('movie')
        .setNameLocalization(Locale.German, 'film')
        .setDescription('The movie to show screenings for.')
        .setDescriptionLocalization(
          Locale.German,
          'Der Film, für den verfügbare Vorstellungen angezeigt werden sollen.',
        )
        .setRequired(true)
        .setAutocomplete(true),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const movieIdOrName = interaction.options.getString('movie', true);
    const loggerWithCtx = getLoggerWithCtx(interaction, { movieIdOrName });

    try {
      loggerWithCtx.info('Getting details for movie');
      const movie = await MovieModel.findOne(
        {
          $or: [
            { _id: isValidObjectId(movieIdOrName) ? movieIdOrName : null },
            { title: movieIdOrName },
          ],
        },
        {
          title: 1,
          screenings: 1,
        },
      );
      if (!movie) {
        loggerWithCtx.info(
          { movieId: movieIdOrName },
          'Provided input option did not match any movies',
        );
        await sendInteractionReply(interaction, replies.movieNotFound, {
          interaction: {
            flags: MessageFlags.Ephemeral,
          },
        });
        return;
      }

      loggerWithCtx.info('Getting user timezone');
      const user = await UserModel.findOne({ discordId: interaction.user.id }, { timezone: 1 });

      if (!user)
        loggerWithCtx.info('No user configuration found, falling back to default timezone');
      const timezone = user?.timezone ?? 'Europe/Vienna';

      loggerWithCtx.debug('Building template context');
      const screenings = movie.screenings.map((screening) => ({
        auditorium: screening.auditorium,
        features: screening.features
          .map((feature) => {
            const translations = I18N[feature];
            if (!translations) return feature;

            const featureTranslation = translations[interaction.locale];
            if (!featureTranslation) return feature;
            return featureTranslation;
          })
          .join(', '),
        hasFeatures: screening.features.length !== 0,
        startTime: dayjs.utc(screening.startTime).tz(timezone).format('YYYY-MM-DD HH:mm:ss Z'),
      }));

      await sendInteractionReply(interaction, replies.success, {
        template: {
          title: movie.title,
          screenings,
          hasScreenings: screenings.length !== 0,
        },
        interaction: {
          flags: MessageFlags.Ephemeral,
        },
      });
    } catch (err) {
      loggerWithCtx.error({ err }, 'Error while getting movie screenings');
      await sendInteractionReply(interaction, replies.error, {
        interaction: {
          flags: MessageFlags.Ephemeral,
        },
      });
    }
  },

  async autocomplete(interaction: AutocompleteInteraction) {
    const loggerWithCtx = getLoggerWithCtx(interaction);

    try {
      loggerWithCtx.info('Getting autocomplete options for movies');
      const focusedOptionValue = interaction.options.getFocused();

      const options = await MovieModel.fuzzySearchMovies(focusedOptionValue);
      await interaction.respond(options);
    } catch (err) {
      loggerWithCtx.error({ err }, 'Failed to get autocomplete options for movies');
      await interaction.respond([]);
    }
  },
};

const replies = {
  success: {
    [Locale.EnglishUS]: discordMessage`
      ${heading(':clapper:  {{{title}}}', HeadingLevel.Two)}
      {{#hasScreenings}}
        {{#screenings}}
          ${bold('Start Time')}: ${inlineCode('{{{startTime}}}')}
          ${bold('Auditorium')}: ${inlineCode('{{{auditorium}}}')}
          {{#hasFeatures}}
            ${bold('Features')}: {{{features}}}
          {{/hasFeatures}}

        {{/screenings}}
      {{/hasScreenings}}
      {{^hasScreenings}}
        ${italic('No active screenings found for this movie.')}
      {{/hasScreenings}}
    `,
    [Locale.German]: discordMessage`
      ${heading(':clapper:  {{{title}}}', HeadingLevel.Two)}
      {{#hasScreenings}}
        {{#screenings}}
          ${bold('Startzeit')}: ${inlineCode('{{{startTime}}}')}
          ${bold('Saal')}: ${inlineCode('{{{auditorium}}}')}
          {{#hasFeatures}}
            ${bold('Features')}: {{{features}}}
          {{/hasFeatures}}

        {{/screenings}}
      {{/hasScreenings}}
      {{^hasScreenings}}
        ${italic('Keine aktuellen Vorstellungen für diesen Film gefunden.')}
      {{/hasScreenings}}
    `,
  },
  movieNotFound: {
    [Locale.EnglishUS]: discordMessage`
      ${heading(':x:  MOVIE NOT FOUND  :x:')}
      In a world filled with stories… this one remains untold.

      The requested movie could not be found. It may not exist, or it might have slipped into the shadows of the archive.

      ${quote(italic(`The reel spins endlessly, yet this story eludes the frame. Check your title and try again.`))}
    `,
    [Locale.German]: discordMessage`
      ${heading(':x:  FILM NICHT GEFUNDEN  :x:')}
      In einer Welt voller Geschichten… bleibt diese unerzählt.

      Der angeforderte Film konnte nicht gefunden werden. Er existiert möglicherweise nicht oder ist in den Schatten des Archivs verschwunden.

      ${quote(italic(`Die Filmrolle dreht sich endlos, doch diese Geschichte entzieht sich dem Bild. Überprüfe den Titel und versuche es erneut.`))}
    `,
  },
  error: {
    [Locale.EnglishUS]: discordMessage`
      ${heading(':x:  MOVIE RETRIEVAL FAILED  :x:')}
      In a world where stories should flow freely… something disrupted the reel.

      The bot was unable to retrieve the requested movie information. A disturbance in the network or an issue with the data source prevented completion of your request.

      ${quote(italic(`The scene fades before it begins. Please try again later — the story will resume once balance is restored.`))}
    `,
    [Locale.German]: discordMessage`
      ${heading(':x:  FILMABRUF FEHLGESCHLAGEN  :x:')}
      In einer Welt, in der Geschichten frei fließen sollten… wurde der Filmstreifen unterbrochen.

      Der Bot konnte die angeforderten Filminformationen nicht abrufen. Eine Störung im Netzwerk oder ein Problem mit der Datenquelle hat die Anfrage verhindert.

      ${quote(italic(`Die Szene verblasst, bevor sie beginnt. Bitte versuche es später erneut — die Geschichte wird fortgesetzt, sobald das Gleichgewicht wiederhergestellt ist.`))}
    `,
  },
} as const;
