import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlusCircle } from '@fortawesome/free-solid-svg-icons';
import ReactMarkdown from 'react-markdown';


const LineList = ({ onSelectLine, selectedLine, lines, error, fetchLines, isCreating, setIsCreating, showArabic, bookTitle, showEditor }) => {

  const handleCreateLine = () => {
    setIsCreating(true);
  };

  return (
    <div>
      <div className="content">
        <h2 className="detail-title">Contents</h2>

        {error ? (
          <p>Error: {error}</p>
        ) : (
          <div>
            <table>
              <thead>
                <tr>
                  <th>Text</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr
                    key={line.id}
                    onClick={() => {
                      onSelectLine(line);
                      //console.log(line)
                      const element = document.getElementById(line.id);
                      // Scroll to the element
                      if (element) {
                        element.scrollIntoView({ behavior: "smooth", block: "center" });
                        
                      }
                    }
                    }
                    style={{
                  fontWeight:
                    selectedLine && line.id === selectedLine.id
                      ? 'bold'
                      : 'normal',
                }}
                  >
                    <td className={showArabic ? "arabic-text" : "english-text"}>
                    <ReactMarkdown>
                  {showArabic ? line.Arabic : line.English}
                  </ReactMarkdown>
                </td>
                <td>
                  {showEditor && (<FontAwesomeIcon icon={faPlusCircle}
                    onClick={handleCreateLine} style={{
                      cursor: 'pointer',
                    }}>Create Line</FontAwesomeIcon >)}
                </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
    </div >
  );
};

export default LineList;
