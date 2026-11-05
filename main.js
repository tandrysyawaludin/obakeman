const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

app.name = '1Password';
app.commandLine.appendSwitch('log-level', '3');

function createTabbedStealthBrowser() {
  const iconPath = path.join(__dirname, 'icon.png');

  // SAFELY CHANGE ICON: Check if file exists and is valid before applying
  if (process.platform === 'darwin' && fs.existsSync(iconPath)) {
    try {
      const dockIcon = nativeImage.createFromPath(iconPath);
      // Only set the icon if Electron successfully read the image data
      if (!dockIcon.isEmpty()) {
        app.dock.setIcon(dockIcon);
      }
    } catch (error) {
      console.log("Could not load custom icon, using default...");
    }
  }

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    alwaysOnTop: true,
    title: "Cloudflare Warp",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      webviewTag: true,
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.setContentProtection(true);
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  ipcMain.on('set-opacity', (event, opacityValue) => {
    mainWindow.setOpacity(opacityValue);
  });
}

app.whenReady().then(createTabbedStealthBrowser);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
