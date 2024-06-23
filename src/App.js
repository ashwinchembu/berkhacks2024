import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Agent from './Agent';

function App() {
  return (
    <Router>
      <div className="App h-screen bg-black text-white">
        <Routes>
          <Route path="/" element={<Agent />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;