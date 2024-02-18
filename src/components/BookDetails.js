import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import fetchWithAuth from '../functions/FetchWithAuth';

const baseUrl = process.env.REACT_APP_API_BASE_URL;

const BookDetails = ({ bookTitle, author, metadata, fetchLines, showEditor }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedBookTitle, setEditedBookTitle] = useState(bookTitle);
    const [editedAuthor, setEditedAuthor] = useState(author);
    const [editedMetadata, setEditedMetadata] = useState(metadata);
    const { bookid } = useParams();

    const handleEditClick = () => {
        if (isEditing) {
            const updatedBookDetails = {
                title: editedBookTitle,
                author: editedAuthor,
                metadata: editedMetadata
            };

            fetchWithAuth(`${baseUrl}/books/${bookid}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updatedBookDetails),
            })
            .then(() => {
                setIsEditing(false);
                fetchLines();  // Optionally trigger re-fetch of data
            })
            .catch((error) => {
                console.error('Save error:', error);
            });
        } else {
            setIsEditing(true);
        }
    };

    const handleChange = (field, value) => {
        switch (field) {
            case 'title':
                setEditedBookTitle(value);
                break;
            case 'author':
                setEditedAuthor(value);
                break;
            case 'metadata':
                setEditedMetadata({ ...editedMetadata, description: value });
                break;
            default:
                break;
        }
    };

    return (
        <div className="book-detail">
            {showEditor && isEditing ? (
                <div>
                    <label>Title
                        <input
                            type="text"
                            value={editedBookTitle}
                            onChange={(e) => handleChange('title', e.target.value)}
                            placeholder="Title"
                        />
                    </label>
                    <label>Author
                        <input
                            type="text"
                            value={editedAuthor}
                            onChange={(e) => handleChange('author', e.target.value)}
                            placeholder="Author"
                        />
                    </label>
                    <label>Description
                        <textarea
                            value={editedMetadata.description || ''}
                            onChange={(e) => handleChange('metadata', e.target.value)}
                            placeholder="Description"
                        />
                    </label>
                    <button onClick={handleEditClick}>Save Changes</button>
                </div>
            ) : (
                <div>
                    <h2>{bookTitle}</h2>
                    <h3>{author}</h3>
                    <p className="commentary-detail">{metadata.description}</p>
                    {showEditor && <button onClick={handleEditClick}>Edit</button>}
                </div>
            )}
        </div>
    );
};

export default BookDetails;
