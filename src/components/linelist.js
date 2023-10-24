import React, { useState } from 'react';

const LineList = ({ onSelectLine, selectedLine, lines, error, fetchLines, isCreating, setIsCreating, showArabic }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);


  const handleMenuToggle = () => {
    setIsMenuOpen(!isMenuOpen);
  };



  const handleCreateLine = () => {
    setIsCreating(true);
  };

  return (
    <div className={`line-list ${isMenuOpen ? 'open' : ''}`}>
      <div className="burger-menu" onClick={handleMenuToggle}>
        <div className="burger-bar" />
        <div className="burger-bar" />
        <div className="burger-bar" />
      </div>
      <div className="content">
        <h1>Text</h1>
   
        
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
                    setIsMenuOpen(false);
                  }}
                  style={{
                    fontWeight:
                      selectedLine && line.id === selectedLine.id
                        ? 'bold'
                        : 'normal',
                  }}
                >
                  <p className={showArabic ? "arabic-text" : "english-text"}>
                    {showArabic ? line.Arabic : line.English}
                  </p>
                </li>
              ))}
            </ul>
            {!isCreating && (
              <button onClick={handleCreateLine}>Create Line</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LineList
