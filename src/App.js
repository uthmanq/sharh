import React from 'react';
import { BrowserRouter as Router, Route, Routes, Link } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import Book from './components/Book'; // Import Book

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/book/:bookid" element={<Book />} />
      </Routes>
    </Router>
  );
};

export default App;