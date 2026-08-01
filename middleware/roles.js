const { ROLE_NAMES } = require("../services/permisos");

module.exports = (...categorias) => {
  return (req, res, next) => {
    const permitidas = categorias.filter((categoria) => ROLE_NAMES.includes(categoria));

    if (!permitidas.includes(req.user.categoria)) {
      return res.status(403).json({ message: "No autorizado" });
    }

    next();
  };
};
