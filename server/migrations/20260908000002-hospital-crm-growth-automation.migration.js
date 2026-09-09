import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from "../db/pgPool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function up(client = null) {
  const sql = await fs.readFile(path.join(__dirname, "20260908000002-hospital-crm-growth-automation.sql"), "utf8");
  const db = client || await pool.connect();
  const ownsClient = !client;
  try {
    if (ownsClient) await db.query("BEGIN");
    await db.query(sql);
    if (ownsClient) await db.query("COMMIT");
    console.log("Hospital CRM growth automation migration applied");
  } catch (error) {
    if (ownsClient) await db.query("ROLLBACK");
    throw error;
  } finally {
    if (ownsClient) {
      db.release();
      await pool.end().catch(() => {});
    }
  }
}

export async function down() {
  throw new Error('Hospital CRM growth automation migration is additive and must not be rolled back automatically');
}
if (import.meta.url === "file://" + process.argv[1]) {
  up().then(() => process.exit(0)).catch((error) => {
    console.error("Hospital CRM growth automation migration failed: " + error.message);
    process.exit(1);
  });
}
