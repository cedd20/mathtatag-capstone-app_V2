# MathTatag - Educational Math Game App 🧮

A comprehensive educational math game application built with React Native and Expo, featuring interactive learning modules, progress tracking, and multi-user support for students, teachers, and parents.

## 🚀 Quick Setup (One Command)

**For new team members who just forked/cloned the repository:**

```bash
npm run setup
```

This single command will:
- ✅ Install all dependencies with proper peer dependency resolution
- ✅ Create necessary configuration files (babel.config.js, metro.config.js, expo-env.d.ts)
- ✅ Install missing packages (react-native-worklets)
- ✅ Fix Expo package versions
- ✅ Set up the project for immediate development

## 📱 Start Development

After running the setup command, start the development server:

```bash
# Start with cache cleared (recommended)
npm run start:clear

# Or use the regular start command
npm start

# Platform-specific commands
npm run android    # Start on Android
npm run ios        # Start on iOS  
npm run web        # Start on web
```

## 🎯 Features

- **Multi-Role System**: Student, Teacher, and Parent dashboards
- **Interactive Math Games**: 12 different math levels with progressive difficulty
- **Progress Tracking**: Real-time analytics and performance monitoring
- **Firebase Integration**: User authentication and data synchronization
- **TensorFlow Integration**: AI-powered learning assistance
- **Cross-Platform**: Works on iOS, Android, and Web

## 🛠️ Manual Setup (If needed)

If the automated setup doesn't work, follow these steps:

1. **Install dependencies:**
   ```bash
   npm install --legacy-peer-deps
   ```

2. **Install worklets package:**
   ```bash
   npm install react-native-worklets --legacy-peer-deps
   ```

3. **Fix Expo packages:**
   ```bash
   npx expo install --fix
   ```

4. **Start with cache cleared:**
   ```bash
   npx expo start --clear
   ```

## 📁 Project Structure

```
├── app/                    # Main application screens
│   ├── (tabs)/            # Tab navigation screens
│   ├── Map*Stages.tsx     # Individual math game levels
│   ├── *Dashboard.tsx     # Role-specific dashboards
│   └── *Login.tsx         # Authentication screens
├── assets/                # Images, fonts, and media files
│   ├── game pngs/         # Game assets and icons
│   ├── images/            # App images and backgrounds
│   ├── fonts/             # Custom fonts
│   └── music/             # Background music
├── components/            # Reusable UI components
├── constants/             # App constants and Firebase config
├── hooks/                 # Custom React hooks
└── models/                # Data models and types
```

## 🔧 Troubleshooting

**If you encounter issues:**

1. **Clear cache and restart:**
   ```bash
   npx expo start --clear
   ```

2. **Reinstall dependencies:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install --legacy-peer-deps
   ```

3. **Check Expo CLI version:**
   ```bash
   npx expo --version
   ```

4. **Reset Metro bundler:**
   ```bash
   npx expo start --clear --reset-cache
   ```

## 📚 Tech Stack

- **Framework**: React Native with Expo SDK 54
- **Navigation**: Expo Router (file-based routing)
- **State Management**: React Hooks + Context
- **Backend**: Firebase (Authentication, Realtime Database)
- **AI/ML**: TensorFlow.js for React Native
- **UI Components**: Custom components with React Native
- **Styling**: StyleSheet with custom themes

## 👥 Team Development

This project is designed for collaborative development. The setup script ensures all team members have the same development environment regardless of their local setup.

## 📖 Learn More

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/)
- [Firebase Documentation](https://firebase.google.com/docs)
- [TensorFlow.js Documentation](https://www.tensorflow.org/js)