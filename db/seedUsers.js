const bcrypt = require("bcrypt");

const demoUsers = [
  { username: "admin", password: "1234", categoria: "Administrador", nombre: "Admin Doc Hub", cargo: "Administrador" },
  { username: "juez", password: "1234", categoria: "Juez", nombre: "Lic. Fernando Reyes", cargo: "Juez 3 Familiar" },
  { username: "notario", password: "1234", categoria: "Notario", nombre: "Not. Karla Sanchez", cargo: "Notaria Publica 24" },
  { username: "abogado", password: "1234", categoria: "Abogado", nombre: "Lic. Mario Torres", cargo: "Abogado litigante" },
  { username: "parte", password: "1234", categoria: "Parte", nombre: "Ana Gomez", cargo: "Parte solicitante" },
  { username: "testigo", password: "1234", categoria: "Testigo", nombre: "Testigo", cargo: "Testigo" },
];

function buildSeedUsers(extraUsername, extraPassword) {
  const users = [...demoUsers];

  if (extraUsername && !users.some((user) => user.username === extraUsername)) {
    users.push({
      username: extraUsername,
      password: extraPassword || "1234",
      categoria: "Juez",
      nombre: extraUsername,
      cargo: "Juez",
    });
  }

  return users.map((user) => ({
    ...user,
    passwordHash: bcrypt.hashSync(user.password, 10),
  }));
}

module.exports = {
  demoUsers,
  buildSeedUsers,
};
