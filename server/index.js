const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PATCH'],
    credentials: true
}));
app.use(express.json());

// Root endpoint
app.get('/', (req, res) => {
    res.json({ message: 'OnlyFacts API is running' });
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });

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
app.get('/api/facts', async (req, res) => {
    try {
        const fact = await Fact.findOne().sort({ publishedAt: -1 });
        res.json(fact);
    } catch (error) {
        res.status(500).json({ message: error.message });
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

// Add a health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', mongodb: mongoose.connection.readyState === 1 });
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
