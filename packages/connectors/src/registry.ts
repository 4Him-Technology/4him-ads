import type { AdPlatform } from "@4him/shared";
import { MetaConnector } from "./meta/index.js";
import type { OAuthAppConfig, PlatformConnector } from "./types.js";

/**
 * Registro de conectores.
 *
 * Único ponto do sistema que sabe quais plataformas existem. Adicionar
 * Google/TikTok/LinkedIn = implementar o contrato e registrar aqui.
 */

export interface ConnectorRegistryConfig {
  meta?: OAuthAppConfig & { writeEnabled?: boolean };
}

export function createConnectorRegistry(config: ConnectorRegistryConfig) {
  const connectors = new Map<AdPlatform, PlatformConnector>();

  if (config.meta) {
    const { writeEnabled, ...app } = config.meta;
    connectors.set("meta", new MetaConnector(app, { writeEnabled }));
  }

  return {
    /** Conector da plataforma, ou `undefined` se não estiver configurada. */
    get(platform: AdPlatform): PlatformConnector | undefined {
      return connectors.get(platform);
    },

    /** Igual ao `get`, mas falha alto quando a plataforma não está configurada. */
    require(platform: AdPlatform): PlatformConnector {
      const connector = connectors.get(platform);
      if (!connector) {
        throw new Error(
          `Plataforma "${platform}" não configurada. Defina as credenciais no .env.`,
        );
      }
      return connector;
    },

    /** Plataformas efetivamente disponíveis nesta instalação. */
    available(): AdPlatform[] {
      return [...connectors.keys()];
    },
  };
}

export type ConnectorRegistry = ReturnType<typeof createConnectorRegistry>;
