const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 120 });

module.exports = cache;
