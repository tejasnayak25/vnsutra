// tools/prebuild.js
// Dynamically update app metadata before build

const fs = require('fs');
const path = require('path');

const appJsonPath = path.join(__dirname, '../app.json');
const gradlePath = path.join(__dirname, '../android/app/build.gradle');
const settingsGradlePath = path.join(__dirname, '../android/settings.gradle');
const manifestPath = path.join(__dirname, '../android/app/src/main/AndroidManifest.xml');
const stringsPath = path.join(__dirname, '../android/app/src/main/res/values/strings.xml');

function updateGradle(appJson) {
  let gradle = fs.readFileSync(gradlePath, 'utf8');
  gradle = gradle.replace(/(applicationId ')\S+(')/, `$1${appJson.expo.android?.package || 'com.game.vnsutra'}$2`)
    .replace(/(namespace ')\S+(')/, `$1${appJson.expo.android?.package || 'com.game.vnsutra'}$2`)
    .replace(/(versionCode )\d+/, `versionCode ${appJson.expo.android?.versionCode || 1}`)
    .replace(/(versionName ")([^"]+)(")/, `versionName "${appJson.expo.version || '1.0.0'}"`);
  fs.writeFileSync(gradlePath, gradle);
}

function updateSettingsGradle(appJson) {
  let settings = fs.readFileSync(settingsGradlePath, 'utf8');
  settings = settings.replace(/rootProject.name = '.*'/, `rootProject.name = '${appJson.expo.name || 'vnsutra'}'`);
  fs.writeFileSync(settingsGradlePath, settings);
}

function updateManifest(appJson) {
  let manifest = fs.readFileSync(manifestPath, 'utf8');
  manifest = manifest.replace(/android:label="@string\/app_name"/, 'android:label="@string/app_name"')
    .replace(/android:screenOrientation="[^"]+"/, `android:screenOrientation="${appJson.expo.orientation || 'landscape'}"`)
    .replace(/<data android:scheme="[^"]+"\/>/, `<data android:scheme="${appJson.expo.scheme || 'vnsutra'}"/>`);
  fs.writeFileSync(manifestPath, manifest);
}

function updateStringsXml(appJson) {
  let strings = fs.readFileSync(stringsPath, 'utf8');
  strings = strings.replace(/<string name="app_name">[^<]+<\/string>/, `<string name="app_name">${appJson.expo.name || 'vnsutra'}</string>`)
    .replace(/<string name="expo_system_ui_user_interface_style" translatable="false">[^<]+<\/string>/, `<string name="expo_system_ui_user_interface_style" translatable="false">${appJson.expo.userInterfaceStyle || 'automatic'}</string>`);
  fs.writeFileSync(stringsPath, strings);
}

function updateMetadata() {
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

  // Example: update version and timestamp
  const now = new Date();
  appJson.expo.version = process.env.APP_VERSION || appJson.expo.version;
  appJson.expo.lastBuildTime = now.toISOString();

  // Add more dynamic updates here as needed

  fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2));
  updateGradle(appJson);
  updateSettingsGradle(appJson);
  updateManifest(appJson);
  updateStringsXml(appJson);
  console.log('Metadata updated in app.json, build.gradle, settings.gradle, AndroidManifest.xml, and strings.xml.');
}

updateMetadata();
