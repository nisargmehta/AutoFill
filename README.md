# EasyFill

A simple local-first Safari WebExtension that learns field values as you type and suggests them on future forms.

## MVP behavior

- Starts with no saved data.
- Detects common job application fields such as first name, last name, email, phone, LinkedIn, GitHub, portfolio, location, company, and work authorization.
- Shows a small save prompt after you type a value into a recognized field.
- Suggests several saved values when you focus a matching field later.
- Stores all data locally in browser extension storage.
- Does not send data to any server.

## Project layout

```text
extension/
  manifest.json
  background.js
  content.js
  content.css
  options.html
  options.js
  options.css
  popup.html
  popup.js
  popup.css
  lib/
    browser-api.js
    field-classifier.js
    storage.js
  icons/
    easyfill.svg
```

## Safari macOS development

Safari Web Extensions are packaged inside a macOS app extension through Xcode. The JavaScript extension source lives in `extension/`.

Typical setup:

1. Open Xcode.
2. Create a new Safari Web Extension project, or use Apple's Safari Web Extension converter.
3. Point/copy the generated extension resources to the files in `extension/`.
4. Enable the unsigned extension in Safari's Develop menu while testing.

The source is WebExtension-style and intentionally avoids browser-specific dependencies so Chrome support can be added later with a browser-specific manifest/build output.

## Chrome/Edge smoke test

You can also load `extension/` as an unpacked extension in Chromium-based browsers for quick iteration:

1. Open `chrome://extensions`.
2. Enable Developer Mode.
3. Click "Load unpacked".
4. Select the `extension/` folder.

Safari remains the target for this MVP, but Chromium is useful for fast UI checks.

## Icon

The EasyFill icon is inspired by Bootstrap Icons' [`file-text-fill`](https://icons.getbootstrap.com/icons/file-text-fill/) document shape, adapted with EasyFill's own color and checkmark treatment.
