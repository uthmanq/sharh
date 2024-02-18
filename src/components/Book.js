import React, { useState, useEffect, useContext } from 'react';
import LineList from './linelist';
import LineDetail from './linedetail';
import FormComponent from './formcomponent';
import BookDetails from './BookDetails'
import SettingsMenu from './settingsmenu'; // Import SettingsMenu
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBars } from '@fortawesome/free-solid-svg-icons';
import { faCogs } from '@fortawesome/free-solid-svg-icons';
import { useParams } from 'react-router-dom';
import fetchWithAuth from '../functions/FetchWithAuth';
import { ThemeContext } from './ThemeContext';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';


const baseUrl = process.env.REACT_APP_API_BASE_URL;
console.log('Base URL is', baseUrl)
const Book = () => {
  const { theme, toggleTheme } = useContext(ThemeContext);
  const [selectedLine, setSelectedLine] = useState(null);
  const [lines, setLines] = useState([]);
  const [bookTitle, setTitle] = useState([]);
  const [author, setAuthor] = useState([]);
  const [metadata, setMetadata] = useState([]);
  const [error, setError] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  
  const [showEditor, setShowEditor] = useState(() =>{
    const saved = localStorage.getItem('showEditor');
    return saved !== null ? JSON.parse(saved) : false;
  });
  
  const [showArabic, setShowArabic] = useState(() =>{
    const saved = localStorage.getItem('showArabic');
    return saved !== null ? JSON.parse(saved) : false;
  });

  const [showSettingsMenu, setShowSettingsMenu] = useState(false); // state to control the visibility of the settings menu
  const [isBorderActive, setIsBorderActive] = useState(true);
  const [isCommentaryActive, setIsCommentaryActive] =
  useState(() =>{
    const saved = localStorage.getItem('isCommentaryActive');
    return saved !== null ? JSON.parse(saved) : false;
  });
  const [isRootWordActive, setIsRootWordActive] = useState(false);
  const { bookid } = useParams(); // Access the id parameter
  const [isTrayOpen, setIsTrayOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  useEffect(() => {
    // Check if the user is authenticated when the app loads
    const token = localStorage.getItem('authToken');
    setIsAuthenticated(!!token);
  }, []);

  const toggleTray = () => {
    setIsTrayOpen(!isTrayOpen);
  };
  const handleArabicToggle = () => {
    localStorage.setItem('showArabic', JSON.stringify(!showArabic));
    setShowArabic(!showArabic);
  };
  const handleEditorToggle = () => {
    localStorage.setItem('showEditor', JSON.stringify(!showEditor));
    setShowEditor(!showEditor);
  };
  const handleBorderToggle = () => {
    setIsBorderActive(!isBorderActive);
  };
  const handleCommentaryToggle = () => {
    localStorage.setItem('isCommentaryActive', JSON.stringify(!isCommentaryActive));
    setIsCommentaryActive(!isCommentaryActive);
  };
  const handleRootWordToggle = () => {
    setIsRootWordActive(!isRootWordActive);
  };
  const onDragEnd = (result) => {
    const { source, destination } = result;

    // Dropped outside the list or no movement
    if (!destination || (source.index === destination.index)) {
        return;
    }

    // Reordering the lines array in local state
    const newLines = Array.from(lines);
    const [reorderedItem] = newLines.splice(source.index, 1);
    newLines.splice(destination.index, 0, reorderedItem);

    setLines(newLines);

    // Update the order on the server
    updateLineOrderOnServer(reorderedItem.id, source.index, destination.index);
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

  const updateLineOrderOnServer = (lineId, fromIndex, toIndex) => {
    fetchWithAuth(`${baseUrl}/books/${bookid}/lines/${lineId}/move`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fromIndex, toIndex }),
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to update line order on the server');
        }
        return response.json();
    })
    .then(data => {
        console.log('Line order updated successfully:', data);
        // Optionally, you might want to re-fetch the lines to ensure the client and server are in sync
        fetchLines();
    })
    .catch(error => {
        console.error('Error updating line order:', error);
        // Optionally, revert the order change in the client state in case of error
        // This step requires storing the previous order and resetting to it upon error
    });
};


  //Post New Line to Book
  const handleSubmit = () => {
    console.log("selected line is", selectedLine)
    const position = selectedLine
      ? lines.findIndex((line) => line.id === selectedLine.id) + 1
      : lines.length;

    fetchWithAuth(`${baseUrl}/books/${bookid}/lines/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ newLine, position }),
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
    fetch(`${baseUrl}/books/${bookid}/lines`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        setTitle(data.title);
        setAuthor(data.author);
        setMetadata(data.metadata);
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
        <div className={theme === 'light' ? 'light-mode' : 'dark-mode'}>

          <div className="line-list" style={{ display: isTrayOpen ? 'block' : 'none' }}>
            <FontAwesomeIcon className="burger-menu-icon settingsIcon"
              icon={faCogs}
              onClick={handleSettingsButtonClick}
            />
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
                  isAuthenticated={isAuthenticated}
                />
              </div>
            }
          <DragDropContext onDragEnd={onDragEnd}>
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
              showEditor={showEditor}

            />
          </DragDropContext>

          </div>
          <div className="line-details-container">
            <div className="header" >
              <h1 className="site-title" style={{ textAlign: "center", }}>{bookTitle}</h1>
              <FontAwesomeIcon className="burger-menu-icon"
                icon={faBars}
                onClick={toggleTray}
                style={{
                  cursor: 'pointer', bottom: '50px', left: '10px', position: 'relative'
                }} />
            </div>
            <BookDetails
              bookTitle = {bookTitle}
              metadata = {metadata}
              author={author}
              showEditor={showEditor}
              setTitle={setTitle}
              setMetadata={setMetadata}
              isBorderActive={isBorderActive}
              fetchLines={fetchLines}

            >
                
            </BookDetails>
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
    </div>
  );

};

export default Book;
