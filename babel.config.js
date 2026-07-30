module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: { '@': './src' },
          extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
        },
      ],
    ],
    // babel-preset-expo already wires the Reanimated/Worklets plugin when
    // react-native-reanimated is installed — adding it here would double-apply it.
  };
};
