# MintList

A freeform, Manifest V3 Chrome extension that replaces your new tab page with a personal bookmark workspace — drag boards anywhere on the canvas, group links visually, theme it with dark/light wallpapers (or your own image), and jump to any bookmark instantly with a command-palette search.

![MintList layout](https://raw.githubusercontent.com/sadiqqgavvi-gif/MintList-Smart-bookmarks/main/screenshots/02-layout.png)

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Screenshots](#screenshots)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [How It Works](#how-it-works)
- [Permissions](#permissions)
- [Deployment](#deployment)
- [Roadmap](#roadmap)
- [About This Project](#about-this-project)
- [Live Demo](#live-demo)
- [License](#license)

## Features

- **Freeform bookmark boards** — group links into boards you can drag anywhere on an open canvas, not a rigid grid; drag individual links between boards too
- **Multiple pages** — organize boards across separate named pages, rename any page from the pencil icon or a double-click, and switch between them from the sidebar
- **Reset layout** — one click snaps every board on the current page back into a tidy grid when the canvas gets messy
- **Quick search (Ctrl/Cmd+K)** — a command palette that searches every bookmark's title and URL across every page at once, with arrow-key navigation and Enter to jump straight to a result
- **Real site favicons** — pulled through Chrome's favicon API, with a generated letter-avatar fallback when a favicon can't load
- **Theming** — a large built-in dark and light wallpaper collection, or upload your own image; the whole UI (text, panels, accents) re-themes to match automatically
- **Frosted-glass board styling** — glassmorphism panels with backdrop blur over the active wallpaper
- **Google Chrome profile sign-in** — a lightweight prompt that reads the signed-in Chrome profile's email, no external accounts or servers involved
- **Privacy blur** — blurs bookmark URLs (revealed on hover) for screen-sharing or presenting
- **Incognito opening** — optional toggle to open bookmarks in an incognito window
- **Runs as a live web demo too** — every Chrome-only API call is guarded, so the exact same codebase runs as a plain website (see [Live Demo](#live-demo)) with sign-in and incognito features simply turned off

## Tech Stack

- **Vanilla JavaScript** (ES2022+), no framework and no build step
- **HTML5** — native `<dialog>` elements for modals (auth, add/edit link, search palette)
- **CSS custom properties** — theme values swapped at runtime, `backdrop-filter` for the glassmorphism boards
- **Chrome Extension APIs (Manifest V3)** — `chrome.storage.local`, `chrome.tabs`, `chrome.windows`, `chrome.identity`, and the `favicon` permission
- **GitHub Pages** — hosts the live demo build of the same UI

## Screenshots

| Sign In                                                                                                                  | Freeform Layout                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| ![Sign in](https://raw.githubusercontent.com/sadiqqgavvi-gif/MintList-Smart-bookmarks/main/screenshots/01-sign%20in.png) | ![Layout](https://raw.githubusercontent.com/sadiqqgavvi-gif/MintList-Smart-bookmarks/main/screenshots/02-layout.png) |

| Upload Wallpaper                                                                                                                           | Search Bookmarks                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| ![Upload wallpaper](https://raw.githubusercontent.com/sadiqqgavvi-gif/MintList-Smart-bookmarks/main/screenshots/03-upload%20wallpaper.png) | ![Search bookmarks](https://raw.githubusercontent.com/sadiqqgavvi-gif/MintList-Smart-bookmarks/main/screenshots/04-search%20bookmarks.png) |

| Add Pages                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------- |
| ![Add pages](https://raw.githubusercontent.com/sadiqqgavvi-gif/MintList-Smart-bookmarks/main/screenshots/05-add%20pages.png) |

## Project Structure

```
MintList-Smart-bookmarks/
├── index.html                # New-tab entry point (also the GitHub Pages root)
├── newtab.js                   # App state, rendering, drag-and-drop, search palette, wallpapers
├── quick-theme.js                # Pre-paints the cached theme before the main script loads (CSP-safe)
├── styles.css                      # Glassmorphism UI, layout, and theme variables
├── manifest.json                     # Manifest V3 configuration
├── icons/                              # 16/32/48/128 extension icons
├── screenshots/                          # Images used in this README
├── CHROME_UPLOAD_STEPS.txt                 # Web Store packaging steps + permission notes
└── README.md
```

## Getting Started

### Prerequisites

- Google Chrome (or another Chromium-based browser that supports Manifest V3)

### Install as a Chrome extension (local)

```bash
git clone https://github.com/sadiqqgavvi-gif/MintList-Smart-bookmarks.git
```

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select the folder you cloned.
5. Open a new tab — MintList replaces the default new-tab page.

### Allow incognito opening (optional)

1. Go to `chrome://extensions` and open **Details** for MintList.
2. Enable **Allow in Incognito**.
3. Turn on **Open incognito** in MintList's sidebar; bookmark clicks now open privately.

## How It Works

- **Graceful degradation** — every Chrome API call is routed through a single `chromeApi` check (`typeof chrome !== "undefined" ? chrome : null`). When it's `null` — as on the GitHub Pages demo — features like sign-in and `chrome.storage` quietly fall back to `localStorage` or simply don't render, instead of throwing errors.
- **No flash of the wrong theme** — `quick-theme.js` caches the last-applied theme in `localStorage` and repaints the CSS custom properties synchronously, before `styles.css` or `newtab.js` finish loading, so opening a new tab never shows a flash of unstyled or wrong-colored content. A `pageshow` listener re-applies it after Chrome's back/forward cache restores the page.
- **CSP-safe by design** — Manifest V3 blocks inline `<script>` tags by default, so the pre-paint logic above lives in its own file (`quick-theme.js`) rather than an inline snippet in `index.html`.

## Permissions

| Permission                   | Why MintList needs it                                                       |
| ---------------------------- | --------------------------------------------------------------------------- |
| `storage`                    | Saves pages, boards, links, and settings locally via `chrome.storage.local` |
| `unlimitedStorage`           | Lets uploaded wallpaper images be stored without hitting the default quota  |
| `tabs`                       | Opens bookmark links, and opens Chrome's profile settings if sign-in fails  |
| `identity`, `identity.email` | Reads the signed-in Chrome profile's email for the Google profile prompt    |
| `favicon`                    | Fetches real site favicons through Chrome's built-in favicon API            |

## Deployment

Two things get shipped from this repo:

- **Chrome Web Store package** — zip the extension folder per [`CHROME_UPLOAD_STEPS.txt`](./CHROME_UPLOAD_STEPS.txt), upload it in the Chrome Web Store Developer Dashboard (one-time $5 registration fee), fill in listing details, screenshots, and permission justifications, then submit for review.
- **GitHub Pages live demo** — the same `index.html` at the repo root is served directly as a static site, so the identical UI is browsable without installing anything.

## Roadmap

- Publish to the Chrome Web Store
- Optional Chrome bookmarks import
- Tag- or folder-based board organization
- Cross-device sync via `chrome.storage.sync`
- Export/import boards as JSON

## About This Project

MintList is a personal project built to be both a polished, Web-Store-ready Chrome extension and a live, linkable portfolio piece — the same codebase runs as an installable extension and as a plain browsable demo via GitHub Pages.

## Live Demo

🔗 [Try it live](https://sadiqqgavvi-gif.github.io/MintList-Smart-bookmarks/)

## License

This project is open source and available for review as part of my portfolio.
