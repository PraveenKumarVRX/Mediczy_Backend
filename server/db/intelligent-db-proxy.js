import axios from 'axios';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { connectToDb as connectMariaDB } from './mariadb.js';
import MariaDBUser from '../models/user.model.mariadb.js';
import { connectDuckDB, executeDuckDB } from './duckdb.js';
import MariaDBNurse from '../models/nurse.model.mariadb.js';
dotenv.config();

/**
 * Intelligent Database Proxy Adapter
 * Connects Node.js server to Python Intelligent DB Service (port 5005)
 * MariaDB is the LEADER - all writes go to MariaDB first, then replicated to helpers
 */

class IntelligentDatabaseProxy {
  constructor() {
    this.baseURL = process.env.INTELLIGENT_DB_URL || 'http://localhost:5005';
    this.isConnected = false;
    this.timeout = 15000;
    this.cache = new Map();
    this.cacheTTL = 30000;
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mediczy-NodeJS-Server/2.0',
        'X-Source': 'nodejs-express'
      },
      maxRedirects: 5,
      validateStatus: (status) => status < 500
    });
    console.log('Intelligent DB Proxy -> Python service: ' + this.baseURL);
  }

  async _request(endpoint, method = 'GET', data = null, useCache = false) {
    const cacheKey = useCache ? (method + ':' + endpoint + ':' + JSON.stringify(data)) : null;
    if (useCache && cacheKey) {
      const cached = this._getCache(cacheKey);
      if (cached) return cached;
    }
    try {
      const config = {
        method,
        url: endpoint,
        ...(data && (method === 'POST' || method === 'PUT' || method === 'PATCH') && { data })
      };
      const response = await this.client(config);
      if (response.status >= 400) {
        throw new Error('HTTP ' + response.status + ': ' + response.statusText);
      }
      const result = response.data;
      if (useCache && cacheKey) {
        this._setCache(cacheKey, result);
      }
      return result;
    } catch (error) {
      console.error('[Intelligent DB] ' + method + ' ' + endpoint + ' failed:', error.message);
      throw error;
    }
  }

  _getCache(key) {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < this.cacheTTL) {
      return entry.data;
    }
    this.cache.delete(key);
    return null;
  }

  _setCache(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
    if (this.cache.size > 1000) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  clearCache() {
    this.cache.clear();
  }

  async _replicateToHelpers(collection, data) {
    const results = { mongo: false, duckdb: false };
    try {
      const { connectMongoDB } = await import('./mongo.js');
      const { mongoose } = await import('./mongo.js');
      await connectMongoDB();
      const modelMap = {
        'users': 'User',
        'doctors': 'Doctor',
        'appointments': 'Appointment'
      };
      const modelName = modelMap[collection];
      if (modelName) {
        const modelPath = '../models/' + collection.slice(0, -1) + '.model.js';
        const Model = mongoose.models[modelName] || (await import(modelPath)).default;
        const mongoData = { ...data };
        if (mongoData.id && !mongoData._id) {
          delete mongoData.id;
        }
        await Model.findOneAndUpdate(
          { email: data.email },
          mongoData,
          { upsert: true, new: true }
        );
        results.mongo = true;
        console.log('✅ Replicated to MongoDB: ' + collection + '/' + (data.email || data.id));
      }
    } catch (error) {
        console.warn('MongoDB replication failed for ' + collection + ':', error.message);
    }
    try {
      await connectDuckDB();
      const tableName = collection + '_analytics';
      const timestamp = new Date().toISOString();
      const jsonData = JSON.stringify(data);
      await executeDuckDB(
        'CREATE TABLE IF NOT EXISTS ' + tableName + ' (' +
        'id VARCHAR PRIMARY KEY,' +
        'data JSON,' +
        'replicated_at TIMESTAMP,' +
        "source VARCHAR DEFAULT 'mariadb'" +
        ')'
      );
      await executeDuckDB(
        'INSERT OR REPLACE INTO ' + tableName + ' (id, data, replicated_at, source) VALUES (?, ?, ?, \"mariadb\")',
        [data.id || data.email || Date.now().toString(), jsonData, timestamp]
      );
      results.duckdb = true;
      console.log('✅ Replicated to DuckDB: ' + tableName + '/' + (data.email || data.id));
    } catch (error) {
        console.warn('DuckDB replication failed for ' + collection + ':', error.message);
    }
    return results;
  }

  async authenticate() {
    try {
      const response = await this._request('/health', 'GET', null, false);
      this.isConnected = response.status === 'healthy';
      if (this.isConnected) {
        console.log('✅ Connected to Python Intelligent Database Service');
        console.log('   Service: ' + response.service);
        console.log('   Status: ' + response.status);
      }
      return this.isConnected;
    } catch (error) {
      console.error('❌ Failed to connect to Python Intelligent DB:', error.message);
      this.isConnected = false;
      return false;
    }
  }

  async close() {
    this.clearCache();
    console.log('Intelligent Database connection closed');
  }

  async store(collection, data) {
    try {
      const result = await this._request('/api/db/store', 'POST', {
        patient_id: data.id || data.userId || data.email || 'anonymous',
        query: 'Store ' + collection + ' data',
        llm_response: JSON.stringify(data),
        source_service: 'nodejs_server',
        metadata: {
          collection,
          operation: 'create',
          timestamp: new Date().toISOString()
        }
      });
      return {
        success: true,
        id: result.interaction_id,
        ...result
      };
    } catch (error) {
      console.error('Failed to store ' + collection + ':', error.message);
      return { success: false, error: error.message };
    }
  }

  async query(collection, filters = {}) {
    try {
      const result = await this._request('/api/db/patient-context/' + (filters.id || 'all'), 'GET', null, true);
      return result;
    } catch (error) {
      console.error('Failed to query ' + collection + ':', error.message);
      return { results: [], count: 0 };
    }
  }

  async analyzeQuery(query, patientId = null, context = {}) {
    try {
      const result = await this._request('/api/db/analyze', 'POST', {
        query,
        patient_id: patientId,
        context
      }, false);
      return result;
    } catch (error) {
      console.error('Medical query analysis failed:', error.message);
      return null;
    }
  }

  get User() {
    const self = this;
    return {
      findOne: async ({ where = {} }) => {
        try {
          await connectMariaDB();
          const user = await MariaDBUser.findOne({ where });
          return user;
        } catch (error) {
          console.error('[Intelligent DB] MariaDB User.findOne failed:', error.message);
        }
        return null;
      },

      findByPk: async (id) => {
        try {
          await connectMariaDB();
          const user = await MariaDBUser.findByPk(id);
          return user;
        } catch (error) {
          console.error('[Intelligent DB] MariaDB User.findByPk failed:', error.message);
          return null;
        }
      },

      create: async (userData) => {
        try {
          await connectMariaDB();
          const newUser = await MariaDBUser.create(userData);
          console.log('✅ User created in MariaDB (LEADER): ' + newUser.email);
          try {
            await self._replicateToHelpers('users', newUser.toJSON());
          } catch (repError) {
            console.warn('[Intelligent DB] Replication to helpers failed:', repError.message);
          }
          return newUser;
        } catch (error) {
          console.error('[Intelligent DB] MariaDB User.create failed:', error.message);
          throw error;
        }
      },

      count: async () => {
        try {
          await connectMariaDB();
          return await MariaDBUser.count();
        } catch (error) {
          console.error('[Intelligent DB] MariaDB User.count failed:', error.message);
          return 0;
        }
      },

      findAll: async (options = {}) => {
        try {
          await connectMariaDB();
          return await MariaDBUser.findAll(options);
        } catch (error) {
          console.error('[Intelligent DB] MariaDB User.findAll failed:', error.message);
          return [];
        }
      },

      findAndCountAll: async (options = {}) => {
        try {
          await connectMariaDB();
          return await MariaDBUser.findAndCountAll(options);
        } catch (error) {
          console.error('[Intelligent DB] MariaDB User.findAndCountAll failed:', error.message);
          return { rows: [], count: 0 };
        }
      }
    };
  }

  get Doctor() {
    console.log('🟡 [Intelligent DB] Doctor getter accessed');
    const self = this;
    return {
      findOne: async ({ where }) => {
        console.log('🟡 [Intelligent DB] Doctor.findOne called with where:', where);
        try {
          await connectMariaDB();
          const MariaDBDoctor = (await import('../models/doctor.model.mariadb.js')).default;
          console.log('🟡 [Intelligent DB] MariaDBDoctor imported:', !!MariaDBDoctor);
          const result = await MariaDBDoctor.findOne({ where });
          console.log('🟡 [Intelligent DB] Doctor.findOne result:', !!result);
          return result;
        } catch (error) {
          console.error('[Intelligent DB] MariaDB Doctor.findOne failed:', error.message);
          console.error(error.stack);
        }
        return null;
      },
      findByPk: async (id) => {
        try {
          await connectMariaDB();
          const MariaDBDoctor = (await import('../models/doctor.model.mariadb.js')).default;
          return await MariaDBDoctor.findByPk(id);
        } catch (error) {
          console.error('[Intelligent DB] MariaDB Doctor.findByPk failed:', error.message);
          return null;
        }
      },
      create: async (doctorData) => {
        try {
          await connectMariaDB();
          const MariaDBDoctor = (await import('../models/doctor.model.mariadb.js')).default;
          const newDoctor = await MariaDBDoctor.create(doctorData);
          console.log('✅ Doctor created in MariaDB (LEADER): ' + newDoctor.email);
          try {
            await self._replicateToHelpers('doctors', newDoctor.toJSON());
          } catch (repError) {
            console.warn('[Intelligent DB] Replication to helpers failed:', repError.message);
          }
          return newDoctor;
        } catch (error) {
          console.error('[Intelligent DB] MariaDB Doctor.create failed:', error.message);
          throw error;
        }
      },
      update: async (id, updateData) => {
        try {
          await connectMariaDB();
          const MariaDBDoctor = (await import('../models/doctor.model.mariadb.js')).default;
          const doctor = await MariaDBDoctor.findByPk(id);
          if (!doctor) {
            throw new Error('Doctor not found');
          }
          await doctor.update(updateData);
          console.log('✅ Doctor updated in MariaDB (LEADER): ' + id);
          try {
            await self._replicateToHelpers('doctors', doctor.toJSON());
          } catch (repError) {
            console.warn('[Intelligent DB] Replication to helpers failed:', repError.message);
          }
          return doctor;
        } catch (error) {
          console.error('[Intelligent DB] MariaDB Doctor.update failed:', error.message);
          throw error;
        }
      },
      destroy: async (id) => {
        try {
          await connectMariaDB();
          const MariaDBDoctor = (await import('../models/doctor.model.mariadb.js')).default;
          const result = await MariaDBDoctor.destroy({ where: { id } });
          console.log('✅ Doctor deleted from MariaDB (LEADER): ' + id);
          return result;
        } catch (error) {
          console.error('[Intelligent DB] MariaDB Doctor.destroy failed:', error.message);
          return 0;
        }
      },
      findAll: async (options = {}) => {
        try {
          await connectMariaDB();
          const MariaDBDoctor = (await import('../models/doctor.model.mariadb.js')).default;
          return await MariaDBDoctor.findAll(options);
        } catch (error) {
          console.error('[Intelligent DB] MariaDB Doctor.findAll failed:', error.message);
          return [];
        }
      },
      count: async (options = {}) => {
        try {
          await connectMariaDB();
          const MariaDBDoctor = (await import('../models/doctor.model.mariadb.js')).default;
          return await MariaDBDoctor.count(options);
        } catch (error) {
          console.error('[Intelligent DB] MariaDB Doctor.count failed:', error.message);
          return 0;
        }
      },
      findAndCountAll: async (options = {}) => {
        try {
          await connectMariaDB();
          const MariaDBDoctor = (await import('../models/doctor.model.mariadb.js')).default;
          return await MariaDBDoctor.findAndCountAll(options);
        } catch (error) {
          console.error('[Intelligent DB] MariaDB Doctor.findAndCountAll failed:', error.message);
          return { rows: [], count: 0 };
        }
      }
    };
  }

  get Admin() {
    return {
      findOne: async ({ where }) => {
        try {
          await connectMariaDB();
          const MariaDBAdmin = (await import('../models/admin.model.mariadb.js')).default;
          return await MariaDBAdmin.findOne({ where });
        } catch (error) {
          console.error('[Intelligent DB] MariaDB Admin.findOne failed:', error.message);
        }
        return null;
      }
    };
  }

  get Nurse() {
    const self = this;
    return {
      findOne: async ({ where = {} }) => {
        try {
          await connectMariaDB();
          const nurse = await MariaDBNurse.findOne({ where });
          return nurse;
        } catch (error) {
          console.error('[Intelligent DB] MariaDB Nurse.findOne failed:', error.message);
        }
        return null;
      },
      findByPk: async (id) => {
        try {
          await connectMariaDB();
          return await MariaDBNurse.findByPk(id);
        } catch (error) {
          console.error('[Intelligent DB] MariaDB Nurse.findByPk failed:', error.message);
          return null;
        }
      },
      create: async (data) => {
        try {
          await connectMariaDB();
          const nurse = await MariaDBNurse.create(data);
          console.log('✅ Nurse created in MariaDB (LEADER): ' + nurse.email);
          try {
            await self._replicateToHelpers('nurses', nurse.toJSON());
          } catch (repError) {
            console.warn('[Intelligent DB] Replication to helpers failed:', repError.message);
          }
          return nurse;
        } catch (error) {
          console.error('[Intelligent DB] MariaDB Nurse.create failed:', error.message);
          throw error;
        }
      },
      findAll: async (options = {}) => {
        try {
          await connectMariaDB();
          return await MariaDBNurse.findAll(options);
        } catch (error) {
          console.error('[Intelligent DB] MariaDB Nurse.findAll failed:', error.message);
          return [];
        }
      },
      count: async () => {
        try {
          await connectMariaDB();
          return await MariaDBNurse.count();
        } catch (error) {
          console.error('[Intelligent DB] MariaDB Nurse.count failed:', error.message);
          return 0;
        }
      },
      findAndCountAll: async (options = {}) => {
        try {
          await connectMariaDB();
          return await MariaDBNurse.findAndCountAll(options);
        } catch (error) {
          console.error('[Intelligent DB] MariaDB Nurse.findAndCountAll failed:', error.message);
          return { rows: [], count: 0 };
        }
      }
    };
  }
  get Assistant() { return this._emptyModel(); }
  get VitalsRecord() { return this._emptyModel(); }
  get MedicationAdministration() { return this._emptyModel(); }
  get PatientNote() { return this._emptyModel(); }
  get Appointment() { return this._emptyModel(); }
  get DoctorAvailability() { return this._emptyModel(); }
  get MembershipPlan() { return this._emptyModel(); }
  get UserPlan() { return this._emptyModel(); }
  get InsuranceProvider() { return this._emptyModel(); }
  get InsurancePolicy() { return this._emptyModel(); }
  get UserInsurance() { return this._emptyModel(); }
  get InsuranceClaim() { return this._emptyModel(); }
  get AuditLog() { return this._emptyModel(); }
  get Lead() { return this._emptyModel(); }
  get LeadActivity() { return this._emptyModel(); }
  get LeadNote() { return this._emptyModel(); }
  get LeadTask() { return this._emptyModel(); }
  get Corporate() { return this._emptyModel(); }
  get Consent() { return this._emptyModel(); }
  get Ticket() { return this._emptyModel(); }
  get FitnessData() { return this._emptyModel(); }
  get HealthRiskAssessment() { return this._emptyModel(); }
  get PaymentTransaction() { return this._emptyModel(); }
  get PaymentGateway() { return this._emptyModel(); }
  get Chat() { return this._emptyModel(); }

  _emptyModel() {
    return {
      findOne: async () => null,
      findByPk: async () => null,
      create: async (data) => ({ id: Date.now(), ...data }),
      findAll: async () => [],
      update: async () => [1],
      destroy: async () => 1,
      count: async () => 0,
      findAndCountAll: async () => ({ rows: [], count: 0 })
    };
  }
}

const intelligentDB = new IntelligentDatabaseProxy();

export async function connectToDb() {
  const isConnected = await intelligentDB.authenticate();
  if (!isConnected) {
    console.warn('⚠️  Intelligent DB not available - using fallback mode');
  }
  return intelligentDB;
}

export async function getIntelligentDB() {
  return await connectToDb();
}

export default intelligentDB;
