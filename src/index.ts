import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import mongoose from 'mongoose';
import logger from './utilities/logger';
import { initializeDiscordClient } from './bot/client';

dayjs.extend(timezone);
dayjs.extend(utc);

const uri = process.env.MONGODB_URI;
if (!uri) {
  logger.error(`No MongoDB URI in environment`);
  process.exit(1);
}

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
await mongoose.connect(uri);

await initializeDiscordClient();
