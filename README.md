# OnlyFacts

A daily facts application where users can agree or disagree with interesting facts. Each fact is available for 24 hours with a live timer showing how long it's been active.

## Features

- Daily facts display
- Agree/Disagree voting system
- Live timer showing fact age
- Modern, responsive UI
- MongoDB backend for data persistence

## Prerequisites

- Node.js (v14 or higher)
- MongoDB installed and running locally
- npm or yarn package manager

## Installation

1. Clone the repository
2. Install dependencies:

```bash
# Install backend dependencies
cd server
npm install

# Install frontend dependencies
cd ../client
npm install
```

3. Start MongoDB locally

4. Start the application:

```bash
# Start backend (from server directory)
npm start

# Start frontend (from client directory)
npm start
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

## API Endpoints

- GET `/api/fact/current` - Get the current fact
- POST `/api/fact` - Add a new fact (admin only)
- PATCH `/api/fact/:id/vote` - Vote on a fact (agree/disagree)

## Technology Stack

- Frontend: React.js
- Backend: Node.js with Express
- Database: MongoDB
- Styling: Custom CSS with modern glassmorphism design
