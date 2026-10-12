const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const defaults = getDefaultConfig(__dirname);
module.exports = mergeConfig(defaults, {
  transformer: {
    babelTransformerPath: require.resolve(
      'react-native-svg-transformer/react-native',
    ),
  },
  resolver: {
    assetExts: defaults.resolver.assetExts.filter(ext => ext !== 'svg'),
    sourceExts: [...defaults.resolver.sourceExts, 'svg'],
  },
});
