// Notarization script for macOS
// This is called automatically after signing during the build process

const { notarize } = require('electron-notarize');
const path = require('path');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  
  // Only notarize on macOS
  if (electronPlatformName !== 'darwin') {
    return;
  }

  // Skip if no Apple ID credentials
  if (!process.env.APPLE_ID || !process.env.APPLE_ID_PASSWORD) {
    console.log('Skipping notarization: APPLE_ID and APPLE_ID_PASSWORD not set');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log('Notarizing application...');
  console.log(`App: ${appPath}`);

  try {
    await notarize({
      appBundleId: 'com.videosync.engine',
      appPath: appPath,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_ID_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID // Optional
    });
    
    console.log('Notarization complete!');
  } catch (error) {
    console.error('Notarization failed:', error);
    // Don't fail the build if notarization fails
    // This allows building without notarization for testing
  }
};