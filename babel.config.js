module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Required for react-native-worklets (replaces reanimated plugin)
      'react-native-worklets/plugin',
    ],
  };
};