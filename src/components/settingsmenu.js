import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faX } from '@fortawesome/free-solid-svg-icons';

const SettingsMenu = ({ handleEditorToggle, handleArabicToggle, showEditor, showArabic, closeSettingsMenu, isBorderActive, handleBorderToggle, isCommentaryActive, handleCommentaryToggle, handleRootWordToggle, isRootWordActive, isAuthenticated }) => {
    return (
        <div className="settings-menu">

            <FontAwesomeIcon className="close-button"
                icon={faX}
                onClick={closeSettingsMenu}
                style={{
                    cursor: 'pointer',
                }} />
            <h2>Settings</h2>
            {isAuthenticated && (
                <div>
                    <label className="switch">
                        <input
                            type="checkbox"
                            checked={showEditor}
                            onChange={handleEditorToggle}
                        />
                        <div className="slider round" />
                    </label>
                    <span>Show Editor</span>
                    <br /></div>
            )}
            <label className="switch">
                <input
                    type="checkbox"
                    checked={showArabic}
                    onChange={handleArabicToggle}
                />
                <span className="slider round" />
            </label>
            <span>List by Arabic</span>
            <br />
            <label className="switch">
                <input
                    type="checkbox"
                    checked={isBorderActive}
                    onChange={handleBorderToggle}
                />
                <span className="slider round" />
            </label>
            <span>Show Round Borders</span>
            <br />
            <label className="switch">
                <input
                    type="checkbox"
                    checked={isCommentaryActive}
                    onChange={handleCommentaryToggle}
                />
                <span className="slider round" />
            </label>
            <span>Show Commentary</span>
            <br />
            <label className="switch">
                <input
                    type="checkbox"
                    checked={isRootWordActive}
                    onChange={handleRootWordToggle}
                />
                <span className="slider round" />
            </label>
            <span>Show Root Words</span>
            <br />
        </div>
    );
};

export default SettingsMenu;
