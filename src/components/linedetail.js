import React, { useState, useEffect } from 'react';

const LineDetail = ({ line, fetchLines, lines, showEditor, isBorderActive, isCommentaryActive, isRootWordActive }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedLine, setEditedLine] = useState(line || {});
    const [originalId, setOriginalId] = useState(line ? line.id : '');


    useEffect(() => {
        setEditedLine(line || {});
        setOriginalId(line ? line.id : '');
    }, [line]);

    const handleEditClick = () => {
        if (isEditing) {
            fetch(`http://localhost:3000/lines/${originalId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(editedLine),
            })
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.json();
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
        fetch(`http://localhost:3000/lines/${line.id}`, {
            method: 'DELETE',
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
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
            fetch(`http://localhost:3000/lines/${line.id}/move`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ toIndex: index - 1, fromIndex: index }),
            })
                .then((response) => {
                    if (!response.ok) {
                        console.log("from index is", index)
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.json();
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
            fetch(`http://localhost:3000/lines/${line.id}/move`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ toIndex: index + 1, fromIndex: index }),
            })
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.json();
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
                            <input type="text" value={editedLine.Arabic} onChange={handleChange('Arabic')} />
                    </label>
                    <label>
                        English:
                            <input type="text" value={editedLine.English} onChange={handleChange('English')} />
                    </label>
                    <label>
                        Commentary:
                            <textarea value={editedLine.commentary} onChange={handleChange('commentary')} />
                    </label>
                    <label>
                        Rootwords:
                            <input type="text" value={editedLine.rootwords} onChange={handleChange('rootwords')} />
                    </label>
                </div>
            ) : (

                <div className="detail-container" style={{ border: isBorderActive ? "0px" : "2px solid #333" }} id={line.id}>
                    <div className="text-container">
                        <div className="english-detail">{line.English}</div>
                        <div className="arabic-detail">{line.Arabic}</div>
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
