import mongoose from 'mongoose';
import logger from '../utilities/logger';
import Fuse from 'fuse.js';

const screeningSchema = new mongoose.Schema({
  /**
   * UTC timestamp of the start of the movie.
   */
  startTime: {
    type: mongoose.SchemaTypes.Date,
    required: true,
  },
  auditorium: {
    type: mongoose.SchemaTypes.String,
    required: true,
    trim: true,
  },
  /**
   * Attribute keys describing features of the screening, for example 3d, atmos, etc
   */
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
      fuzzySearchMovies: async (search: string): Promise<{ name: string; value: string }[]> => {
        const movies = await MovieModel.find({}, { title: 1, _id: 1 });
        const movieOptions = movies.map((movie) => ({
          name: movie.title,
          value: movie._id.toString(),
        }));

        if (search.trim().length === 0) {
          logger.debug('No input to filter yet, returning first 25 options');
          return movieOptions.slice(0, 25);
        }

        logger.debug('Fuzzy searching available movie options');
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
