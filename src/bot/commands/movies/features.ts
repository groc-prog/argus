import {
  ChatInputCommandInteraction,
  heading,
  inlineCode,
  italic,
  Locale,
  MessageFlags,
  quote,
  SlashCommandBuilder,
  unorderedList,
} from 'discord.js';
import { discordMessage, sendInteractionReply } from '../../../utilities/discord';
import { I18N } from '../../../constants';

export default {
  data: new SlashCommandBuilder()
    .setName('movie-features')
    .setDescription('A complete list of all available movie features.')
    .setDescriptionLocalization(
      Locale.German,
      'Eine vollständige Liste von allen verfügbaren Film-Features.',
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const features = Object.values(I18N)
      .map((feature) => feature[interaction.locale])
      .filter((featureI18n) => featureI18n !== undefined);

    await sendInteractionReply(interaction, replies.success, {
      template: {
        features: Array.from(new Set(features)),
      },
      interaction: {
        flags: MessageFlags.Ephemeral,
      },
    });
  },
};

const replies = {
  success: {
    [Locale.EnglishUS]: discordMessage`
      ${heading(':sparkles:  KNOWN FEATURES  :sparkles:')}
      In a world where every movie shines for a reason… these are the traits that define them.

      {{#features}}
        ${unorderedList([inlineCode('{{{.}}}')])}
      {{/features}}

      ${quote(italic(`Each feature tells its own story — combine them wisely to craft your perfect notifications.`))}
    `,
    [Locale.German]: discordMessage`
      ${heading(':sparkles:  BEKANNTE FEATURES  :sparkles:')}
      In einer Welt, in der jeder Film aus einem besonderen Grund leuchtet… sind dies die Merkmale, die ihn definieren.

      {{#features}}
        ${unorderedList([inlineCode('{{{.}}}')])}
      {{/features}}

      ${quote(italic(`Jedes Feature erzählt seine eigene Geschichte — kombiniere sie weise, um deine perfekten Benachrichtigungen zu gestalten.`))}
    `,
  },
} as const;
