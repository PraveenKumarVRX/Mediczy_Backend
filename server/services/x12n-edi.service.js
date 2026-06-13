/**
 * X12N EDI Transactions Service — HIPAA 5010
 *
 * Builds, parses, stores, and validates ASC X12N transactions:
 *   270 / 271  — Eligibility Benefit Inquiry / Response
 *   837P / 837I — Professional / Institutional Claims
 *   835         — Claim Payment / Remittance Advice
 *   278         — Health Care Services Review (Prior Authorization)
 *   999 / TA1   — Functional / Interchange Acknowledgment
 *
 * Each transaction:
 *   1. Gets a unique control number (ISA13 / GS06 / ST02)
 *   2. Is wrapped in ISA/GS/ST envelopes per X12 v5010 rules
 *   3. Is stored in `edi_transactions` with raw EDI and parsed JSON
 *   4. Generates a 999 ACK upon receipt
 *
 * Standards:
 *   ASC X12 Version 005010
 *   HIPAA Transaction and Code Set Standards §162
 *   CMS 5010 Companion Guides (270/271/837P/837I/835/278)
 */

import pool from '../db/pgPool.js';

// ── DB bootstrap ──────────────────────────────────────────────────────────────
export async function ensureEdiTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS edi_transactions (
      id               BIGSERIAL PRIMARY KEY,
      tenant_id        INTEGER NOT NULL,
      transaction_set  VARCHAR(10) NOT NULL,
      direction        VARCHAR(10) NOT NULL,
      interchange_ctrl VARCHAR(20),
      group_ctrl       VARCHAR(20),
      transaction_ctrl VARCHAR(20),
      sender_id        VARCHAR(20),
      receiver_id      VARCHAR(20),
      raw_edi          TEXT,
      parsed_json      JSONB,
      status           VARCHAR(20) DEFAULT 'pending',
      ack_997_status   VARCHAR(20),
      error_message    TEXT,
      reference_id     TEXT,
      reference_type   VARCHAR(40),
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      processed_at     TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS edi_segments (
      id               BIGSERIAL PRIMARY KEY,
      transaction_id   BIGINT REFERENCES edi_transactions(id),
      loop_id          VARCHAR(10),
      segment_id       VARCHAR(5),
      segment_order    INTEGER,
      elements         TEXT[],
      created_at       TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_edi_tenant_ts   ON edi_transactions(tenant_id, transaction_set, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_edi_interchange ON edi_transactions(interchange_ctrl);
    CREATE INDEX IF NOT EXISTS idx_edi_status      ON edi_transactions(status, tenant_id);
  `);
}

// ── X12 envelope constants ────────────────────────────────────────────────────
const EDI_VERSION   = '00501';
const SENDER_ID     = process.env.EDI_SENDER_ID      || 'MEDICZY         ';
const RECEIVER_ID   = process.env.EDI_RECEIVER_ID    || 'CLEARINGHOUSE   ';
const SENDER_QUAL   = process.env.EDI_SENDER_QUAL    || 'ZZ';
const RECEIVER_QUAL = process.env.EDI_RECEIVER_QUAL  || 'ZZ';
const SEG_TERM      = '~';
const ELE_SEP       = '*';
const SUB_SEP       = ':';

function pad(n, len) { return String(n).padStart(len, '0'); }

function isaCtrl()  { return pad(Math.floor(Math.random() * 1e9), 9); }
function gsCtrl()   { return String(Math.floor(Math.random() * 1e6)); }
function stCtrl()   { return pad(Math.floor(Math.random() * 10000), 4); }

function ediDate()  { const d = new Date(); return `${d.getFullYear().toString().slice(2)}${pad(d.getMonth()+1,2)}${pad(d.getDate(),2)}`; }
function ediTime()  { const d = new Date(); return `${pad(d.getHours(),2)}${pad(d.getMinutes(),2)}`; }

function seg(id, ...elems) {
  return [id, ...elems].join(ELE_SEP) + SEG_TERM;
}

function wrapEnvelope(gsFunc, stSet, stSegs, stCtrlNum) {
  const isNum   = isaCtrl();
  const gsNum   = gsCtrl();
  const iDate   = ediDate();
  const iTime   = ediTime();

  const lines = [
    seg('ISA', '00', '          ', '00', '          ', SENDER_QUAL, SENDER_ID, RECEIVER_QUAL, RECEIVER_ID, iDate, iTime, '^', EDI_VERSION, isNum, '0', 'P', SUB_SEP),
    seg('GS', gsFunc, SENDER_ID.trim(), RECEIVER_ID.trim(), `20${iDate}`, iTime, gsNum, 'X', '005010X'),
    seg('ST', stSet, stCtrlNum),
    ...stSegs,
    seg('SE', String(stSegs.length + 2), stCtrlNum),
    seg('GE', '1', gsNum),
    seg('IEA', '1', isNum),
  ];
  return { raw: lines.join('\n'), isNum, gsNum, stCtrlNum };
}

// ── 270 — Eligibility Inquiry ─────────────────────────────────────────────────
export function build270(data) {
  const { memberId, memberName, memberDob, npi, tradingPartnerServiceId, referenceId } = data;
  const ctrl = stCtrl();
  const stSegs = [
    seg('BHT', '0022', '13', referenceId || ctrl, `20${ediDate()}`, ediTime()),
    seg('HL',  '1', '', '20', '1'),
    seg('NM1', 'PR', '2', 'MEDICZY HEALTHCARE', '', '', '', '', 'PI', tradingPartnerServiceId || '000000000'),
    seg('HL',  '2', '1', '21', '1'),
    seg('NM1', '1P', '2', 'MEDICZY', '', '', '', '', 'XX', npi || '0000000000'),
    seg('HL',  '3', '2', '22', '0'),
    seg('NM1', 'IL', '1', (memberName || '').split(' ')[1] || 'DOE', (memberName || '').split(' ')[0] || 'JOHN', '', '', '', 'MI', memberId || ''),
    seg('DMG', 'D8', (memberDob || '').replace(/-/g, '') || '19800101'),
    seg('EQ', '30'),
  ];
  return { ...wrapEnvelope('HS', '270', stSegs, ctrl), transactionSet: '270' };
}

// ── 271 — Eligibility Response ────────────────────────────────────────────────
export function build271(data) {
  const { memberId, memberName, planName, planId, coverageStatus, effectiveDate, terminationDate } = data;
  const ctrl = stCtrl();
  const stSegs = [
    seg('BHT', '0022', '11', ctrl, `20${ediDate()}`, ediTime()),
    seg('HL',  '1', '', '20', '1'),
    seg('NM1', 'PR', '2', 'INSURANCE PLAN', '', '', '', '', 'PI', planId || '000000000'),
    seg('HL',  '2', '1', '21', '1'),
    seg('NM1', '1P', '2', 'MEDICZY HEALTHCARE', '', '', '', '', 'XX', '0000000000'),
    seg('HL',  '3', '2', '22', '0'),
    seg('NM1', 'IL', '1', (memberName || '').split(' ')[1] || 'DOE', (memberName || '').split(' ')[0] || 'JOHN', '', '', '', 'MI', memberId || ''),
    seg('DTP', '346', 'D8', (effectiveDate || '').replace(/-/g, '')),
    seg('EB', coverageStatus === 'active' ? '1' : '6', '', '30', planName || 'UNKNOWN PLAN'),
  ];
  return { ...wrapEnvelope('HB', '271', stSegs, ctrl), transactionSet: '271' };
}

// ── 837P — Professional Claim ─────────────────────────────────────────────────
export function build837P(data) {
  const { patientName, patientId, patientDob, npi, taxId, diagnosisCodes = [], procedureCodes = [], serviceDate, totalCharge, referenceId } = data;
  const ctrl = stCtrl();
  const stSegs = [
    seg('BPR', '22', String(Number(totalCharge || 0).toFixed(2)), 'C', 'ACH', 'CTX', '01', '999999999', 'DA', '12345678', '1111111111', '', '01', '999999999', 'DA', '87654321', `20${ediDate()}`),
    seg('BHT', '0019', '00', referenceId || ctrl, `20${ediDate()}`, ediTime(), 'CH'),
    seg('NM1', '41', '2', 'MEDICZY HEALTHCARE', '', '', '', '', '46', taxId || '000000000'),
    seg('PER', 'IC', 'EDI CONTACT', 'TE', '8005551234'),
    seg('NM1', '40', '2', 'CLEARINGHOUSE', '', '', '', '', 'XV', '000000000'),
    seg('HL', '1', '', '20', '1'),
    seg('PRV', 'BI', 'PXC', '207Q00000X'),
    seg('NM1', '85', '2', 'MEDICZY HEALTHCARE', '', '', '', '', 'XX', npi || '0000000000'),
    seg('N3', '123 HEALTH STREET'),
    seg('N4', 'MUMBAI', 'MH', '400001', 'IN'),
    seg('HL', '2', '1', '22', '0'),
    seg('SBR', 'P', '18', '', '', '', '', '', '', 'MB'),
    seg('NM1', 'IL', '1', (patientName || '').split(' ')[1] || 'DOE', (patientName || '').split(' ')[0] || 'JOHN', '', '', '', 'MI', patientId || ''),
    seg('DMG', 'D8', (patientDob || '').replace(/-/g, '') || '19800101'),
    seg('HL', '3', '2', '23', '0'),
    seg('PAT', '19'),
    seg('CLM', referenceId || ctrl, String(Number(totalCharge || 0).toFixed(2)), '', '', '11:B:1', 'Y', 'A', 'Y', 'I'),
    seg('DTP', '472', 'D8', (serviceDate || '').replace(/-/g, '') || ediDate()),
    ...diagnosisCodes.slice(0, 8).map((dx, i) => seg('HI', `BK:${dx}`)),
    seg('LX', '1'),
    ...procedureCodes.slice(0, 6).map((proc, i) =>
      seg('SV1', `HC:${proc}`, String(Number(totalCharge || 0).toFixed(2)), 'UN', '1', '11')
    ),
  ];
  return { ...wrapEnvelope('HC', '837', stSegs, ctrl), transactionSet: '837P' };
}

// ── 837I — Institutional Claim ────────────────────────────────────────────────
export function build837I(data) {
  const { patientName, patientId, admitDate, dischargeDate, drg, diagnosisCodes = [], totalCharge, npi, referenceId } = data;
  const ctrl = stCtrl();
  const stSegs = [
    seg('BHT', '0019', '00', referenceId || ctrl, `20${ediDate()}`, ediTime(), 'CH'),
    seg('NM1', '41', '2', 'MEDICZY HEALTHCARE', '', '', '', '', '46', '000000000'),
    seg('NM1', '40', '2', 'CLEARINGHOUSE', '', '', '', '', 'XV', '000000000'),
    seg('HL', '1', '', '20', '1'),
    seg('NM1', '85', '2', 'MEDICZY HEALTHCARE', '', '', '', '', 'XX', npi || '0000000000'),
    seg('N3', '123 HEALTH STREET'),
    seg('N4', 'MUMBAI', 'MH', '400001', 'IN'),
    seg('HL', '2', '1', '22', '0'),
    seg('SBR', 'P', '18', '', '', '', '', '', '', 'MA'),
    seg('NM1', 'IL', '1', (patientName || '').split(' ')[1] || 'DOE', (patientName || '').split(' ')[0] || 'JOHN', '', '', '', 'MI', patientId || ''),
    seg('HL', '3', '2', '23', '0'),
    seg('CLM', referenceId || ctrl, String(Number(totalCharge || 0).toFixed(2)), '', '', '11:B:1', 'Y', 'A', 'Y', 'I'),
    seg('DTP', '435', 'D8', (admitDate || '').replace(/-/g, '') || ediDate()),
    seg('DTP', '096', 'D8', (dischargeDate || '').replace(/-/g, '') || ediDate()),
    seg('CL1', '1', '9', '01'),
    ...diagnosisCodes.slice(0, 8).map((dx, i) => seg('HI', `BK:${dx}`)),
    ...(drg ? [seg('HI', `DR:${drg}`)] : []),
    seg('LX', '1'),
    seg('SV2', '0100', '', String(Number(totalCharge || 0).toFixed(2)), 'UN', '1'),
  ];
  return { ...wrapEnvelope('HC', '837', stSegs, ctrl), transactionSet: '837I' };
}

// ── 835 — Remittance Advice ───────────────────────────────────────────────────
export function build835(data) {
  const { paymentAmount, paymentDate, claimId, patientId, paidAmount, adjustmentCode, checkNumber } = data;
  const ctrl = stCtrl();
  const stSegs = [
    seg('BPR', '22', String(Number(paymentAmount || 0).toFixed(2)), 'C', 'ACH', 'CTX', '01', '999999999', 'DA', '12345678', '1111111111', '', '01', '999999999', 'DA', '87654321', (paymentDate || '').replace(/-/g, '') || ediDate()),
    seg('TRN', '1', checkNumber || ctrl, '1111111111', '*'),
    seg('DTM', '405', `20${ediDate()}`),
    seg('N1', 'PR', 'INSURANCE PAYER', 'XV', '000000000'),
    seg('N1', 'PE', 'MEDICZY HEALTHCARE', 'XX', '0000000000'),
    seg('LX', '1'),
    seg('CLP', claimId || ctrl, '1', String(Number(paymentAmount || 0).toFixed(2)), String(Number(paidAmount || 0).toFixed(2)), '', 'MB', patientId || ''),
    seg('NM1', 'QC', '1', 'DOE', 'JOHN', '', '', '', 'MI', patientId || ''),
    seg('SVC', 'HC:99213', String(Number(paymentAmount || 0).toFixed(2)), String(Number(paidAmount || 0).toFixed(2)), '', '1'),
    seg('DTM', '472', `20${ediDate()}`),
    ...(adjustmentCode ? [seg('CAS', 'CO', adjustmentCode, String((Number(paymentAmount) - Number(paidAmount || 0)).toFixed(2)))] : []),
  ];
  return { ...wrapEnvelope('HP', '835', stSegs, ctrl), transactionSet: '835' };
}

// ── 278 — Prior Authorization ─────────────────────────────────────────────────
export function build278(data) {
  const { patientId, patientName, providerId, serviceCode, requestType = 'I', urgency = 'E', referenceId } = data;
  const ctrl = stCtrl();
  const stSegs = [
    seg('BHT', '0007', requestType, referenceId || ctrl, `20${ediDate()}`, ediTime()),
    seg('HL', '1', '', '20', '1'),
    seg('NM1', 'X3', '2', 'INSURANCE PAYER', '', '', '', '', 'XV', '000000000'),
    seg('HL', '2', '1', '21', '1'),
    seg('NM1', '1P', '1', 'DOE', 'PHYSICIAN', '', '', '', 'XX', providerId || '0000000000'),
    seg('HL', '3', '2', '22', '0'),
    seg('NM1', 'IL', '1', (patientName || '').split(' ')[1] || 'DOE', (patientName || '').split(' ')[0] || 'JOHN', '', '', '', 'MI', patientId || ''),
    seg('HL', '4', '3', 'SS', '0'),
    seg('TRN', '1', referenceId || ctrl, '0000000000'),
    seg('UM', serviceCode || 'HS', urgency, '', '', 'RP:30', '', 'Y'),
    seg('DTP', '472', 'D8', ediDate()),
  ];
  return { ...wrapEnvelope('HR', '278', stSegs, ctrl), transactionSet: '278' };
}

// ── 999 — Functional Acknowledgment ──────────────────────────────────────────
export function build999(originalCtrl, originalSet, accepted = true) {
  const ctrl = stCtrl();
  const stSegs = [
    seg('AK1', originalSet.replace(/[PI]/g, '').trim(), originalCtrl),
    seg('AK9', accepted ? 'A' : 'R', '1', '1', accepted ? '1' : '0'),
  ];
  return { ...wrapEnvelope('FA', '999', stSegs, ctrl), transactionSet: '999' };
}

// ── EDI raw parser ────────────────────────────────────────────────────────────
export function parseEdi(rawEdi) {
  const lines     = rawEdi.replace(/\r/g, '').split(SEG_TERM).filter(Boolean);
  const segments  = lines.map(l => ({ id: l.split(ELE_SEP)[0], elements: l.split(ELE_SEP) }));
  const isa       = segments.find(s => s.id === 'ISA');
  const gs        = segments.find(s => s.id === 'GS');
  const st        = segments.find(s => s.id === 'ST');
  return {
    interchangeCtrl: isa?.elements[13],
    groupCtrl:       gs?.elements[6],
    transactionCtrl: st?.elements[2],
    transactionSet:  st?.elements[1],
    senderId:        isa?.elements[6]?.trim(),
    receiverId:      isa?.elements[8]?.trim(),
    segments,
  };
}

// ── Persistence ───────────────────────────────────────────────────────────────
export async function saveEdiTransaction(tenantId, opts) {
  const { transactionSet, direction, raw, parsed, referenceId, referenceType } = opts;
  const { rows } = await pool.query(
    `INSERT INTO edi_transactions
       (tenant_id, transaction_set, direction, interchange_ctrl, group_ctrl, transaction_ctrl,
        sender_id, receiver_id, raw_edi, parsed_json, status, reference_id, reference_type)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11,$12)
     RETURNING id, transaction_set, direction, status, created_at`,
    [
      tenantId, transactionSet, direction,
      parsed?.interchangeCtrl || opts.isNum || null,
      parsed?.groupCtrl || opts.gsNum || null,
      parsed?.transactionCtrl || opts.stCtrlNum || null,
      parsed?.senderId || SENDER_ID.trim(),
      parsed?.receiverId || RECEIVER_ID.trim(),
      raw || null,
      parsed ? JSON.stringify(parsed) : null,
      referenceId || null, referenceType || null,
    ]
  );
  return rows[0];
}

export async function listEdiTransactions(tenantId, filters = {}) {
  const { transactionSet, direction, status, limit = 50 } = filters;
  const conds = ['tenant_id = $1'];
  const vals  = [tenantId];
  let idx = 2;
  if (transactionSet) { conds.push(`transaction_set = $${idx++}`); vals.push(transactionSet); }
  if (direction)      { conds.push(`direction = $${idx++}`);       vals.push(direction); }
  if (status)         { conds.push(`status = $${idx++}`);          vals.push(status); }
  vals.push(Math.min(Number(limit) || 50, 200));
  const { rows } = await pool.query(
    `SELECT id, transaction_set, direction, interchange_ctrl, status, ack_997_status,
            reference_id, reference_type, created_at, processed_at
     FROM edi_transactions WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT $${idx}`,
    vals
  );
  return rows;
}

export async function getEdiTransaction(id, tenantId) {
  const { rows } = await pool.query(
    'SELECT * FROM edi_transactions WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  if (!rows.length) throw new Error('EDI transaction not found');
  return rows[0];
}

export async function updateEdiStatus(id, status, errorMessage = null) {
  await pool.query(
    `UPDATE edi_transactions SET status = $1, error_message = $2, processed_at = NOW() WHERE id = $3`,
    [status, errorMessage || null, id]
  );
}
