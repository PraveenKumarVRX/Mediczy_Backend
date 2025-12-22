#!/usr/bin/env node

/**
 * 🛠️ CREATE TEAM USER ACCOUNT
 * 
 * Creates a test team user account if it doesn't exist
 */

const bcrypt = require('bcrypt');
const mariadb = require('mariadb');

const createTeamUser = async () => {
    console.log('🛠️ Creating team user account...');
    
    let connection;
    try {
        connection = await mariadb.createConnection({
            host: 'localhost',
            user: 'mediczy',
            password: 'Mediczy2024Secure',
            database: 'mediczy'
        });
        
        // Check if team user already exists
        const existingUser = await connection.query(
            'SELECT id FROM users WHERE email = ?',
            ['team@test.com']
        );
        
        if (existingUser.length > 0) {
            console.log('✅ Team user already exists');
            
            // Update password to ensure it's correct
            const hashedPassword = await bcrypt.hash('test123', 10);
            await connection.query(
                'UPDATE users SET password = ? WHERE email = ?',
                [hashedPassword, 'team@test.com']
            );
            console.log('✅ Team user password updated');
        } else {
            // Create new team user
            const hashedPassword = await bcrypt.hash('test123', 10);
            await connection.query(`
                INSERT INTO users (
                    firstName, lastName, email, password, dateOfBirth, gender, 
                    phoneNumber, address_street, address_city, address_state, 
                    address_zipCode, address_country, profilePicture, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `, [
                'Team', 'User', 'team@test.com', hashedPassword, '1990-01-01', 'Other',
                '+1-555-0444', '789 Team St', 'Team City', 'NY', '12345', 'USA', null
            ]);
            console.log('✅ Team user created successfully');
        }
        
        // Verify the user was created/updated
        const user = await connection.query(
            'SELECT id, email, firstName, lastName, isAdmin FROM users WHERE email = ?',
            ['team@test.com']
        );
        console.log('👤 Team user details:', user[0]);
        
    } catch (error) {
        console.error('💥 Error creating team user:', error.message);
    } finally {
        if (connection) await connection.end();
    }
};

createTeamUser();