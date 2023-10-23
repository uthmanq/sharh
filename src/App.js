import React, { useState, useEffect } from 'react';
import LineList from './components/linelist';
import LineDetail from './components/linedetail';

const App = () => {
  const [selectedLine, setSelectedLine] = useState(null);
  const [lines, setLines] = useState([]);
  const [error, setError] = useState(null);

  const fetchLines = () => {
    fetch('http://localhost:3000/lines')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        setLines(data.lines);
      })
      .catch((error) => {
        setError(error.message);
      });
  };

  useEffect(() => {
    fetchLines();
  }, []);


  return (
    <div className="app">
      <div className="app-container">
        <LineList onSelectLine={setSelectedLine} selectedLine={selectedLine} lines={lines} error={error} fetchLines={fetchLines} />
        <LineDetail line={selectedLine} fetchLines={fetchLines} lines={lines} />
      </div>
    </div>

  );
};

export default App;
