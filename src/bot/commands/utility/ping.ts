import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder().setName('beep-boop'),
  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.reply('Hello Stranger!');
  },
};
