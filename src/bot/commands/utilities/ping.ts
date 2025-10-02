import { ChatInputCommandInteraction, Locale, SlashCommandBuilder } from 'discord.js';
import { message, replyFromTemplate } from '../../../utilities/reply';

export default {
  data: new SlashCommandBuilder().setName('beep-boop'),

  async execute(interaction: ChatInputCommandInteraction) {
    await replyFromTemplate(interaction, replies.success);
  },
};

const replies = {
  success: {
    [Locale.EnglishUS]: message`Hello`,
    [Locale.German]: message`Grüzi`,
  },
  error: {
    [Locale.EnglishUS]: message`err`,
    [Locale.German]: message`fehla`,
  },
} as const;
