import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler } from './middleware/errorHandler';
import { ipAllowlist } from './middleware/ipAllowlist';
import { env } from './config/env';
import { authRouter } from './modules/auth/auth.routes';
import { twoFactorRouter } from './modules/auth/twoFactor.routes';
import { casesRouter } from './modules/cases/cases.routes';
import { eventsRouter } from './modules/events/events.routes';
import { caseContactsRouter } from './modules/cases/caseContacts.routes';
import { caseContributorsRouter } from './modules/cases/caseContributors.routes';
import { caseAuditLogRouter } from './modules/cases/caseAuditLog.routes';
import { caseTagsRouter } from './modules/cases/caseTags.routes';
import { caseDocumentsRouter } from './modules/cases/caseDocuments.routes';
import { caseCommentsRouter } from './modules/cases/caseComments.routes';
import { contactsRouter } from './modules/contacts/contacts.routes';
import { tagsRouter } from './modules/tags/tags.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { searchRouter } from './modules/search/search.routes';
import { graphRouter } from './modules/graph/graph.routes';
import { reportRouter } from './modules/report/report.routes';
import { geoRouter } from './modules/geo/geo.routes';
import { calendarRouter } from './modules/calendar/calendar.routes';
import { editorialProjectsRouter } from './modules/editorial/editorialProjects.routes';
import { editorialProjectContributorsRouter } from './modules/editorial/editorialProjectContributors.routes';
import { editorialProjectCasesRouter } from './modules/editorial/editorialProjectCases.routes';
import { editorialProjectMilestonesRouter } from './modules/editorial/editorialProjectMilestones.routes';

export const app = express();

// Only takes effect when TRUST_PROXY=true (see config/env.ts) -- required
// for ipAllowlist below to see the real visitor's address rather than a
// reverse proxy's, on deployments that sit behind one (a typical cPanel
// Node app does).
app.set('trust proxy', env.TRUST_PROXY);

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

// Registered before ipAllowlist so uptime checks / hosting-panel health
// probes keep working even when the allowlist is active and doesn't
// include the monitoring service's IP.
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// brief §5, "liste blanche d'IP" -- a no-op unless IP_ALLOWLIST is set.
app.use(ipAllowlist);

app.use('/api/auth', authRouter);
app.use('/api/auth/2fa', twoFactorRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/search', searchRouter);
app.use('/api/graph', graphRouter);
app.use('/api/geo', geoRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/editorial-projects', editorialProjectsRouter);
app.use('/api/editorial-projects/:projectId/contributors', editorialProjectContributorsRouter);
app.use('/api/editorial-projects/:projectId/cases', editorialProjectCasesRouter);
app.use('/api/editorial-projects/:projectId/milestones', editorialProjectMilestonesRouter);
app.use('/api/cases', casesRouter);
app.use('/api/cases/:caseId/events', eventsRouter);
app.use('/api/cases/:caseId/contacts', caseContactsRouter);
app.use('/api/cases/:caseId/contributors', caseContributorsRouter);
app.use('/api/cases/:caseId/audit-log', caseAuditLogRouter);
app.use('/api/cases/:caseId/tags', caseTagsRouter);
app.use('/api/cases/:caseId/documents', caseDocumentsRouter);
app.use('/api/cases/:caseId/comments', caseCommentsRouter);
app.use('/api/cases/:caseId/report', reportRouter);

// Must be registered after all routes.
app.use(errorHandler);
