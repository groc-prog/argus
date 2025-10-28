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
  SlashCommandBuilder,
} from 'discord.js';
import { chatMessage, sendInteractionReply } from '../../../utilities/discord';
import { getLoggerWithCtx } from '../../../utilities/logger';
import { MovieModel } from '../../../models/movie';
import { isValidObjectId } from 'mongoose';
import { I18N } from '../../../constants';
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
    [Locale.EnglishUS]: chatMessage`
      ${heading(':clapper:  {{{title}}}  :clapper:', HeadingLevel.Two)}
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
    [Locale.German]: chatMessage`
      ${heading(':clapper:  {{{title}}}  :clapper:', HeadingLevel.Two)}
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
    [Locale.EnglishUS]: chatMessage`
      ${heading(':mag:  Movie Not Found  :mag:')}
      The requested movie could not be found. It may not exist or might have been archived.
    `,
    [Locale.German]: chatMessage`
      ${heading(':mag:  Film nicht gefunden  :mag:')}
      Der angeforderte Film konnte nicht gefunden werden. Er existiert möglicherweise nicht oder ist archiviert.
    `,
  },

  error: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':boom:  Movie Retrieval Failed  :boom:')}
      The bot was unable to retrieve the requested movie information due to a network or data issue.
    `,
    [Locale.German]: chatMessage`
      ${heading(':boom:  Filmabruf fehlgeschlagen  :boom:')}
      Der Bot konnte die angeforderten Filminformationen aufgrund einer Netzwerk- oder Datenstörung nicht abrufen.
    `,
  },
} as const;
