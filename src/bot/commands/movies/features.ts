import {
  ChatInputCommandInteraction,
  heading,
  inlineCode,
  Locale,
  MessageFlags,
  quote,
  SlashCommandBuilder,
  unorderedList,
} from 'discord.js';
import { chatMessage, sendInteractionReply } from '../../../utilities/discord';
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
    [Locale.EnglishUS]: chatMessage`
      ${heading(':popcorn:  Movie Features  :popcorn:')}
      Hey hey! Wanna know all the cool stuff I can notify you about? Look at these babies.

      {{#features}}
        ${unorderedList([inlineCode('{{{.}}}')])}
      {{/features}}

      ${quote(`Each of these is like a little hint for making your notifications just right`)}
    `,
    [Locale.German]: chatMessage`
      ${heading(':popcorn:  Schlüsselwörter  :popcorn:')}
      Hey, hey! Willst du wissen, über welche coolen Sachen ich dich informieren kann? Schau dir diese Schnapper an.

      {{#features}}
        ${unorderedList([inlineCode('{{{.}}}')])}
      {{/features}}

      ${quote(`Jedes davon ist wie ein kleiner Tipp, damit deine Benachrichtigungen richtig nice werden`)}
    `,
  },
} as const;
