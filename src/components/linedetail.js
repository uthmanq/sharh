import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import fetchWithAuth from '../functions/FetchWithAuth';
import ReactMarkdown from 'react-markdown';

const baseUrl = process.env.REACT_APP_API_BASE_URL;

const LineDetail = ({ line, fetchLines, lines, showEditor, isBorderActive, isCommentaryActive, isRootWordActive }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedLine, setEditedLine] = useState(line || {});
    const [originalId, setOriginalId] = useState(line ? line.id : '');
    const { bookid } = useParams(); // Access the id parameter
    console.log(bookid)

    useEffect(() => {
        setEditedLine(line || {});
        setOriginalId(line ? line.id : '');
    }, [line]);

    const handleEditClick = () => {
        if (isEditing) {
            fetchWithAuth(`${baseUrl}/books/${bookid}/lines/${originalId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    
                },
                body: JSON.stringify({updatedLine :editedLine}),
            })
                
                .then((data) => {
                    setIsEditing(false);
                    fetchLines();  // Trigger re-fetch of data after successful edit
                })
                .catch((error) => {
                    console.error('Edit error: ', error);
                });
        } else {
            setIsEditing(true);
            setEditedLine(line);
            setOriginalId(line.id);
        }
    };

    const handleDeleteClick = () => {
        fetchWithAuth(`${baseUrl}/books/${bookid}/lines/${line.id}`, {
            method: 'DELETE',
        })
            
            .then((data) => {
                fetchLines();  // Trigger re-fetch of data after successful delete
            })
            .catch((error) => {
                console.error('Delete error: ', error);
            });
    };

    const handleMoveUp = () => {
        const index = lines.findIndex(l => l.id === line.id);
        if (index > 0) {
            fetchWithAuth(`${baseUrl}/books/${bookid}/lines/${line.id}/move`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ toIndex: index - 1, fromIndex: index }),
            })

                .then((data) => {
                    fetchLines();  // Trigger re-fetch of data after successful move
                })
                .catch((error) => {
                    console.error('Move up error: ', error);
                });
        }
    };

    const handleMoveDown = () => {
        const index = lines.findIndex(l => l.id === line.id);
        if (index < lines.length - 1) {
            fetchWithAuth(`${baseUrl}/books/${bookid}/lines/${line.id}/move`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ toIndex: index + 1, fromIndex: index }),
            })
                .then((data) => {
                    fetchLines();  // Trigger re-fetch of data after successful move
                })
                .catch((error) => {
                    console.error('Move down error: ', error);
                });
        }
    };

    const handleChange = (field) => (event) => {
        setEditedLine({ ...editedLine, [field]: event.target.value });
    };

    if (!line) {
        return <div></div>;
    }

    return (
        
        <div className="line-details">


            {isEditing ? (
                <div>
                    <label>
                        Arabic:
                            <textarea type="text" value={editedLine.Arabic} className="create-line-form-group" onChange={handleChange('Arabic')} />
                    </label>
                    <label>
                        English:
                            <textarea type="text" className="create-line-form-group" value={editedLine.English} onChange={handleChange('English')} />
                    </label>
                    <label>
                        Commentary:
                            <textarea className="create-line-form-group" value={editedLine.commentary} onChange={handleChange('commentary')} />
                    </label>
                    <label>
                        Rootwords:
                            <textarea type="text" className="create-line-form-group" value={editedLine.rootwords} onChange={handleChange('rootwords')} />
                    </label>
                </div>
            ) : (

                <div className="detail-container" style={{ border: isBorderActive ? "0px" : "2px solid #333" }} id={line.id}>
                    <div className="text-container">
                        <div className="english-detail"><ReactMarkdown>{line.English}</ReactMarkdown></div>
                        <div className="arabic-detail"><ReactMarkdown>{line.Arabic}</ReactMarkdown></div>
                    </div>
                    <hr style={{display: isCommentaryActive ? "block":"none"}}></hr>
                    <div className="commentary-detail" style={{display: isCommentaryActive ? "block":"none"}}>{line.commentary}</div>
                    <hr style={{display: isRootWordActive ? "block":"none"}}></hr>
                    <div className="rootword-detail" style={{display: isRootWordActive ? "block":"none"}}>Arabic Root Word Breakdown: {line.rootwords}</div>
                </div>

            )}
            <div className="container">

                {showEditor && (
                    <div className="button-list">
                        <button onClick={handleEditClick}>{isEditing ? 'Save' : 'Edit'}</button>
                        <button onClick={handleDeleteClick}>Delete</button>
                        <button onClick={handleMoveUp}>Move Up</button>
                        <button onClick={handleMoveDown}>Move Down</button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LineDetail;
