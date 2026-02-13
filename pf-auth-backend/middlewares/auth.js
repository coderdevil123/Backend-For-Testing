// const jwt = require('jsonwebtoken');

// module.exports = function auth(req, res, next) {
//   const authHeader = req.headers.authorization;

//   if (!authHeader) {
//     return res.status(401).json({ error: 'No token provided' });
//   }

//   const token = authHeader.split(' ')[1];

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     req.user = decoded; 
//     next();
//   } catch (err) {
//     return res.status(401).json({ error: 'Invalid token' });
//   }
// };

const jwt = require('jsonwebtoken');

function auth(req, res, next) {
  // Try to get token from:
  // 1. Authorization header (Bearer token)
  // 2. Cookie
  let token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    token = req.cookies?.auth_token;
  }

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    console.error('Token verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = auth;
