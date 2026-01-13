import Fastify from "fastify";
import cors from "@fastify/cors";
import { menuRoutes } from "./routes/menu.js";
import { healthRoutes } from "./routes/health.js";
import { orderRoutes } from "./routes/orders.js";

export const app = Fastify({ logger: true });

// CORS configuration - allow frontend origin and necessary headers
app.register(cors, {
  origin: true, // Allow all origins for development (including mobile LAN access)
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Accept",
    "Origin",
    "X-Requested-With",
  ],
  credentials: true,
});

app.register(healthRoutes);
app.register(menuRoutes);
app.register(orderRoutes);