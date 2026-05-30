# ATLAS Chrome

Chrome extension for creating ATLAS tasks from selected text in the browser.

## Install on Windows

1. Clone this repository on the Windows machine.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the cloned `atlas-chrome` repository folder.
6. Open the extension options and set:
   - ATLAS API URL, for example `https://atlas-api.arktechnology.dev`
   - ATLAS API token, the bearer token used by the ATLAS API

## Use

Select text on any `http` or `https` page, then click the ATLAS extension icon. The extension sends the selected text, page title, captured timestamp, and browser URL to ATLAS.

For canvas-style editors such as Google Docs and Google Slides, Chrome may not expose the selection through normal page APIs. In that case the extension falls back to the page's copy behavior, then reads the clipboard text. This makes Docs/Slides selections work, but it also means the selected text becomes your clipboard contents.

ATLAS must expose `POST /browser/tasks`, which creates the task from the captured page context.

## Development

This is a plain Manifest V3 extension. There is no build step.

After changing files, go to `chrome://extensions` and click the reload button for ATLAS Chrome. Then refresh any page where you want to test selection capture.
