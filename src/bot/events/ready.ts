import { Client, Events } from 'discord.js';
import logger from '../../utilities/logger';

export default {
  name: Events.ClientReady,
  once: true,
  execute(client: Client<true>) {
    logger.info(`Bot ${client.user.tag} ready to rumble`);
  },
};
