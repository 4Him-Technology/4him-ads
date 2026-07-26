import { buildServer } from "./server.js";
import { env } from "./env.js";

const app = buildServer();

app
  .listen({ port: env.API_PORT, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`4him Ads API rodando em http://localhost:${env.API_PORT}`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
