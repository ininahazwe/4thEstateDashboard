import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../../config/db';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../middleware/auditLog';
import { CaseRole } from '../../middleware/auth';
import { listCaseContributorIds } from './caseContributors.service';
import { notifyUsers, getUserFullName } from '../notifications/notifications.service';

export type CommentResourceType = 'case' | 'event' | 'document';
export type CommentVisibility = 'private' | 'shared';

interface CommentRow extends RowDataPacket {
  id: number;
  resource_type: CommentResourceType;
  resource_id: number;
  parent_comment_id: number | null;
  author_id: number;
  author_name: string;
  body: string;
  visibility: CommentVisibility;
  mentions: unknown;
  created_at: string;
  updated_at: string;
}

function mapComment(row: CommentRow) {
  return {
    id: row.id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    parentCommentId: row.parent_comment_id,
    authorId: row.author_id,
    authorName: row.author_name,
    body: row.body,
    visibility: row.visibility,
    mentions: row.mentions ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// A comment always lives under a case for permission purposes, but can be
// attached to the case itself, one of its events, or one of its documents
// (brief §4.5). This guards against attaching a comment to a resource from
// a different case entirely.
async function assertResourceBelongsToCase(
  caseId: number,
  resourceType: CommentResourceType,
  resourceId: number
) {
  if (resourceType === 'case') {
    if (resourceId !== caseId) {
      throw new AppError(400, 'resourceId must equal the case id for a case-level comment');
    }
    return;
  }

  if (resourceType === 'event') {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM investigation_events WHERE id = :resourceId AND case_id = :caseId',
      { resourceId, caseId }
    );
    if (!rows[0]) {
      throw new AppError(404, 'Event not found in this case');
    }
    return;
  }

  // resourceType === 'document'
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id FROM case_documents WHERE id = :resourceId AND case_id = :caseId AND deleted_at IS NULL',
    { resourceId, caseId }
  );
  if (!rows[0]) {
    throw new AppError(404, 'Document not found in this case');
  }
}

// Visibility: "shared" comments are visible to every case member; "private"
// ones only to their own author (brief §4.5 "Prives (auteur seul)").
export async function listComments(
  caseId: number,
  resourceType: CommentResourceType,
  resourceId: number,
  viewerId: number
) {
  await assertResourceBelongsToCase(caseId, resourceType, resourceId);

  const [rows] = await pool.query<CommentRow[]>(
    `SELECT c.id, c.resource_type, c.resource_id, c.parent_comment_id, c.author_id,
            u.full_name AS author_name, c.body, c.visibility, c.mentions, c.created_at, c.updated_at
     FROM comments c
     JOIN users u ON u.id = c.author_id
     WHERE c.resource_type = :resourceType AND c.resource_id = :resourceId AND c.deleted_at IS NULL
       AND (c.visibility = 'shared' OR c.author_id = :viewerId)
     ORDER BY c.created_at ASC`,
    { resourceType, resourceId, viewerId }
  );

  return rows.map(mapComment);
}

export interface CreateCommentInput {
  resourceType: CommentResourceType;
  resourceId: number;
  body: string;
  visibility?: CommentVisibility;
  parentCommentId?: number;
  mentions?: unknown;
}

export async function createComment(caseId: number, input: CreateCommentInput, actorId: number) {
  await assertResourceBelongsToCase(caseId, input.resourceType, input.resourceId);

  if (input.parentCommentId) {
    const [parentRows] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM comments
       WHERE id = :id AND resource_type = :resourceType AND resource_id = :resourceId AND deleted_at IS NULL`,
      { id: input.parentCommentId, resourceType: input.resourceType, resourceId: input.resourceId }
    );
    if (!parentRows[0]) {
      throw new AppError(404, 'Parent comment not found on this resource');
    }
  }

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO comments (resource_type, resource_id, parent_comment_id, author_id, body, visibility, mentions)
     VALUES (:resourceType, :resourceId, :parentCommentId, :authorId, :body, :visibility, :mentions)`,
    {
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      parentCommentId: input.parentCommentId ?? null,
      authorId: actorId,
      body: input.body,
      visibility: input.visibility ?? 'shared',
      mentions: input.mentions ? JSON.stringify(input.mentions) : null,
    }
  );

  await recordAudit({
    actorId,
    caseId,
    action: 'create',
    resourceType: 'comment',
    resourceId: result.insertId,
    after: { body: input.body, visibility: input.visibility ?? 'shared' },
  });

  // Only "shared" comments notify other contributors — a "private" one is
  // meant for the author's eyes only (brief §4.5), so no one else should
  // learn it exists, let alone see a snippet of it.
  if ((input.visibility ?? 'shared') === 'shared') {
    const contributorIds = await listCaseContributorIds(caseId);
    const [caseRows] = await pool.query<RowDataPacket[]>('SELECT title FROM cases WHERE id = :caseId', {
      caseId,
    });
    const actorName = await getUserFullName(actorId);
    await notifyUsers(contributorIds, 'new_action', {
      actorId,
      payload: {
        caseId,
        caseTitle: caseRows[0]?.title ?? null,
        actorName,
        snippet: input.body.slice(0, 140),
        onResourceType: input.resourceType,
        onResourceId: input.resourceId,
      },
    });
  }

  return listComments(caseId, input.resourceType, input.resourceId, actorId);
}

export async function updateComment(caseId: number, commentId: number, body: string, actorId: number) {
  const [rows] = await pool.query<CommentRow[]>('SELECT * FROM comments WHERE id = :commentId AND deleted_at IS NULL', {
    commentId,
  });
  const existing = rows[0];
  if (!existing) {
    throw new AppError(404, 'Comment not found');
  }
  if (existing.author_id !== actorId) {
    throw new AppError(403, 'You can only edit your own comments');
  }

  await pool.query('UPDATE comments SET body = :body WHERE id = :commentId', { body, commentId });

  await recordAudit({
    actorId,
    caseId,
    action: 'update',
    resourceType: 'comment',
    resourceId: commentId,
    after: { body },
  });

  return listComments(caseId, existing.resource_type, existing.resource_id, actorId);
}

export async function deleteComment(caseId: number, commentId: number, actorId: number, actorRole: CaseRole) {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT author_id FROM comments WHERE id = :commentId AND deleted_at IS NULL',
    { commentId }
  );
  const existing = rows[0];
  if (!existing) {
    throw new AppError(404, 'Comment not found');
  }
  // Moderation: a lead can remove any comment on their case; everyone else
  // can only remove their own.
  if (existing.author_id !== actorId && actorRole !== 'lead') {
    throw new AppError(403, 'Only the author or a case lead can delete this comment');
  }

  await pool.query('UPDATE comments SET deleted_at = NOW() WHERE id = :commentId', { commentId });

  await recordAudit({ actorId, caseId, action: 'delete', resourceType: 'comment', resourceId: commentId });
}
