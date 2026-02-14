# PDF Ruler

A simple, privacy-focused tool to visualize and measure distances on A4 PDF documents directly in your browser.

![Screenshot](./assets/pdfrulerlogo.png)

## Features

- **Automatic A4 Calibration**: Automatically scales measurements based on standard A4 paper dimensions (210mm x 297mm). No manual calibration needed.
- **Auto-Detect Orientation**: Detects portrait vs. landscape pages and scales accordingly.
- **Multiple Measurements**: Draw as many lines as you need. Each new line gets a distinct color for better visibility.
- **Precision Tools**:
  - **Magnifier**: A 2x magnifier appears when dragging points for pixel-perfect placement.
  - **Point Dragging**: Adjust existing measurement points at any time.
- **Mobile Friendly**: Full touch support and responsive UI for use on tablets and phones.
- **Privacy First**: All PDF processing happens locally in your browser using PDF.js. Your documents are never uploaded to a server.

## Usage

1.  **Open the App**: Simply open `index.html` in a modern web browser.
2.  **Load a PDF**: Click the **Open PDF** button and select a file from your device.
3.  **Measure**:
    -   Click and drag (or tap and drag) to draw a measurement line.
    -   The distance is displayed directly on the line in centimeters.
    -   Drag the endpoints of any line to adjust the measurement.
4.  **Controls**:
    -   **Zoom**: Change the zoom level to inspect details.
    -   **Clear**: Remove all measurements from the page.
    -   **Page Navigation**: Use the arrow buttons to switch pages.

## Technologies

-   **Vanilla JavaScript (ES6+)**: No build step required for core logic.
-   **Mozilla PDF.js**: Robust PDF rendering library.
-   **HTML5 Canvas**: High-performance drawing for the measurement overlay.
-   **CSS Variables**: Clean, maintainable styling with a modern look.

## Development

To run locally with `pdf.js` worker support (which requires a local server due to CORS policies):

```bash
# Using Python
python3 -m http.server 8080

# Or any other static file server
npx serve .
```

Then visit `http://localhost:8080` in your browser.
