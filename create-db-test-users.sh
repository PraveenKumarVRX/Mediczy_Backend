#!/bin/bash

# Create test users directly in MariaDB
# Uses bcrypt hashes for passwords

echo "Creating test users in database..."

# Hash passwords using Node.js bcrypt
# User123 hash
USER_HASH='$2b$10$xGHqV8YqZ8pGQ1Y5C.PmqORQWM0KWxL5mF1X0pZqGF7GVHJ8X3X3W'
# Doctor123 hash
DOCTOR_HASH='$2b$10$vLHqV8YqZ8pGQ1Y5C.PmqORQWM0KWxL5mF1X0pZqGF7GVHJ8Y4Y4X'
# Admin123 hash
ADMIN_HASH='$2b$10$wMIqV8YqZ8pGQ1Y5C.PmqORQWM0KWxL5mF1X0pZqGF7GVHJ8Z5Z5Y'
# test123 hash
TEST_HASH='$2b$10$yNJqV8YqZ8pGQ1Y5C.PmqORQWM0KWxL5mF1X0pZqGF7GVHJ8A6A6Z'

# Generate hash for each password
echo "Generating password hashes..."
USER_HASH=$(node -e "const bcrypt = require('bcrypt'); bcrypt.hash('User123', 10).then(hash => console.log(hash));")
DOCTOR_HASH=$(node -e "const bcrypt = require('bcrypt'); bcrypt.hash('Doctor123', 10).then(hash => console.log(hash));")
ADMIN_HASH=$(node -e "const bcrypt = require('bcrypt'); bcrypt.hash('Admin123', 10).then(hash => console.log(hash));")
TEAM_HASH=$(node -e "const bcrypt = require('bcrypt'); bcrypt.hash('Team123', 10).then(hash => console.log(hash));")
NURSE_HASH=$(node -e "const bcrypt = require('bcrypt'); bcrypt.hash('Nurse123', 10).then(hash => console.log(hash));")
ASSISTANT_HASH=$(node -e "const bcrypt = require('bcrypt'); bcrypt.hash('Assistant123', 10).then(hash => console.log(hash));")
CORPORATE_HASH=$(node -e "const bcrypt = require('bcrypt'); bcrypt.hash('Corporate123', 10).then(hash => console.log(hash));")
AMBULANCE_HASH=$(node -e "const bcrypt = require('bcrypt'); bcrypt.hash('Ambulance123', 10).then(hash => console.log(hash));")
HOMECARE_HASH=$(node -e "const bcrypt = require('bcrypt'); bcrypt.hash('Homecare123', 10).then(hash => console.log(hash));")
TEST_HASH=$(node -e "const bcrypt = require('bcrypt'); bcrypt.hash('test123', 10).then(hash => console.log(hash));")

sleep 1

echo "Creating users..."

# NOTE: Doctors, nurses, and staff should ONLY exist in their dedicated tables
# DO NOT insert them into the users table to prevent login endpoint confusion
# Corporate HR users belong in the corporates table, not users table

# Create test users
sudo mysql mediczy <<EOF
-- Users table (ONLY actual patients/users - NO doctors/staff/admin/team/corporate)
-- Admin and team members should have isAdmin or isTeam flags
-- Corporate users belong in corporates table (see PostgreSQL migration)
INSERT IGNORE INTO users (email, password, firstName, lastName, phoneNumber, dateOfBirth, gender, isEmailVerified, isAdmin, isTeam, createdAt, updatedAt) 
VALUES 
  ('user@mediczy.com', '$USER_HASH', 'Test', 'User', '9999999999', '1990-01-01', 'Male', 1, 0, 0, NOW(), NOW()),
  ('admin@mediczy.com', '$ADMIN_HASH', 'Admin', 'User', '9999999998', '1990-01-01', 'Male', 1, 1, NOW(), NOW()),
  ('team@mediczy.com', '$TEAM_HASH', 'Team', 'Member', '9999999997', '1990-01-01', 'Male', 1, 1, NOW(), NOW()),
  ('patient@test.com', '$TEST_HASH', 'John', 'Patient', '9999999995', '1990-01-01', 'Male', 1, 0, NOW(), NOW()),
  ('user@test.com', '$TEST_HASH', 'Sarah', 'User', '9999999994', '1990-01-01', 'Female', 1, 0, NOW(), NOW()),
  ('wellness@test.com', '$TEST_HASH', 'Mike', 'Wellness', '9999999993', '1990-01-01', 'Male', 1, 0, NOW(), NOW());

-- Doctors table (doctors go HERE, not in users table)
INSERT IGNORE INTO doctors (email, password, firstName, lastName, specialization, qualification, experience, registrationNumber, phoneNumber, isVerified, createdAt, updatedAt) 
VALUES 
  ('doctor@mediczy.com', '$DOCTOR_HASH', 'Test', 'Doctor', 'General Practitioner', 'MBBS', 5, 'REG123456', '8888888888', 1, NOW(), NOW()),
  ('cardio@test.com', '$TEST_HASH', 'Dr. Rajesh', 'Sharma', 'Cardiologist', 'MBBS, MD', 10, 'REG111111', '8888888887', 1, NOW(), NOW()),
  ('neuro@test.com', '$TEST_HASH', 'Dr. Priya', 'Patel', 'Neurologist', 'MBBS, MD', 8, 'REG222222', '8888888886', 1, NOW(), NOW()),
  ('gp@test.com', '$TEST_HASH', 'Dr. Amit', 'Kumar', 'General Practitioner', 'MBBS', 7, 'REG333333', '8888888885', 1, NOW(), NOW());

-- Nurses table (nurses go HERE, not in users table)
INSERT IGNORE INTO nurses (email, password, firstName, lastName, phoneNumber, licenseNumber, department, createdAt, updatedAt) 
VALUES 
  ('nurse@mediczy.com', '$NURSE_HASH', 'Test', 'Nurse', '7777777777', 'NURSE12345', 'General', NOW(), NOW());

-- Doctor assistants table (assistants go HERE, not in users table)
INSERT IGNORE INTO doctor_assistants (email, password, firstName, lastName, phoneNumber, qualification, experience, createdAt, updatedAt) 
VALUES 
  ('assistant@mediczy.com', '$ASSISTANT_HASH', 'Test', 'Assistant', '6666666666', 'Diploma', 2, NOW(), NOW());

-- Corporates table
INSERT IGNORE INTO corporates (companyName, contactPerson, email, phoneNumber, industry, employeeCount, createdAt, updatedAt) 
VALUES 
  ('Test Corporate Ltd', 'Test Contact', 'corporate@mediczy.com', '5555555555', 'Healthcare', 500, NOW(), NOW());

SELECT 'Users created successfully!' as status;
SELECT 'IMPORTANT: Doctors/nurses/staff are in their dedicated tables, NOT in users table' as note;
EOF

echo "✅ Test users created in database"
