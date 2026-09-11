import { Request, Response } from 'express';
import { z } from 'zod';
import { parseId } from '../../utils/parseId';
import { createEvent, deleteEvent, getEventById, listEventsForCase, updateEvent } from './events.service';

const eventTypeEnum = z.enum([
  'interview',
  'meeting',
  'call',
  'field_visit',
  'document_analysis',
  'key_discovery',
  'dead_end',
  'pivot',
  'publication',
]);

const followUpStatusEnum = z.enum(['to_process', 'in_progress', 'resolved', 'no_further_action']);
const sensitivityEnum = z.enum(['public', 'internal', 'confidential', 'highly_sensitive']);

const eventFields = {
  type: eventTypeEnum,
  eventDate: z.string().min(1), // ISO 8601 datetime, e.g. "2026-09-15T14:30:00Z"
  location: z.string().optional(),
  locationLat: z.number().min(-90).max(90).optional(),
  locationLng: z.number().min(-180).max(180).optional(),
  reason: z.string().optional(),
  findingsSummary: z.any().optional(), // free-form JSON: bullet points, structured notes, etc.
  sensitivity: sensitivityEnum.optional(),
  followUpStatus: followUpStatusEnum.optional(),
  contactIds: z.array(z.number().int().positive()).optional(),
};

const createEventSchema = z.object(eventFields);
const updateEventSchema = z.object(eventFields).partial();

export async function listEventsHandler(req: Request, res: Response) {
  const caseId = parseId(req.params.caseId, 'case id');
  const events = await listEventsForCase(caseId);
  res.json(events);
}

export async function createEventHandler(req: Request, res: Response) {
  const caseId = parseId(req.params.caseId, 'case id');
  const input = createEventSchema.parse(req.body);
  const created = await createEvent(caseId, input, req.user!.id);
  res.status(201).json(created);
}

export async function getEventHandler(req: Request, res: Response) {
  const caseId = parseId(req.params.caseId, 'case id');
  const eventId = parseId(req.params.eventId, 'event id');
  const event = await getEventById(caseId, eventId, req.user!.id);
  res.json(event);
}

export async function updateEventHandler(req: Request, res: Response) {
  const caseId = parseId(req.params.caseId, 'case id');
  const eventId = parseId(req.params.eventId, 'event id');
  const input = updateEventSchema.parse(req.body);
  const updated = await updateEvent(caseId, eventId, input, req.user!.id);
  res.json(updated);
}

export async function deleteEventHandler(req: Request, res: Response) {
  const caseId = parseId(req.params.caseId, 'case id');
  const eventId = parseId(req.params.eventId, 'event id');
  await deleteEvent(caseId, eventId, req.user!.id);
  res.status(204).send();
}
