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
        loggerWithCtx.info('Provided input option did not match any movies');
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
    [Locale.EnglishUS]: discordMessage`
      ${heading(':clapper:  {{{title}}}', HeadingLevel.Two)}
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
    [Locale.German]: discordMessage`
      ${heading(':clapper:  {{{title}}}', HeadingLevel.Two)}
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
