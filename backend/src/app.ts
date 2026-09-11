import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './modules/auth/auth.routes';
import { casesRouter } from './modules/cases/cases.routes';
import { eventsRouter } from './modules/events/events.routes';
import { caseContactsRouter } from './modules/cases/caseContacts.routes';
import { contactsRouter } from './modules/contacts/contacts.routes';

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/cases', casesRouter);
app.use('/api/cases/:caseId/events', eventsRouter);
app.use('/api/cases/:caseId/contacts', caseContactsRouter);

// Must be registered after all routes.
app.use(errorHandler);
