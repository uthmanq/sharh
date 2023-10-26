import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const LandingPage = () => {
  const navigate = useNavigate();
  const [books, setBooks] = useState([]);

  useEffect(() => {
    const fetchBooks = async () => {
      try {
        const response = await fetch('http://localhost:3000/books');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setBooks(data.books);
      } catch (error) {
        console.error('Error fetching books', error);
      }
    };

    fetchBooks();
  }, []);

  const handleEnter = (bookId) => {
    navigate('/book/'+ bookId);
  };

  return (
    <div className="landing-page">
      <div className="book-list">
        <h2>Books</h2>
        <ul>
          {books.map((book, index) => (
            <li key={index} onClick={() => handleEnter(book.id)}>
              {book.title} by {book.author}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default LandingPage;
