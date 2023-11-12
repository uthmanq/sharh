import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from './AuthContext'; // Replace with the correct path to your AuthContext

const baseUrl = process.env.REACT_APP_API_BASE_URL;

function MyAccount() {
    const { isAuthenticated } = useContext(AuthContext);
    const [userData, setUserData] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchUserData = async () => {
            try {
                const token = localStorage.getItem('authToken');
                if (token) {
                    const response = await axios.get(`${baseUrl}/user`, {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });
                    setUserData(response.data);
                }
            } catch (error) {
                setError(error.response ? error.response.data.message : error.message);
            }
        };

        if (isAuthenticated) {
            fetchUserData();
        }
    }, [isAuthenticated]);

    if (!isAuthenticated) {
        return <div>Please log in to view this page.</div>;
    }

    return (
        <div className="account-page">
        <div className="container">
            <h1>My Account</h1>
            {userData ? (
                <div className="book-list">
                    <p><strong>Username:</strong> {userData.username}</p>
                    <p><strong>Email:</strong> {userData.email}</p>
                    {/* Add more fields as necessary */}
                </div>
            ) : (
                <p>Loading user data...</p>
            )}
            {error && <p>Error: {error}</p>}
        </div>
        </div>
    );
}

export default MyAccount;