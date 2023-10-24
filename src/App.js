import React, { useState, useEffect } from 'react';
import LineList from './components/linelist';
import LineDetail from './components/linedetail';
import FormComponent from './components/formcomponent'; // Import FormComponent from a separate file

const App = () => {
  const [selectedLine, setSelectedLine] = useState(null);
  const [lines, setLines] = useState([]);
  const [error, setError] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showEditor, setShowEditor] = useState(true);
  const [showArabic, setShowArabic] = useState(true);

  const handleArabicToggle = () => {
    setShowArabic(!showArabic);
  };
  const handleEditorToggle = () => {
    setShowEditor(!showEditor);
  };

  const [newLine, setNewLine] = useState({
    Arabic: '',
    English: '',
    commentary: '',
    rootwords: '',
  });

  const handleInputChange = (field, value) => {
    setNewLine({
      ...newLine,
      [field]: value,
    });
  };

  const handleCancel = () => {
    setIsCreating(false);
    setNewLine({
      Arabic: '',
      English: '',
      commentary: '',
      rootwords: '',
    });
  };

  const handleSubmit = () => {
    const position = selectedLine
      ? lines.findIndex((line) => line.id === selectedLine.id) + 1
      : lines.length;

    fetch('http://localhost:3000/lines', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ newLine, position }),
    })
      .then((response) => {
        if (response.ok) {
          return response.text();
        } else {
          return response.text().then((text) => {
            throw new Error(text);
          });
        }
      })
      .then((data) => {
        console.log(data);
        fetchLines(); // Fetch lines again to update the list with the new line
        handleCancel(); // Reset form and hide it
      })
      .catch((error) => {
        console.error('Error:', error);
      });
  };

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
        <div class="line-list">
        <label className="switch">
          <input
            type="checkbox"
            checked={showEditor}
            onChange={handleEditorToggle}
          />
          <span className="slider round" />
        </label>
        <span>Toggle Editor</span>
        <label className="switch">
          <input
            type="checkbox"
            checked={showArabic}
            onChange={handleArabicToggle}
          />
          <span className="slider round" />
        </label>
        <span>Toggle Arabic</span>
        <LineList
          onSelectLine={setSelectedLine}
          selectedLine={selectedLine}
          lines={lines}
          error={error}
          fetchLines={fetchLines}
          isCreating={isCreating}
          setIsCreating={setIsCreating}
          showArabic={showArabic}
        />
        </div>
        <div className="line-details-container">
          {
            isCreating
              ? <FormComponent
                newLine={newLine}
                setNewLine={setNewLine}
                handleCancel={handleCancel}
                handleSubmit={handleSubmit}
                handleInputChange={handleInputChange}
              />
              : lines.map(line => (
                <LineDetail
                  key={line.id}
                  line={line}
                  fetchLines={fetchLines}
                  lines={lines}
                  showEditor={showEditor}
                />
              ))
          }
        </div>
      </div>
    </div>
  );
};

export default App;
