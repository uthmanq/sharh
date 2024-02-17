import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Link } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import Book from './components/Book'; // Import Book
import Login from './components/Login'
import PDFView from './components/PDFView'
import MyAccount from './components/MyAccount'
import { AuthProvider } from './components/AuthContext'
import { ThemeProvider } from './components/ThemeContext';

const App = () => {


  return (
    <AuthProvider>
      <ThemeProvider>
        <Router>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/book/:bookid" element={<Book />} />
            <Route path="/book/pdf/:bookid" element={<PDFView />} />
            <Route path="/login" element={<Login />} />
            <Route path="/account" element={<MyAccount />} />
          </Routes>
        </Router>
      </ThemeProvider>
    </AuthProvider>
  );
};

export default App;