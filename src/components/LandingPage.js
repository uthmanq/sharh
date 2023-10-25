import React from 'react';
import { useNavigate } from 'react-router-dom';

const LandingPage = () => {
  const navigate = useNavigate();

  const handleEnter = () => {
    navigate('/book');
  };

  return (
    <div className="landing-page">
      <button className="enter-button" onClick={handleEnter}>
        Enter
      </button>
    </div>
  );
};

export default LandingPage;