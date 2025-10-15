import mongoose from 'mongoose';
import logger from '../utilities/logger';
import Fuse from 'fuse.js';

const screeningSchema = new mongoose.Schema({
  /** UTC timestamp of the start of the movie. */
  startTime: {
    type: mongoose.SchemaTypes.Date,
    required: true,
  },
  auditorium: {
    type: mongoose.SchemaTypes.String,
    required: true,
    trim: true,
  },
  /** Attribute keys describing features of the screening, for example 3d, atmos, etc */
  features: [mongoose.SchemaTypes.String],
});

const movieSchema = new mongoose.Schema(
  {
    title: {
      type: mongoose.SchemaTypes.String,
      required: true,
      index: true,
      unique: true,
      trim: true,
    },
    description: {
      type: mongoose.SchemaTypes.String,
      trim: true,
    },
    /**
     * Current screenings of the movie. Movies scraped in the past might not have any more entries
     * in this field as they are emptied once the movie is no longer part of the scraped data.
     */
    screenings: [screeningSchema],
    ageRating: {
      type: mongoose.SchemaTypes.String,
      trim: true,
    },
    durationMinutes: Number,
    genres: [mongoose.SchemaTypes.String],
  },
  {
    timestamps: true,
    statics: {
      /**
       * Fuzzy searches movie names based on the provided search term. Fuzzy searching is done in
       * memory and only returns the first 25 results.
       * @param {string} search - The search term which the fuzzy search is based on.
       * @returns
       */
      fuzzySearchMovies: async (search: string): Promise<{ name: string; value: string }[]> => {
        const loggerWithCtx = logger.child({ model: MovieModel.constructor.name });

        loggerWithCtx.info('Getting all movies for fuzzy search');
        const movies = await MovieModel.find({}, { title: 1, _id: 1 });
        const movieOptions = movies.map((movie) => ({
          name: movie.title,
          value: movie._id.toString(),
        }));
        loggerWithCtx.debug(`Found ${movieOptions.length} movies`);

        if (search.trim().length === 0) {
          loggerWithCtx.debug('No input to filter yet, returning first 25 options');
          return movieOptions.slice(0, 25);
        }

        loggerWithCtx.info('Fuzzy searching available movie options');
        const fuse = new Fuse(movieOptions, {
          keys: ['name'],
        });
        const matches = fuse.search(search);

        return matches.slice(0, 25).map((match) => match.item);
      },
    },
  },
);

export type Movie = mongoose.InferSchemaType<typeof movieSchema>;
export const MovieModel = mongoose.model('Movie', movieSchema);
