const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

console.log('Starting server...');
console.log('Node environment:', process.env.NODE_ENV);
console.log('Port:', process.env.PORT);

const app = express();
let isReady = false;

// Basic middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        ready: isReady,
        time: new Date().toISOString()
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({ 
        message: 'OnlyFacts API is running',
        ready: isReady
    });
});

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
    console.error('MONGODB_URI is not defined');
    process.exit(1);
}

console.log('MongoDB URI format check:', 
    MONGODB_URI.startsWith('mongodb+srv://') ? 'Valid Atlas URI' : 'Not an Atlas URI');

const mongoOptions = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000,
    keepAlive: true,
    keepAliveInitialDelay: 300000,
    retryWrites: true,
    w: 'majority',
    wtimeout: 2500
};

const connectWithRetry = async () => {
    const maxRetries = 5;
    let retries = 0;

    while (retries < maxRetries) {
        try {
            console.log(`MongoDB connection attempt ${retries + 1}/${maxRetries}`);
            console.log('Connecting with options:', JSON.stringify(mongoOptions, null, 2));
            
            const conn = await mongoose.connect(MONGODB_URI, mongoOptions);
            console.log(`MongoDB connected to ${conn.connection.name} database`);
            console.log('Connection state:', mongoose.connection.readyState);
            
            isReady = true;
            return;
        } catch (err) {
            console.error('MongoDB connection error:', err.message);
            console.error('Error name:', err.name);
            console.error('Error code:', err.code);
            
            retries++;
            if (retries === maxRetries) {
                console.error('Max retries reached. Could not connect to MongoDB.');
                isReady = false;
                return;
            }
            
            const delay = Math.min(1000 * Math.pow(2, retries), 10000);
            console.log(`Waiting ${delay}ms before next attempt...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
};

// Handle MongoDB events
mongoose.connection.on('connected', () => {
    console.log('MongoDB connected event fired');
    isReady = true;
});

mongoose.connection.on('error', (err) => {
    console.error('MongoDB error event:', err);
    isReady = false;
});

mongoose.connection.on('disconnected', () => {
    console.log('MongoDB disconnected event fired');
    isReady = false;
    // Only try to reconnect if we haven't already hit max retries
    if (mongoose.connection.readyState === 0) {
        console.log('Attempting to reconnect...');
        connectWithRetry();
    }
});

// Handle process termination
process.on('SIGINT', () => {
    mongoose.connection.close(false, () => {
        console.log('MongoDB connection closed through app termination');
        process.exit(0);
    });
});

// Initial connection
console.log('Starting initial MongoDB connection...');
connectWithRetry();

// Fact Schema
const factSchema = new mongoose.Schema({
    content: { type: String, required: true },
    publishedAt: { type: Date, default: Date.now },
    agrees: { type: Number, default: 0 },
    disagrees: { type: Number, default: 0 },
    voters: [{ 
        userId: String,
        vote: String // 'agree' or 'disagree'
    }]
});

const Fact = mongoose.model('Fact', factSchema);

// Routes
// Get current fact
// Middleware to check database readiness
const checkDatabaseReady = (req, res, next) => {
    if (!isReady) {
        console.log('Database not ready, returning 503');
        return res.status(503).json({
            message: 'Service is starting up, please try again in a few seconds',
            retryAfter: 5
        });
    }
    next();
};

// Get current fact
app.get('/api/facts', checkDatabaseReady, async (req, res) => {
    console.log('GET /api/facts - Database is ready');
    try {
        const fact = await Fact.findOne().sort({ publishedAt: -1 }).maxTimeMS(5000);
        console.log('Query result:', fact ? 'Found fact' : 'No facts found');
        if (!fact) {
            return res.json({ message: 'No facts found' });
        }
        res.json(fact);
    } catch (error) {
        console.error('Error in /api/facts:', error);
        if (error.name === 'MongooseError' || error.name === 'MongoError') {
            return res.status(503).json({
                message: 'Database operation failed, please try again',
                retryAfter: 5
            });
        }
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Add new fact (admin only - you should add authentication)
app.post('/api/fact', checkDatabaseReady, async (req, res) => {
    console.log('POST /api/fact - Adding new fact');
    try {
        if (!req.body.content) {
            return res.status(400).json({ message: 'Content is required' });
        }

        const fact = new Fact({
            content: req.body.content,
            publishedAt: new Date()
        });

        const newFact = await fact.save().maxTimeMS(5000);
        console.log('New fact created:', newFact._id);
        res.status(201).json(newFact);
    } catch (error) {
        console.error('Error creating fact:', error);
        if (error.name === 'MongooseError' || error.name === 'MongoError') {
            return res.status(503).json({
                message: 'Database operation failed, please try again',
                retryAfter: 5
            });
        }
        res.status(400).json({ message: error.message });
    }
});

// Update fact votes
app.patch('/api/fact/:id/vote', checkDatabaseReady, async (req, res) => {
    console.log('PATCH /api/fact/:id/vote - Updating votes');
    try {
        const { type, userId } = req.body;
        
        if (!type || !userId) {
            return res.status(400).json({ message: 'Type and userId are required' });
        }

        if (!['agree', 'disagree'].includes(type)) {
            return res.status(400).json({ message: 'Invalid vote type' });
        }

        const fact = await Fact.findById(req.params.id).maxTimeMS(5000);
        
        if (!fact) {
            return res.status(404).json({ message: 'Fact not found' });
        }

        // Check if user has already voted
        const existingVote = fact.voters.find(v => v.userId === userId);
        if (existingVote) {
            if (existingVote.vote === type) {
                return res.status(400).json({ message: 'Already voted' });
            }
            // Remove previous vote
            fact[existingVote.vote === 'agree' ? 'agrees' : 'disagrees']--;
            existingVote.vote = type;
        } else {
            fact.voters.push({ userId, vote: type });
        }

        // Update vote count
        fact[type === 'agree' ? 'agrees' : 'disagrees']++;
        
        await fact.save().maxTimeMS(5000);
        console.log('Vote updated for fact:', fact._id);
        res.json(fact);
    } catch (error) {
        console.error('Error updating vote:', error);
        if (error.name === 'MongooseError' || error.name === 'MongoError') {
            return res.status(503).json({
                message: 'Database operation failed, please try again',
                retryAfter: 5
            });
        }
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Basic error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something went wrong!' });
});

const startServer = () => {
    const PORT = process.env.PORT || 5000;
    console.log('Starting server on port:', PORT);
    console.log('Node environment:', process.env.NODE_ENV);

    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server is running at http://0.0.0.0:${PORT}`);
        console.log('Process ID:', process.pid);
    }).on('error', (err) => {
        console.error('Server error:', err);
        process.exit(1);
    });

    // Handle server-specific events
    server.on('listening', () => {
        console.log('Server is in listening state');
    });

    server.on('connection', () => {
        console.log('New client connection established');
    });

    // Graceful shutdown handlers
    const gracefulShutdown = (signal) => {
        console.log(`${signal} received. Starting graceful shutdown...`);
        server.close(async () => {
            console.log('Server stopped accepting new connections');
            try {
                await mongoose.connection.close(false);
                console.log('MongoDB connection closed');
                console.log('Graceful shutdown completed');
                process.exit(0);
            } catch (err) {
                console.error('Error during shutdown:', err);
                process.exit(1);
            }
        });

        // Force shutdown after 30 seconds
        setTimeout(() => {
            console.error('Could not close connections in time, forcefully shutting down');
            process.exit(1);
        }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
};

// Start server after MongoDB connection is ready
mongoose.connection.once('connected', () => {
    console.log('MongoDB connected, starting server...');
    startServer();
});
