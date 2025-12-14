import express from "express";
import dotenv from "dotenv";
dotenv.config();
import cors from "cors";
import { connectToDb } from "./db/mariadb.js";
import userRouter from "./routes/user.route.js";
import doctorRouter from "./routes/doctor.route.js";
import adminRouter from "./routes/admin.route.js";

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors());

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'Mediczy Backend with Intelligent Database', 
    timestamp: new Date().toISOString() 
  });
});

// Routes
app.use('/api/users', userRouter);
app.use('/api/doctors', doctorRouter);
app.use('/api/admin', adminRouter);

// Initialize database connection
console.log('🔄 Initializing Intelligent Database Connection...');
connectToDb()
  .then(() => {
    console.log('✅ Intelligent Database connected successfully');
    
    app.listen(PORT, () => {
      console.log('🚀 Mediczy Backend Server Running');
      console.log(`📡 Server: http://localhost:${PORT}`);
      console.log(`🏥 Health: http://localhost:${PORT}/health`);
      console.log('🧠 Using Ultra-Fast Intelligent Database Service');
      console.log('');
      console.log('🔐 Test Credentials:');
      console.log('👤 User: user@mediczy.com / user123');
      console.log('🩺 Doctor: doctor@mediczy.com / doctor123'); 
      console.log('👑 Admin: admin@mediczy.com / admin123');
    });
  })
  .catch((error) => {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  process.exit(0);
});

export default app;