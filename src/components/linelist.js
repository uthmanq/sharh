import React from 'react';
import { Droppable, Draggable } from 'react-beautiful-dnd';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlusCircle } from '@fortawesome/free-solid-svg-icons';
import ReactMarkdown from 'react-markdown';

const LineList = ({
  onSelectLine,
  selectedLine,
  lines,
  error,
  isCreating,
  setIsCreating,
  showArabic,
  bookTitle,
  showEditor,
}) => {

  const handleCreateLine = () => {
    setIsCreating(true);
  };

  return (
    <Droppable droppableId="lines">
      {(provided) => (
        <div {...provided.droppableProps} ref={provided.innerRef} className="content">
          <h2 className="detail-title">Contents</h2>
          {error ? <p>Error: {error}</p> : (
            <table>
              <thead>
                <tr>
                  <th>Text</th>
                  {showEditor && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <Draggable key={line.id} draggableId={line.id.toString()} index={index} isDragDisabled={!showEditor}>
                    {(provided, snapshot) => (
                      <tr
                        ref={provided.innerRef}
                        {...(showEditor ? provided.draggableProps : {})}
                        {...(showEditor ? provided.dragHandleProps : {})}
                        onClick={() => onSelectLine(line)}
                        style={{
                          ...provided.draggableProps.style,
                          fontWeight: selectedLine && line.id === selectedLine.id ? 'bold' : 'normal',
                        }}
                      >
                        <td className={showArabic ? "arabic-text" : "english-text"}>
                          <ReactMarkdown>
                            {showArabic ? line.Arabic : line.English}
                          </ReactMarkdown>
                        </td>
                        {showEditor && (
                          <td>
                            <FontAwesomeIcon icon={faPlusCircle} onClick={handleCreateLine} style={{ cursor: 'pointer' }}>Create Line</FontAwesomeIcon>
                          </td>
                        )}
                      </tr>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Droppable>
  );
};

export default LineList;
