// vite.config.ts
import { defineConfig } from "file:///home/allen/Proyectos/PineFramework/node_modules/.pnpm/vite@5.4.21_@types+node@22.19.21/node_modules/vite/dist/node/index.js";
import react from "file:///home/allen/Proyectos/PineFramework/node_modules/.pnpm/@vitejs+plugin-react@4.7.0_vite@5.4.21_@types+node@22.19.21_/node_modules/@vitejs/plugin-react/dist/index.js";
import path from "path";
var __vite_injected_original_dirname = "/home/allen/Proyectos/PineFramework/frontend";
var vite_config_default = defineConfig({
  plugins: [react()],
  resolve: {
    conditions: ["source"],
    alias: [
      // More specific subpath aliases FIRST
      { find: "pine-framework/utils/time", replacement: path.resolve(__vite_injected_original_dirname, "../src/utils/time.ts") },
      // Fallback: route main entry to frontend-safe version (no trading/Node.js)
      { find: "pine-framework", replacement: path.resolve(__vite_injected_original_dirname, "../src/frontend-safe.ts") }
    ]
  },
  server: {
    port: 3e3,
    proxy: {
      "/api": {
        target: "http://localhost:8081",
        changeOrigin: true
      },
      "/ws": {
        target: "ws://localhost:8081",
        ws: true
      }
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvaG9tZS9hbGxlbi9Qcm95ZWN0b3MvUGluZUZyYW1ld29yay9mcm9udGVuZFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL2hvbWUvYWxsZW4vUHJveWVjdG9zL1BpbmVGcmFtZXdvcmsvZnJvbnRlbmQvdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL2hvbWUvYWxsZW4vUHJveWVjdG9zL1BpbmVGcmFtZXdvcmsvZnJvbnRlbmQvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgcGF0aCBmcm9tICdwYXRoJztcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW3JlYWN0KCldLFxuICByZXNvbHZlOiB7XG4gICAgY29uZGl0aW9uczogWydzb3VyY2UnXSxcbiAgICBhbGlhczogW1xuICAgICAgLy8gTW9yZSBzcGVjaWZpYyBzdWJwYXRoIGFsaWFzZXMgRklSU1RcbiAgICAgIHsgZmluZDogJ3BpbmUtZnJhbWV3b3JrL3V0aWxzL3RpbWUnLCByZXBsYWNlbWVudDogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4uL3NyYy91dGlscy90aW1lLnRzJykgfSxcbiAgICAgIC8vIEZhbGxiYWNrOiByb3V0ZSBtYWluIGVudHJ5IHRvIGZyb250ZW5kLXNhZmUgdmVyc2lvbiAobm8gdHJhZGluZy9Ob2RlLmpzKVxuICAgICAgeyBmaW5kOiAncGluZS1mcmFtZXdvcmsnLCByZXBsYWNlbWVudDogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4uL3NyYy9mcm9udGVuZC1zYWZlLnRzJykgfSxcbiAgICBdLFxuICB9LFxuICBzZXJ2ZXI6IHtcbiAgICBwb3J0OiAzMDAwLFxuICAgIHByb3h5OiB7XG4gICAgICAnL2FwaSc6IHtcbiAgICAgICAgdGFyZ2V0OiAnaHR0cDovL2xvY2FsaG9zdDo4MDgxJyxcbiAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxuICAgICAgfSxcbiAgICAgICcvd3MnOiB7XG4gICAgICAgIHRhcmdldDogJ3dzOi8vbG9jYWxob3N0OjgwODEnLFxuICAgICAgICB3czogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSxcbiAgfSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFzVCxTQUFTLG9CQUFvQjtBQUNuVixPQUFPLFdBQVc7QUFDbEIsT0FBTyxVQUFVO0FBRmpCLElBQU0sbUNBQW1DO0FBSXpDLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVMsQ0FBQyxNQUFNLENBQUM7QUFBQSxFQUNqQixTQUFTO0FBQUEsSUFDUCxZQUFZLENBQUMsUUFBUTtBQUFBLElBQ3JCLE9BQU87QUFBQTtBQUFBLE1BRUwsRUFBRSxNQUFNLDZCQUE2QixhQUFhLEtBQUssUUFBUSxrQ0FBVyxzQkFBc0IsRUFBRTtBQUFBO0FBQUEsTUFFbEcsRUFBRSxNQUFNLGtCQUFrQixhQUFhLEtBQUssUUFBUSxrQ0FBVyx5QkFBeUIsRUFBRTtBQUFBLElBQzVGO0FBQUEsRUFDRjtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLE1BQ0wsUUFBUTtBQUFBLFFBQ04sUUFBUTtBQUFBLFFBQ1IsY0FBYztBQUFBLE1BQ2hCO0FBQUEsTUFDQSxPQUFPO0FBQUEsUUFDTCxRQUFRO0FBQUEsUUFDUixJQUFJO0FBQUEsTUFDTjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
