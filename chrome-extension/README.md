# Sharh Notes Clipper - Chrome Extension

A Chrome extension that allows you to clip text from any webpage directly to your Sharh notes.

## Features

- Select text on any webpage and clip it to your notes
- Choose which note and section to save to
- Automatic "Clips" section if no section is specified
- Secure authentication with JWT tokens

## Installation

### Development Mode

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right corner
3. Click "Load unpacked"
4. Select the `chrome-extension` folder from this project

### Production

The extension will be published to the Chrome Web Store (coming soon).

## Setup

1. After installing the extension, click on the extension icon
2. Click "Open Settings" to configure your API connection
3. Get your authentication token:
   - Log in to your Sharh account at [sharhapp.com](https://sharhapp.com)
   - Open your browser's developer console (F12)
   - Go to the Console tab and type: `localStorage.getItem('token')`
   - Copy the token (without quotes) and paste it in the settings
4. Save your settings

## Usage

1. Browse to any webpage
2. Select the text you want to clip
3. Click the Sharh extension icon
4. Select a folder and note from the dropdowns
5. (Optional) Enter a section name, or leave blank to save to "Clips"
6. Click "Clip Note"

## File Structure

```
chrome-extension/
├── manifest.json       # Extension configuration
├── popup.html          # Main popup interface
├── popup.js            # Popup logic and API calls
├── popup.css           # Popup styling
├── content.js          # Content script for text selection
├── background.js       # Background service worker
├── options.html        # Settings page
├── options.js          # Settings logic
├── icons/              # Extension icons (need to be created)
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md           # This file
```

## Creating Icons

You need to create three icon files in the `icons/` folder:
- `icon16.png` - 16x16 pixels (for browser toolbar)
- `icon48.png` - 48x48 pixels (for extension management page)
- `icon128.png` - 128x128 pixels (for Chrome Web Store)

You can create simple placeholder icons or design custom ones for your brand.

## API Endpoints Used

- `GET /folders` - Fetch all folders
- `GET /notes/folder/:folderId` - Fetch notes in a folder
- `POST /notes/clip` - Clip a note with the following payload:
  ```json
  {
    "noteId": "string",
    "body": "string",
    "section": "string (optional)"
  }
  ```

## Development

To modify the extension:

1. Make your changes to the source files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension card
4. Test your changes

## Troubleshooting

### "Please configure your API settings" error
- Make sure you've added your authentication token in the settings page
- Verify the API URL is correct (default: `https://sharhapp.com/api`)

### Cannot load folders/notes
- Check that your authentication token is valid and not expired
- Verify you have an internet connection
- Check the browser console for any error messages

### Selected text not appearing
- Make sure you've selected text on the webpage before opening the extension
- Try selecting the text again after opening the extension popup

## Security

- Your authentication token is stored securely using Chrome's storage API
- All API calls are made over HTTPS
- The extension only requests permissions for necessary functionality

## License

This extension is part of the Sharh project.
