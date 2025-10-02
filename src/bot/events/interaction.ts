import { Events, type Interaction } from 'discord.js';
import logger from '../../utilities/logger';
import { client } from '../client';

export default {
  name: Events.InteractionCreate,
  async execute(interaction: Interaction) {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    logger.info(`Received interaction for command ${command.data.name}`);
    await command.execute(interaction);
  },
};
