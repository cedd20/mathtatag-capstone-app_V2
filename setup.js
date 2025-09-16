#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Setting up MathTatag App...\n');

// Function to run commands with error handling
function runCommand(command, description) {
  console.log(`📦 ${description}...`);
  try {
    execSync(command, { stdio: 'inherit' });
    console.log(`✅ ${description} completed\n`);
  } catch (error) {
    console.error(`❌ Error during ${description}:`, error.message);
    process.exit(1);
  }
}

// Function to create/update files
function createFile(filePath, content, description) {
  console.log(`📝 ${description}...`);
  try {
    fs.writeFileSync(filePath, content);
    console.log(`✅ ${description} completed\n`);
  } catch (error) {
    console.error(`❌ Error creating ${filePath}:`, error.message);
    process.exit(1);
  }
}

// Check if package.json exists
if (!fs.existsSync('package.json')) {
  console.error('❌ package.json not found. Please run this script from the project root directory.');
  process.exit(1);
}

// Step 1: Clean install dependencies
runCommand('npm install --legacy-peer-deps', 'Installing dependencies with legacy peer deps');

// Step 2: Create babel.config.js
const babelConfig = `module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Required for react-native-worklets (replaces reanimated plugin)
      'react-native-worklets/plugin',
    ],
  };
};`;

createFile('babel.config.js', babelConfig, 'Creating babel.config.js');

// Step 3: Create metro.config.js
const metroConfig = `const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

module.exports = config;`;

createFile('metro.config.js', metroConfig, 'Creating metro.config.js');

// Step 4: Create expo-env.d.ts
const expoEnvTypes = `/// <reference types="expo/types" />

// NOTE: This file should not be edited and should be in your git ignore`;

createFile('expo-env.d.ts', expoEnvTypes, 'Creating expo-env.d.ts');

// Step 5: Install react-native-worklets if not present
try {
  require.resolve('react-native-worklets');
  console.log('✅ react-native-worklets already installed\n');
} catch (error) {
  runCommand('npm install react-native-worklets --legacy-peer-deps', 'Installing react-native-worklets');
}

// Step 6: Fix Expo packages (skip if there are conflicts)
console.log('📦 Fixing Expo package versions...');
try {
  execSync('npx expo install --fix', { stdio: 'inherit' });
  console.log('✅ Fixing Expo package versions completed\n');
} catch (error) {
  console.log('⚠️  Some package conflicts detected, but continuing with current versions\n');
}

console.log('🎉 Setup completed successfully!');
console.log('\n📱 To start the development server, run:');
console.log('   npx expo start');
console.log('\n📱 To start with cache cleared:');
console.log('   npx expo start --clear');
console.log('\n📱 To start on web:');
console.log('   npx expo start --web');
console.log('\n📱 To start on Android:');
console.log('   npx expo start --android');
console.log('\n📱 To start on iOS:');
console.log('   npx expo start --ios');
console.log('\n🔧 If you encounter any issues, try:');
console.log('   npx expo start --clear');
console.log('   or');
console.log('   npm install --legacy-peer-deps');
