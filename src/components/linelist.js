import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlusCircle } from '@fortawesome/free-solid-svg-icons';

const LineList = ({ onSelectLine, selectedLine, lines, error, fetchLines, isCreating, setIsCreating, showArabic, bookTitle }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);


  const handleMenuToggle = () => {
    setIsMenuOpen(!isMenuOpen);
  };



  const handleCreateLine = () => {
    setIsCreating(true);
  };

  return (
    <div>
      <div className="burger-menu" onClick={handleMenuToggle}>
        <div className="burger-bar" />
        <div className="burger-bar" />
        <div className="burger-bar" />
      </div>
      <div className="content">
        <h1 className="detail-title">{bookTitle}</h1>
        {!isCreating && (
              <FontAwesomeIcon icon={faPlusCircle}
                onClick={handleCreateLine} style={{
                  cursor: 'pointer',
                }}>Create Line</FontAwesomeIcon > 
            )}

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
                    const element = document.getElementById(line.id);
                    // Scroll to the element
                    if (element) {
                      element.scrollIntoView({ behavior: "smooth" });
                    }
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

          </div>
        )}
      </div>
    </div>
  );
};

export default LineList
