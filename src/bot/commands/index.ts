import statusCommand from './utilities/status';
import setupCommand from './utilities/setup';
import helpCommand from './utilities/help';
import setUserPreferencesCommand from './users/set-preferences';
import reactivateNotificationCommand from './users/reactivate';
import notificationsCommand from './users/notifications';
import deleteNotificationCommand from './users/delete';
import addNotificationCommand from './users/add';
import detailsCommand from './movies/details';
import featuresCommand from './movies/features';
import screeningsCommand from './movies/screenings';

export default [
  statusCommand,
  setupCommand,
  helpCommand,
  setUserPreferencesCommand,
  reactivateNotificationCommand,
  notificationsCommand,
  deleteNotificationCommand,
  addNotificationCommand,
  detailsCommand,
  featuresCommand,
  screeningsCommand,
];
