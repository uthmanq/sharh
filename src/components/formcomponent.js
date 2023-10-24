import React from 'react';

const FormComponent = ({ newLine, handleInputChange, handleCancel, handleSubmit }) => {
  return (
    <div className="create-line-form-container">
      <form className="create-line-form">
        <div className="create-line-form-group">
          <label>
            Arabic:
            <input
              value={newLine.Arabic}
              onChange={(e) => handleInputChange('Arabic', e.target.value)}
            />
          </label>
        </div>
        <div className="create-line-form-group">
          <label>
            English:
            <input
              value={newLine.English}
              onChange={(e) => handleInputChange('English', e.target.value)}
            />
          </label>
        </div>
        <div className="create-line-form-group">
          <label>
            Commentary:
            <textarea
              value={newLine.commentary}
              onChange={(e) => handleInputChange('commentary', e.target.value)}
            />
          </label>
        </div>
        <div className="create-line-form-group">
          <label>
            Rootwords:
            <textarea
              value={newLine.rootwords}
              onChange={(e) => handleInputChange('rootwords', e.target.value)}
            />
          </label>
        </div>
        <div className="create-line-form-buttons">
          <button type="button" onClick={handleSubmit}>
            Submit
          </button>
          <button type="button" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default FormComponent;
