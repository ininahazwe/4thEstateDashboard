import { Request, Response } from 'express';
import { z } from 'zod';
import { parseId } from '../../utils/parseId';
import { createContact, deleteContact, getContactById, listContacts, updateContact } from './contacts.service';

const sensitivityEnum = z.enum(['none', 'protected_witness', 'at_risk_source']);

const contactFields = {
  fullName: z.string().min(1).max(255),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  organization: z.string().max(255).optional(),
  roleOrTitle: z.string().max(150).optional(),
  notes: z.string().optional(),
  sensitivity: sensitivityEnum.optional(),
  reliability: z.number().int().min(1).max(5).optional(),
  privateNotes: z.string().optional(),
};

const createContactSchema = z.object(contactFields);
const updateContactSchema = z.object(contactFields).partial();

export async function listContactsHandler(req: Request, res: Response) {
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const contacts = await listContacts(search);
  res.json(contacts);
}

export async function createContactHandler(req: Request, res: Response) {
  const input = createContactSchema.parse(req.body);
  const created = await createContact(input, req.user!.id);
  res.status(201).json(created);
}

export async function getContactHandler(req: Request, res: Response) {
  const contactId = parseId(req.params.id, 'contact id');
  const contact = await getContactById(contactId, req.user!.id);
  res.json(contact);
}

export async function updateContactHandler(req: Request, res: Response) {
  const contactId = parseId(req.params.id, 'contact id');
  const input = updateContactSchema.parse(req.body);
  const updated = await updateContact(contactId, input, req.user!.id);
  res.json(updated);
}

export async function deleteContactHandler(req: Request, res: Response) {
  const contactId = parseId(req.params.id, 'contact id');
  await deleteContact(contactId, req.user!.id);
  res.status(204).send();
}
