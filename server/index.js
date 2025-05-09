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
const mongoOptions = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000,
    keepAlive: true,
    keepAliveInitialDelay: 300000
};

const connectWithRetry = async () => {
    const maxRetries = 10;
    let retries = 0;

    while (retries < maxRetries) {
        try {
            console.log(`MongoDB connection attempt ${retries + 1}/${maxRetries}`);
            await mongoose.connect(process.env.MONGODB_URI, mongoOptions);
            console.log('MongoDB connected successfully');
            isReady = true;
            return;
        } catch (err) {
            console.error('MongoDB connection error:', err.message);
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
    console.log('MongoDB connected');
    isReady = true;
});

mongoose.connection.on('error', (err) => {
    console.error('MongoDB error:', err);
    isReady = false;
});

mongoose.connection.on('disconnected', () => {
    console.log('MongoDB disconnected');
    isReady = false;
    connectWithRetry(); // Try to reconnect
});

// Handle process termination
process.on('SIGINT', () => {
    mongoose.connection.close(() => {
        console.log('MongoDB disconnected through app termination');
        process.exit(0);
    });
});

// Initial connection
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

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        mongoose.connection.close(false, () => {
            console.log('MongoDB connection closed');
            process.exit(0);
        });
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received. Shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        mongoose.connection.close(false, () => {
            console.log('MongoDB connection closed');
            process.exit(0);
        });
    });
});
