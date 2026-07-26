/**
 * @4him/connectors — integrações com plataformas de anúncios.
 *
 * Todas implementam o mesmo contrato `PlatformConnector`, de modo que
 * domínio e UI não mudam ao adicionar uma plataforma nova.
 */

export * from "./types.js";
export * from "./errors.js";
export * from "./registry.js";
export { MetaConnector, MetaClient, META_READ_SCOPES, META_WRITE_SCOPES } from "./meta/index.js";
