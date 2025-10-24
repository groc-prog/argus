import { Locale } from 'discord.js';

export const I18N: { [key: string]: Partial<Record<Locale, string>> } = {
  '2d': {
    [Locale.EnglishUS]: '2D',
    [Locale.German]: '2D',
  },
  atmos: {
    [Locale.EnglishUS]: 'Dolby Atmos Sound',
    [Locale.German]: 'Dolby Atmos Sound',
  },
  vorpremiere: {
    [Locale.EnglishUS]: 'Prepremiere',
    [Locale.German]: 'Vorpremiere',
  },
  pricelevel_N96: {
    [Locale.EnglishUS]: 'Last chance',
    [Locale.German]: 'Letzte Chance',
  },
  englisch: {
    [Locale.EnglishUS]: 'English',
    [Locale.German]: 'Englisch',
  },
  '2filmfrühstückd': {
    [Locale.EnglishUS]: 'Movie Breakfast',
    [Locale.German]: 'Filmfrühstück',
  },
  language_2: {
    [Locale.EnglishUS]: 'English',
    [Locale.German]: 'Englisch',
  },
  _pm_preview: {
    [Locale.EnglishUS]: 'Preview',
    [Locale.German]: 'Vorschau',
  },
  'anime night': {
    [Locale.EnglishUS]: 'Anime Night',
    [Locale.German]: 'Anime Night',
  },
  anime_night: {
    [Locale.EnglishUS]: 'Anime Night',
    [Locale.German]: 'Anime Night',
  },
  language_6: {
    [Locale.EnglishUS]: 'Japanese (German Subtitles)',
    [Locale.German]: 'Japanisch (deutsche Untertitel)',
  },
  pricelevel_N101: {
    [Locale.EnglishUS]: 'Premiere 2D',
    [Locale.German]: 'Premiere 2D',
  },
  pricelevel_N103: {
    [Locale.EnglishUS]: 'Premiere 2D Kids',
    [Locale.German]: 'Premiere 2D Kinder',
  },
  '3d': {
    [Locale.EnglishUS]: '3D',
    [Locale.German]: '3D',
  },
  mx4d: {
    [Locale.EnglishUS]: 'MX4D',
    [Locale.German]: 'MX4D',
  },
  'kino anders': {
    [Locale.EnglishUS]: 'Theatre Differently',
    [Locale.German]: 'Kino Anders',
  },
  kino_anders: {
    [Locale.EnglishUS]: 'Theatre Differently',
    [Locale.German]: 'Kino Anders',
  },
  filmfrühstück: {
    [Locale.EnglishUS]: 'Movie Breakfast',
    [Locale.German]: 'Filmfrühstück',
  },
  kultur: {
    [Locale.EnglishUS]: 'Culture',
    [Locale.German]: 'Kultur',
  },
  erstes_kinoerlebnis: {
    [Locale.EnglishUS]: 'First Theatre Experience',
    [Locale.German]: 'Erstes Kinoerlebnis',
  },
  ladies_night: {
    [Locale.EnglishUS]: 'Ladies Night',
    [Locale.German]: 'Ladies Night',
  },
};

export const FEATURES = Object.fromEntries(
  Object.entries(I18N).map(([feature, i18n]) => [
    feature,
    new Set(Object.values(i18n).map((translation) => translation.toLowerCase())),
  ]),
);
