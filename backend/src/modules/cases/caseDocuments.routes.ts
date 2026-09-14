import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { parseId } from '../../utils/parseId';
import { requireAuth, requireCaseRole } from '../../middleware/auth';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../middleware/auditLog';
import { UPLOADS_DIR, caseUploadsDir } from '../../config/storage';
import { decryptDocumentBuffer, encryptDocumentBuffer } from '../../utils/documentCrypto';
import { extractDocumentText, isTextExtractable } from '../../utils/documentTextExtraction';
import {
  createCaseDocument,
  deleteCaseDocument,
  DocumentFileType,
  getCaseDocumentForDownload,
  listCaseDocuments,
  updateDocumentExtractedText,
} from './caseDocuments.service';

const fileTypeEnum = z.enum(['contract', 'report', 'photo', 'audio', 'video', 'other']);
const sensitivityEnum = z.enum(['public', 'internal', 'confidential', 'highly_sensitive']);

const metadataSchema = z.object({
  fileType: fileTypeEnum.optional().default('other'),
  sensitivity: sensitivityEnum.optional(),
  sourceDescription: z.string().max(255).optional(),
  extractedDate: z.string().optional(),
  eventId: z.coerce.number().int().positive().optional(),
});

// 25MB covers documents/photos comfortably; revisit if audio/video uploads
// turn out to need more headroom.
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// Memory storage rather than multer's diskStorage: the file needs to pass
// through encryptDocumentBuffer() (brief §5, "chiffrement au repos") and,
// for images/PDFs, extractDocumentText() before anything is written to
// disk, so the route handler needs the raw buffer rather than a path
// multer already wrote to.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } });

// Mounted at /api/cases/:caseId/documents in app.ts.
export const caseDocumentsRouter = Router({ mergeParams: true });

caseDocumentsRouter.use(requireAuth);

caseDocumentsRouter.get(
  '/',
  requireCaseRole('read_only'),
  asyncHandler(async (req, res) => {
    const caseId = parseId(req.params.caseId, 'case id');
    res.json(await listCaseDocuments(caseId));
  })
);

caseDocumentsRouter.post(
  '/',
  requireCaseRole('collaborator'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const caseId = parseId(req.params.caseId, 'case id');
    if (!req.file) {
      throw new AppError(400, 'No file uploaded (expected a "file" field)');
    }

    const input = metadataSchema.parse(req.body);
    const safeExt = path.extname(req.file.originalname).slice(0, 20);
    const filename = `${crypto.randomUUID()}${safeExt}`;
    const relativePath = path.join(`case_${caseId}`, filename);
    const absolutePath = path.join(caseUploadsDir(caseId), filename);

    // Encrypt before it ever touches disk (no plaintext temp file) --
    // encryptDocumentBuffer() is a no-op passthrough when
    // DOCUMENT_ENCRYPTION_KEY isn't configured, so this is safe either way.
    fs.writeFileSync(absolutePath, encryptDocumentBuffer(req.file.buffer));

    const ocrApplicable = isTextExtractable(req.file.mimetype);

    const created = await createCaseDocument(
      caseId,
      {
        fileName: req.file.originalname,
        storagePath: relativePath,
        fileType: input.fileType as DocumentFileType,
        sensitivity: input.sensitivity,
        sourceDescription: input.sourceDescription,
        extractedDate: input.extractedDate,
        eventId: input.eventId,
        ocrStatus: ocrApplicable ? 'pending' : 'not_applicable',
      },
      req.user!.id
    );
    res.status(201).json(created);

    // Fire-and-forget: OCR (images) / text-layer extraction (PDFs) can take
    // a few seconds, so it runs after the response rather than blocking the
    // upload. Uses the buffer already in memory -- no need to re-read and
    // decrypt the file just written. Never lets a failure surface to the
    // client; the document is simply left unsearchable by content
    // (ocr_status = 'failed').
    if (ocrApplicable) {
      extractDocumentText(req.file.buffer, req.file.mimetype)
        .then((text) => updateDocumentExtractedText(created.id, text ? 'done' : 'failed', text))
        .catch((err) => {
          console.error(`Text extraction follow-up failed for document ${created.id}:`, err);
          updateDocumentExtractedText(created.id, 'failed', null).catch(() => undefined);
        });
    }
  })
);

caseDocumentsRouter.get(
  '/:documentId/download',
  requireCaseRole('read_only'),
  asyncHandler(async (req, res) => {
    const caseId = parseId(req.params.caseId, 'case id');
    const documentId = parseId(req.params.documentId, 'document id');
    const doc = await getCaseDocumentForDownload(caseId, documentId);

    const absolutePath = path.join(UPLOADS_DIR, doc.storage_path);
    if (!fs.existsSync(absolutePath)) {
      throw new AppError(404, 'File missing on disk');
    }

    let plainBuffer: Buffer;
    try {
      plainBuffer = decryptDocumentBuffer(fs.readFileSync(absolutePath));
    } catch (err) {
      console.error(`Failed to decrypt document ${documentId}:`, err);
      throw new AppError(500, 'Unable to decrypt this file. Contact an administrator.');
    }

    await recordAudit({
      actorId: req.user!.id,
      caseId,
      action: 'download',
      resourceType: 'case_document',
      resourceId: documentId,
    });

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(doc.file_name).replace(/'/g, '%27')}"`
    );
    res.send(plainBuffer);
  })
);

caseDocumentsRouter.delete(
  '/:documentId',
  requireCaseRole('lead'),
  asyncHandler(async (req, res) => {
    const caseId = parseId(req.params.caseId, 'case id');
    const documentId = parseId(req.params.documentId, 'document id');
    await deleteCaseDocument(caseId, documentId, req.user!.id);
    res.status(204).send();
  })
);
