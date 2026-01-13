import { FastifyInstance } from "fastify";
import { DatabaseService } from '../database.js';

export async function menuRoutes(fastify: FastifyInstance) {
  fastify.get("/menu", async (request, reply) => {
    try {
      const { table } = request.query as { table?: string };
      
      if (!table) {
        return reply.status(400).send({ message: "table is required" });
      }

      const tableNumber = Number(table);
      if (Number.isNaN(tableNumber)) {
        return reply.status(400).send({ message: "invalid table number" });
      }

      const menuData = await DatabaseService.getMenu(tableNumber);
      return menuData;
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ message: "Failed to load menu" });
    }
  });
}