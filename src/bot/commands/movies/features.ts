import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('movie-features')
    .setDescription('A complete list of all available movie features.'),

  // async execute(interaction: ChatInputCommandInteraction) {},
};

// const replies = {} as const;
