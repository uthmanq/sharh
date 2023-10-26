import React, { useState, useEffect } from 'react';
import LineList from './linelist';
import LineDetail from './linedetail';
import FormComponent from './formcomponent';
import SettingsMenu from './settingsmenu'; // Import SettingsMenu
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBars } from '@fortawesome/free-solid-svg-icons';
import { useParams } from 'react-router-dom';

const Book = () => {
  const [selectedLine, setSelectedLine] = useState(null);
  const [lines, setLines] = useState([]);
  const [bookTitle, setTitle] = useState([]);

  const [error, setError] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showEditor, setShowEditor] = useState(true);
  const [showArabic, setShowArabic] = useState(true);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false); // state to control the visibility of the settings menu
  const [isBorderActive, setIsBorderActive] = useState(true);
  const [isCommentaryActive, setIsCommentaryActive] = useState(true);
  const [isRootWordActive, setIsRootWordActive] = useState(true);
  const { bookid } = useParams(); // Access the id parameter

  const handleArabicToggle = () => {
    setShowArabic(!showArabic);
  };
  const handleEditorToggle = () => {
    setShowEditor(!showEditor);
  };
  const handleBorderToggle = () => {
    setIsBorderActive(!isBorderActive);
  };
  const handleCommentaryToggle = () => {
    setIsCommentaryActive(!isCommentaryActive);
  };
  const handleRootWordToggle = () => {
    setIsRootWordActive(!isRootWordActive);
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
  const handleSettingsButtonClick = () => {
    setShowSettingsMenu(!showSettingsMenu); // toggle the visibility of the settings menu
  };

  //Post New Line to Book
  const handleSubmit = () => {
    const position = selectedLine
      ? lines.findIndex((line) => line.id === selectedLine.id) + 1
      : lines.length;

    fetch(`http://localhost:3000/books/${bookid}/lines/`, {
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

  //Get All Lines in a Book
  const fetchLines = () => {
    fetch(`http://localhost:3000/books/${bookid}/lines`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        setTitle(data.title);
        setLines(data.lines);
      })
      .catch((error) => {
        setError(error.message);
      });
  };

  useEffect(() => {
    fetchLines();
  }, []);
  const closeSettingsMenu = () => {
    setShowSettingsMenu(false);
  };
  return (
    <div className="app">

      <div className="app-container">
        <div className="line-list">
          <FontAwesomeIcon className="burger-menu-icon"
            icon={faBars}
            onClick={handleSettingsButtonClick}
            style={{
              cursor: 'pointer', top: '10px', left: '10px',
            }} />
          {
            showSettingsMenu &&
            <div className="settings-tray">
              <SettingsMenu
                handleEditorToggle={handleEditorToggle}
                handleArabicToggle={handleArabicToggle}
                showEditor={showEditor}
                showArabic={showArabic}
                closeSettingsMenu={closeSettingsMenu}
                handleBorderToggle={handleBorderToggle}
                handleCommentaryToggle={handleCommentaryToggle}
                isCommentaryActive={isCommentaryActive}
                handleRootWordToggle={handleRootWordToggle}
                isRootWordActive={isRootWordActive}
              />
            </div>
          }
          <LineList
            onSelectLine={setSelectedLine}
            selectedLine={selectedLine}
            lines={lines}
            error={error}
            fetchLines={fetchLines}
            isCreating={isCreating}
            setIsCreating={setIsCreating}
            showArabic={showArabic}
            bookTitle={bookTitle}
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
                  isBorderActive={isBorderActive}
                  isCommentaryActive={isCommentaryActive}
                  isRootWordActive={isRootWordActive}
                />
              ))
          }
        </div>
      </div>
    </div>
  );

};

export default Book;
