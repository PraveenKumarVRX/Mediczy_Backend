import test from 'node:test';
import assert from 'node:assert/strict';
import { postgresTls } from '../db/postgres-tls.js';
test('local disposable databases can use non-TLS connections',()=>assert.equal(postgresTls({NODE_ENV:'test',POSTGRES_HOST:'127.0.0.1',POSTGRES_SSL:'false'}),false));
test('RDS connections verify certificate trust and hostname',()=>{const config=postgresTls({NODE_ENV:'production',POSTGRES_HOST:'mediczy-prod.example.ap-south-1.rds.amazonaws.com'});assert.equal(config.rejectUnauthorized,true);assert.match(config.ca,/BEGIN CERTIFICATE/);});
test('production remote TLS cannot be switched off',()=>assert.throws(()=>postgresTls({NODE_ENV:'production',POSTGRES_HOST:'remote.example',POSTGRES_SSL:'false'}),/requires verified TLS/));
test('missing explicit trust file fails closed',()=>assert.throws(()=>postgresTls({POSTGRES_SSL:'true',POSTGRES_SSL_CA_FILE:'/nonexistent/rds-ca.pem'}),/ENOENT/));
test('other TLS servers use system trust',()=>assert.deepEqual(postgresTls({POSTGRES_HOST:'db.example',POSTGRES_SSL:'true'}),{rejectUnauthorized:true}));

test('URI options cannot silently weaken verified TLS',()=>assert.throws(()=>postgresTls({NODE_ENV:'production'},'postgresql://user:pass@db.example/db?sslmode=no-verify'),/URI TLS options/));
test('URI hostname selects the RDS trust bundle',()=>assert.match(postgresTls({NODE_ENV:'production'},'postgresql://user:pass@db.example.ap-south-1.rds.amazonaws.com/db').ca,/BEGIN CERTIFICATE/));

const { isPrivilegedDatabaseSecret } = await import('../utils/runtime-secret-policy.js');
test('runtime loader excludes administrator, backup and migrator credentials',()=>{for(const key of ['RDS_MASTER_PASSWORD','POSTGRES_BACKUP_PASSWORD','POSTGRES_MIGRATOR_PASSWORD','DB_ADMIN_PASS'])assert.equal(isPrivilegedDatabaseSecret(key),true);for(const key of ['POSTGRES_PASSWORD','JWT_SECRET','NURSING_IMAGE_BUCKET'])assert.equal(isPrivilegedDatabaseSecret(key),false);});
