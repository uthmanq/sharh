function fetchWithAuth(url, options) {
    const token = localStorage.getItem('authToken');
  
    if (!token) {
      // No token, redirect to login page
      window.location.href = '/login';
      return Promise.reject('No token');
    }
  
    // Include the token in the request
    const authOptions = {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    };
  
    // Make the fetch request
    return fetch(url, authOptions)
      .then((response) => {
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            // Bad token, clear it from localStorage and redirect to login page
            localStorage.removeItem('authToken');
            window.location.href = '/login';
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      });
  }

  export default fetchWithAuth;