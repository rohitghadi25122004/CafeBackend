import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { menuRoutes } from "./routes/menu.js";
import { healthRoutes } from "./routes/health.js";
import { orderRoutes } from "./routes/orders.js";

export const app = Fastify({ logger: true });

// CORS configuration - allow frontend origin and necessary headers
app.register(cors, {
  origin:
    process.env.NODE_ENV === "production"
      ? (process.env.FRONTEND_URL?.split(",").map((s) => s.trim()).filter(Boolean) ?? [])
      : true, // Allow all origins for development (including mobile LAN access)
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

app.register(multipart, {
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

app.register(healthRoutes);
app.register(menuRoutes);
app.register(orderRoutes);

// Add root route for health check
app.get('/', async (request, reply) => {
  return { message: 'Cafe Ordering System API', status: 'running' };
});