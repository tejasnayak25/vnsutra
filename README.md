# VN-Sutra Expo App

This project uses [Expo](https://expo.dev) and [expo-router](https://expo.github.io/router/docs).

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Update native metadata**
   ```bash
   node tools/prebuild.js
   ```

3. **Run in development mode**
   ```bash
   npm start
   ```
   or for web:
   ```bash
   npm run web
   ```
   or for android:
   ```bash
   npm run android
   ```
   or for ios:
   ```bash
   npm run ios
   ```

4. **Build the app**
   - Android: `npm run build-android`
   - iOS: `npm run build-ios`

Refer to `package.json` for all available scripts.

---

- Edit your app in the `app/` directory.
- Native metadata (name, version, orientation, etc.) is managed in `app.json` and synced to Android native files by the prebuild script.
