# Online News Scraper - Frontend

Simple, modern web interface for searching and exporting news articles.

## Features
- Clean, responsive design
- Real-time search
- Up to 100 articles per search
- Excel export functionality
- Mobile-friendly

## Usage

### Option 1: Open directly in browser
Simply open `index.html` in your web browser.

### Option 2: Use Python HTTP server
```bash
cd Frontend
python -m http.server 8000
```
Then visit: http://localhost:8000

## Requirements
- Backend server must be running on http://localhost:5000
- Modern web browser (Chrome, Firefox, Edge, Safari)

## Configuration
If your backend is running on a different URL, edit `script.js` and change:
```javascript
const API_BASE_URL = 'http://localhost:5000';
```
