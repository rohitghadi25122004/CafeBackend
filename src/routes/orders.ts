import { FastifyInstance } from "fastify";
import { DatabaseService } from '../database.js';

export async function orderRoutes(fastify: FastifyInstance) {
  // Create a new order
  fastify.post("/orders", async (request, reply) => {
    try {
      const { table, items } = request.body as {
        table: string;
        items: Array<{ menuItemId: number; quantity: number }>;
      };

      if (!table || !items || !Array.isArray(items) || items.length === 0) {
        return reply.status(400).send({ message: "Table and items are required" });
      }

      const tableNumber = Number(table);
      if (Number.isNaN(tableNumber)) {
        return reply.status(400).send({ message: "Invalid table number" });
      }

      const result = await DatabaseService.createOrder(tableNumber, items);
      return reply.status(201).send(result);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ message: "Failed to create order" });
    }
  });

  // Get order by ID
  fastify.get("/orders/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const order = await DatabaseService.getOrderById(id);
      return order;
    } catch (error) {
      if (error instanceof Error && error.message === "Order not found") {
        return reply.status(404).send({ message: "Order not found" });
      }
      fastify.log.error(error);
      return reply.status(500).send({ message: "Failed to fetch order" });
    }
  });

  // Get orders by table number
  fastify.get("/orders/table/:tableNumber", async (request, reply) => {
    try {
      const { tableNumber } = request.params as { tableNumber: string };
      const tableNum = Number(tableNumber);

      if (Number.isNaN(tableNum)) {
        return reply.status(400).send({ message: "Invalid table number" });
      }

      const orders = await DatabaseService.getOrdersByTable(tableNum);
      return orders;
    } catch (error) {
      if (error instanceof Error && error.message === "Table not found") {
        return reply.status(404).send({ message: "Table not found" });
      }
      fastify.log.error(error);
      return reply.status(500).send({ message: "Failed to fetch orders" });
    }
  });

  // Update order status
  fastify.patch("/orders/:id/status", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { status } = request.body as { status: string };

      const result = await DatabaseService.updateOrderStatus(id, status);
      return result;
    } catch (error) {
      if (error instanceof Error && error.message === "Invalid status") {
        return reply.status(400).send({ message: "Invalid status" });
      }
      fastify.log.error(error);
      return reply.status(500).send({ message: "Failed to update order status" });
    }
  });
}

