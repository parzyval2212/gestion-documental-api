module.exports = (categoria) => {
  return (req, res, next) => {
    if (req.user.categoria !== categoria) {
      return res.status(403).json({ message: "No autorizado" });
    }

    next();
  };
};
