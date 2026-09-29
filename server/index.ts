import app from "./app";

const port = Number(process.env.API_PORT ?? 8787);

Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(`Naya API listening on http://localhost:${port}`);
