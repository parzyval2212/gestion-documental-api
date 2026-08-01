const { hasPermission } = require("../services/permisos");

function requirePermission(permission) {
  return (req, res, next) => {
    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({
        message: "No autorizado",
        permission,
      });
    }

    next();
  };
}

module.exports = {
  requirePermission,
};
