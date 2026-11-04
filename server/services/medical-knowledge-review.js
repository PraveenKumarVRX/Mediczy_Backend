export async function reviewMedicalKnowledge(database, { id, status, version, dueAt, reviewerUid, role, expectedFingerprint }) {
  if (!['medical_director'].includes(role)) throw Object.assign(new Error('Medical director review required'), { statusCode: 403 });
  if (!/^[A-Z0-9]{6}$/.test(reviewerUid || '')) throw Object.assign(new Error('Registered reviewer UID required'), { statusCode: 400 });
  if (!['approved', 'revoked'].includes(status) || !Number.isSafeInteger(Number(id)) || Number(id) < 1) throw Object.assign(new Error('Invalid review'), { statusCode: 400 });
  const due = new Date(dueAt);
  if (status === 'approved' && (!/^[a-f0-9]{64}$/.test(expectedFingerprint || '') || typeof version !== 'string' || !version || String(version).length > 100 || !Number.isFinite(due.getTime()) || due <= new Date())) throw Object.assign(new Error('Source version and future review date required'), { statusCode: 400 });
  const { rows } = await database.query(`UPDATE ai_knowledge_documents SET review_status=$2,source_version=$3,review_due_at=$4,approved_content_hash=CASE WHEN $2='approved' THEN $6 ELSE NULL END,
    metadata=jsonb_set(jsonb_set(COALESCE(metadata,'{}'),'{medical_review}', $5::jsonb),'{medical_review_history}',COALESCE(metadata->'medical_review_history','[]'::jsonb)||jsonb_build_array($5::jsonb)),updated_at=NOW()
    WHERE id=$1 AND scope='global' AND ($2='revoked' OR (status='ready' AND $6=(SELECT encode(sha256(convert_to(COALESCE(string_agg(c.content,chr(10) ORDER BY c.chunk_index,c.id),''),'UTF8')),'hex') FROM ai_document_chunks c WHERE c.document_id=$1))) RETURNING id,review_status,source_version,review_due_at`,
  [id, status, status === 'approved' ? version : null, status === 'approved' ? due : null,
    JSON.stringify({ reviewerUid, status, version, reviewedAt: new Date().toISOString() }), expectedFingerprint || null]);
  if (!rows.length) throw Object.assign(new Error('Knowledge document missing, outside scope or changed; preview again'), { statusCode: 404 });
  return rows[0];
}

export async function previewMedicalKnowledge(database, { id, role }) {
  if (role !== 'medical_director') throw Object.assign(new Error('Medical director review required'),{statusCode:403});
  const {rows}=await database.query(`SELECT d.id,d.title,d.source_version,
    jsonb_agg(jsonb_build_object('chunkId',c.id,'text',c.content) ORDER BY c.chunk_index,c.id) AS chunks,
    encode(sha256(convert_to(string_agg(c.content,chr(10) ORDER BY c.chunk_index,c.id),'UTF8')),'hex') AS fingerprint
    FROM ai_knowledge_documents d JOIN ai_document_chunks c ON c.document_id=d.id
    WHERE d.id=$1 AND d.scope='global' AND d.status='ready' GROUP BY d.id`,[id]);
  if(!rows.length) throw Object.assign(new Error('Ready global source not found'),{statusCode:404});
  return rows[0];
}
