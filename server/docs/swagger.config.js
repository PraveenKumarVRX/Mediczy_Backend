/**
 * Swagger/OpenAPI Configuration
 * 
 * Central configuration for API documentation
 * Generates interactive API docs accessible at /api-docs and /docs
 */

import swaggerJsdoc from 'swagger-jsdoc';

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Mediczy Healthcare Platform API',
    version: '1.0.0',
    description: `
      Comprehensive healthcare platform API providing services for:
      - Patient management and health records
      - Doctor consultations and appointments
      - Corporate wellness programs
      - Lab, Pharmacy, and Ambulance services
      - AI-powered health insights
      - Telemedicine and video consultations
    `,
    contact: {
      name: 'Mediczy API Support',
      email: 'dev@mediczy.com',
      url: 'https://mediczy.com/support'
    },
    license: {
      name: 'Proprietary',
      url: 'https://mediczy.com/terms'
    }
  },
  servers: [
    {
      url: 'https://mayden.in:9443',
      description: 'Production server'
    },
    {
      url: 'http://localhost:3000',
      description: 'Development server'
    },
    {
      url: 'http://localhost:9443',
      description: 'Local HTTPS server'
    }
  ],
  tags: [
    { name: 'Authentication', description: 'User authentication and authorization' },
    { name: 'Users', description: 'User management endpoints' },
    { name: 'Doctors', description: 'Doctor profiles and availability' },
    { name: 'Appointments', description: 'Appointment booking and management' },
    { name: 'Prescriptions', description: 'Prescription management' },
    { name: 'Corporate', description: 'Corporate health benefits and analytics' },
    { name: 'Labs', description: 'Laboratory services and tests' },
    { name: 'Pharmacy', description: 'Pharmacy and medication services' },
    { name: 'Ambulance', description: 'Emergency ambulance services' },
    { name: 'Homecare', description: 'Home healthcare services' },
    { name: 'AI Doctor', description: 'AI-powered health consultations' },
    { name: 'Video Consultation', description: 'Telemedicine video calls' },
    { name: 'Health Records', description: 'Electronic Health Records (EHR)' },
    { name: 'Notifications', description: 'Push notifications and alerts' },
    { name: 'Admin', description: 'Administrative endpoints' }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT token in format: Bearer {token}'
      },
      apiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'API key for external integrations'
      }
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: false
          },
          message: {
            type: 'string',
            example: 'Error message description'
          },
          error: {
            type: 'string',
            example: 'Detailed error information'
          }
        }
      },
      Success: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true
          },
          message: {
            type: 'string',
            example: 'Operation completed successfully'
          },
          data: {
            type: 'object',
            description: 'Response data'
          }
        }
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          email: { type: 'string', format: 'email', example: 'user@mediczy.com' },
          firstName: { type: 'string', example: 'John' },
          lastName: { type: 'string', example: 'Doe' },
          dateOfBirth: { type: 'string', format: 'date', example: '1990-01-15' },
          gender: { type: 'string', enum: ['male', 'female', 'other'], example: 'male' },
          phoneNumber: { type: 'string', example: '+919876543210' },
          isAdmin: { type: 'boolean', example: false },
          role: { type: 'string', enum: ['user', 'admin', 'super_admin'], example: 'user' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      Doctor: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          email: { type: 'string', format: 'email', example: 'doctor@mediczy.com' },
          firstName: { type: 'string', example: 'Dr. Jane' },
          lastName: { type: 'string', example: 'Smith' },
          specializations: {
            type: 'array',
            items: { type: 'string' },
            example: ['Cardiology', 'Internal Medicine']
          },
          qualifications: {
            type: 'array',
            items: { type: 'string' },
            example: ['MBBS', 'MD']
          },
          experienceYears: { type: 'integer', example: 10 },
          rating: { type: 'number', format: 'float', example: 4.5 },
          consultationFee: { type: 'number', format: 'float', example: 500 },
          isVerified: { type: 'boolean', example: true },
          status: { type: 'string', enum: ['active', 'inactive', 'pending'], example: 'active' }
        }
      },
      Appointment: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          userId: { type: 'integer', example: 1 },
          doctorId: { type: 'integer', example: 1 },
          appointmentDate: { type: 'string', format: 'date-time', example: '2025-12-15T10:00:00Z' },
          status: {
            type: 'string',
            enum: ['pending', 'confirmed', 'completed', 'cancelled'],
            example: 'confirmed'
          },
          consultationType: {
            type: 'string',
            enum: ['online', 'in-person'],
            example: 'online'
          },
          symptoms: { type: 'string', example: 'Fever and headache' },
          notes: { type: 'string', example: 'Patient notes' },
          videoRoomId: { type: 'string', example: 'room-abc123' },
          createdAt: { type: 'string', format: 'date-time' }
        }
      }
    },
    responses: {
      UnauthorizedError: {
        description: 'Authentication token is missing or invalid',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: {
              success: false,
              message: 'unauthorized token'
            }
          }
        }
      },
      NotFoundError: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: {
              success: false,
              message: 'Resource not found'
            }
          }
        }
      },
      ValidationError: {
        description: 'Validation error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: {
              success: false,
              message: 'Validation failed',
              errors: ['Email is required', 'Password must be at least 8 characters']
            }
          }
        }
      },
      ServerError: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: {
              success: false,
              message: 'Internal server error'
            }
          }
        }
      }
    }
  },
  security: [
    {
      bearerAuth: []
    }
  ]
};

const options = {
  swaggerDefinition,
  apis: [
    './server/routes/*.js',
    './server/routes/**/*.js',
    './server/models/**/*.js'
  ]
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
