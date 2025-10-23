import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import mongoose from 'mongoose';
import logger from './utilities/logger';
import { initializeDiscordClient } from './bot/client';
import { ensureEnvironmentConfigured } from './utilities/env';

ensureEnvironmentConfigured();

dayjs.extend(timezone);
dayjs.extend(utc);

mongoose.connection.on('connected', () => {
  logger.info('Connected to MongoDB');
});
mongoose.connection.on('disconnected', () => {
  logger.warn('Lost connection to MongoDB, attempting to reconnect');
});
mongoose.connection.on('reconnected', () => {
  logger.info('Reconnected MongoDB');
});
mongoose.connection.on('error', (event) => {
  logger.error(event, 'MongoDB connection error');
});

logger.info('Connecting to MongoDB');
await mongoose.connect(process.env.MONGODB_URI);

await initializeDiscordClient();
