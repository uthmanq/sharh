import React, { useState } from 'react';

const LineList = ({ onSelectLine, selectedLine, lines, error, fetchLines }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showArabic, setShowArabic] = useState(true); // New state variable

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
  const handleMenuToggle = () => {
    setIsMenuOpen(!isMenuOpen);
  };
  const handleArabicToggle = () => {
    setShowArabic(!showArabic);
  };

  const handleCreateLine = () => {
    setIsCreating(true);
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

  return (
    <div className={`line-list ${isMenuOpen ? 'open' : ''}`}>
      <div className="burger-menu" onClick={handleMenuToggle}>
        <div className="burger-bar" />
        <div className="burger-bar" />
        <div className="burger-bar" />
      </div>
      <div className="content">
        <h1>Lines</h1>
        <label className="switch">
            <input type="checkbox" checked={showArabic} onChange={handleArabicToggle} />
            <span className="slider round"></span>
          </label>
        {error ? (
          <p>Error: {error}</p>
        ) : (
          <div>
            <ul>
              {lines.map((line) => (
                <li
                  key={line.id}
                  onClick={() => {
                    onSelectLine(line);
                    setIsMenuOpen(false); // close menu when a line is selected
                  }}
                  style={{
                    fontWeight:
                      selectedLine && line.id === selectedLine.id
                        ? 'bold'
                        : 'normal',
                  }}
                >
                <p className="arabic-text">{showArabic ? line.Arabic : line.English}</p>
                </li>
              ))}
            </ul>
            {isCreating ? (
              <div>
                <form>
                  <div>
                    <label>
                      Arabic:
                      <input
                        type="text"
                        value={newLine.Arabic}
                        onChange={(e) =>
                          handleInputChange('Arabic', e.target.value)
                        }
                      />
                    </label>
                  </div>
                  <div>
                    <label>
                      English:
                      <input
                        type="text"
                        value={newLine.English}
                        onChange={(e) =>
                          handleInputChange('English', e.target.value)
                        }
                      />
                    </label>
                  </div>
                  <div>
                    <label>
                      Commentary:
                      <input
                        type="text"
                        value={newLine.commentary}
                        onChange={(e) =>
                          handleInputChange('commentary', e.target.value)
                        }
                      />
                    </label>
                  </div>
                  <div>
                    <label>
                      Rootwords:
                      <input
                        type="text"
                        value={newLine.rootwords}
                        onChange={(e) =>
                          handleInputChange('rootwords', e.target.value)
                        }
                      />
                    </label>
                  </div>
                  <button type="button" onClick={handleSubmit}>
                    Submit
                  </button>
                  <button type="button" onClick={handleCancel}>
                    Cancel
                  </button>
                </form>
              </div>
            ) : (
              <button onClick={handleCreateLine}>Create Line</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LineList;
