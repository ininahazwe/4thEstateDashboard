import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool } from '../../config/db';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../middleware/auditLog';
import { Sensitivity } from './cases.types';

export type DocumentFileType = 'contract' | 'report' | 'photo' | 'audio' | 'video' | 'other';
export type OcrStatus = 'not_applicable' | 'pending' | 'done' | 'failed';

interface DocumentRow extends RowDataPacket {
  id: number;
  case_id: number;
  event_id: number | null;
  file_name: string;
  storage_path: string;
  file_type: DocumentFileType;
  sensitivity: Sensitivity | null;
  source_description: string | null;
  extracted_date: string | null;
  extracted_text: string | null;
  ocr_status: OcrStatus;
  uploaded_by: number;
  uploaded_at: string;
}

function mapDocument(row: DocumentRow) {
  return {
    id: row.id,
    caseId: row.case_id,
    eventId: row.event_id,
    fileName: row.file_name,
    fileType: row.file_type,
    sensitivity: row.sensitivity,
    sourceDescription: row.source_description,
    extractedDate: row.extracted_date,
    ocrStatus: row.ocr_status,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
  };
}

// Only metadata — never storage_path, which is an internal disk location,
// not something the frontend needs (downloads go through the dedicated
// /download route, which resolves it server-side).
export async function listCaseDocuments(caseId: number) {
  const [rows] = await pool.query<DocumentRow[]>(
    `SELECT id, case_id, event_id, file_name, storage_path, file_type, sensitivity,
            source_description, extracted_date, extracted_text, ocr_status, uploaded_by, uploaded_at
     FROM case_documents
     WHERE case_id = :caseId AND deleted_at IS NULL
     ORDER BY uploaded_at DESC`,
    { caseId }
  );
  return rows.map(mapDocument);
}

export interface CreateDocumentInput {
  fileName: string;
  storagePath: string;
  fileType: DocumentFileType;
  sensitivity?: Sensitivity;
  sourceDescription?: string;
  extractedDate?: string;
  eventId?: number;
  ocrStatus?: OcrStatus;
}

export async function createCaseDocument(caseId: number, input: CreateDocumentInput, actorId: number) {
  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO case_documents
      (case_id, event_id, file_name, storage_path, file_type, sensitivity, source_description, extracted_date, ocr_status, uploaded_by)
     VALUES
      (:caseId, :eventId, :fileName, :storagePath, :fileType, :sensitivity, :sourceDescription, :extractedDate, :ocrStatus, :uploadedBy)`,
    {
      caseId,
      eventId: input.eventId ?? null,
      fileName: input.fileName,
      storagePath: input.storagePath,
      fileType: input.fileType,
      sensitivity: input.sensitivity ?? null,
      sourceDescription: input.sourceDescription ?? null,
      extractedDate: input.extractedDate ?? null,
      ocrStatus: input.ocrStatus ?? 'not_applicable',
      uploadedBy: actorId,
    }
  );

  const documentId = result.insertId;

  await recordAudit({
    actorId,
    caseId,
    action: 'create',
    resourceType: 'case_document',
    resourceId: documentId,
    after: { fileName: input.fileName, fileType: input.fileType },
  });

  const [rows] = await pool.query<DocumentRow[]>(
    `SELECT id, case_id, event_id, file_name, storage_path, file_type, sensitivity,
            source_description, extracted_date, extracted_text, ocr_status, uploaded_by, uploaded_at
     FROM case_documents WHERE id = :documentId`,
    { documentId }
  );
  return mapDocument(rows[0]);
}

// Internal use only (the download route needs storage_path); never
// returned directly to the frontend.
export async function getCaseDocumentForDownload(caseId: number, documentId: number) {
  const [rows] = await pool.query<DocumentRow[]>(
    `SELECT id, case_id, event_id, file_name, storage_path, file_type, sensitivity,
            source_description, extracted_date, extracted_text, ocr_status, uploaded_by, uploaded_at
     FROM case_documents
     WHERE id = :documentId AND case_id = :caseId AND deleted_at IS NULL`,
    { documentId, caseId }
  );
  if (!rows[0]) {
    throw new AppError(404, 'Document not found');
  }
  return rows[0];
}

// Soft delete only, consistent with cases/events/contacts — the physical
// file is intentionally left on disk (retention/audit trail), it's just
// hidden from listings via the deleted_at filter above.
export async function deleteCaseDocument(caseId: number, documentId: number, actorId: number) {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM case_documents WHERE id = :documentId AND case_id = :caseId AND deleted_at IS NULL',
    { documentId, caseId }
  );
  if (!rows[0]) {
    throw new AppError(404, 'Document not found');
  }

  await pool.query('UPDATE case_documents SET deleted_at = NOW() WHERE id = :documentId', { documentId });

  await recordAudit({
    actorId,
    caseId,
    action: 'delete',
    resourceType: 'case_document',
    resourceId: documentId,
  });
}

// Called from the background text-extraction step kicked off right after
// upload (see caseDocuments.routes.ts) -- runs OCR/text-layer extraction
// without blocking the upload response, then writes the result back here.
export async function updateDocumentExtractedText(
  documentId: number,
  status: OcrStatus,
  text: string | null
): Promise<void> {
  await pool.query(
    'UPDATE case_documents SET ocr_status = :status, extracted_text = :text WHERE id = :documentId',
    { status, text, documentId }
  );
}
