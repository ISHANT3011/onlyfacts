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
const connectDB = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB connected successfully');
        isReady = true;
        return true;
    } catch (err) {
        console.error('MongoDB connection error:', err);
        isReady = false;
        return false;
    }
};

// Retry connection if it fails
let retries = 0;
const maxRetries = 5;

const attemptConnection = async () => {
    while (retries < maxRetries && !isReady) {
        console.log(`Connection attempt ${retries + 1} of ${maxRetries}`);
        if (await connectDB()) {
            break;
        }
        retries++;
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
};

// Start connection process
attemptConnection();

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
// Get current fact
app.get('/api/facts', async (req, res) => {
    console.log('GET /api/facts');
    
    if (!isReady) {
        return res.status(503).json({
            message: 'Service is starting up, please try again in a few seconds',
            retryAfter: 5
        });
    }

    try {
        const fact = await Fact.findOne().sort({ publishedAt: -1 });
        console.log('Found fact:', fact ? 'yes' : 'no');
        res.json(fact || { message: 'No facts found' });
    } catch (error) {
        console.error('Error fetching fact:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Add new fact (admin only - you should add authentication)
app.post('/api/fact', async (req, res) => {
    try {
        const fact = new Fact({
            content: req.body.content,
            publishedAt: new Date()
        });
        const newFact = await fact.save();
        res.status(201).json(newFact);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Update fact votes
app.patch('/api/fact/:id/vote', async (req, res) => {
    try {
        const { type, userId } = req.body; // 'agree' or 'disagree'
        const fact = await Fact.findById(req.params.id);
        
        // Check if user has already voted
        const existingVote = fact.voters.find(voter => voter.userId === userId);
        if (existingVote) {
            return res.status(400).json({ 
                message: 'You have already voted on this fact',
                hasVoted: true,
                previousVote: existingVote.vote
            });
        }

        // Add new vote
        if (type === 'agree') {
            fact.agrees += 1;
        } else if (type === 'disagree') {
            fact.disagrees += 1;
        }
        
        // Record the voter
        fact.voters.push({ userId, vote: type });
        
        const updatedFact = await fact.save();
        res.json(updatedFact);
    } catch (error) {
        res.status(400).json({ message: error.message });
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
