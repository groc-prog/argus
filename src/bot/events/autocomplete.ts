import { Events, type Interaction } from 'discord.js';
import logger from '../../utilities/logger';
import { client } from '../client';

export default {
  name: Events.InteractionCreate,

  async execute(interaction: Interaction) {
    if (!interaction.isAutocomplete()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command || !command.autocomplete) return;

    logger.info(`Received autocomplete interaction for command ${command.data.name}`);
    await command.autocomplete(interaction);
  },
};
