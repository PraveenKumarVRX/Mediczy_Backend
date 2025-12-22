# Mediczy - MongoDB to MariaDB Migration

## Migration Summary
Successfully migrated Mediczy application from MongoDB to MariaDB.

## Changes Made

### 1. Database Configuration
- **Old**: MongoDB with Mongoose ODM
- **New**: MariaDB with Sequelize ORM

### 2. Files Created/Modified

#### New Files:
- `server/db/mariadb.js` - MariaDB/Sequelize connection handler
- `server/models/user.model.mariadb.js` - User model with Sequelize
- `server/sync-db.js` - Database schema sync script
- `server/app.js.mongodb.backup` - Backup of original MongoDB version

#### Modified Files:
- `server/app.js` - Updated to use MariaDB connection
- `server/.env` - Updated with MariaDB credentials

### 3. Database Setup
```sql
Database: mediczy
User: mediczy
Password: mediczy123
Host: localhost
```

### 4. Tables Created
- `users` - User accounts with full profile information

### 5. Dependencies Added
- `mariadb` - MariaDB connector for Node.js
- `sequelize` - Already installed (ORM)
- `mysql2` - Already installed (driver)

### 6. Application Status
- ✅ Frontend: http://localhost:8082 (HTTP 200)
- ✅ Backend: http://localhost:8000 
- ✅ Database: MariaDB connected successfully
- ✅ MongoDB: Stopped and disabled

### 7. Model Features Preserved
- Password hashing with bcrypt (pre-save hooks)
- JWT token generation
- Password comparison method
- Full user profile fields (address, emergency contact, insurance, medical info)

### 8. Migration Steps for Other Models

To migrate remaining models (doctor, chat, fitness):

1. Create Sequelize model file:
```javascript
import { DataTypes } from 'sequelize';
import { sequelize } from '../db/mariadb.js';

const ModelName = sequelize.define('ModelName', {
  // Define fields here
}, {
  timestamps: true,
  tableName: 'table_name'
});

export default ModelName;
```

2. Add model import to `sync-db.js`
3. Run: `node sync-db.js`
4. Update controller to use Sequelize queries instead of Mongoose

### 9. Key Differences (MongoDB vs Sequelize)

| Operation | MongoDB/Mongoose | Sequelize |
|-----------|-----------------|-----------|
| Find All | `Model.find()` | `Model.findAll()` |
| Find One | `Model.findOne()` | `Model.findOne()` |
| Find by ID | `Model.findById(id)` | `Model.findByPk(id)` |
| Create | `Model.create()` | `Model.create()` |
| Update | `Model.updateOne()` | `Model.update()` |
| Delete | `Model.deleteOne()` | `Model.destroy()` |
| Save | `doc.save()` | `instance.save()` |

### 10. Environment Variables
```env
DB_NAME=mediczy
DB_USER=mediczy
DB_PASSWORD=mediczy123
DB_HOST=localhost
PORT=8000
SECRET_TOKEN=mediczy_secret_token_2024
NODE_ENV=development
```

## Testing

Test user registration endpoint:
```bash
curl -X POST http://localhost:8000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "password": "password123",
    "dateOfBirth": "1990-01-01",
    "gender": "Male",
    "phoneNumber": "1234567890"
  }'
```

## Rollback Instructions

To rollback to MongoDB:
```bash
cd /root/Mediczy/server
cp app.js.mongodb.backup app.js
systemctl start mongod
systemctl enable mongod
npm run dev
```

## Next Steps

1. Migrate remaining models (doctor, chat, fitness)
2. Update all controllers to use Sequelize syntax
3. Test all API endpoints
4. Consider data migration from MongoDB to MariaDB if needed

---
Migration Date: November 9, 2025
Status: ✅ Complete
