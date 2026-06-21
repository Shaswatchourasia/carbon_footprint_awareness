const crypto = require('crypto');

/**
 * Generates a short, URL-safe, collision-resistant ID.
 * We avoid pulling in a uuid dependency for something this small.
 */
function generateId(prefix = '') {
  const random = crypto.randomBytes(9).toString('base64url');
  return prefix ? `${prefix}_${random}` : random;
}

module.exports = { generateId };
