/**
 * Migration Script: MariaDB Users → PostgreSQL
 * Phase 1 of database consolidation
 */

import { sequelize as mariadb } from '../db/mariadb.js';
import { postgresSequelize as postgres } from '../db/postgres-sequelize.js';
import { QueryTypes } from 'sequelize';

async function migrateUsers() {
  console.log('🚀 Starting User Migration: MariaDB → PostgreSQL\n');

  try {
    // Connect to both databases
    await mariadb.authenticate();
    console.log('✅ MariaDB connected');
    
    await postgres.authenticate();
    console.log('✅ PostgreSQL connected\n');

    // Get all users from MariaDB
    const mariaUsers = await mariadb.query(
      `SELECT * FROM users ORDER BY id`,
      { type: QueryTypes.SELECT }
    );
    console.log(`📊 Found ${mariaUsers.length} users in MariaDB`);

    // Get existing PostgreSQL user IDs
    const pgUserIds = await postgres.query(
      `SELECT id FROM users`,
      { type: QueryTypes.SELECT }
    );
    const existingIds = new Set(pgUserIds.map(u => u.id));
    console.log(`📊 Found ${existingIds.size} users in PostgreSQL\n`);

    let inserted = 0, updated = 0, skipped = 0;

    for (const user of mariaUsers) {
      try {
        // Map MariaDB fields to PostgreSQL schema
        const pgUser = {
          id: user.id,
          firstName: user.firstName || 'Unknown',
          lastName: user.lastName || 'User',
          email: user.email,
          password: user.password,
          dateOfBirth: user.dateOfBirth || new Date('1990-01-01'),
          gender: user.gender || 'Other',
          phoneNumber: user.phoneNumber || '',
          address_street: user.address_street || null,
          address_city: user.address_city || null,
          address_state: user.address_state || null,
          address_zipCode: user.address_zipCode || null,
          address_country: user.address_country || 'India',
          emergencyContact_name: user.emergencyContact_name || null,
          emergencyContact_relationship: user.emergencyContact_relationship || null,
          emergencyContact_phoneNumber: user.emergencyContact_phoneNumber || null,
          bloodType: user.bloodType || null,
          profileImage: user.profileImage || null,
          isAdmin: user.isAdmin === 1 || user.isAdmin === true,
          status: user.isActive === false ? 'inactive' : 'active',
          emailVerified: user.isEmailVerified === 1 || user.isEmailVerified === true,
          lastLoginAt: user.lastLogin || null,
          createdAt: user.createdAt || new Date(),
          updatedAt: user.updatedAt || new Date()
        };

        if (existingIds.has(user.id)) {
          // Update existing user
          await postgres.query(
            `UPDATE users SET 
              "firstName" = :firstName,
              "lastName" = :lastName,
              email = :email,
              password = :password,
              "dateOfBirth" = :dateOfBirth,
              gender = :gender,
              "phoneNumber" = :phoneNumber,
              "isAdmin" = :isAdmin,
              status = :status,
              "updatedAt" = NOW()
            WHERE id = :id`,
            { replacements: pgUser, type: QueryTypes.UPDATE }
          );
          updated++;
        } else {
          // Insert new user
          await postgres.query(
            `INSERT INTO users (
              id, "firstName", "lastName", email, password, "dateOfBirth", gender,
              "phoneNumber", address_street, address_city, address_state,
              address_zipCode, address_country, "bloodType", "profileImage",
              "isAdmin", status, "emailVerified", "lastLoginAt", "createdAt", "updatedAt"
            ) VALUES (
              :id, :firstName, :lastName, :email, :password, :dateOfBirth, :gender,
              :phoneNumber, :address_street, :address_city, :address_state,
              :address_zipCode, :address_country, :bloodType, :profileImage,
              :isAdmin, :status, :emailVerified, :lastLoginAt, :createdAt, :updatedAt
            )`,
            { replacements: pgUser, type: QueryTypes.INSERT }
          );
          inserted++;
        }
      } catch (err) {
        console.error(`  ⚠️ Error processing user ${user.id}: ${err.message}`);
        skipped++;
      }
    }

    // Reset sequence to max ID
    await postgres.query(
      `SELECT setval('users_id_seq', (SELECT COALESCE(MAX(id), 1) FROM users))`,
      { type: QueryTypes.SELECT }
    );

    console.log('\n✅ Migration Complete:');
    console.log(`   Inserted: ${inserted}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped: ${skipped}`);

    // Verify counts match
    const finalCount = await postgres.query(
      `SELECT COUNT(*) as count FROM users`,
      { type: QueryTypes.SELECT }
    );
    console.log(`\n📊 PostgreSQL now has ${finalCount[0].count} users`);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await mariadb.close();
    await postgres.close();
  }
}

migrateUsers();
