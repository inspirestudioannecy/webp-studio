import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Chemins relatifs pour assurer le fonctionnement hors-ligne par double-clic
  worker: {
    format: 'es', // Le worker de conversion est un module ES (imports dynamiques @jsquash).
  },
  // Les codecs WASM @jsquash chargent leurs .wasm eux-mêmes : on les laisse hors
  // du pré-bundling Vite pour que leurs imports dynamiques internes restent intacts.
  optimizeDeps: {
    exclude: ['@jsquash/webp', '@jsquash/avif'],
  },
});
