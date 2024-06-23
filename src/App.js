// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Agent from './Agent';

function App() {
  return (
    <Router>
      <div className="App">
        <nav className="bg-gray-800 p-4">
          <ul className="flex space-x-4">
            <li>
              <Link className="text-white" to="/">Home</Link>
            </li>
            <li>
              <Link className="text-white" to="/about">About</Link>
            </li>
            <li>
              <Link className="text-white" to="/contact">Contact</Link>
            </li>
          </ul>
        </nav>

        <Routes>
          <Route path="/" element={<Agent />} />

        </Routes>
      </div>
    </Router>
  );
}

export default App;
