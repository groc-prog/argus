import { Events, type Interaction } from 'discord.js';
import logger from '../../utilities/logger';
import { client } from '../client';

export default {
  name: Events.InteractionCreate,

  async execute(interaction: Interaction) {
    if (!interaction.isAutocomplete()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command || !command.autocomplete) return;

    try {
      logger.info({ command: command.data.name }, `Received autocomplete interaction`);
      await command.autocomplete(interaction);
      logger.info({ command: command.data.name }, `Autocomplete interaction finished`);
    } catch (err) {
      logger.error(
        { err, command: command.data.name },
        'Unhandled error during autocomplete interaction handling',
      );
    }
  },
};
