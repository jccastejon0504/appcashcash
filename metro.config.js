const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver = {
  ...config.resolver,
  extraNodeModules: {
    ...config.resolver?.extraNodeModules,
    assert: path.resolve(__dirname, 'node_modules/assert'),
  },
};

module.exports = config;
// module.exports = withUniwindConfig(config, {
//   cssEntryFile: './global.css',
// });
