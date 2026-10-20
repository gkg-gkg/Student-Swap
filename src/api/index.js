// One entry point for data access. The *.mock.js signatures are the contract: the HTTP modules are cast to them,
// so a mismatch between mock and real implementation shows up in `npm run typecheck`.
// Pages import from here, never from *.mock.js / *.http.js,
// so switching to the real API is a one-flag change (config/env.js: USE_MOCKS).
import { USE_MOCKS } from '../config/env.js';
import * as eventsMock from './events.mock.js';
import * as eventsHttp from './events.http.js';
import * as listingsMock from './listings.mock.js';
import * as listingsHttp from './listings.http.js';
import * as offersMock from './offers.mock.js';
import * as offersHttp from './offers.http.js';
import * as ordersMock from './orders.mock.js';
import * as ordersHttp from './orders.http.js';
import * as payoutsMock from './payouts.mock.js';
import * as payoutsHttp from './payouts.http.js';
import * as reportsMock from './reports.mock.js';
import * as reportsHttp from './reports.http.js';
import * as uploadsMock from './uploads.mock.js';
import * as uploadsHttp from './uploads.http.js';
import * as notificationsMock from './notifications.mock.js';
import * as notificationsHttp from './notifications.http.js';
import * as adminMock from './admin.mock.js';
import * as adminHttp from './admin.http.js';
import * as usersMock from './users.mock.js';
import * as usersHttp from './users.http.js';
import * as ticketAiMock from './ticket-ai.mock.js';
import * as ticketAiHttp from './ticket-ai.http.js';

export const events = /** @type {typeof eventsMock} */ (USE_MOCKS ? eventsMock : eventsHttp);
export const listings = /** @type {typeof listingsMock} */ (USE_MOCKS ? listingsMock : listingsHttp);
export const offers = /** @type {typeof offersMock} */ (USE_MOCKS ? offersMock : offersHttp);
export const orders = /** @type {typeof ordersMock} */ (USE_MOCKS ? ordersMock : ordersHttp);
export const payouts = /** @type {typeof payoutsMock} */ (USE_MOCKS ? payoutsMock : payoutsHttp);
export const reports = /** @type {typeof reportsMock} */ (USE_MOCKS ? reportsMock : reportsHttp);
export const uploads = /** @type {typeof uploadsMock} */ (USE_MOCKS ? uploadsMock : uploadsHttp);
export const notifications = /** @type {typeof notificationsMock} */ (
  USE_MOCKS ? notificationsMock : notificationsHttp
);
export const admin = /** @type {typeof adminMock} */ (USE_MOCKS ? adminMock : adminHttp);
export const users = /** @type {typeof usersMock} */ (USE_MOCKS ? usersMock : usersHttp);
// AI features call Claude on the backend. Real mode = the HTTP version; the key never touches the browser.
export const ticketAi = /** @type {typeof ticketAiMock} */ (USE_MOCKS ? ticketAiMock : ticketAiHttp);
