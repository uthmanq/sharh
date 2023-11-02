import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
const baseUrl = process.env.REACT_APP_API_BASE_URL;
console.log(baseUrl)
const LandingPage = () => {
  const navigate = useNavigate();
  const [books, setBooks] = useState([]);

  useEffect(() => {
    const fetchBooks = async () => {
      try {
        const response = await fetch(`${baseUrl}/books`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setBooks(data.books);
        console.log("data", data)
      } catch (error) {
        console.error('Error fetching books', error);
      }
    };

    fetchBooks();
  }, []);

  const handleEnter = (bookId) => {
    navigate('/book/' + bookId);
  };

  return (
    <div className="landing-page">
      <div className="book-list">
        <h1>Sharh by Ummah Spot</h1>
        <p>Sharh is a project to give a new way to read Arabic texts with English translation and commentary digitally. Our core mission focuses on two aspects: </p>
        <ol>
          <li>High-quality, readable, accurate, and accessible translations of important classical Islamic texts.</li>
          <li>A sleek, modern, and intuitive digital experience that offers a better alternative to PDFs.</li>
        </ol>
        <table>
          <thead>
            <tr>
              <th>Books</th>
            </tr>
          </thead>
          <tbody>
            {books.map((book, index) => (
              <tr key={index} onClick={() => handleEnter(book.id)}>
                <td>{book.title} by {book.author}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LandingPage;
