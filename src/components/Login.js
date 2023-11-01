import React, { useState } from 'react';
import axios from 'axios';
const baseUrl = process.env.REACT_APP_API_BASE_URL;

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      const response = await axios.post(`${baseUrl}/login`, {
        username,
        password,
      });
      const token = response.data.token;
      if (token) {
        // Save the token to localStorage
        localStorage.setItem('authToken', token);
        
        // Optionally, redirect user to another page or update state to indicate login success
      }
    } catch (error) {
      setError(error.response ? error.response.data.message : error.message);
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <div>
          <label>
            Username:
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
        </div>
        <div>
          <label>
            Password:
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
        </div>
        <div>
          <button type="submit">Login</button>
        </div>
      </form>
      {error && <p>{error}</p>}
    </div>
  );
}

export default Login;
