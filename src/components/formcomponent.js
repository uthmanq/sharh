import React from 'react';

const FormComponent = ({ newLine, handleInputChange, handleCancel, handleSubmit }) => {
  return (
    <div className="create-line-form-container">
      <h3>Create New Line</h3>
      <form className="create-line-form">
        <div className="create-line-form-group">
          <label>
            Arabic:
            <textarea class="arabic-text"
              value={newLine.Arabic}
              onChange={(e) => handleInputChange('Arabic', e.target.value)}
            />
          </label>
        </div>
        <div className="create-line-form-group">
          <label>
            English:
            <textarea
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
          <button type="button button-delete" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default FormComponent;
