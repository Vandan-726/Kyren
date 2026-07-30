import { fileURLToPath } from 'url'
import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        react(),
    ],
    resolve: {
        alias: {
            '@/components': path.resolve(__dirname, './src/component'),
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        // In development the Vite dev server and the Express API are separate
        // processes. Proxying /api keeps the frontend origin-relative, so the
        // same fetch code works unchanged on Vercel where both are same-origin.
        proxy: {
            '/api': {
                target: `http://localhost:${process.env.PORT || 3001}`,
                changeOrigin: true,
            },
        },
    },
});
