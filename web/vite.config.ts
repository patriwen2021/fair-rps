import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const serverOrigin = `http://localhost:${process.env.PORT ?? 3000}`;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/socket.io": { target: serverOrigin, ws: true },
    },
  },
});
