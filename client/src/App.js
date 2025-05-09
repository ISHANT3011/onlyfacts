import React, { useState, useEffect } from 'react';
import './App.css';
import config from './config';

function App() {
  const [fact, setFact] = useState(null);
  const [timeLeft, setTimeLeft] = useState('');
  const [userVote, setUserVote] = useState(null);

  // Generate a unique user ID if not exists
  useEffect(() => {
    const storedUserId = localStorage.getItem('userId');
    if (!storedUserId) {
      const newUserId = 'user_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('userId', newUserId);
    }
  }, []);

  useEffect(() => {
    fetchCurrentFact();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [updateTimer]);

  // Check if user has already voted when fact loads
  useEffect(() => {
    if (fact) {
      const factVoteKey = `fact_${fact._id}_vote`;
      const previousVote = localStorage.getItem(factVoteKey);
      setUserVote(previousVote);
    }
  }, [fact]);

  const fetchCurrentFact = async () => {
    try {
      const response = await fetch(`${config.API_URL}/api/fact/current`);
      const data = await response.json();
      setFact(data);
    } catch (error) {
      console.error('Error fetching fact:', error);
    }
  };

  const updateTimer = () => {
    if (fact) {
      const publishDate = new Date(fact.publishedAt);
      const now = new Date();
      const diff = 24 * 60 * 60 * 1000 - (now - publishDate); // Count down instead of up
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft(`Time remaining: ${hours}h ${minutes}m ${seconds}s`);
    }
  };

  const handleVote = async (type) => {
    if (!fact) return;
    
    // Check if user has already voted on this fact
    const userId = localStorage.getItem('userId');
    const factVoteKey = `fact_${fact._id}_vote`;
    const previousVote = localStorage.getItem(factVoteKey);
    
    if (previousVote) {
      alert('You have already voted on this fact!');
      return;
    }

    try {
      const response = await fetch(`${config.API_URL}/api/fact/${fact._id}/vote`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type, userId })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        // Save the vote in localStorage
        localStorage.setItem(factVoteKey, type);
        setUserVote(type);
        setFact(result);
      } else if (result.hasVoted) {
        // If server says user already voted, update local storage
        localStorage.setItem(factVoteKey, result.previousVote);
        setUserVote(result.previousVote);
        alert('You have already voted on this fact!');
      }
    } catch (error) {
      console.error('Error voting:', error);
    }
  };

  return (
    <div className="App">
      <header className="header">
        <h1 className="logo">OnlyFacts</h1>
        {timeLeft && <div className="timer">{timeLeft}</div>}
      </header>
      <main className="main-content">
        <div className="card">
          <h2 className="card-title">Today's Fact</h2>
          {fact ? (
            <>
              <p className="fact-text">{fact.content}</p>
              <div className="vote-container">
                <button 
                  className={`vote-button agree ${userVote === 'agree' ? 'voted' : ''}`}
                  onClick={() => handleVote('agree')}
                  disabled={userVote !== null}
                >
                  <span>Agree</span>
                  <span className="vote-count">{fact.agrees}</span>
                </button>
                <button 
                  className={`vote-button disagree ${userVote === 'disagree' ? 'voted' : ''}`}
                  onClick={() => handleVote('disagree')}
                  disabled={userVote !== null}
                >
                  <span>Disagree</span>
                  <span className="vote-count">{fact.disagrees}</span>
                </button>
              </div>
            </>
          ) : (
            <p className="loading">Loading fact...</p>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
