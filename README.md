# Stealth Browser (Disguised as 1Password)

A custom, lightweight tabbed browser built with Electron.js that is completely invisible to screen-sharing software (like Google Meet, Zoom, and MS Teams). To the presenter, it acts as a normal floating browser; to the audience, the window simply does not exist.

## Features
* **Screen-Share Invisibility:** Utilizes native OS Content Protection / Window Display Affinity APIs to bypass screen capture buffers.
* **Google OAuth Bypass:** Intercepts and rewrites network headers to bypass Google's "Insecure Browser" blocks, allowing seamless Google account logins.
* **Tabbed Interface:** Features a dynamic tab bar, URL input, and active navigation tracking.
* **Opacity Control:** Built-in slider to adjust the window's transparency on the fly.
* **App Disguise:** Packaged to look and act like "1Password" in the macOS Dock, Activity Monitor, and Menu Bar.

## Prerequisites
* [Node.js](https://nodejs.org/) installed on your machine.

## Installation & Setup
1. Clone or download this repository.
2. Install the necessary dependencies:
   ```bash
   npm install


## Create package
npx @electron/packager . --icon=icon.icns --overwrite
