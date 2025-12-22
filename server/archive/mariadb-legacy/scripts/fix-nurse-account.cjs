const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');

async function fixNurseAccount() {
    console.log('🔧 Fixing nurse test account...');
    
    // Create database connection
    const connection = await mysql.createConnection({
        host: 'localhost',
        port: 3306,
        user: 'mediczy',
        password: 'Mediczy2024Secure',
        database: 'mediczy'
    });

    try {
        // Hash the password 'test123' with bcrypt
        const hashedPassword = await bcrypt.hash('test123', 10);
        console.log('💻 Generated hashed password for test123');

        // Update the existing nurse account
        const [result] = await connection.execute(
            'UPDATE nurses SET password = ? WHERE email = ?',
            [hashedPassword, 'nurse@test.com']
        );

        if (result.affectedRows > 0) {
            console.log('✅ Successfully updated nurse@test.com password');
        } else {
            console.log('⚠️  No nurse found with email nurse@test.com, creating new one...');
            
            // Create new nurse account
            await connection.execute(`
                INSERT INTO nurses (
                    firstName, lastName, email, password, phoneNumber, 
                    licenseNumber, department, isActive, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `, [
                'Nurse Manager', 'Test', 'nurse@test.com', hashedPassword, '+91-9876543230',
                'RN-123456', 'Emergency Department', 1
            ]);
            
            console.log('✅ Created new nurse test account');
        }

        // Verify the nurse can be found
        const [rows] = await connection.execute(
            'SELECT id, firstName, lastName, email, department FROM nurses WHERE email = ?',
            ['nurse@test.com']
        );

        if (rows.length > 0) {
            console.log('👤 Nurse account verified:', rows[0]);
        }

    } catch (error) {
        console.error('❌ Error fixing nurse account:', error);
    } finally {
        await connection.end();
    }
}

// Run the fix
fixNurseAccount().catch(console.error);