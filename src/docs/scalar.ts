import { openApiSpec } from './openapi';

/**
 * Gera o HTML do Scalar API Reference com o spec embutido.
 * Usa o CDN do jsDelivr para carregar o Scalar.
 */
export function getScalarHTML(): string {
  const specJson = JSON.stringify(openApiSpec);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <title>wa-omni-gateway — API Docs</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📡</text></svg>" />
</head>
<body>
  <div id="app"></div>

  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  <script>
    Scalar.createApiReference('#app', {
      spec: {
        content: ${specJson},
      },
      theme: 'kepler',
      darkMode: true,
      hideDownloadButton: false,
      metaData: {
        title: 'wa-omni-gateway API',
      },
    })
  </script>
</body>
</html>`;
}
