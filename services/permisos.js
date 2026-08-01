const ROLE_NAMES = ["Administrador", "Juez", "Notario", "Abogado", "Parte", "Testigo"];

const commonRead = [
  "auth.me",
  "auth.logout",
  "usuarios.me.leer",
  "usuarios.me.editar",
  "usuarios.me.cambiar_password",
  "usuarios.leer",
  "documentos.leer",
  "documentos.versiones.leer",
  "documentos.trazabilidad.leer",
  "documentos.visualizar",
  "expedientes.leer",
  "expedientes.participantes.leer",
  "expedientes.trazabilidad.leer",
  "firmas.leer",
  "notificaciones.leer",
  "notificaciones.marcar_leida",
];

const ROLE_PERMISSIONS = {
  Administrador: {
    actions: [
      ...commonRead,
      "expedientes.crear",
      "expedientes.editar",
      "expedientes.cambiar_estado",
      "expedientes.eliminar",
      "usuarios.crear",
      "participantes.crear",
      "participantes.editar",
      "participantes.eliminar",
      "documentos.crear",
      "documentos.editar",
      "documentos.cambiar_estado",
      "documentos.restaurar_version",
      "firmas.solicitar",
      "firmas.firmar",
      "firmas.rechazar",
    ],
    ui: {
      verTodosExpedientes: true,
      puedeAdministrarExpedientes: true,
      puedeAdministrarParticipantes: true,
      puedeAdministrarUsuarios: true,
      puedeCargarDocumentos: true,
      puedeAprobarRechazar: true,
      puedeFirmar: true,
      puedeSolicitarFirma: true,
      soloDocumentosAutorizados: false,
      soloSolicitudesFirma: false,
      tabs: ["inicio", "documentos", "firma", "avisos"],
    },
  },
  Juez: {
    actions: [
      ...commonRead,
      "expedientes.crear",
      "expedientes.editar",
      "expedientes.cambiar_estado",
      "expedientes.eliminar",
      "participantes.crear",
      "participantes.editar",
      "participantes.eliminar",
      "documentos.crear",
      "documentos.editar",
      "documentos.cambiar_estado",
      "documentos.restaurar_version",
      "firmas.solicitar",
      "firmas.firmar",
      "firmas.rechazar",
    ],
    ui: {
      verTodosExpedientes: true,
      puedeAdministrarExpedientes: true,
      puedeAdministrarParticipantes: true,
      puedeAdministrarUsuarios: false,
      puedeCargarDocumentos: true,
      puedeAprobarRechazar: true,
      puedeFirmar: true,
      puedeSolicitarFirma: true,
      soloDocumentosAutorizados: false,
      soloSolicitudesFirma: false,
      tabs: ["inicio", "documentos", "firma", "avisos"],
    },
  },
  Notario: {
    actions: [
      ...commonRead,
      "firmas.solicitar",
      "firmas.firmar",
      "firmas.rechazar",
    ],
    ui: {
      verTodosExpedientes: true,
      puedeAdministrarExpedientes: false,
      puedeAdministrarParticipantes: false,
      puedeCargarDocumentos: false,
      puedeAprobarRechazar: false,
      puedeFirmar: true,
      puedeSolicitarFirma: true,
      puedeAdministrarUsuarios: false,
      soloDocumentosAutorizados: false,
      soloSolicitudesFirma: false,
      tabs: ["inicio", "firma", "avisos"],
    },
  },
  Abogado: {
    actions: [
      ...commonRead,
      "documentos.crear",
      "documentos.editar",
      "firmas.solicitar",
      "firmas.firmar",
      "firmas.rechazar",
    ],
    ui: {
      verTodosExpedientes: false,
      puedeAdministrarExpedientes: false,
      puedeAdministrarParticipantes: false,
      puedeCargarDocumentos: true,
      puedeAprobarRechazar: false,
      puedeFirmar: true,
      puedeSolicitarFirma: true,
      puedeAdministrarUsuarios: false,
      soloDocumentosAutorizados: false,
      soloSolicitudesFirma: false,
      tabs: ["inicio", "documentos", "firma", "avisos"],
    },
  },
  Parte: {
    actions: [
      ...commonRead,
      "documentos.crear",
      "documentos.editar",
      "firmas.firmar",
      "firmas.rechazar",
    ],
    ui: {
      verTodosExpedientes: false,
      puedeAdministrarExpedientes: false,
      puedeAdministrarParticipantes: false,
      puedeCargarDocumentos: true,
      puedeAprobarRechazar: false,
      puedeFirmar: true,
      puedeSolicitarFirma: false,
      puedeAdministrarUsuarios: false,
      soloDocumentosAutorizados: true,
      soloSolicitudesFirma: false,
      tabs: ["inicio", "documentos", "firma", "avisos"],
    },
  },
  Testigo: {
    actions: [
      "auth.me",
      "auth.logout",
      "usuarios.me.leer",
      "usuarios.me.editar",
      "usuarios.me.cambiar_password",
      "firmas.leer",
      "firmas.firmar",
      "firmas.rechazar",
      "notificaciones.leer",
      "notificaciones.marcar_leida",
    ],
    ui: {
      verTodosExpedientes: false,
      puedeAdministrarExpedientes: false,
      puedeAdministrarParticipantes: false,
      puedeCargarDocumentos: false,
      puedeAprobarRechazar: false,
      puedeFirmar: true,
      puedeSolicitarFirma: false,
      puedeAdministrarUsuarios: false,
      soloDocumentosAutorizados: false,
      soloSolicitudesFirma: true,
      tabs: ["inicio", "firma", "avisos"],
    },
  },
};

function normalizeRole(role) {
  return ROLE_NAMES.find((name) => name.toLowerCase() === String(role || "").toLowerCase()) || null;
}

function getRolePermissions(role) {
  const normalized = normalizeRole(role);
  const config = normalized ? ROLE_PERMISSIONS[normalized] : null;

  if (!config) {
    return {
      role: normalized,
      actions: [],
      ui: { tabs: ["inicio"] },
    };
  }

  return {
    role: normalized,
    actions: [...config.actions],
    ui: { ...config.ui },
  };
}

function hasPermission(user, permission) {
  if (!user || !permission) return false;
  return getRolePermissions(user.categoria).actions.includes(permission);
}

module.exports = {
  ROLE_NAMES,
  getRolePermissions,
  hasPermission,
};
