# MintList New Tab

A free local Chrome extension for smart new-tab bookmark boards.

## Features

- Create bookmark pages, and rename any page via the pencil icon (or double-click its name) in the sidebar.
- Group links into freeform boards you can drag anywhere on the canvas.
- "Reset layout" button (in the sidebar) to snap boards back into a tidy grid.
- Drag links between boards.
- Collapse the sidebar with the `‹` toggle at its top to give boards more room; click `›` to bring it back.
- Quick search: press **Ctrl/Cmd+K** (or the search icon) to search every bookmark across every page from one command palette.
- Real site favicons, with a letter-avatar fallback if a favicon can't load.
- One-click wallpaper styles with dark and light collections.
- Large dark and light wallpaper collections.
- Upload your own wallpaper image — shown full-bleed, full resolution, with only a light tint for text legibility; the whole UI re-themes to match.
- Frosted-glass (glassmorphism) board styling.
- Google Chrome profile sign-in prompt.
- Privacy mode to blur URLs during screen sharing.
- Toggle incognito opening for bookmarks.

## Install locally

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select the folder where you cloned or downloaded this repository.
5. Open a new tab.

## Incognito opening

Chrome requires one extra user approval before extensions can create incognito windows:

1. Go to `chrome://extensions`.
2. Open **Details** for MintList New Tab.
3. Enable **Allow in Incognito**.

After that, turn on **Open incognito** in the sidebar and bookmark clicks will open privately.

## Arranging boards

Boards live on a freeform canvas — drag a board by its header to place it anywhere. The canvas has no visible scrollbar; it only grows as far as your boards actually extend. Click **Reset layout** in the sidebar (just below "New page") at any time to snap every board on the current page back into a neat grid.

## Quick search

Press **Ctrl+K** (Windows/Linux) or **Cmd+K** (Mac), or click the search icon in the top bar, to open the search palette. It searches titles and URLs across every page and board at once — use the arrow keys and Enter to jump straight to a result.

## Data

All pages, boards, links, board positions, account state, wallpaper settings, uploaded wallpapers, privacy mode, and incognito mode preferences are stored locally with `chrome.storage.local`.
