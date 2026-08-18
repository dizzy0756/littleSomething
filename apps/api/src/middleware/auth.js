const { verifyToken } = require("../lib/auth");

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    const cookies = parseCookies(req.headers.cookie);
    const cookieToken = cookies["admin_session"];
    if (!cookieToken) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const decoded = verifyToken(cookieToken);
    if (!decoded) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
    req.user = decoded;
    return next();
  }

  const token = authHeader.split(" ")[1];
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  req.user = decoded;
  next();
}

function adminOnly(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

function adminSessionFromCookie(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies["admin_session"];
  if (!token) {
    return res.status(401).json({ error: "Admin session required" });
  }
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: "Invalid or expired admin session" });
  }
  if (decoded.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  req.user = decoded;
  next();
}

function parseCookies(cookieHeader) {
  const list = {};
  if (!cookieHeader) return list;
  cookieHeader.split(";").forEach(function(cookie) {
    const parts = cookie.split("=");
    const key = parts[0].trim();
    const value = parts.length > 1 ? parts.slice(1).join("=").trim() : "";
    list[key] = decodeURIComponent(value);
  });
  return list;
}

module.exports = { authMiddleware, adminOnly, adminSessionFromCookie };
