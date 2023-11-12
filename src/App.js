import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Link } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import Book from './components/Book'; // Import Book
import Login from './components/Login'
import MyAccount from './components/MyAccount'
import {AuthProvider} from './components/AuthContext'
const App = () => {
  

  return (
    <AuthProvider>
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/book/:bookid" element={<Book />} />
        <Route path="/login" element={<Login />} />
        <Route path="/account" element={<MyAccount />} />
      </Routes>
    </Router>
    </AuthProvider>
  );
};

export default App;