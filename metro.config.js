const { getDefaultConfig } = require('expo/metro-config');
// const { withUniwindConfig } = require('uniwind/metro');

const config = getDefaultConfig(__dirname);

module.exports = config;
// module.exports = withUniwindConfig(config, {
//   cssEntryFile: './global.css',
// });
