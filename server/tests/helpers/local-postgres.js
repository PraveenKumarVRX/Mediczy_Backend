import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir, userInfo } from 'node:os';
import { execFileSync } from 'node:child_process';
import pg from 'pg';

export async function localPostgres() {
  const directory = await mkdtemp(`${tmpdir()}/mediqzy-chat-pg-`);
  const bin = '/usr/lib/postgresql/16/bin';
  const data = `${directory}/data`;
  execFileSync(`${bin}/initdb`, ['-D', data, '-A', 'trust', '--no-instructions'], { stdio: 'ignore' });
  execFileSync(`${bin}/pg_ctl`, ['-D', data, '-l', `${directory}/postgres.log`, '-o', `-F -h '' -k ${directory} -p 5432`, '-w', 'start'], { stdio: 'ignore' });
  const pool = new pg.Pool({ host: directory, port: 5432, user: userInfo().username, database: 'postgres', ssl: false });
  return { pool, async stop() {
    await pool.end();
    execFileSync(`${bin}/pg_ctl`, ['-D', data, '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore' });
    await rm(directory, { recursive: true, force: true });
  } };
}
