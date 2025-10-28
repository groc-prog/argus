import {
  AutocompleteInteraction,
  bold,
  ChatInputCommandInteraction,
  heading,
  HeadingLevel,
  inlineCode,
  Locale,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { chatMessage, sendInteractionReply } from '../../../utilities/discord';
import { getLoggerWithCtx } from '../../../utilities/logger';
import { MovieModel } from '../../../models/movie';
import { isValidObjectId } from 'mongoose';

export default {
  data: new SlashCommandBuilder()
    .setName('movie-details')
    .setDescription('View all available details for a given movie.')
    .setDescriptionLocalization(Locale.German, 'Sieh dir alle Infos für einen beliebigen Film an.')
    .addStringOption((option) =>
      option
        .setName('movie')
        .setNameLocalization(Locale.German, 'film')
        .setDescription('The movie to show details for.')
        .setDescriptionLocalization(
          Locale.German,
          'Der Film, für den mehr Infos angezeigt werden sollen.',
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
          ageRating: 1,
          description: 1,
          durationMinutes: 1,
          genres: 1,
        },
      );
      if (!movie) {
        loggerWithCtx.info('Provided input option did not match any known movies');
        await sendInteractionReply(interaction, replies.movieNotFound, {
          interaction: {
            flags: MessageFlags.Ephemeral,
          },
        });
        return;
      }

      loggerWithCtx.debug('Building template context');
      const templateData = {
        ...movie.toObject(),
        genres: movie.genres.join(', '),
        hasGenres: movie.genres.length !== 0,
      };

      await sendInteractionReply(interaction, replies.success, {
        template: templateData,
        interaction: {
          flags: MessageFlags.Ephemeral,
        },
      });
    } catch (err) {
      loggerWithCtx.error({ err }, 'Error while getting movie details');
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
      {{#description}}
        {{{description}}}
      {{/description}}

      {{#ageRating}}
        ${bold('Age Rating')}: ${inlineCode('{{{ageRating}}}')}
      {{/ageRating}}
      {{#durationMinutes}}
        ${bold('Duration')}: ${inlineCode('{{durationMinutes}} min')}
      {{/durationMinutes}}
      {{#hasGenres}}
        ${bold('Genres')}: ${inlineCode('{{{genres}}}')}
      {{/hasGenres}}
    `,
    [Locale.German]: chatMessage`
      ${heading(':clapper:  {{{title}}}  :clapper:', HeadingLevel.Two)}
      {{#description}}
        {{{description}}}
      {{/description}}

      {{#ageRating}}
        ${bold('Altersfreigabe')}: ${inlineCode('{{{ageRating}}}')}
      {{/ageRating}}
      {{#durationMinutes}}
        ${bold('Dauer')}: ${inlineCode('{{durationMinutes}} min')}
      {{/durationMinutes}}
      {{#hasGenres}}
        ${bold('Genres')}: ${inlineCode('{{{genres}}}')}
      {{/hasGenres}}
    `,
  },
  movieNotFound: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':thinking:  Movie Not Found  :thinking:')}
      Hmm… looks like I can't find that movie

      Either it doesn't exist or it's hiding somewhere in the archives. Double-check the title and we'll try again — the popcorn's waiting!
    `,
    [Locale.German]: chatMessage`
      ${heading(':thinking:  Film Nicht Gefunden  :thinking:')}
      Hmm… ich kann den Film leider nicht finden

      Vielleicht existiert er nicht oder versteckt sich irgendwo im Archiv. Überprüfe den Titel und wir probieren's nochmal — das Popcorn wartet schon!
    `,
  },
  error: {
    [Locale.EnglishUS]: chatMessage`
      ${heading(':boom:  Movie Retrieval Failed  :boom:')}
      Oops! Something went wrong while grabbing the movie info

      Could be a network hiccup or an issue with the data source. The reel didn't spin this time… Try again later and we'll get your movie fix!
    `,
    [Locale.German]: chatMessage`
      ${heading(':boom:  Filmabruf Fehlgeschlagen  :boom:')}
      Ups! Beim Abrufen der Filminfos ist was schiefgelaufen

      Könnte ein Netzwerkproblem oder ein Fehler bei der Datenquelle sein. Der Filmstreifen wollte diesmal nicht laufen… Versuch's später nochmal und wir holen dein Kino-Update!
    `,
  },
} as const;
