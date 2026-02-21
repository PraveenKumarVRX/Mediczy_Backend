-- Find user by email
SELECT id, email, "firstName", "lastName" 
FROM users 
WHERE email = 'user@mediczy.com';

-- Find all appointments for this user
SELECT a.id, a."userId", a."appointmentDate", a."appointmentTime", 
       a.status, a."consultationType", a."doctorName", a."createdAt"
FROM appointments a
JOIN users u ON a."userId" = u.id
WHERE u.email = 'user@mediczy.com'
ORDER BY a."appointmentDate" DESC, a."appointmentTime" DESC
LIMIT 10;
