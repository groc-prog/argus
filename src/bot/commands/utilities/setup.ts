import { Locale, SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Guides you through the initial configuration of the bot.')
    .setDescriptionLocalization(Locale.German, 'Führt dich durch die Erstkonfiguration des Bots.'),
};

// const replies = {} as const;
