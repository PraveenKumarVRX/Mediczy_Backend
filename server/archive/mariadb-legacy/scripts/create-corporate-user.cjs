#!/usr/bin/env node

/**
 * 🛠️ CREATE CORPORATE USER ACCOUNT
 * 
 * Creates a test corporate user account for comprehensive testing
 */

const bcrypt = require('bcrypt');
const mariadb = require('mariadb');

const createCorporateUser = async () => {
    console.log('🛠️ Creating corporate user account...');
    
    let connection;
    try {
        connection = await mariadb.createConnection({
            host: 'localhost',
            user: 'mediczy',
            password: 'Mediczy2024Secure',
            database: 'mediczy'
        });
        
        // Check if corporate user already exists
        const existingUser = await connection.query(
            'SELECT id FROM users WHERE email = ?',
            ['hr@testcorp.com']
        );
        
        if (existingUser.length > 0) {
            console.log('✅ Corporate user already exists');
            
            // Update password to ensure it's correct
            const hashedPassword = await bcrypt.hash('test123', 10);
            await connection.query(
                'UPDATE users SET password = ? WHERE email = ?',
                [hashedPassword, 'hr@testcorp.com']
            );
            console.log('✅ Corporate user password updated');
        } else {
            // Create new corporate user
            const hashedPassword = await bcrypt.hash('test123', 10);
            await connection.query(`
                INSERT INTO users (
                    firstName, lastName, email, password, dateOfBirth, gender, 
                    phoneNumber, address_street, address_city, address_state, 
                    address_zipCode, address_country, profilePicture, 
                    createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `, [
                'HR', 'Manager', 'hr@testcorp.com', hashedPassword, '1985-01-01', 'Other',
                '+1-555-0199', '123 Corporate Blvd', 'Business City', 'NY', '12345', 'USA', null
            ]);
            console.log('✅ Corporate user created successfully');
        }
        
        // Verify the user was created/updated
        const user = await connection.query(
            'SELECT id, email, firstName, lastName, isAdmin FROM users WHERE email = ?',
            ['hr@testcorp.com']
        );
        console.log('👤 Corporate user details:', user[0]);
        
        // Also create a test corporate user with proper role for testing
        const existingCorp = await connection.query(
            'SELECT id FROM users WHERE email = ?',
            ['corporate@test.com']
        );
        
        if (existingCorp.length === 0) {
            const corpHashedPassword = await bcrypt.hash('test123', 10);
            await connection.query(`
                INSERT INTO users (
                    firstName, lastName, email, password, dateOfBirth, gender, 
                    phoneNumber, address_street, address_city, address_state, 
                    address_zipCode, address_country, profilePicture, 
                    createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `, [
                'Corporate', 'User', 'corporate@test.com', corpHashedPassword, '1980-01-01', 'Other',
                '+1-555-0299', '456 Corporate Ave', 'Business City', 'CA', '54321', 'USA', null
            ]);
            console.log('✅ Additional corporate test user created');
        }
        
        const corpUser = await connection.query(
            'SELECT id, email, firstName, lastName FROM users WHERE email = ?',
            ['corporate@test.com']
        );
        console.log('👤 Corporate test user details:', corpUser[0]);
        
    } catch (error) {
        console.error('💥 Error creating corporate user:', error.message);
    } finally {
        if (connection) await connection.end();
    }
};

createCorporateUser();