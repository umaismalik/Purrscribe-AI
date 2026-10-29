import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { sql, dbConfig } from "./db/mssql.js";
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import fileUpload from "express-fileupload";
import transcribeRoute from "./routes/transcribe.js";
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { auth } from 'express-oauth2-jwt-bearer';
import userRoutes from './routes/users.js';
import fs from 'fs';
import path from 'path';
import Stripe from 'stripe';
import http from 'http'; 
import { 
  BlobServiceClient, 
  generateBlobSASQueryParameters, 
  BlobSASPermissions 
} from '@azure/storage-blob'
import https from 'https';

dotenv.config();

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const AZURE_CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME || 'files';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

let blobServiceClient;
let containerClient;

async function initializeAzureStorage() {
  try {
    if (!AZURE_STORAGE_CONNECTION_STRING) {
      console.warn('Azure Storage connection string not found. Using local storage only.');
      return false;
    }

    blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
    containerClient = blobServiceClient.getContainerClient(AZURE_CONTAINER_NAME);
    const exists = await containerClient.exists();
    if (!exists) {
      await containerClient.create();
      console.log(`Azure Blob Storage container "${AZURE_CONTAINER_NAME}" created`);
    }
    
    console.log(' Azure Blob Storage initialized successfully');
    return true;
  } catch (error) {
    console.error('Azure Blob Storage initialization failed:', error.message);
    return false;
  }
}

initializeAzureStorage();

async function uploadToAzureBlob(fileBuffer, fileName, contentType, userId) {
  try {
    if (!containerClient) {
      throw new Error('Azure Blob Storage not initialized');
    }
    const safeFileName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const blobName = `users/${userId}/${Date.now()}_${safeFileName}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.uploadData(fileBuffer, {
      blobHTTPHeaders: { 
        blobContentType: contentType,
        blobContentDisposition: `inline; filename="${safeFileName}"`
      }
    });
    
    console.log(`File uploaded to Azure Blob: ${blobName}`);

    return {
      url: blockBlobClient.url,
      blobName: blobName
    };
  } catch (error) {
    console.error('Azure upload error:', error);
    throw error;
  }
}

// import { 
//   BlobServiceClient, 
//   generateBlobSASQueryParameters, 
//   BlobSASPermissions 
// } from '@azure/storage-blob'

// const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
// const AZURE_CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME || 'files';


async function initializeStorage() {
  console.log('📁 Using local file storage only');
  return true;
}


async function uploadToLocalStorage(fileBuffer, fileName, contentType, userId) {
  try {
    const uploadsDir = path.join(__dirname, 'uploads');
    const userDir = path.join(uploadsDir, 'users', userId.toString());
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    
    const safeFileName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const fileNameWithTimestamp = `${Date.now()}_${safeFileName}`;
    const filePath = path.join(userDir, fileNameWithTimestamp);
    
    await fs.promises.writeFile(filePath, fileBuffer);
    
    const fileUrl = `/uploads/users/${userId}/${fileNameWithTimestamp}`;
    
    console.log(`File uploaded to local storage: ${filePath}`);
    
    return {
      url: fileUrl,
      filePath: filePath
    };
  } catch (error) {
    console.error('Local upload error:', error);
    throw error;
  }
}

initializeStorage();

console.log("OPENAI_API_KEY loaded:", process.env.OPENAI_API_KEY ? " yes" : " no");

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
});

// const checkJwt = auth({
//   audience: process.env.AUTH0_AUDIENCE,
//   issuerBaseURL: process.env.AUTH0_ISSUER,
  
//     // tokenSigningAlg: process.env.TOKEN_SIGNING_ALG || 'HS256' 
// });
const checkJwt = (req, res, next) => {
  // Skip auth for public routes
  if (req.path.includes('/public') || req.path === '/api/health') {
    return next();
  }

  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' });
  }

  const token = authHeader.split(' ')[1];
  
  try {
   
    const auth0Secret = process.env.AUTH0_CLIENT_SECRET; 
    if (auth0Secret) {
      const decoded = jwt.verify(token, auth0Secret, {
        audience: process.env.AUTH0_AUDIENCE,
        issuer: `https://${process.env.VITE_AUTH0_DOMAIN}/`
      });
      req.auth = { payload: decoded };
      return next();
    }
  } catch (auth0Error) {
  
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.auth = { 
        payload: {
          sub: decoded.auth0Id || decoded.id,
          email: decoded.email,
          name: decoded.name
        }
      };
      return next();
    } catch (ourError) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }
};
const syncAuth0User = async (req, res, next) => {
  if (req.auth && req.auth.payload) {
    try {
      const auth0User = req.auth.payload;
      const pool = await getPool();
      
      console.log('Syncing Auth0 user:', auth0User.sub, auth0User.email);
      const userResult = await pool.request()
        .input('auth0Id', sql.NVarChar, auth0User.sub)
        .query('SELECT * FROM Users WHERE auth0_id = @auth0Id');
      
      if (userResult.recordset.length === 0) {
        const insertResult = await pool.request()
          .input('auth0Id', sql.NVarChar, auth0User.sub)
          .input('email', sql.NVarChar, auth0User.email)
          .input('name', sql.NVarChar, auth0User.name || auth0User.email.split('@')[0])
          .input('emailVerified', sql.Bit, auth0User.email_verified ? 1 : 0)
          .query(`
            INSERT INTO Users (auth0_id, email, name, email_verified, createdAt)
            OUTPUT inserted.id, inserted.email, inserted.name, inserted.auth0_id
            VALUES (@auth0Id, @email, @name, @emailVerified, GETDATE())
          `);
        
        console.log('New user created from Auth0:', insertResult.recordset[0]);
      } else {
        console.log('Auth0 user already exists:', userResult.recordset[0]);
      }
    } catch (error) {
      console.error('Auth0 user sync error:', error);
    }
  }
  next();
};

const handleAuth0User = async (req, res, next) => {
  if (req.auth && req.auth.payload) {
    try {
      const auth0User = req.auth.payload;
      const pool = await getPool();

      const userCheck = await pool.request()
        .input('auth0Id', sql.NVarChar, auth0User.sub)
        .query('SELECT * FROM Users WHERE auth0_id = @auth0Id');
      
      if (userCheck.recordset.length === 0) {
        await pool.request()
          .input('auth0Id', sql.NVarChar, auth0User.sub)
          .input('email', sql.NVarChar, auth0User.email)
          .input('name', sql.NVarChar, auth0User.name || auth0User.email.split('@')[0])
          .input('emailVerified', sql.Bit, auth0User.email_verified ? 1 : 0)
          .query(`
            INSERT INTO Users (auth0_id, email, name, email_verified, createdAt)
            VALUES (@auth0Id, @email, @name, @emailVerified, GETDATE())
          `);
        
        console.log('New user created from Auth0:', auth0User.email);
      }
      
      req.user = auth0User;
    } catch (error) {
      console.error('Auth0 user handling error:', error);
    }
  }
  next();
};

const authenticateJWTWithQuery = async (req, res, next) => {
  let token = req.headers.authorization?.split(' ')[1];
  if (!token && req.query.token) {
    token = req.query.token;
  }
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
// ==================== UNIFIED AUTHENTICATION MIDDLEWARE ====================
const authenticateUniversal = async (req, res, next) => {
  console.log('🔐 Universal Auth - Headers:', req.headers.authorization);
  console.log('🔐 Universal Auth - URL:', req.url);
  
  let userId = null;
  let token = req.headers.authorization?.split(' ')[1];
  if (!token && req.query.token) {
    token = req.query.token;
  }
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      console.log('📋 Decoded token:', decoded);
      
      if (decoded.userId) {
        userId = decoded.userId;
      } else if (decoded.id) {
        userId = decoded.id;
      } else if (decoded.auth0Id) {
        const user = await dbService.getUserByAuth0Id(decoded.auth0Id);
        if (user) {
          userId = user.id;
        }
      }
      
      console.log('👤 Extracted user ID:', userId);
      
    } catch (jwtError) {
      console.log('🔄 JWT verification failed:', jwtError.message);
    }
  }

  if (!userId) {
    console.error(' Authentication failed - no valid token');
    return res.status(401).json({ 
      success: false,
      error: 'Authentication failed - no valid token' 
    });
  }

  req.user = { id: userId };
  next();
};
// ==================== DATABASE MIDDLEWARE LAYER ====================
class DatabaseService {
  constructor() {
    this.pool = null;
    this.dbConfig = dbConfig;
  }


  async getPool() {
    if (this.pool) return this.pool;
    try {
      this.pool = await sql.connect(this.dbConfig);
      console.log('Connected to SQL Server');
      return this.pool;
    } catch (err) {
      console.error('Database connection failed:', err);
      throw err;
    }
  }
  async getUserByEmail(email) {
    const pool = await this.getPool();
    const result = await pool.request()
      .input('email', sql.NVarChar, email)
      .query('SELECT * FROM Users WHERE email = @email');
    return result.recordset[0] || null;
  }

  async getUserById(id) {
    const pool = await this.getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM Users WHERE id = @id');
    return result.recordset[0] || null;
  }

  async getUserByAuth0Id(auth0Id) {
    const pool = await this.getPool();
    const result = await pool.request()
      .input('auth0Id', sql.NVarChar, auth0Id)
      .query('SELECT * FROM Users WHERE auth0_id = @auth0Id');
    return result.recordset[0] || null;
  }

  async createUser(userData) {
    const pool = await this.getPool();
    const { email, password, name, auth0Id, emailVerified } = userData;
    
    const result = await pool.request()
      .input('email', sql.NVarChar, email)
      .input('password', sql.NVarChar, password || null)
      .input('name', sql.NVarChar, name)
      .input('auth0Id', sql.NVarChar, auth0Id || null)
      .input('emailVerified', sql.Bit, emailVerified ? 1 : 0)
      .query(`
        INSERT INTO Users (email, password, name, auth0_id, email_verified, createdAt, updatedAt)
        OUTPUT inserted.id, inserted.email, inserted.name, inserted.auth0_id, inserted.createdAt
        VALUES (@email, @password, @name, @auth0Id, @emailVerified, GETDATE(), GETDATE())
      `);
    
    return result.recordset[0];
  }

 async updateUser(userId, updateData) {
  const pool = await this.getPool();
  const { 
    professional_title, 
    phone_number, 
    avatar_seed, 
    role, 
    auth0Id, 
    emailVerified,
    name 
  } = updateData;
  
  let updateFields = [];
  const request = pool.request()
    .input('userId', sql.Int, userId);
  
  if (professional_title !== undefined) {
    updateFields.push("professional_title = @professional_title");
    request.input('professional_title', sql.NVarChar, professional_title);
  }
  
  if (phone_number !== undefined) {
    updateFields.push("phone_number = @phone_number");
    request.input('phone_number', sql.NVarChar, phone_number);
  }
  
  if (avatar_seed !== undefined) {
    updateFields.push("avatar_seed = @avatar_seed");
    request.input('avatar_seed', sql.NVarChar, avatar_seed);
  }
  
  if (role !== undefined) {
    updateFields.push("role = @role");
    request.input('role', sql.NVarChar, role);
  }
  
  // ✅ ADD THESE NEW FIELDS FOR AUTH0 SYNC
  if (auth0Id !== undefined) {
    updateFields.push("auth0_id = @auth0Id");
    request.input('auth0Id', sql.NVarChar, auth0Id);
  }
  
  if (emailVerified !== undefined) {
    updateFields.push("email_verified = @emailVerified");
    request.input('emailVerified', sql.Bit, emailVerified ? 1 : 0);
  }
  
  if (name !== undefined) {
    updateFields.push("name = @name");
    request.input('name', sql.NVarChar, name);
  }
  updateFields.push("updatedAt = GETDATE()");
  
  const query = `UPDATE Users SET ${updateFields.join(", ")} WHERE id = @userId`;
  await request.query(query);
  return this.getUserById(userId);
}

  async updateUserPassword(userId, hashedPassword) {
    const pool = await this.getPool();
    await pool.request()
      .input('userId', sql.Int, userId)
      .input('password', sql.NVarChar, hashedPassword)
      .query('UPDATE Users SET password = @password, updatedAt = GETDATE() WHERE id = @userId');
    return true;
  }
  async getUserSubscription(userId) {
    const pool = await this.getPool();
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT 
          us.*,
          sp.name as plan_name,
          sp.description as plan_description,
          sp.monthly_price,
          sp.yearly_price,
          sp.features
        FROM user_subscriptions us
        INNER JOIN subscription_plans sp ON us.plan_id = sp.id
        WHERE us.user_id = @userId AND us.status IN ('active', 'pending')
        ORDER BY us.created_at DESC
      `);
    return result.recordset[0] || null;
  }

  async createOrUpdateSubscription(subscriptionData) {
    const pool = await this.getPool();
    const { userId, planId, billingCycle, currentPeriodStart, currentPeriodEnd, stripeSubscriptionId, stripeCustomerId, status } = subscriptionData;
    
    const existingSub = await pool.request()
      .input('userId', sql.Int, userId)
      .query('SELECT id FROM user_subscriptions WHERE user_id = @userId AND status IN (\'active\', \'pending\')');
    
    if (existingSub.recordset.length > 0) {
      await pool.request()
        .input('userId', sql.Int, userId)
        .input('planId', sql.NVarChar, planId)
        .input('billingCycle', sql.NVarChar, billingCycle)
        .input('currentPeriodStart', sql.Date, currentPeriodStart)
        .input('currentPeriodEnd', sql.Date, currentPeriodEnd)
        .input('stripeSubscriptionId', sql.NVarChar, stripeSubscriptionId)
        .input('stripeCustomerId', sql.NVarChar, stripeCustomerId)
        .input('status', sql.NVarChar, status || 'active')
        .query(`
          UPDATE user_subscriptions 
          SET plan_id = @planId, billing_cycle = @billingCycle, 
              current_period_start = @currentPeriodStart, current_period_end = @currentPeriodEnd,
              stripe_subscription_id = @stripeSubscriptionId, stripe_customer_id = @stripeCustomerId,
              status = @status, cancel_at_period_end = 0, updated_at = GETDATE()
          WHERE user_id = @userId
        `);
    } else {
      await pool.request()
        .input('userId', sql.Int, userId)
        .input('planId', sql.NVarChar, planId)
        .input('billingCycle', sql.NVarChar, billingCycle)
        .input('currentPeriodStart', sql.Date, currentPeriodStart)
        .input('currentPeriodEnd', sql.Date, currentPeriodEnd)
        .input('stripeSubscriptionId', sql.NVarChar, stripeSubscriptionId)
        .input('stripeCustomerId', sql.NVarChar, stripeCustomerId)
        .input('status', sql.NVarChar, status || 'active')
        .query(`
          INSERT INTO user_subscriptions 
            (user_id, plan_id, billing_cycle, current_period_start, current_period_end, 
             stripe_subscription_id, stripe_customer_id, status)
          VALUES 
            (@userId, @planId, @billingCycle, @currentPeriodStart, @currentPeriodEnd,
             @stripeSubscriptionId, @stripeCustomerId, @status)
        `);
    }
    
    return this.getUserSubscription(userId);
  }

  async cancelUserSubscription(userId) {
    const pool = await this.getPool();
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        UPDATE user_subscriptions 
        SET status = 'cancelled', updated_at = GETDATE()
        WHERE user_id = @userId AND status = 'active'
      `);
    return result.rowsAffected[0] > 0;
  }
}

const dbService = new DatabaseService();

// ==================== MIDDLEWARE FUNCTIONS ====================
const validateRequest = (schema) => {
  return (req, res, next) => {
    try {
      if (schema.body) {
        const { error } = schema.body.validate(req.body);
        if (error) {
          return res.status(400).json({ error: error.details[0].message });
        }
      }
      
      if (schema.params) {
        const { error } = schema.params.validate(req.params);
        if (error) {
          return res.status(400).json({ error: error.details[0].message });
        }
      }
      
      if (schema.query) {
        const { error } = schema.query.validate(req.query);
        if (error) {
          return res.status(400).json({ error: error.details[0].message });
        }
      }
      
      next();
    } catch (error) {
      res.status(500).json({ error: 'Request validation failed' });
    }
  };
};

const formatResponse = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    if (res.statusCode >= 400) {
      return originalSend.call(this, data);
    }
    
    if (typeof data === 'object' && data !== null && !data.success) {
      const formattedResponse = {
        success: true,
        data: data,
        timestamp: new Date().toISOString()
      };
      return originalSend.call(this, formattedResponse);
    }
    
    return originalSend.call(this, data);
  };
  
  next();
};

const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      details: err.message
    });
  }
  
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      success: false,
      error: 'Authentication failed'
    });
  }
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
};

const createRateLimit = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false
  });
};

// ==================== AUTHENTICATION MIDDLEWARE ====================
const authenticateJWT = async (req, res, next) => {
  console.log('🔐 Auth Headers:', req.headers.authorization);
  console.log('🔐 Request URL:', req.url);
  
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    console.log(' No authorization header');
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  
  if (!token) {
    console.log(' No token in authorization header');
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    console.log('Decoded token:', decoded);
    
    // Extract user ID from different token structures
    let userId = null;
    if (decoded.userId) {
      userId = decoded.userId;
    } else if (decoded.id) {
      userId = decoded.id;
    } else if (decoded.auth0Id) {
      // For Auth0 tokens, look up the user
      const user = await dbService.getUserByAuth0Id(decoded.auth0Id);
      if (user) {
        userId = user.id;
      }
    }
    
    if (!userId) {
      console.log(' No user ID found in token');
      return res.status(401).json({ error: 'Invalid token structure' });
    }
    
    req.user = { id: userId };
    console.log('Authenticated user:', userId);
    next();
    
  } catch (err) {
    console.error(" JWT verification error:", err.message);
    return res.status(401).json({ error: 'Invalid token' });
  }
};
app.use(cors({
  origin: [
   'http://localhost:5173',
    'http://localhost:5174',
    'https://mliapi.ddns.net:5173',
    'https://mliapi.ddns.net',
     'http://localhost:5173',
    'http://localhost:5174',
    'http://mliapi.ddns.net:5173',
    'https://mliapi.ddns.net',
    'http://mliapi.ddns.net',
    'https://mliapi.ddns.net:5000',
    'http://mliapi.ddns.net:5000',
    'http://192.168.100.6:5000'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'Range', 
    'Accept',
    'X-Requested-With',
    'Origin'
  ],
    exposedHeaders: [
    'Content-Range', 
    'Content-Length', 
    'Accept-Ranges', 
    'Content-Type',
    'Authorization'
  ],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));


app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(formatResponse);

app.use('/api/', createRateLimit(15 * 60 * 1000, 100, 'Too many requests from this IP'));
app.use('/api/auth/', createRateLimit(15 * 60 * 1000, 50, 'Too many authentication attempts'));

// ==================== ORIGINAL DATABASE CONNECTION (FOR BACKWARD COMPATIBILITY) ====================
let pool;
async function getPool() {
  if (pool) return pool;
  try {
    pool = await sql.connect(dbService.dbConfig);
    console.log('Connected to SQL Server');
    return pool;
  } catch (err) {
    console.error('Database connection failed:', err);
    throw err;
  }
}

// ==================== AUTHENTICATION ROUTES (USING DATABASE SERVICE) ====================
app.post('/api/auth/register', async (req, res) => {
  try {
    console.log('Registration attempt:', req.body);
    
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const existingUser = await dbService.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await dbService.createUser({
      email,
      password: hashedPassword,
      name
    });

    user.createdAt = new Date();
    
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1h' }
    );

    res.status(201).json({ 
      token,
      user
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      error: 'Registration failed',
      details: error.message
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await dbService.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1h' }
    );

    res.json({ 
      token,
      user: { 
        id: user.id, 
        email: user.email, 
        name: user.name, 
        createdAt: user.createdAt 
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/me', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await dbService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// ==================== CALL RECORDINGS ROUTES ====================
app.post('/api/fix-missing-table', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CallRecordings' AND xtype='U')
      CREATE TABLE CallRecordings (
        id INT PRIMARY KEY IDENTITY(1,1),
        user_id INT NOT NULL,
        pet_name NVARCHAR(255) NOT NULL,
        owner_name NVARCHAR(255) NOT NULL,
        phone_number NVARCHAR(20) NOT NULL,
        duration INT DEFAULT 0,
        call_type NVARCHAR(20) DEFAULT 'whatsapp',
        call_direction NVARCHAR(10) DEFAULT 'outgoing',
        audio_url NVARCHAR(500),
        transcription NVARCHAR(MAX),
        summary NVARCHAR(MAX),
        status NVARCHAR(20) DEFAULT 'pending',
        approved_by NVARCHAR(255),
        approved_date DATETIME2,
        date DATETIME2 DEFAULT GETDATE(),
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE(),
        FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
      )
    `);
    
    res.json({ 
      success: true, 
      message: 'CallRecordings table created successfully!' 
    });
    
  } catch (err) {
    console.error("Error creating table:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to create table", 
      details: err.message 
    });
  }
});
app.get('/api/test-call-recordings', authenticateJWT, async (req, res) => {
  try {
    console.log('🧪 TEST CALL-RECORDINGS ROUTE - User:', req.user.id);
    
    const userId = req.user.id;
    const pool = await getPool();
    const tableCheck = await pool.request()
      .query(`SELECT COUNT(*) as tableExists FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'CallRecordings'`);
    
    const tableExists = tableCheck.recordset[0].tableExists > 0;
    
    if (!tableExists) {
      return res.json({ 
        success: false, 
        message: 'CallRecordings table does not exist',
        tableExists: false
      });
    }
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query('SELECT COUNT(*) as count FROM CallRecordings WHERE user_id = @userId');
    
    res.json({ 
      success: true, 
      message: 'Call recordings route is working!',
      tableExists: true,
      userRecordingsCount: result.recordset[0].count,
      userId: userId
    });
    
  } catch (err) {
    console.error(" Test route error:", err);
    res.status(500).json({ 
      success: false,
      error: "Test failed", 
      details: err.message 
    });
  }
});
app.get('/api/call-recordings', authenticateJWT, async (req, res) => {
  try {
    console.log('📞 CALL-RECORDINGS ROUTE HIT - User:', req.user.id);
    
    const userId = req.user.id;
    const pool = await getPool();
    
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT 
          id,
          pet_name as petName,
          owner_name as ownerName,
          phone_number as phoneNumber,
          duration,
          call_type as callType,
          call_direction as callDirection,
          audio_url as audioUrl,
          transcription,
          summary,
          status,
          approved_by as approvedBy,
          approved_date as approvedDate,
          date,
          created_at as createdAt
        FROM CallRecordings 
        WHERE user_id = @userId
        ORDER BY created_at DESC
      `);
    
    console.log(` Retrieved ${result.recordset.length} call recordings for user ${userId}`);
    
   
    const recordings = result.recordset || [];
    
    res.json(recordings);
  } catch (err) {
    console.error(" Error fetching call recordings:", err);
    res.status(500).json({ 
      error: "Failed to fetch call recordings",
      details: err.message 
    });
  }
});

app.post('/api/call-recordings', authenticateJWT, async (req, res) => {
  try {
    const {
      petName,
      ownerName,
      phoneNumber,
      callType = 'whatsapp',
      callDirection = 'outgoing',
      duration = 0
    } = req.body;
    
    const userId = req.user.id;

    console.log(' NEW CALL RECORDING REQUEST:');
    console.log(' User:', userId);
    console.log(' Pet:', petName);
    console.log(' Owner:', ownerName);
    console.log(' Phone:', phoneNumber);

    if (!petName || !ownerName || !phoneNumber) {
      console.error(' Missing required fields');
      return res.status(400).json({ error: "Pet name, owner name, and phone number are required" });
    }

    const pool = await getPool();
    
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .input('petName', sql.NVarChar, petName)
      .input('ownerName', sql.NVarChar, ownerName)
      .input('phoneNumber', sql.NVarChar, phoneNumber)
      .input('callType', sql.NVarChar, callType)
      .input('callDirection', sql.NVarChar, callDirection)
      .input('duration', sql.Int, duration)
      .query(`
        INSERT INTO CallRecordings (
          user_id, pet_name, owner_name, phone_number, call_type, 
          call_direction, duration, status
        )
        OUTPUT inserted.id, inserted.pet_name as petName, inserted.owner_name as ownerName, 
               inserted.phone_number as phoneNumber, inserted.call_type as callType, 
               inserted.call_direction as callDirection, inserted.duration, inserted.status, 
               inserted.date, inserted.created_at as createdAt
        VALUES (@userId, @petName, @ownerName, @phoneNumber, @callType, 
                @callDirection, @duration, 'pending')
      `);
    
    const callRecording = result.recordset[0];
    
    console.log(' CALL RECORDING CREATED SUCCESSFULLY:', callRecording.id, 'for pet:', petName);
    
    res.status(201).json(callRecording);
    
  } catch (err) {
    console.error(" ERROR creating call recording:", err);
    res.status(500).json({ 
      error: "Failed to create call recording",
      details: err.message 
    });
  }
});

// Get specific call recording
app.get('/api/call-recordings/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const pool = await getPool();
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query(`
        SELECT 
          id,
          pet_name as petName,
          owner_name as ownerName,
          phone_number as phoneNumber,
          duration,
          call_type as callType,
          call_direction as callDirection,
          audio_url as audioUrl,
          transcription,
          summary,
          status,
          approved_by as approvedBy,
          approved_date as approvedDate,
          date,
          created_at as createdAt
        FROM CallRecordings 
        WHERE id = @id AND user_id = @userId
      `);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: "Call recording not found" });
    }
    
    res.json(result.recordset[0]);
  } catch (err) {
    console.error(" Error fetching call recording:", err);
    res.status(500).json({ 
      error: "Failed to fetch call recording",
      details: err.message 
    });
  }
});
app.put('/api/call-recordings/:id/duration', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const { duration } = req.body;
    const userId = req.user.id;
    
    if (!duration && duration !== 0) {
      return res.status(400).json({ error: "Duration is required" });
    }

    const pool = await getPool();
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .input('duration', sql.Int, duration)
      .query(`
        UPDATE CallRecordings 
        SET duration = @duration, updated_at = GETDATE()
        WHERE id = @id AND user_id = @userId
        OUTPUT inserted.id, inserted.duration
      `);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: "Call recording not found" });
    }
    
    res.json({ 
      message: "Duration updated successfully",
      duration: result.recordset[0].duration
    });
    
  } catch (err) {
    console.error(" Error updating call duration:", err);
    res.status(500).json({ 
      error: "Failed to update call duration",
      details: err.message 
    });
  }
});

app.delete('/api/call-recordings/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const pool = await getPool();
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query('DELETE FROM CallRecordings WHERE id = @id AND user_id = @userId');
    
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: "Call recording not found" });
    }
    
    res.json({ message: "Call recording deleted successfully" });
    
  } catch (err) {
    console.error(" Error deleting call recording:", err);
    res.status(500).json({ 
      error: "Failed to delete call recording",
      details: err.message 
    });
  }
});
app.post('/api/call-recordings/:id/transcribe', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const pool = await getPool();
    const recordingResult = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query('SELECT * FROM CallRecordings WHERE id = @id AND user_id = @userId');
    
    if (recordingResult.recordset.length === 0) {
      return res.status(404).json({ error: "Call recording not found" });
    }
    
    const recording = recordingResult.recordset[0];
    const mockTranscription = `Transcription for call with ${recording.pet_name}:
Veterinarian: Hello, this is a follow-up call about ${recording.pet_name}.
Owner: Thank you for calling.
Veterinarian: We discussed the treatment plan and scheduled a follow-up appointment.
Owner: We'll see you next week.`;
    await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .input('transcription', sql.NVarChar, mockTranscription)
      .query(`
        UPDATE CallRecordings 
        SET transcription = @transcription, updated_at = GETDATE()
        WHERE id = @id AND user_id = @userId
      `);
    
    const updatedResult = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query(`
        SELECT 
          id,
          pet_name as petName,
          owner_name as ownerName,
          phone_number as phoneNumber,
          transcription,
          updated_at as updatedAt
        FROM CallRecordings 
        WHERE id = @id AND user_id = @userId
      `);
    
    res.json({
      message: "Transcription completed successfully",
      transcription: mockTranscription,
      recording: updatedResult.recordset[0]
    });
    
  } catch (err) {
    console.error(" Error transcribing call recording:", err);
    res.status(500).json({ 
      error: "Failed to transcribe call recording",
      details: err.message 
    });
  }
});

app.post('/api/call-recordings/:id/summarize', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const pool = await getPool();
    
    const recordingResult = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query('SELECT * FROM CallRecordings WHERE id = @id AND user_id = @userId');
    
    if (recordingResult.recordset.length === 0) {
      return res.status(404).json({ error: "Call recording not found" });
    }
    
    const recording = recordingResult.recordset[0];
    
    if (!recording.transcription) {
      return res.status(400).json({ error: "No transcription available to summarize" });
    }
    const mockSummary = `Summary: Discussed ${recording.pet_name}'s health status with owner. Reviewed treatment plan and scheduled follow-up appointment.`;
    
    await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .input('summary', sql.NVarChar, mockSummary)
      .query(`
        UPDATE CallRecordings 
        SET summary = @summary, updated_at = GETDATE()
        WHERE id = @id AND user_id = @userId
      `);
    
    res.json({
      message: "Summary generated successfully",
      summary: mockSummary
    });
    
  } catch (err) {
    console.error(" Error summarizing transcription:", err);
    res.status(500).json({ 
      error: "Failed to summarize transcription",
      details: err.message 
    });
  }
});
app.post('/api/call-recordings/:id/approve', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { approvedBy = `User ${userId}` } = req.body;
    const pool = await getPool();
    
    await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .input('approvedBy', sql.NVarChar, approvedBy)
      .query(`
        UPDATE CallRecordings 
        SET status = 'approved', approved_by = @approvedBy, approved_date = GETDATE()
        WHERE id = @id AND user_id = @userId
      `);
    
    res.json({ message: "Transcription approved successfully" });
    
  } catch (err) {
    console.error(" Error approving transcription:", err);
    res.status(500).json({ 
      error: "Failed to approve transcription",
      details: err.message 
    });
  }
});
app.get('/api/debug/call-recordings-test', authenticateJWT, async (req, res) => {
  try {
    console.log('🧪 DEBUG ROUTE HIT - User:', req.user.id);
    
    const userId = req.user.id;
    const pool = await getPool();
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT COUNT(*) as count FROM CallRecordings WHERE user_id = @userId
      `);
    
    const userCount = result.recordset[0].count;
    const totalResult = await pool.request()
      .query('SELECT COUNT(*) as total FROM CallRecordings');
    
    res.json({
      success: true,
      message: 'Debug route working!',
      userRecordingsCount: userCount,
      totalRecordingsCount: totalResult.recordset[0].total,
      userId: userId,
      tableExists: true
    });
    
  } catch (err) {
    console.error(" Debug route error:", err);
    res.status(500).json({ 
      success: false,
      error: "Debug failed", 
      details: err.message 
    });
  }
});
app.put('/api/call-recordings/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.user.id;
    
    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }

    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .input('status', sql.NVarChar, status)
      .query(`
        UPDATE CallRecordings 
        SET status = @status, updated_at = GETDATE()
        WHERE id = @id AND user_id = @userId
        OUTPUT inserted.id, inserted.status
      `);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: "Call recording not found" });
    }
    
    res.json({ 
      message: "Call recording updated successfully",
      status: result.recordset[0].status
    });
    
  } catch (err) {
    console.error(" Error updating call recording:", err);
    res.status(500).json({ 
      error: "Failed to update call recording",
      details: err.message 
    });
  }
});

app.get('/api/debug/init-tables', async (req, res) => {
  try {
    await createDatabaseTables();
    res.json({ success: true, message: 'All tables initialized' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post('/api/debug/create-callrecordings-table', async (req, res) => {
  try {
    const pool = await getPool();
    
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CallRecordings' AND xtype='U')
      CREATE TABLE CallRecordings (
        id INT PRIMARY KEY IDENTITY(1,1),
        user_id INT NOT NULL,
        pet_name NVARCHAR(255) NOT NULL,
        owner_name NVARCHAR(255) NOT NULL,
        phone_number NVARCHAR(20) NOT NULL,
        duration INT DEFAULT 0,
        call_type NVARCHAR(20) DEFAULT 'whatsapp',
        call_direction NVARCHAR(10) DEFAULT 'outgoing',
        audio_url NVARCHAR(500),
        transcription NVARCHAR(MAX),
        summary NVARCHAR(MAX),
        status NVARCHAR(20) DEFAULT 'pending',
        approved_by NVARCHAR(255),
        approved_date DATETIME2,
        date DATETIME2 DEFAULT GETDATE(),
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE(),
        FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
      )
    `);
    res.json({ 
      success: true, 
      message: 'CallRecordings table created successfully' 
    });
    
  } catch (err) {
    console.error(" Error creating table:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to create table", 
      details: err.message 
    });
  }
});
app.get('/api/debug/check-callrecordings-table', async (req, res) => {
  try {
    const pool = await getPool();
    const tableCheck = await pool.request()
      .query(`SELECT COUNT(*) as tableExists FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'CallRecordings'`);
    
    const tableExists = tableCheck.recordset[0].tableExists > 0;
    
    if (!tableExists) {
      return res.json({ 
        success: false, 
        message: 'CallRecordings table does not exist',
        tableExists: false
      });
    }
    const dataCheck = await pool.request()
      .query('SELECT COUNT(*) as recordCount FROM CallRecordings');
    
    res.json({ 
      success: true, 
      message: 'CallRecordings table exists',
      tableExists: true,
      recordCount: dataCheck.recordset[0].recordCount
    });
    
  } catch (err) {
    console.error(" Table check error:", err);
    res.status(500).json({ 
      success: false,
      error: "Table check failed", 
      details: err.message 
    });
  }
});
// ==================== SUBSCRIPTION ROUTES ====================
app.get('/api/user/subscription', authenticateJWT, async (req, res) => {
  try {
    console.log(' Fetching subscription for user:', req.user.id);

    const subscription = await dbService.getUserSubscription(req.user.id);
    
    if (!subscription) {
      console.log(' No subscription found for user:', req.user.id);
      return res.status(404).json({ error: "No active subscription found" });
    }
    
    const price = subscription.billing_cycle === 'monthly' 
      ? subscription.monthly_price 
      : subscription.yearly_price;
    
    console.log('Subscription found:', subscription.plan_name);
    
    res.json({
      id: subscription.id,
      plan: {
        id: subscription.plan_id,
        name: subscription.plan_name,
        description: subscription.plan_description,
        price: price,
        features: JSON.parse(subscription.features)
      },
      billingCycle: subscription.billing_cycle,
      status: subscription.status,
      currentPeriodStart: subscription.current_period_start,
      currentPeriodEnd: subscription.current_period_end,
      nextBillingDate: subscription.current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end
    });
  } catch (err) {
    console.error("Error fetching subscription:", err);
    res.status(500).json({ error: "Failed to fetch subscription" });
  }
});

app.get('/api/user/subscription/status', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const pool = await getPool();
    
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT 
          us.status,
          us.plan_id,
          us.billing_cycle,
          us.current_period_start,
          us.current_period_end,
          sp.name as plan_name
        FROM user_subscriptions us
        LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
        WHERE us.user_id = @userId
        ORDER BY us.created_at DESC
      `);
    
    if (result.recordset.length === 0) {
      return res.json({ 
        hasSubscription: false,
        status: 'none'
      });
    }
    
    const subscription = result.recordset[0];
    res.json({
      hasSubscription: true,
      status: subscription.status,
      plan: subscription.plan_name,
      billingCycle: subscription.billing_cycle,
      isActive: subscription.status === 'active',
      currentPeriodStart: subscription.current_period_start,
      currentPeriodEnd: subscription.current_period_end
    });
  } catch (err) {
    console.error("Error checking subscription status:", err);
    res.status(500).json({ error: "Failed to check subscription status" });
  }
});

app.post('/api/user/subscribe', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const { planId, billingCycle } = req.body;
    
    if (!planId || !billingCycle) {
      return res.status(400).json({ error: "Plan ID and billing cycle are required" });
    }

    const pool = await getPool();
    const planResult = await pool.request()
      .input('planId', sql.NVarChar, planId)
      .query('SELECT * FROM subscription_plans WHERE id = @planId AND is_active = 1');
    
    if (planResult.recordset.length === 0) {
      return res.status(404).json({ error: "Plan not found" });
    }

    const plan = planResult.recordset[0];
    const price = billingCycle === 'monthly' ? plan.monthly_price : plan.yearly_price;
    
    console.log(`Selected plan: ${planId}, Price: $${price}, Billing: ${billingCycle}`);
    if (planId === 'basic' && price === 0) {
      console.log('Activating free Basic plan without Stripe');

      const currentPeriodStart = new Date();
      const currentPeriodEnd = new Date();
      currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + (billingCycle === 'monthly' ? 1 : 12));
      
      await dbService.createOrUpdateSubscription({
        userId,
        planId,
        billingCycle,
        currentPeriodStart,
        currentPeriodEnd,
        status: 'active'
      });
      
      return res.json({
        success: true,
        message: "Free plan activated successfully!",
        subscription: {
          planId: planId,
          billingCycle: billingCycle,
          status: 'active',
          plan: {
            id: plan.id,
            name: plan.name,
            price: 0
          }
        }
      });
    }
    console.log('Creating Stripe checkout for paid plan');
    const priceInCents = Math.round(price * 100);
    const user = await dbService.getUserById(userId);
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    let product;
    try {
      const products = await stripe.products.list({
        limit: 1,
        active: true,
        url: `plan_${planId}`
      });
      
      if (products.data.length > 0) {
        product = products.data[0];
      } else {
        product = await stripe.products.create({
          name: `${plan.name} Plan`,
          description: plan.description,
          metadata: {
            plan_id: planId
          }
        });
      }
    } catch (productError) {
      console.error('Error creating/finding product:', productError);
      product = await stripe.products.create({
        name: `${plan.name} Plan`,
        metadata: {
          plan_id: planId
        }
      });
    }
    const priceObject = await stripe.prices.create({
      product: product.id,
      unit_amount: priceInCents,
      currency: 'usd',
      recurring: {
        interval: billingCycle === 'monthly' ? 'month' : 'year',
      },
    });
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceObject.id,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.VITE_AUTH_REDIRECT_URI || 'http://localhost:5173'}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.VITE_AUTH_REDIRECT_URI || 'http://localhost:5173'}/subscription/cancel`,
      customer_email: user.email,
      metadata: {
        userId: userId.toString(),
        planId: planId,
        billingCycle: billingCycle
      },
      subscription_data: {
        metadata: {
          userId: userId.toString(),
          planId: planId,
          billingCycle: billingCycle
        }
      }
    });

    res.json({ 
      sessionId: session.id,
      redirectUrl: session.url 
    });
    
  } catch (err) {
    console.error("Error creating subscription:", err);
    res.status(500).json({ 
      error: "Failed to create subscription",
      details: err.message 
    });
  }
});

app.post('/api/user/cancel-subscription', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
 
    const subscription = await dbService.getUserSubscription(userId);
    
    if (!subscription) {
      return res.status(404).json({ error: "No active subscription found" });
    }
    if (subscription.stripe_subscription_id) {
      try {
        await stripe.subscriptions.cancel(subscription.stripe_subscription_id);
        console.log(`Stripe subscription cancelled: ${subscription.stripe_subscription_id}`);
      } catch (stripeError) {
        console.error('Stripe cancellation error:', stripeError);
      }
    }
    
    await dbService.cancelUserSubscription(userId);
    
    res.json({ 
      success: true,
      message: "Subscription cancelled successfully",
      cancelledInStripe: !!subscription.stripe_subscription_id
    });
  } catch (err) {
    console.error("Error cancelling subscription:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to cancel subscription" 
    });
  }
});

app.post('/api/create-checkout-session', authenticateJWT, async (req, res) => {
  try {
    const { planId, billingCycle } = req.body;
    const userId = req.user.id;
    
    if (!planId || !billingCycle) {
      return res.status(400).json({ error: "Plan ID and billing cycle are required" });
    }

    const pool = await getPool();
    
    // Get plan details
    const planResult = await pool.request()
      .input('planId', sql.NVarChar, planId)
      .query('SELECT * FROM subscription_plans WHERE id = @planId AND is_active = 1');
    
    if (planResult.recordset.length === 0) {
      return res.status(404).json({ error: "Plan not found" });
    }

    const plan = planResult.recordset[0];
    const price = billingCycle === 'monthly' ? plan.monthly_price : plan.yearly_price;
    const priceInCents = Math.round(price * 100);

    const userResult = await pool.request()
      .input('userId', sql.Int, userId)
      .query('SELECT email, name FROM Users WHERE id = @userId');
    
    if (userResult.recordset.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResult.recordset[0];

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${plan.name} Plan - ${billingCycle}`,
              description: plan.description,
            },
            unit_amount: priceInCents,
            recurring: {
              interval: billingCycle === 'monthly' ? 'month' : 'year',
            },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.VITE_AUTH_REDIRECT_URI}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.VITE_AUTH_REDIRECT_URI}/subscription/cancel`,
      customer_email: user.email,
      metadata: {
        userId: userId.toString(),
        planId: planId,
        billingCycle: billingCycle
      },
    });

    res.json({ sessionId: session.id });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ==================== PAYMENT METHOD ROUTES ====================
app.get('/api/user/payment-methods', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const pool = await getPool();
    
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT 
          id,
          type,
          details,
          is_default,
          created_at,
          updated_at
        FROM payment_methods 
        WHERE user_id = @userId
        ORDER BY is_default DESC, created_at DESC
      `);
    
    const paymentMethods = result.recordset.map(method => ({
      id: method.id,
      type: method.type,
      details: JSON.parse(method.details),
      isDefault: method.is_default,
      createdAt: method.created_at,
      updatedAt: method.updated_at
    }));
    
    res.json(paymentMethods);
  } catch (err) {
    console.error("Error fetching payment methods:", err);
    res.status(500).json({ error: "Failed to fetch payment methods" });
  }
});

app.post('/api/user/payment-methods', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, details } = req.body;
    
    if (!type || !details) {
      return res.status(400).json({ error: "Type and details are required" });
    }
    
    const pool = await getPool();
    const existingMethodsResult = await pool.request()
      .input('userId', sql.Int, userId)
      .query('SELECT COUNT(*) as count FROM payment_methods WHERE user_id = @userId');
    
    const isFirstMethod = existingMethodsResult.recordset[0].count === 0;
    
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .input('type', sql.NVarChar, type)
      .input('details', sql.NVarChar, JSON.stringify(details))
      .input('isDefault', sql.Bit, isFirstMethod ? 1 : 0)
      .query(`
        INSERT INTO payment_methods (user_id, type, details, is_default)
        OUTPUT inserted.id, inserted.type, inserted.details, inserted.is_default, inserted.created_at
        VALUES (@userId, @type, @details, @isDefault)
      `);
    
    const newMethod = result.recordset[0];
    
    res.status(201).json({
      id: newMethod.id,
      type: newMethod.type,
      details: JSON.parse(newMethod.details),
      isDefault: newMethod.is_default,
      createdAt: newMethod.created_at
    });
  } catch (err) {
    console.error("Error adding payment method:", err);
    res.status(500).json({ error: "Failed to add payment method" });
  }
});

app.put('/api/user/payment-methods/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { details } = req.body;
    
    if (!details) {
      return res.status(400).json({ error: "Details are required" });
    }
    
    const pool = await getPool();
    const checkResult = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query('SELECT id FROM payment_methods WHERE id = @id AND user_id = @userId');
    
    if (checkResult.recordset.length === 0) {
      return res.status(404).json({ error: "Payment method not found" });
    }
    
    await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .input('details', sql.NVarChar, JSON.stringify(details))
      .query(`
        UPDATE payment_methods 
        SET details = @details, updated_at = GETDATE()
        WHERE id = @id AND user_id = @userId
      `);
    
    const updatedResult = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query(`
        SELECT 
          id,
          type,
          details,
          is_default,
          created_at,
          updated_at
        FROM payment_methods 
        WHERE id = @id AND user_id = @userId
      `);
    
    if (updatedResult.recordset.length === 0) {
      return res.status(404).json({ error: "Payment method not found after update" });
    }
    
    const updatedMethod = updatedResult.recordset[0];
    
    res.json({
      id: updatedMethod.id,
      type: updatedMethod.type,
      details: JSON.parse(updatedMethod.details),
      isDefault: updatedMethod.is_default,
      updatedAt: updatedMethod.updated_at
    });
  } catch (err) {
    console.error("Error updating payment method:", err);
    res.status(500).json({ 
      error: "Failed to update payment method",
      details: err.message 
    });
  }
});

app.delete('/api/user/payment-methods/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const pool = await getPool();
    
    const methodResult = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query('SELECT is_default FROM payment_methods WHERE id = @id AND user_id = @userId');
    
    if (methodResult.recordset.length === 0) {
      return res.status(404).json({ error: "Payment method not found" });
    }
    
    const isDefault = methodResult.recordset[0].is_default;
    
    if (isDefault) {
      return res.status(400).json({ error: "Cannot delete default payment method" });
    }
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query('DELETE FROM payment_methods WHERE id = @id AND user_id = @userId');
    
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: "Payment method not found" });
    }
    
    res.json({ message: "Payment method deleted successfully" });
  } catch (err) {
    console.error("Error deleting payment method:", err);
    res.status(500).json({ error: "Failed to delete payment method" });
  }
});

app.post('/api/user/payment-methods/:id/set-default', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const pool = await getPool();
    
    await pool.request()
      .input('userId', sql.Int, userId)
      .query('UPDATE payment_methods SET is_default = 0 WHERE user_id = @userId');
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query(`
        UPDATE payment_methods 
        SET is_default = 1, updated_at = GETDATE()
        WHERE id = @id AND user_id = @userId
      `);
    
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: "Payment method not found" });
    }
    
    res.json({ message: "Default payment method updated successfully" });
  } catch (err) {
    console.error("Error setting default payment method:", err);
    res.status(500).json({ error: "Failed to set default payment method" });
  }
});

// ==================== USER PROFILE ROUTES ====================
app.get('/api/user/profile', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const pool = await getPool();
    
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT 
          id,
          email,
          name,
          professional_title,
          phone_number,
          phone_verified,
          avatar_seed,
          role,
          createdAt,
          updatedAt
        FROM Users 
        WHERE id = @userId
      `);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    
    res.json(result.recordset[0]);
  } catch (err) {
    console.error("Error fetching user profile:", err);
    res.status(500).json({ error: "Failed to fetch user profile" });
  }
});

app.put('/api/user/profile', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      professional_title, 
      phone_number, 
      avatar_seed 
    } = req.body;
    
    console.log('Profile update request:', { userId, professional_title, phone_number, avatar_seed });
    
    const pool = await getPool();
    let updateFields = [];
    const request = pool.request()
      .input('userId', sql.Int, userId);
    
    if (professional_title !== undefined) {
      updateFields.push("professional_title = @professional_title");
      request.input('professional_title', sql.NVarChar, professional_title || null);
    }
    
    if (phone_number !== undefined) {
      updateFields.push("phone_number = @phone_number");
      request.input('phone_number', sql.NVarChar, phone_number || null);
      updateFields.push("phone_verified = 0");
    }
    
    if (avatar_seed !== undefined) {
      updateFields.push("avatar_seed = @avatar_seed");
      request.input('avatar_seed', sql.NVarChar, avatar_seed || 'vet');
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }
    
    updateFields.push("updatedAt = GETDATE()");
    
    const query = `
      UPDATE Users 
      SET ${updateFields.join(", ")}
      WHERE id = @userId
      
      SELECT 
        id,
        email,
        name,
        professional_title,
        phone_number,
        phone_verified,
        avatar_seed,
        role,
        createdAt,
        updatedAt
      FROM Users 
      WHERE id = @userId
    `;
    
    const result = await request.query(query);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    
    res.json({
      message: "Profile updated successfully",
      user: result.recordset[0]
    });
    
  } catch (err) {
    console.error("Error updating profile:", err);
    res.status(500).json({ error: "Failed to update profile", details: err.message });
  }
});

app.post('/api/user/verify-phone', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const pool = await getPool();

    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        UPDATE Users 
        SET phone_verified = 1, updatedAt = GETDATE()
        WHERE id = @userId AND phone_number IS NOT NULL
      `);
    
    if (result.rowsAffected[0] === 0) {
      return res.status(400).json({ error: "Phone number not set or user not found" });
    }
    
    res.json({ message: "Phone number verified successfully" });
    
  } catch (err) {
    console.error("Error verifying phone:", err);
    res.status(500).json({ error: "Failed to verify phone number" });
  }
});

app.post('/api/user/change-password', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current password and new password are required" });
    }
    
    const pool = await getPool();
    const userResult = await pool.request()
      .input('userId', sql.Int, userId)
      .query('SELECT password FROM Users WHERE id = @userId');
    
    if (userResult.recordset.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const user = userResult.recordset[0];
    
    const passwordMatch = await bcrypt.compare(currentPassword, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.request()
      .input('userId', sql.Int, userId)
      .input('newPassword', sql.NVarChar, hashedPassword)
      .query('UPDATE Users SET password = @newPassword, updatedAt = GETDATE() WHERE id = @userId');
    
    res.json({ message: "Password updated successfully" });
    
  } catch (err) {
    console.error("Error changing password:", err);
    res.status(500).json({ error: "Failed to change password" });
  }
});

// ==================== PETS ROUTES ====================
app.post('/api/pets', authenticateJWT, async (req, res) => {
  try {
    const { name, species, breed, age, owner, phoneNumber, imageData, imageType, notes } = req.body;
    const userId = req.user.id;

    const pool = await getPool();
    
    let imageUrl = null;
    if (imageData && imageType) {
      imageUrl = `data:${imageType};base64,${imageData}`;
    }

    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .input('name', sql.NVarChar, name)
      .input('species', sql.NVarChar, species)
      .input('breed', sql.NVarChar, breed || null)
      .input('age', sql.NVarChar, age || null)
      .input('owner', sql.NVarChar, owner)
      .input('phoneNumber', sql.NVarChar, phoneNumber || null)
      .input('imageData', sql.NVarChar, imageData || null)
      .input('imageType', sql.NVarChar, imageType || null)
      .input('imageUrl', sql.NVarChar, imageUrl || null)
      .input('notes', sql.NVarChar, notes || null)
      .query(`
        INSERT INTO Pets (user_id, name, species, breed, age, owner, phone_number, image_data, image_type, image_url, notes)
        OUTPUT inserted.id, inserted.name, inserted.species, inserted.breed, inserted.age, 
               inserted.owner, inserted.phone_number as phoneNumber, 
               inserted.image_url as imageUrl, 
               inserted.image_data as imageData,
               inserted.image_type as imageType,
               inserted.notes, inserted.created_at
        VALUES (@userId, @name, @species, @breed, @age, @owner, @phoneNumber, @imageData, @imageType, @imageUrl, @notes)
      `);
    
    const pet = result.recordset[0];
    
    res.status(201).json({
      message: "Pet added successfully",
      pet: pet
    });
    
  } catch (err) {
    console.error("Error adding pet:", err);
    res.status(500).json({ 
      error: "Failed to add pet",
      details: err.message 
    });
  }
});

app.get('/api/pets', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const pool = await getPool();
    
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT 
          id,
          name,
          species,
          breed,
          age,
          owner,
          phone_number as phoneNumber,
          CASE 
            WHEN image_url IS NOT NULL THEN image_url
            WHEN image_data IS NOT NULL AND image_type IS NOT NULL 
            THEN 'data:' + image_type + ';base64,' + image_data
            ELSE NULL
          END as imageUrl,
          image_data as imageData,
          image_type as imageType,
          notes,
          created_at
        FROM Pets 
        WHERE user_id = @userId
        ORDER BY created_at DESC
      `);
    
    res.json(result.recordset);
  } catch (err) {
    console.error("Error fetching pets:", err);
    res.status(500).json({ 
      error: "Failed to fetch pets",
      details: err.message 
    });
  }
});

app.put('/api/pets/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      species, 
      breed, 
      age, 
      owner, 
      phoneNumber,  
      imageData, 
      imageType, 
      notes 
    } = req.body;
    
    const userId = req.user.id;

    const pool = await getPool();
    const checkResult = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query('SELECT id FROM Pets WHERE id = @id AND user_id = @userId');
    
    if (checkResult.recordset.length === 0) {
      return res.status(404).json({ error: "Pet not found" });
    }

    let updateFields = [];
    const request = pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId);
    
    if (name !== undefined) {
      updateFields.push("name = @name");
      request.input('name', sql.NVarChar, name);
    }
    
    if (species !== undefined) {
      updateFields.push("species = @species");
      request.input('species', sql.NVarChar, species);
    }
    
    if (breed !== undefined) {
      updateFields.push("breed = @breed");
      request.input('breed', sql.NVarChar, breed || null);
    }
    
    if (age !== undefined) {
      updateFields.push("age = @age");
      request.input('age', sql.NVarChar, age || null);
    }
    
    if (owner !== undefined) {
      updateFields.push("owner = @owner");
      request.input('owner', sql.NVarChar, owner);
    }
    
    if (phoneNumber !== undefined) {
      updateFields.push("phone_number = @phoneNumber");
      request.input('phoneNumber', sql.NVarChar, phoneNumber || null);
    }
    
    if (imageData !== undefined) {
      updateFields.push("image_data = @imageData");
      request.input('imageData', sql.NVarChar, imageData || null);
    }
    
    if (imageType !== undefined) {
      updateFields.push("image_type = @imageType");
      request.input('imageType', sql.NVarChar, imageType || null);
    }
    
    if (notes !== undefined) {
      updateFields.push("notes = @notes");
      request.input('notes', sql.NVarChar, notes || null);
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }
    
    updateFields.push("updated_at = GETDATE()");
    
    await request.query(`
      UPDATE Pets 
      SET ${updateFields.join(", ")}
      WHERE id = @id AND user_id = @userId
    `);

    const updatedResult = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query(`
        SELECT 
          id,
          name,
          species,
          breed,
          age,
          owner,
          phone_number as phoneNumber,
          image_url as imageUrl,
          notes,
          created_at
        FROM Pets 
        WHERE id = @id AND user_id = @userId
      `);
    
    if (updatedResult.recordset.length === 0) {
      return res.status(404).json({ error: "Pet not found after update" });
    }
    
    const updatedPet = updatedResult.recordset[0];
    
    res.json({
      message: "Pet updated successfully",
      pet: updatedPet
    });
    
  } catch (err) {
    console.error("Error updating pet:", err);
    res.status(500).json({ 
      error: "Failed to update pet",
      details: err.message 
    });
  }
});

app.delete('/api/pets/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const pool = await getPool();
    
    const checkResult = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query('SELECT id FROM Pets WHERE id = @id AND user_id = @userId');
    
    if (checkResult.recordset.length === 0) {
      return res.status(404).json({ error: "Pet not found" });
    }
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query('DELETE FROM Pets WHERE id = @id AND user_id = @userId');
    
    res.json({ message: "Pet deleted successfully" });
  } catch (err) {
    console.error("Error deleting pet:", err);
    res.status(500).json({ error: "Failed to delete pet" });
  }
});

// ==================== TEMPLATES ROUTES ====================
app.get('/api/templates', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const pool = await getPool();
    
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT 
          id,
          name,
          description,
          template,
          created_at,
          updated_at
        FROM VisitTypeTemplates 
        WHERE user_id = @userId
        ORDER BY created_at DESC
      `);
    
    res.json(result.recordset);
  } catch (err) {
    console.error("Error fetching templates:", err);
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

app.post('/api/templates', authenticateJWT, async (req, res) => {
  try {
    const { name, description, template } = req.body;
    const userId = req.user.id;

    if (!name || !template) {
      return res.status(400).json({ error: "Name and template content are required" });
    }

    const pool = await getPool();
    
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || null)
      .input('template', sql.NVarChar, template)
      .query(`
        INSERT INTO VisitTypeTemplates (user_id, name, description, template)
        OUTPUT inserted.*
        VALUES (@userId, @name, @description, @template)
      `);
    
    res.status(201).json({
      message: "Template created successfully",
      template: result.recordset[0]
    });
    
  } catch (err) {
    console.error("Error creating template:", err);
    res.status(500).json({ 
      error: "Failed to create template",
      details: err.message 
    });
  }
});

app.put('/api/templates/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, template } = req.body;
    const userId = req.user.id;

    const pool = await getPool();
    const checkResult = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query('SELECT id FROM VisitTypeTemplates WHERE id = @id AND user_id = @userId');
    
    if (checkResult.recordset.length === 0) {
      return res.status(404).json({ error: "Template not found" });
    }
    
    await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || null)
      .input('template', sql.NVarChar, template)
      .query(`
        UPDATE VisitTypeTemplates 
        SET name = @name, description = @description, template = @template, updated_at = GETDATE()
        WHERE id = @id AND user_id = @userId
      `);
    
    const updatedResult = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query(`
        SELECT * FROM VisitTypeTemplates 
        WHERE id = @id AND user_id = @userId
      `);
    
    res.json({
      message: "Template updated successfully",
      template: updatedResult.recordset[0]
    });
    
  } catch (err) {
    console.error("Error updating template:", err);
    res.status(500).json({ 
      error: "Failed to update template",
      details: err.message 
    });
  }
});

app.delete('/api/templates/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const pool = await getPool();
    
    const checkResult = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query('SELECT id FROM VisitTypeTemplates WHERE id = @id AND user_id = @userId');
    
    if (checkResult.recordset.length === 0) {
      return res.status(404).json({ error: "Template not found" });
    }
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query('DELETE FROM VisitTypeTemplates WHERE id = @id AND user_id = @userId');
    
    res.json({ message: "Template deleted successfully" });
  } catch (err) {
    console.error("Error deleting template:", err);
    res.status(500).json({ error: "Failed to delete template" });
  }
});

// ==================== CLINICS ROUTES ====================
app.get('/api/clinics', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const pool = await getPool();
    
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT 
          id,
          name,
          address,
          city,
          state,
          zip_code as zipCode,
          phone,
          email,
          manager,
          logo_url as logoUrl,
          type,
          notes,
          pet_count as petCount,
          created_at,
          updated_at
        FROM Clinics 
        WHERE user_id = @userId
        ORDER BY created_at DESC
      `);
    
    res.json(result.recordset);
  } catch (err) {
    console.error("Error fetching clinics:", err);
    res.status(500).json({ error: "Failed to fetch clinics" });
  }
});

app.post('/api/clinics', authenticateJWT, async (req, res) => {
  try {
    const {
      name,
      address,
      city,
      state,
      zipCode,
      phone,
      email,
      manager,
      logoUrl,
      type,
      notes
    } = req.body;
    
    const userId = req.user.id;

    if (!name || !address || !city || !manager) {
      return res.status(400).json({ error: "Name, address, city and manager are required" });
    }

    const pool = await getPool();
    
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .input('name', sql.NVarChar, name)
      .input('address', sql.NVarChar, address)
      .input('city', sql.NVarChar, city)
      .input('state', sql.NVarChar, state || null)
      .input('zipCode', sql.NVarChar, zipCode || null)
      .input('phone', sql.NVarChar, phone || null)
      .input('email', sql.NVarChar, email || null)
      .input('manager', sql.NVarChar, manager)
      .input('logoUrl', sql.NVarChar, logoUrl || null)
      .input('type', sql.NVarChar, type || null)
      .input('notes', sql.NVarChar, notes || null)
      .query(`
        INSERT INTO Clinics (
          user_id, name, address, city, state, zip_code, phone, email, 
          manager, logo_url, type, notes, pet_count
        )
        OUTPUT inserted.id, inserted.name, inserted.address, inserted.city, 
               inserted.state, inserted.zip_code as zipCode, inserted.phone, 
               inserted.email, inserted.manager, inserted.logo_url as logoUrl, 
               inserted.type, inserted.notes, inserted.pet_count as petCount,
               inserted.created_at, inserted.updated_at
        VALUES (
          @userId, @name, @address, @city, @state, @zipCode, @phone, @email,
          @manager, @logoUrl, @type, @notes, 0
        )
      `);
    
    const clinic = result.recordset[0];
    res.status(201).json(clinic);
    
  } catch (err) {
    console.error("Error creating clinic:", err);
    res.status(500).json({ 
      error: "Failed to create clinic",
      details: err.message 
    });
  }
});

app.put('/api/clinics/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      address,
      city,
      state,
      zipCode,
      phone,
      email,
      manager,
      logoUrl,
      type,
      notes
    } = req.body;
    
    const userId = req.user.id;

    const pool = await getPool();
    const checkResult = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query('SELECT id FROM Clinics WHERE id = @id AND user_id = @userId');
    
    if (checkResult.recordset.length === 0) {
      return res.status(404).json({ error: "Clinic not found" });
    }

    await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .input('name', sql.NVarChar, name)
      .input('address', sql.NVarChar, address)
      .input('city', sql.NVarChar, city)
      .input('state', sql.NVarChar, state || null)
      .input('zipCode', sql.NVarChar, zipCode || null)
      .input('phone', sql.NVarChar, phone || null)
      .input('email', sql.NVarChar, email || null)
      .input('manager', sql.NVarChar, manager)
      .input('logoUrl', sql.NVarChar, logoUrl || null)
      .input('type', sql.NVarChar, type || null)
      .input('notes', sql.NVarChar, notes || null)
      .query(`
        UPDATE Clinics 
        SET name = @name, address = @address, city = @city, state = @state,
            zip_code = @zipCode, phone = @phone, email = @email, manager = @manager,
            logo_url = @logoUrl, type = @type, notes = @notes, updated_at = GETDATE()
        WHERE id = @id AND user_id = @userId
      `);
    
    const updatedResult = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query(`
        SELECT 
          id,
          name,
          address,
          city,
          state,
          zip_code as zipCode,
          phone,
          email,
          manager,
          logo_url as logoUrl,
          type,
          notes,
          pet_count as petCount,
          created_at,
          updated_at
        FROM Clinics 
        WHERE id = @id AND user_id = @userId
      `);
    
    res.json(updatedResult.recordset[0]);
    
  } catch (err) {
    console.error("Error updating clinic:", err);
    res.status(500).json({ 
      error: "Failed to update clinic",
      details: err.message 
    });
  }
});

app.delete('/api/clinics/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const pool = await getPool();
    
    const checkResult = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query('SELECT id FROM Clinics WHERE id = @id AND user_id = @userId');
    
    if (checkResult.recordset.length === 0) {
      return res.status(404).json({ error: "Clinic not found" });
    }
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query('DELETE FROM Clinics WHERE id = @id AND user_id = @userId');
    
    res.json({ message: "Clinic deleted successfully" });
  } catch (err) {
    console.error("Error deleting clinic:", err);
    res.status(500).json({ error: "Failed to delete clinic" });
  }
});

// ==================== TRANSCRIPTIONS ROUTES ====================
app.post('/api/transcriptions', authenticateJWT, async (req, res) => {
  try {
    const {
      title,
      content,
      category,
      petName,
      clinicName,
      visitType,
      templateName,
      recordingDuration,
      audioUrl,
      isCallRecording 
    } = req.body;
    
    if (!title || !content || !category) {
      return res.status(400).json({ error: "Title, content, and category are required" });
    }

    const userId = req.user.id;
    const pool = await getPool();
    
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .input('title', sql.NVarChar, title)
      .input('content', sql.NVarChar, content)
      .input('categoryName', sql.NVarChar, category)
      .input('petName', sql.NVarChar, petName || null)
      .input('clinicName', sql.NVarChar, clinicName || null)
      .input('visitType', sql.NVarChar, visitType || null)
      .input('templateName', sql.NVarChar, templateName || null)
      .input('recordingDuration', sql.Int, recordingDuration || 0)
      .input('audioUrl', sql.NVarChar, audioUrl || null)
      .input('isCallRecording', sql.Bit, isCallRecording ? 1 : 0)
      .query(`
        INSERT INTO Transcriptions (
          user_id, title, content, category_name, pet_name, clinic_name, 
          visit_type, template_name, recording_duration, audio_url, is_call_recording
        ) 
        OUTPUT inserted.*
        VALUES (
          @userId, @title, @content, @categoryName, @petName, @clinicName, 
          @visitType, @templateName, @recordingDuration, @audioUrl, @isCallRecording
        )
      `);
    
    res.status(201).json({
      message: "Transcription saved successfully",
      transcription: result.recordset[0]
    });
    
  } catch (err) {
    console.error("Error saving transcription:", err);
    res.status(500).json({ 
      error: "Failed to save transcription",
      details: err.message 
    });
  }
});
app.get('/api/transcriptions', authenticateJWT, async (req, res) => {
  try {
    const { category, page = 1, limit = 10 } = req.query;
    const userId = req.user.id;
    
    const pool = await getPool();
    let whereClause = "WHERE t.user_id = @userId";
    
    const request = pool.request()
      .input('userId', sql.Int, userId);
    
    if (category) {
      whereClause += " AND t.category_name = @category";
      request.input('category', sql.NVarChar, category);
    }
    
    const offset = (page - 1) * limit;
    request.input('offset', sql.Int, offset);
    request.input('limit', sql.Int, limit);
    
    const result = await request.query(`
      SELECT 
        t.id,
        t.title,
        t.content,
        t.category_name as category,
        t.pet_name,
        t.clinic_name,
        t.visit_type,
        t.template_name,
        t.recording_duration,
        t.created_at
      FROM Transcriptions t
      ${whereClause}
      ORDER BY t.created_at DESC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `);
    
    const countResult = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT COUNT(*) as total 
        FROM Transcriptions t
        ${whereClause}
      `);
    
    res.json({
      transcriptions: result.recordset,
      total: countResult.recordset[0].total,
      page: parseInt(page),
      totalPages: Math.ceil(countResult.recordset[0].total / limit)
    });
  } catch (err) {
    console.error("Error fetching transcriptions:", err);
    res.status(500).json({ error: "Failed to fetch transcriptions" });
  }
});

app.get('/api/transcriptions/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const pool = await getPool();
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query(`
        SELECT 
          t.id,
          t.title,
          t.content,
          t.category_name as category,
          t.pet_name,
          t.clinic_name,
          t.visit_type,
          t.template_name,
          t.recording_duration,
          t.created_at
        FROM Transcriptions t
        WHERE t.id = @id AND t.user_id = @userId
      `);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: "Transcription not found" });
    }
    
    res.json(result.recordset[0]);
  } catch (err) {
    console.error("Error fetching transcription:", err);
    res.status(500).json({ error: "Failed to fetch transcription" });
  }
});
app.put('/api/transcriptions/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      content,
      category,
      pet_name,
      clinic_name,
      visit_type
    } = req.body;
    
    const userId = req.user.id;
    const pool = await getPool();
    
    const existingResult = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query('SELECT id FROM Transcriptions WHERE id = @id AND user_id = @userId');
    
    if (existingResult.recordset.length === 0) {
      return res.status(404).json({ error: "Transcription not found" });
    }
    
    let updateFields = [];
    const request = pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId);
    
    if (title !== undefined) {
      updateFields.push("title = @title");
      request.input('title', sql.NVarChar, title);
    }
    
    if (content !== undefined) {
      updateFields.push("content = @content");
      request.input('content', sql.NVarChar, content);
    }
    
    if (category !== undefined) {
      updateFields.push("category_name = @category");
      request.input('category', sql.NVarChar, category);
    }
    
    if (pet_name !== undefined) {
      updateFields.push("pet_name = @pet_name");
      request.input('pet_name', sql.NVarChar, pet_name || null);
    }
    
    if (clinic_name !== undefined) {
      updateFields.push("clinic_name = @clinic_name");
      request.input('clinic_name', sql.NVarChar, clinic_name || null);
    }
    
    if (visit_type !== undefined) {
      updateFields.push("visit_type = @visit_type");
      request.input('visit_type', sql.NVarChar, visit_type || null);
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }
    
    updateFields.push("updated_at = GETDATE()");
    
    const result = await request.query(`
      UPDATE Transcriptions 
      SET ${updateFields.join(", ")}
      WHERE id = @id AND user_id = @userId
    `);
    
    const updatedResult = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query(`
        SELECT * FROM Transcriptions 
        WHERE id = @id AND user_id = @userId
      `);
    
    res.json({ 
      message: "Transcription updated successfully",
      transcription: updatedResult.recordset[0]
    });
  } catch (err) {
    console.error("Error updating transcription:", err);
    res.status(500).json({ error: "Failed to update transcription" });
  }
});

app.delete('/api/transcriptions/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const pool = await getPool();
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query('DELETE FROM Transcriptions WHERE id = @id AND user_id = @userId');
    
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: "Transcription not found" });
    }
    
    res.json({ message: "Transcription deleted successfully" });
  } catch (err) {
    console.error("Error deleting transcription:", err);
    res.status(500).json({ error: "Failed to delete transcription" });
  }
});

// ==================== AVATAR UPLOAD ROUTE ====================
app.post('/api/user/avatar', authenticateJWT, async (req, res) => {
  try {
    console.log('📸 Avatar upload request received');
    
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ error: 'No files were uploaded.' });
    }

    const userId = req.user.id;
    const avatarFile = req.files.avatar;
    
    if (!avatarFile) {
      return res.status(400).json({ error: 'No avatar file found in request' });
    }

    console.log('📸 Uploading avatar for user:', userId);
    console.log('📸 File details:', {
      name: avatarFile.name,
      size: avatarFile.size,
      type: avatarFile.mimetype
    });

    // Check file type
    if (!avatarFile.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Only image files are allowed' });
    }

    // Check file size (max 5MB)
    if (avatarFile.size > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size should be less than 5MB' });
    }

    // Upload to local storage
    const uploadResult = await uploadToLocalStorage(
      avatarFile.data,
      avatarFile.name,
      avatarFile.mimetype,
      userId
    );

    // Save avatar URL to user profile
    const pool = await getPool();
    await pool.request()
      .input('userId', sql.Int, userId)
      .input('avatar_url', sql.NVarChar, uploadResult.url)
      .input('avatar_seed', sql.NVarChar, null) // Clear seed when using uploaded avatar
      .query(`
        UPDATE Users 
        SET avatar_url = @avatar_url, avatar_seed = @avatar_seed, updatedAt = GETDATE()
        WHERE id = @userId
      `);

    // Get updated user data
    const userResult = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT 
          id,
          email,
          name,
          professional_title,
          phone_number,
          phone_verified,
          avatar_seed,
          avatar_url,
          role,
          createdAt,
          updatedAt
        FROM Users 
        WHERE id = @userId
      `);

    const user = userResult.recordset[0];

    res.json({
      message: "Avatar uploaded successfully",
      avatarUrl: uploadResult.url,
      user: user
    });

  } catch (err) {
    console.error("❌ Error uploading avatar:", err);
    res.status(500).json({ 
      error: "Failed to upload avatar",
      details: err.message 
    });
  }
});

// ✅ NEW: Get user avatar route
app.get('/api/user/avatar/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const pool = await getPool();
    
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query('SELECT avatar_url FROM Users WHERE id = @userId');
    
    if (result.recordset.length === 0 || !result.recordset[0].avatar_url) {
      return res.status(404).json({ error: "Avatar not found" });
    }
    
    const avatarUrl = result.recordset[0].avatar_url;
    const filePath = path.join(__dirname, avatarUrl);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Avatar file not found" });
    }
    
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (err) {
    console.error("Error fetching avatar:", err);
    res.status(500).json({ error: "Failed to fetch avatar" });
  }
});

// ✅ UPDATE: User profile route to handle avatar properly
app.put('/api/user/profile', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      professional_title, 
      phone_number, 
      avatar_seed,
      avatar_url 
    } = req.body;
    
    console.log('💾 Profile update request:', { 
      userId, 
      professional_title, 
      phone_number, 
      avatar_seed,
      avatar_url 
    });
    
    const pool = await getPool();
    let updateFields = [];
    const request = pool.request()
      .input('userId', sql.Int, userId);
    
    if (professional_title !== undefined) {
      updateFields.push("professional_title = @professional_title");
      request.input('professional_title', sql.NVarChar, professional_title || null);
    }
    
    if (phone_number !== undefined) {
      updateFields.push("phone_number = @phone_number");
      request.input('phone_number', sql.NVarChar, phone_number || null);
      updateFields.push("phone_verified = 0");
    }
    
    // ✅ FIXED: Handle both avatar_seed and avatar_url
    if (avatar_seed !== undefined) {
      updateFields.push("avatar_seed = @avatar_seed");
      request.input('avatar_seed', sql.NVarChar, avatar_seed || 'vet');
      // Clear uploaded avatar when using seed
      updateFields.push("avatar_url = NULL");
    }
    
    if (avatar_url !== undefined) {
      updateFields.push("avatar_url = @avatar_url");
      request.input('avatar_url', sql.NVarChar, avatar_url || null);
      // Clear seed when using uploaded avatar
      updateFields.push("avatar_seed = NULL");
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }
    
    updateFields.push("updatedAt = GETDATE()");
    
    const query = `
      UPDATE Users 
      SET ${updateFields.join(", ")}
      WHERE id = @userId
      
      SELECT 
        id,
        email,
        name,
        professional_title,
        phone_number,
        phone_verified,
        avatar_seed,
        avatar_url,
        role,
        createdAt,
        updatedAt
      FROM Users 
      WHERE id = @userId
    `;
    
    const result = await request.query(query);
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const user = result.recordset[0];
    
    res.json({
      message: "Profile updated successfully",
      user: user
    });
    
  } catch (err) {
    console.error("❌ Error updating profile:", err);
    res.status(500).json({ 
      error: "Failed to update profile", 
      details: err.message 
    });
  }
});
// ==================== FIXED FILE MANAGEMENT ROUTES ====================

// ✅ GET all files for authenticated user
app.get('/api/files', authenticateUniversal, async (req, res) => {
  try {
    console.log('📁 /api/files endpoint hit for user:', req.user?.id);
    
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const userId = req.user.id;
    const pool = await getPool();
    
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT 
          id,
          name,
          type,
          size,
          url,
          upload_date as uploadDate
        FROM Files 
        WHERE user_id = @userId
        ORDER BY upload_date DESC
      `);
    
    console.log(`📁 Found ${result.recordset.length} files for user ${userId}`);
    
    res.json(result.recordset);
    
  } catch (err) {
    console.error(" Error fetching files:", err);
    res.status(500).json({ 
      error: "Failed to fetch files", 
      details: err.message 
    });
  }
});

// ✅ UPLOAD file
app.post('/api/upload', authenticateUniversal, async (req, res) => {
  try {
    console.log('📤 Upload request received');
    
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ error: 'No files were uploaded.' });
    }

    const userId = req.user.id;
    const uploadedFile = req.files.file;
    
    if (!uploadedFile) {
      return res.status(400).json({ error: 'No file found in request' });
    }

    console.log('📤 Uploading file:', uploadedFile.name, 'Size:', uploadedFile.size);

    const uploadResult = await uploadToLocalStorage(
      uploadedFile.data,
      uploadedFile.name,
      uploadedFile.mimetype,
      userId
    );
    
    const pool = await getPool();
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .input('name', sql.NVarChar, uploadedFile.name)
      .input('type', sql.NVarChar, uploadedFile.mimetype)
      .input('size', sql.Int, uploadedFile.size)
      .input('url', sql.NVarChar, uploadResult.url)
      .query(`
        INSERT INTO Files (user_id, name, type, size, url)
        OUTPUT inserted.id, inserted.name, inserted.type, inserted.size, inserted.url, inserted.upload_date
        VALUES (@userId, @name, @type, @size, @url)
      `);
    
    const fileRecord = result.recordset[0];

    console.log('✅ File uploaded successfully:', fileRecord.id);

    res.status(201).json({
      message: "File uploaded successfully",
      file: fileRecord
    });
    
  } catch (err) {
    console.error(" Error uploading file:", err);
    res.status(500).json({ 
      error: "Failed to upload file",
      details: err.message 
    });
  }
});

// ✅ DELETE file
app.delete('/api/files/:id', authenticateUniversal, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const pool = await getPool();
    
    const fileResult = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query('SELECT * FROM Files WHERE id = @id AND user_id = @userId');
    
    if (fileResult.recordset.length === 0) {
      return res.status(404).json({ error: "File not found" });
    }
    
    const file = fileResult.recordset[0];
    const filePath = path.join(__dirname, file.url);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🗑️ Local file deleted: ${filePath}`);
    }
    
    await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query('DELETE FROM Files WHERE id = @id AND user_id = @userId');
    
    res.json({ message: "File deleted successfully" });
    
  } catch (err) {
    console.error(" Error deleting file:", err);
    res.status(500).json({ 
      error: "Failed to delete file",
      details: err.message 
    });
  }
});

// ✅ DOWNLOAD file
app.get('/api/files/download/:id', authenticateUniversal, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const pool = await getPool();
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query('SELECT * FROM Files WHERE id = @id AND user_id = @userId');
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: "File not found" });
    }
    
    const file = result.recordset[0];
    const filePath = path.join(__dirname, file.url);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found on server" });
    }
    
    res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
    res.setHeader('Content-Type', file.type);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (err) {
    console.error(" Error downloading file:", err);
    res.status(500).json({ error: "Failed to download file" });
  }
});
// ==================== DEBUG ROUTES ====================
app.get('/api/debug/token-check', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    console.log('🔐 Debug - Auth Header:', authHeader);
    
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.split(' ')[1];
    console.log('🔐 Debug - Token:', token ? 'Present' : 'Missing');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    console.log('🔐 Debug - Decoded Token:', decoded);
    
    res.json({ 
      success: true, 
      decoded,
      message: 'Token is valid',
      userInfo: {
        userId: decoded.userId || decoded.id,
        email: decoded.email,
        auth0Id: decoded.auth0Id
      }
    });
  } catch (error) {
    console.error(' Token debug error:', error.message);
    res.status(401).json({ 
      error: 'Invalid token',
      details: error.message 
    });
  }
});
app.delete('/api/files/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const pool = await getPool();
    
    const fileResult = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query('SELECT * FROM Files WHERE id = @id AND user_id = @userId');
    
    if (fileResult.recordset.length === 0) {
      return res.status(404).json({ error: "File not found" });
    }
    
    const file = fileResult.recordset[0];
    const filePath = path.join(__dirname, file.url);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Local file deleted: ${filePath}`);
    }
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query('DELETE FROM Files WHERE id = @id AND user_id = @userId');
    
    res.json({ message: "File deleted successfully" });
    
  } catch (err) {
    console.error("Error deleting file:", err);
    res.status(500).json({ 
      error: "Failed to delete file",
      details: err.message 
    });
  }
});
app.get('/api/files/view/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Try to get token from query parameter first
    let token = req.query.token;
    let userId;

    console.log('🔐 Token received for file view:', token ? 'Present' : 'Missing');

    if (token) {
      // Authenticate using token from query parameter
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        console.log('📋 Decoded token:', decoded);
        
        // Handle different token structures
        if (decoded.userId) {
          userId = decoded.userId; // For tokens with userId
        } else if (decoded.id) {
          userId = decoded.id; // For tokens with id
        } else if (decoded.sub) {
          // For Auth0 tokens, we need to look up the user
          const user = await dbService.getUserByAuth0Id(decoded.sub);
          if (user) {
            userId = user.id;
          }
        }
        
        console.log('👤 Extracted user ID:', userId);
        
        if (!userId) {
          return res.status(401).json({ error: "Invalid token structure - no user ID found" });
        }
      } catch (tokenError) {
        console.error(' Token verification failed:', tokenError.message);
        return res.status(401).json({ error: "Invalid token" });
      }
    } else if (req.headers.authorization) {
      // Try to authenticate using Bearer token
      try {
        const authHeader = req.headers.authorization;
        const bearerToken = authHeader.split(' ')[1];
        const decoded = jwt.verify(bearerToken, process.env.JWT_SECRET || 'your-secret-key');
        if (decoded.userId) {
          userId = decoded.userId;
        } else if (decoded.id) {
          userId = decoded.id;
        }
        
        if (!userId) {
          return res.status(401).json({ error: "Invalid token structure" });
        }
      } catch (authError) {
        console.error('Bearer token verification failed:', authError.message);
        return res.status(401).json({ error: "Invalid authorization header" });
      }
    } else {
      console.error('No authentication provided');
      return res.status(401).json({ error: "No authentication provided" });
    }

    const pool = await getPool();
    
    console.log(`Looking for file ID: ${id} for user: ${userId}`);
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query('SELECT * FROM Files WHERE id = @id AND user_id = @userId');
    
    if (result.recordset.length === 0) {
      console.log(`File not found in database: ID ${id}, User ${userId}`);
      return res.status(404).json({ error: "File not found" });
    }
    
    const file = result.recordset[0];
    console.log(` File found: ${file.name}, URL: ${file.url}`);
    
    const filePath = path.join(__dirname, file.url);
    console.log(` Looking for file at: ${filePath}`);
    
    if (!fs.existsSync(filePath)) {
      console.log(`Physical file not found: ${filePath}`);
      return res.status(404).json({ error: "File not found on server" });
    }
    
    // Set appropriate headers
    res.setHeader('Content-Type', file.type);
    res.setHeader('Content-Disposition', `inline; filename="${file.name}"`);
    res.setHeader('Cache-Control', 'no-cache');
    
    console.log(`Streaming file: ${filePath}`);
    const fileStream = fs.createReadStream(filePath);
    
    fileStream.on('error', (error) => {
      console.error(' File stream error:', error);
      res.status(500).json({ error: "Failed to stream file" });
    });
    
    fileStream.pipe(res);
    
  } catch (err) {
    console.error(" Error streaming file:", err);
    res.status(500).json({ error: "Failed to stream file" });
  }
});

app.get('/api/files/content/:id', authenticateJWTWithQuery, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const pool = await getPool();
    
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query('SELECT * FROM Files WHERE id = @id AND user_id = @userId');
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: "File not found" });
    }
    
    const file = result.recordset[0];
    const filePath = path.join(__dirname, file.url);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found on server" });
    }
    
    if (file.type.includes('text') || file.name.match(/\.(txt|json|xml|html|css|js|md)$/i)) {
      const content = await fs.promises.readFile(filePath, 'utf8');
      res.json({ content });
    } else {
      res.status(400).json({ error: "File type not supported for content reading" });
    }
    
  } catch (err) {
    console.error(" Error reading file content:", err);
    res.status(500).json({ error: "Failed to read file content" });
  }
});
// ==================== AUDIO FILES ROUTES ====================
app.get('/api/audio-files', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const pool = await getPool();
    
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT 
          id,
          name,
          type,
          size,
          url,
          upload_date as uploadDate
        FROM Audio 
        WHERE user_id = @userId AND type LIKE 'audio/%'
        ORDER BY upload_date DESC
      `);
    
    console.log(`Found ${result.recordset.length} audio files for user ${userId}`);
    res.json(result.recordset);
  } catch (err) {
    console.error("Error fetching audio files:", err);
    res.status(500).json({ error: "Failed to fetch audio files" });
  }
});

app.post('/api/audio-files/upload', authenticateJWT, async (req, res) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ error: 'No files were uploaded.' });
    }

    const userId = req.user.id;
    const uploadedFile = req.files.audio;
    const uploadResult = await uploadToLocalStorage(
      uploadedFile.data,
      uploadedFile.name,
      uploadedFile.mimetype,
      userId
    );
    
    const pool = await getPool();
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .input('name', sql.NVarChar, uploadedFile.name)
      .input('type', sql.NVarChar, uploadedFile.mimetype)
      .input('size', sql.Int, uploadedFile.size)
      .input('url', sql.NVarChar, uploadResult.url)
      .query(`
        INSERT INTO Audio (user_id, name, type, size, url)
        OUTPUT inserted.id, inserted.name, inserted.type, inserted.size, inserted.url, inserted.upload_date
        VALUES (@userId, @name, @type, @size, @url)
      `);
    
    const fileRecord = result.recordset[0];

    res.status(201).json({
      message: "Audio file uploaded successfully",
      audioFile: fileRecord
    });
    
  } catch (err) {
    console.error(" Error uploading audio file:", err);
    res.status(500).json({ 
      error: "Failed to upload audio file",
      details: err.message 
    });
  }
});
app.get('/api/audio-files/stream/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`Audio streaming request for file ID: ${id}`);
    let token = req.query.token || req.headers.authorization?.split(' ')[1];
    let userId;

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        console.log('Decoded token:', decoded);
        
        if (decoded.userId) userId = decoded.userId;
        else if (decoded.id) userId = decoded.id;
        else if (decoded.auth0Id) {
          const user = await dbService.getUserByAuth0Id(decoded.auth0Id);
          if (user) userId = user.id;
        }
      } catch (tokenError) {
        console.log('Token verification failed, continuing with public access');
      }
    }

    const pool = await getPool();
    let query = `SELECT * FROM Audio WHERE id = @id AND type LIKE 'audio/%'`;
    const request = pool.request().input('id', sql.Int, id);
    
    if (userId) {
      query += ' AND user_id = @userId';
      request.input('userId', sql.Int, userId);
    }
    
    const result = await request.query(query);
    
    if (result.recordset.length === 0) {
      console.log(` Audio file not found: ID ${id}`);
      return res.status(404).json({ error: "Audio file not found" });
    }
    
    const audioFile = result.recordset[0];
    const filePath = path.join(__dirname, audioFile.url);
    
    console.log(`Looking for file at: ${filePath}`);
    
    if (!fs.existsSync(filePath)) {
      console.log(`Physical file not found: ${filePath}`);
      return res.status(404).json({ error: "Audio file not found on server" });
    }
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    const ext = path.extname(audioFile.name).toLowerCase();
    const contentTypes = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.webm': 'audio/webm',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac',
      '.flac': 'audio/flac'
    };
    
    const contentType = contentTypes[ext] || 'audio/mpeg';
    
    console.log(`Streaming audio: ${audioFile.name}, Type: ${contentType}, Size: ${fileSize} bytes`);
    
  
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      
      console.log(`Range request: ${start}-${end}/${fileSize}`);
      
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600'
      };
      
      res.writeHead(206, head);
      const fileStream = fs.createReadStream(filePath, { start, end });
      fileStream.pipe(res);
      
      fileStream.on('error', (error) => {
        console.error(' File stream error:', error);
        res.status(500).json({ error: "Streaming error" });
      });
      
    } else {

      const head = {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600'
      };
      
      res.writeHead(200, head);
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
      
      fileStream.on('error', (error) => {
        console.error('File stream error:', error);
        res.status(500).json({ error: "Streaming error" });
      });
    }
    
  } catch (err) {
    console.error(" Error streaming audio file:", err);
    res.status(500).json({ 
      error: "Failed to stream audio file",
      details: err.message 
    });
  }
});
app.get('/api/audio-files/download/:id', authenticateJWTWithQuery, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const pool = await getPool();
    
    console.log(`Download request for audio ID: ${id}, User: ${userId}`);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query('SELECT * FROM Audio WHERE id = @id AND user_id = @userId AND type LIKE \'audio/%\'');
    
    if (result.recordset.length === 0) {
      console.log(`Audio file not found in database: ID ${id}`);
      return res.status(404).json({ error: "Audio file not found" });
    }
    
    const audioFile = result.recordset[0];
    console.log(`Audio file found: ${audioFile.name}, URL: ${audioFile.url}`);
    const filePath = path.join(__dirname, audioFile.url);
    console.log(`Looking for file at: ${filePath}`);
    
    if (!fs.existsSync(filePath)) {
      console.log(`Physical file not found: ${filePath}`);
      return res.status(404).json({ error: "Audio file not found on server" });
    }
    res.setHeader('Content-Disposition', `attachment; filename="${audioFile.name}"`);
    res.setHeader('Content-Type', audioFile.type);
    res.setHeader('Content-Length', fs.statSync(filePath).size);
    res.setHeader('Cache-Control', 'no-cache');
    
    console.log(`Downloading file: ${filePath}`);
    const fileStream = fs.createReadStream(filePath);
    
    fileStream.on('error', (error) => {
      console.error(' File stream error during download:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Download failed" });
      }
    });
    
    fileStream.pipe(res);
    
  } catch (err) {
    console.error("Error downloading audio file:", err);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: "Failed to download audio file",
        details: err.message 
      });
    }
  }
});
app.get('/api/audio-files/download-token/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const token = req.query.token;
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    let userId;

    if (decoded.userId) userId = decoded.userId;
    else if (decoded.id) userId = decoded.id;
    else if (decoded.auth0Id) {
      const user = await dbService.getUserByAuth0Id(decoded.auth0Id);
      if (user) userId = user.id;
    }

    if (!userId) {
      return res.status(401).json({ error: "Invalid token structure" });
    }

    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query('SELECT * FROM Audio WHERE id = @id AND user_id = @userId AND type LIKE \'audio/%\'');
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ error: "Audio file not found" });
    }
    
    const audioFile = result.recordset[0];
    const filePath = path.join(__dirname, audioFile.url);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Audio file not found on server" });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${audioFile.name}"`);
    res.setHeader('Content-Type', audioFile.type);
    res.setHeader('Content-Length', fs.statSync(filePath).size);
    res.setHeader('Cache-Control', 'no-cache');
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
    fileStream.on('error', (error) => {
      console.error('File stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Download failed" });
      }
    });
    
  } catch (err) {
    console.error("Error downloading audio file:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to download audio file" });
    }
  }
});

app.put('/api/audio-files/:id/duration', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const { duration } = req.body;
    const userId = req.user.id;
    const pool = await getPool();

    res.json({ message: "Duration update not implemented yet" });
  } catch (err) {
    console.error(" Error updating duration:", err);
    res.status(500).json({ error: "Failed to update duration" });
  }
});
app.delete('/api/audio-files/:id', authenticateJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const pool = await getPool();
    
    const fileResult = await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query('SELECT * FROM Audio WHERE id = @id AND user_id = @userId AND type LIKE \'audio/%\'');
    
    if (fileResult.recordset.length === 0) {
      return res.status(404).json({ error: "Audio file not found" });
    }
    
    const audioFile = fileResult.recordset[0];
    const filePath = path.join(__dirname, audioFile.url);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Audio file deleted: ${filePath}`);
    }
    await pool.request()
      .input('id', sql.Int, id)
      .input('userId', sql.Int, userId)
      .query('DELETE FROM Audio WHERE id = @id AND user_id = @userId');
    
    res.json({ message: "Audio file deleted successfully" });
    
  } catch (err) {
    console.error("Error deleting audio file:", err);
    res.status(500).json({ 
      error: "Failed to delete audio file",
      details: err.message 
    });
  }
});
// ==================== LIVE AUDIO RECORDING ROUTES ====================
app.post('/api/audio-files/upload-live', authenticateJWT, async (req, res) => {
  try {
    const { name, type, size, duration, content } = req.body;
    const userId = req.user.id;

    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }

    const pool = await getPool();
    const placeholderUrl = `/uploads/live-recordings/${userId}/${Date.now()}_${name}`;
    
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .input('name', sql.NVarChar, name)
      .input('type', sql.NVarChar, type)
      .input('size', sql.Int, size || 0)
      .input('url', sql.NVarChar, placeholderUrl)
      .query(`
        INSERT INTO Audio (user_id, name, type, size, url)
        OUTPUT inserted.id, inserted.name, inserted.type, inserted.size, inserted.url, inserted.upload_date
        VALUES (@userId, @name, @type, @size, @url)
      `);
    
    const fileRecord = result.recordset[0];

    res.status(201).json({
      message: "Live recording saved successfully",
      audioFile: fileRecord
    });
    
  } catch (err) {
    console.error("Error saving live recording:", err);
    res.status(500).json({ 
      error: "Failed to save live recording",
      details: err.message 
    });
  }
});

app.post('/api/audio-files/save-recording', authenticateJWT, async (req, res) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ error: 'No audio file was uploaded.' });
    }

    const userId = req.user.id;
    const audioBlob = req.files.audio;

    const uploadResult = await uploadToLocalStorage(
      audioBlob.data,
      `recording_${Date.now()}.webm`,
      'audio/webm',
      userId
    );
    
    const pool = await getPool();
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .input('name', sql.NVarChar, `Live Recording ${new Date().toLocaleString()}`)
      .input('type', sql.NVarChar, 'audio/webm')
      .input('size', sql.Int, audioBlob.size)
      .input('url', sql.NVarChar, uploadResult.url)
      .query(`
        INSERT INTO Audio (user_id, name, type, size, url)
        OUTPUT inserted.id, inserted.name, inserted.type, inserted.size, inserted.url, inserted.upload_date
        VALUES (@userId, @name, @type, @size, @url)
      `);
    
    const fileRecord = result.recordset[0];

    res.status(201).json({
      message: "Audio recording saved successfully",
      audioFile: fileRecord
    });
    
  } catch (err) {
    console.error("Error saving audio recording:", err);
    res.status(500).json({ 
      error: "Failed to save audio recording",
      details: err.message 
    });
  }
});
// ==================== ADMIN ROUTES ====================
app.get('/api/admin/users', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const pool = await getPool();
    
    const userCheck = await pool.request()
      .input('userId', sql.Int, userId)
      .query('SELECT role FROM Users WHERE id = @userId');
    
    if (userCheck.recordset.length === 0 || userCheck.recordset[0].role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }

    const result = await pool.request()
      .query(`
        SELECT 
          id,
          email,
          name,
          role,
          auth0_id,
          professional_title,
          phone_number,
          createdAt,
          updatedAt
        FROM Users 
        ORDER BY createdAt DESC
      `);
    
    res.json(result.recordset);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

app.put('/api/admin/users/:id/role', authenticateJWT, async (req, res) => {
  try {
    const adminId = req.user.id;
    const { id } = req.params;
    const { role } = req.body;
    
    if (!role || !['admin', 'doctor', 'nurse'].includes(role)) {
      return res.status(400).json({ error: "Valid role is required" });
    }

    const pool = await getPool();
    const adminCheck = await pool.request()
      .input('adminId', sql.Int, adminId)
      .query('SELECT role FROM Users WHERE id = @adminId');
    
    if (adminCheck.recordset.length === 0 || adminCheck.recordset[0].role !== 'admin') {
      return res.status(403).json({ error: "Admin access required" });
    }

    await pool.request()
      .input('id', sql.Int, id)
      .input('role', sql.NVarChar, role)
      .query('UPDATE Users SET role = @role, updatedAt = GETDATE() WHERE id = @id');

    res.json({ message: "User role updated successfully" });
    
  } catch (err) {
    console.error("Error updating user role:", err);
    res.status(500).json({ error: "Failed to update user role" });
  }
});

app.put('/api/user/role', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const { role } = req.body;
    
    if (!role || !['admin', 'doctor', 'nurse'].includes(role)) {
      return res.status(400).json({ error: "Valid role is required (admin, doctor, nurse)" });
    }

    const pool = await getPool();
    
    await pool.request()
      .input('userId', sql.Int, userId)
      .input('role', sql.NVarChar, role)
      .query('UPDATE Users SET role = @role, updatedAt = GETDATE() WHERE id = @userId');

    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query('SELECT id, email, name, role, auth0_id, createdAt FROM Users WHERE id = @userId');
    
    res.json({
      message: "Role updated successfully",
      user: result.recordset[0]
    });
    
  } catch (err) {
    console.error("Error updating role:", err);
    res.status(500).json({ error: "Failed to update role" });
  }
});

// ==================== AUTH0 ROUTES (USING DATABASE SERVICE) ====================
app.post('/api/auth/auth0/callback', checkJwt, async (req, res) => {
  try {
    const auth0User = req.auth.payload;
    console.log('Auth0 callback received:', {
      sub: auth0User.sub,
      email: auth0User.email,
      name: auth0User.name
    });

    // First try to find user by Auth0 ID
    let user = await dbService.getUserByAuth0Id(auth0User.sub);
    
    if (!user) {
      // If no user found with Auth0 ID, check by email
      user = await dbService.getUserByEmail(auth0User.email);
      
      if (user) {
        console.log('Linking existing email user with Auth0 account:', user.email);
        // Link the Auth0 account to existing user
        const linkedUser = await dbService.updateUser(user.id, {
          auth0Id: auth0User.sub,
          emailVerified: auth0User.email_verified
        });
        
        if (!linkedUser) {
          throw new Error('Failed to link Auth0 account');
        }
        user = linkedUser;
      } else {
        // Create new user
        console.log('Creating new user from Auth0...');
        user = await dbService.createUser({
          email: auth0User.email,
          name: auth0User.name || auth0User.email.split('@')[0],
          auth0Id: auth0User.sub,
          emailVerified: auth0User.email_verified
        });
      }
    }

    // ✅ ADD NULL CHECK
    if (!user) {
      throw new Error('User authentication failed');
    }

    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        name: user.name,
        auth0Id: user.auth0_id 
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        auth0Id: user.auth0_id,
        createdAt: user.createdAt
      }
    });
    
  } catch (error) {
    console.error('Auth0 callback error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Authentication failed',
      details: error.message 
    });
  }
});
// ==================== AUTH0 SYNC ROUTE (ADD THIS) ====================

app.post('/api/auth/auth0/sync', async (req, res) => {
  try {
    const { auth0Id, email, name, emailVerified } = req.body;
    
    console.log("Auth0 sync request:", { auth0Id, email, name });
    
    if (!auth0Id || !email) {
      return res.status(400).json({ error: 'Auth0 ID and email are required' });
    }

    // First, check if user exists with this Auth0 ID
    let user = await dbService.getUserByAuth0Id(auth0Id);
    
    if (user) {
      console.log("User found by Auth0 ID, updating:", user.id);
      // Update existing user
      const updatedUser = await dbService.updateUser(user.id, {
        name: name || email.split('@')[0],
        emailVerified: emailVerified
      });
      
      if (!updatedUser) {
        throw new Error('Failed to update user');
      }
      user = updatedUser;
    } else {
      // Check if user exists with this email but different Auth0 ID
      const existingUserByEmail = await dbService.getUserByEmail(email);
      
      if (existingUserByEmail) {
        console.log("User exists with same email, linking accounts:", existingUserByEmail.id);
        
        // Link the Auth0 account to existing user
        const linkedUser = await dbService.updateUser(existingUserByEmail.id, {
          auth0Id: auth0Id,
          emailVerified: emailVerified
        });
        
        if (!linkedUser) {
          throw new Error('Failed to link Auth0 account');
        }
        user = linkedUser;
      } else {
        // Create new user
        console.log("Creating new user for Auth0 ID:", auth0Id);
        user = await dbService.createUser({
          email: email,
          name: name || email.split('@')[0],
          auth0Id: auth0Id,
          emailVerified: emailVerified
        });
      }
    }
    
    // ✅ ADD NULL CHECK
    if (!user) {
      throw new Error('User creation/update failed');
    }
    
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        auth0Id: user.auth0_id 
      }, 
      process.env.JWT_SECRET || 'your-secret-key', 
      { expiresIn: '24h' }
    );
    
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        auth0Id: user.auth0_id
      }
    });
    
  } catch (error) {
    console.error('Auth0 sync error:', error);
    res.status(500).json({ 
      error: 'Failed to sync user',
      details: error.message 
    });
  }
});
app.get('/api/users/by-sub/:sub', authenticateJWT, async (req, res) => {
  try {
    const { sub } = req.params;
    const user = await dbService.getUserByAuth0Id(sub);
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    res.json(user);
  } catch (error) {
    console.error("Error fetching user by auth0 sub:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

app.get('/api/users/auth0/:auth0Id', authenticateJWT, async (req, res) => {
  try {
    const { auth0Id } = req.params;
    const user = await dbService.getUserByAuth0Id(auth0Id);
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    res.json(user);
  } catch (error) {
    console.error("Error fetching user by Auth0 ID:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

app.post('/api/auth/link-auth0', authenticateJWT, async (req, res) => {
  try {
    const { auth0Id, email } = req.body;
    const userId = req.user.id;

    if (!auth0Id || !email) {
      return res.status(400).json({ error: 'Auth0 ID and email are required' });
    }
    const user = await dbService.getUserById(userId);
    
    if (!user || user.email !== email) {
      return res.status(403).json({ error: 'Email does not match authenticated user' });
    }

    const existingAuth0User = await dbService.getUserByAuth0Id(auth0Id);
    if (existingAuth0User && existingAuth0User.id !== userId) {
      return res.status(409).json({ error: 'Auth0 account already linked to another user' });
    }
    
    await dbService.updateUser(userId, { auth0Id });

    res.json({ success: true, message: 'Auth0 account linked successfully' });
    
  } catch (error) {
    console.error('Account linking error:', error);
    res.status(500).json({ error: 'Failed to link Auth0 account' });
  }
});

// ==================== STRIPE WEBHOOK ====================
app.post('/api/stripe-webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    const pool = await getPool();

    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        await handleCheckoutSessionCompleted(session, pool);
        break;
      
      case 'customer.subscription.updated':
        const subscriptionUpdated = event.data.object;
        await handleSubscriptionUpdated(subscriptionUpdated, pool);
        break;
      
      case 'customer.subscription.deleted':
        const subscriptionDeleted = event.data.object;
        await handleSubscriptionDeleted(subscriptionDeleted, pool);
        break;
      
      case 'invoice.payment_succeeded':
        const invoice = event.data.object;
        await handleInvoicePaymentSucceeded(invoice, pool);
        break;
      
      case 'invoice.payment_failed':
        const failedInvoice = event.data.object;
        await handleInvoicePaymentFailed(failedInvoice, pool);
        break;
    }

    res.json({received: true});
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({error: 'Webhook handler failed'});
  }
});

async function handleCheckoutSessionCompleted(session, pool) {
  const { userId, planId, billingCycle } = session.metadata;
  
  const currentPeriodStart = new Date(session.subscription.current_period_start * 1000);
  const currentPeriodEnd = new Date(session.subscription.current_period_end * 1000);
  await dbService.createOrUpdateSubscription({
    userId: parseInt(userId),
    planId,
    billingCycle,
    currentPeriodStart,
    currentPeriodEnd,
    stripeSubscriptionId: session.subscription,
    stripeCustomerId: session.customer,
    status: 'active'
  });

  console.log(`Subscription activated for user ${userId}`);
}
async function handleSubscriptionUpdated(subscription, pool) {
  const currentPeriodStart = new Date(subscription.current_period_start * 1000);
  const currentPeriodEnd = new Date(subscription.current_period_end * 1000);

  await pool.request()
    .input('stripeSubscriptionId', sql.NVarChar, subscription.id)
    .input('currentPeriodStart', sql.Date, currentPeriodStart)
    .input('currentPeriodEnd', sql.Date, currentPeriodEnd)
    .input('status', sql.NVarChar, subscription.status)
    .input('cancelAtPeriodEnd', sql.Bit, subscription.cancel_at_period_end ? 1 : 0)
    .query(`
      UPDATE user_subscriptions 
      SET current_period_start = @currentPeriodStart, 
          current_period_end = @currentPeriodEnd,
          status = @status,
          cancel_at_period_end = @cancelAtPeriodEnd,
          updated_at = GETDATE()
      WHERE stripe_subscription_id = @stripeSubscriptionId
    `);
}

async function handleSubscriptionDeleted(subscription, pool) {
  await pool.request()
    .input('stripeSubscriptionId', sql.NVarChar, subscription.id)
    .input('status', sql.NVarChar, 'cancelled')
    .query(`
      UPDATE user_subscriptions 
      SET status = @status, updated_at = GETDATE()
      WHERE stripe_subscription_id = @stripeSubscriptionId
    `);
}
async function handleInvoicePaymentSucceeded(invoice, pool) {
  console.log(`Payment succeeded for invoice ${invoice.id}`);
}
async function handleInvoicePaymentFailed(invoice, pool) {
  console.log(`Payment failed for invoice ${invoice.id}`);
}
// ==================== UTILITY ROUTES ====================
app.get('/api/health', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().query('SELECT 1');
    
    const azureStatus = containerClient ? 'Connected' : 'Not Configured';
    
    res.json({ 
      status: 'OK', 
      database: 'Connected',
      azureStorage: azureStatus
    });
  } catch (err) {
    res.status(500).json({ 
      status: 'Error', 
      database: 'Disconnected', 
      error: err.message 
    });
  }
});

// ==================== STATIC FILE SERVING ====================
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/uploads/audio', express.static(path.join(__dirname, 'uploads', 'audio')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.mp3') || path.endsWith('.wav') || path.endsWith('.m4a')) {
      res.setHeader('Content-Type', getAudioContentType(path, ''));
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));
// ==================== DATABASE INITIALIZATION ====================
const createDatabaseTables = async () => {
  try {
    const pool = await getPool();
    
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Users' AND xtype='U')
      CREATE TABLE Users (
        id INT PRIMARY KEY IDENTITY(1,1),
        auth0_id NVARCHAR(255) UNIQUE,
        email NVARCHAR(255) NOT NULL UNIQUE,
        password NVARCHAR(255) NULL,
        name NVARCHAR(255),
        email_verified BIT DEFAULT 0,
        professional_title NVARCHAR(255),
        phone_number NVARCHAR(20),
        phone_verified BIT DEFAULT 0,
        avatar_seed NVARCHAR(50) DEFAULT 'vet',
        role NVARCHAR(20) DEFAULT 'doctor',
        createdAt DATETIME DEFAULT GETDATE(),
        updatedAt DATETIME DEFAULT GETDATE()
      )
    `);

    console.log(' Users table created/verified');

    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Files' AND xtype='U')
      CREATE TABLE Files (
        id INT PRIMARY KEY IDENTITY(1,1),
        user_id INT NOT NULL,
        name NVARCHAR(255) NOT NULL,
        type NVARCHAR(100) NOT NULL,
        size INT NOT NULL,
        url NVARCHAR(500) NOT NULL,
        upload_date DATETIME2 DEFAULT GETDATE(),
        FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
      )
    `);
    console.log('Files table created/verified');
 await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Audio' AND xtype='U')
      CREATE TABLE Audio (
        id INT PRIMARY KEY IDENTITY(1,1),
        user_id INT NOT NULL,
        name NVARCHAR(255) NOT NULL,
        type NVARCHAR(100) NOT NULL,
        size INT NOT NULL,
        url NVARCHAR(500) NOT NULL,
        duration INT DEFAULT 0,
        blob_name NVARCHAR(500),
        upload_date DATETIME2 DEFAULT GETDATE(),
        FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
      )
    `);
    console.log('Audio table created/verified');
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='TranscriptionCategories' AND xtype='U')
      CREATE TABLE TranscriptionCategories (
        id INT PRIMARY KEY IDENTITY(1,1),
        name NVARCHAR(100) NOT NULL UNIQUE,
        description NVARCHAR(500)
      )
    `);
    console.log('TranscriptionCategories table created/verified');

    await pool.request().query(`
      MERGE INTO TranscriptionCategories AS target
      USING (VALUES 
        ('SOAP', 'Subjective, Objective, Assessment, Plan format'),
        ('Medical Notes', 'Standard medical documentation'),
        ('Raw Text', 'Unformatted transcription text')
      ) AS source (name, description)
      ON target.name = source.name
      WHEN NOT MATCHED THEN
        INSERT (name, description) VALUES (source.name, source.description);
    `);
    console.log(' Default categories inserted');

    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Pets' AND xtype='U')
      CREATE TABLE Pets (
        id INT PRIMARY KEY IDENTITY(1,1),
        user_id INT NOT NULL,
        name NVARCHAR(255) NOT NULL,
        species NVARCHAR(100) NOT NULL,
        breed NVARCHAR(100),
        age NVARCHAR(50),
        owner NVARCHAR(255) NOT NULL,
        phone_number NVARCHAR(20),
        image_url NVARCHAR(500),
        image_data NVARCHAR(MAX),
        image_type NVARCHAR(100),
        notes NVARCHAR(MAX),
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE(),
        FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
      )
    `);
    console.log('Pets table created/verified');

    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Clinics' AND xtype='U')
      CREATE TABLE Clinics (
        id INT PRIMARY KEY IDENTITY(1,1),
        user_id INT NOT NULL,
        name NVARCHAR(255) NOT NULL,
        address NVARCHAR(500),
        city NVARCHAR(100),
        state NVARCHAR(100),
        zip_code NVARCHAR(20),
        phone NVARCHAR(20),
        email NVARCHAR(255),
        manager NVARCHAR(255),
        logo_url NVARCHAR(500),
        type NVARCHAR(100),
        notes NVARCHAR(MAX),
        pet_count INT DEFAULT 0,
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE(),
        FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
      )
    `);
    console.log('Clinics table created/verified');

    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='VisitTypeTemplates' AND xtype='U')
      CREATE TABLE VisitTypeTemplates (
        id INT PRIMARY KEY IDENTITY(1,1),
        user_id INT NOT NULL,
        name NVARCHAR(255) NOT NULL,
        description NVARCHAR(500),
        template NVARCHAR(MAX) NOT NULL,
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE(),
        FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
      )
    `);
    console.log(' VisitTypeTemplates table created/verified');

    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='audioFiles' AND xtype='U')
      CREATE TABLE audioFiles (
        id INT PRIMARY KEY IDENTITY(1,1),
        user_id INT NOT NULL,
        name NVARCHAR(255) NOT NULL,
        type NVARCHAR(100) NOT NULL,
        size INT NOT NULL,
        url NVARCHAR(500) NOT NULL,
        blob_name NVARCHAR(500),
        duration INT DEFAULT 0,
        upload_date DATETIME2 DEFAULT GETDATE(),
        FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
      )
    `);
    console.log('audioFiles table created/verified');

    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='CallRecordings' AND xtype='U')
      CREATE TABLE CallRecordings (
        id INT PRIMARY KEY IDENTITY(1,1),
        user_id INT NOT NULL,
        pet_name NVARCHAR(255) NOT NULL,
        owner_name NVARCHAR(255) NOT NULL,
        phone_number NVARCHAR(20) NOT NULL,
        duration INT DEFAULT 0,
        call_type NVARCHAR(20) DEFAULT 'whatsapp',
        call_direction NVARCHAR(10) DEFAULT 'outgoing',
        audio_url NVARCHAR(500),
        transcription NVARCHAR(MAX),
        summary NVARCHAR(MAX),
        status NVARCHAR(20) DEFAULT 'pending',
        approved_by NVARCHAR(255),
        approved_date DATETIME2,
        date DATETIME2 DEFAULT GETDATE(),
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE(),
        FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
      )
    `);
    console.log('CallRecordings table created/verified');

    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='subscription_plans' AND xtype='U')
      CREATE TABLE subscription_plans (
        id VARCHAR(20) PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        description TEXT,
        monthly_price DECIMAL(10, 2) NOT NULL,
        yearly_price DECIMAL(10, 2) NOT NULL,
        features NVARCHAR(MAX) NOT NULL,
        is_popular BIT DEFAULT 0,
        is_active BIT DEFAULT 1,
        display_order INT DEFAULT 0,
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE()
      )
    `);
    console.log('subscription_plans table created/verified');

    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='user_subscriptions' AND xtype='U')
      CREATE TABLE user_subscriptions (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_id INT NOT NULL,
        plan_id VARCHAR(20) NOT NULL,
        billing_cycle VARCHAR(10) CHECK (billing_cycle IN ('monthly', 'yearly')) NOT NULL,
        status VARCHAR(10) CHECK (status IN ('active', 'cancelled', 'pending', 'expired')) DEFAULT 'pending',
        current_period_start DATE NOT NULL,
        current_period_end DATE NOT NULL,
        cancel_at_period_end BIT DEFAULT 0,
        stripe_subscription_id VARCHAR(255),
        stripe_customer_id VARCHAR(255),
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE(),
        FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
        FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE CASCADE
      )
    `);
    console.log('user_subscriptions table created/verified');

    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='payment_methods' AND xtype='U')
      CREATE TABLE payment_methods (
        id INT IDENTITY(1,1) PRIMARY KEY,
        user_id INT NOT NULL,
        type VARCHAR(10) CHECK (type IN ('card', 'bank', 'paypal')) NOT NULL,
        details NVARCHAR(MAX) NOT NULL,
        is_default BIT DEFAULT 0,
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE(),
        FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
      )
    `);
    console.log('payment_methods table created/verified');

    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM subscription_plans WHERE id = 'basic')
      INSERT INTO subscription_plans (id, name, description, monthly_price, yearly_price, features, is_popular, display_order) VALUES
      ('basic', 'Basic', 'For individual veterinarians', 0.00, 0.00, '["5 transcriptions per month", "Basic templates", "Email support", "1GB storage"]', 0, 1),
      ('premium', 'Premium', 'For small clinics', 29.00, 290.00, '["Unlimited transcriptions", "All templates", "Priority support", "10GB storage", "Multiple pets"]', 1, 2),
      ('enterprise', 'Enterprise', 'For large veterinary hospitals', 79.00, 790.00, '["Unlimited transcriptions", "Custom templates", "24/7 dedicated support", "Unlimited storage", "Team collaboration", "Advanced analytics"]', 0, 3);
    `);
    console.log('Default subscription plans inserted');

    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Transcriptions' AND xtype='U')
      CREATE TABLE Transcriptions (
        id INT PRIMARY KEY IDENTITY(1,1),
        user_id INT NOT NULL,
        title NVARCHAR(500) NOT NULL,
        content NVARCHAR(MAX) NOT NULL,
        category_name NVARCHAR(100) NOT NULL,
        pet_name NVARCHAR(255),
        clinic_name NVARCHAR(255),
        visit_type NVARCHAR(100),
        template_name NVARCHAR(100),
        recording_duration INT,
        created_at DATETIME2 DEFAULT GETDATE(),
        updated_at DATETIME2 DEFAULT GETDATE(),
        FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
      )
    `);
    console.log('Transcriptions table created/verified');

  } catch (error) {
    console.error('Failed to create database tables:', error.message);
  }
};

const connectWithRetry = async () => {
  try {
    await getPool();
    console.log('Connected to MS SQL database');
    await createDatabaseTables();
  } catch (err) {
    console.error('Database connection error:', err.message);
    console.log('Retrying connection in 5 seconds...');
    setTimeout(connectWithRetry, 5000);
  }
};

connectWithRetry();

app.use(errorHandler);
app.use('/api/users', userRoutes);
app.use("/api/transcribe", limiter, transcribeRoute);
// ==================== SERVER START ====================
const port = process.env.PORT || 5000;
const useSSL = process.env.USE_SSL === 'true';

if (useSSL) {
  try {
    const sslDir = process.env.SSL_CERT_DIR || path.join(__dirname, 'ssl');
    const keyPath = path.join(sslDir, process.env.SSL_KEY_FILENAME || 'server.key');
    const certPath = path.join(sslDir, process.env.SSL_CERT_FILENAME || 'server.crt');
    
    console.log('🔐 SSL Enabled - Loading certificates from:', sslDir);
    console.log('🔑 Key path:', keyPath);
    console.log('📄 Cert path:', certPath);
    if (!fs.existsSync(keyPath)) {
      throw new Error(`SSL key file not found: ${keyPath}`);
    }
    if (!fs.existsSync(certPath)) {
      throw new Error(`SSL certificate file not found: ${certPath}`);
    }

    const privateKey = fs.readFileSync(keyPath, 'utf8');
    const certificate = fs.readFileSync(certPath, 'utf8');
    
    console.log(' SSL files loaded successfully');
    console.log(' Key size:', privateKey.length, 'bytes');
    console.log(' Cert size:', certificate.length, 'bytes');

    const credentials = { 
      key: privateKey, 
      cert: certificate,
      // Important: Allow self-signed certificates
      rejectUnauthorized: false,
      // Better SSL configuration
      secureProtocol: 'TLSv1_2_method',
      ciphers: [
        'ECDHE-RSA-AES128-GCM-SHA256',
        'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES128-SHA256',
        'ECDHE-RSA-AES256-SHA384',
        'AES128-GCM-SHA256',
        'AES256-GCM-SHA384'
      ].join(':'),
      honorCipherOrder: true
    };
    const httpsServer = https.createServer(credentials, app);
    httpsServer.on('tlsClientError', (error) => {
      console.error(' TLS Client Error:', error.message);
    });

    httpsServer.on('error', (error) => {
      console.error(' HTTPS Server error:', error);
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use`);
      }
    });

    httpsServer.listen(port, '0.0.0.0', () => {
      console.log(` HTTPS Server running on https://0.0.0.0:${port}`);
      console.log(` External URL: https://mliapi.ddns.net:${port}`);
      console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(` Health check: https://mliapi.ddns.net:${port}/api/health`);
      console.log('  Using self-signed certificate - browsers will show security warning');
    });

  } catch (error) {
    console.error(' SSL setup failed:', error.message);
    console.log(' Falling back to HTTP...');
    startHttpServer();
  }
} else {
  startHttpServer();
}

function startHttpServer() {
  const httpServer = http.createServer(app);
  
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(` HTTP Server running on http://0.0.0.0:${port}`);
    console.log(` External URL: http://mliapi.ddns.net:${port}`);
    console.log(` Health check: http://mliapi.ddns.net:${port}/api/health`);
  });
}