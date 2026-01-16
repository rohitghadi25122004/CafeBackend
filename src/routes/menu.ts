import { FastifyInstance } from "fastify";
import { DatabaseService } from '../database.js';
import { supabase } from '../supabase.js';

export async function menuRoutes(fastify: FastifyInstance) {
  fastify.get("/menu", async (request: any, reply: any) => {
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

  // Admin Operations
  fastify.post("/admin/categories", async (request: any, reply: any) => {
    try {
      const { name } = request.body as { name: string };
      if (!name) return reply.status(400).send({ message: "Name is required" });
      const category = await DatabaseService.addCategory(name);
      return category;
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ message: "Failed to add category" });
    }
  });

  fastify.post("/admin/menu-items", async (request: any, reply: any) => {
    try {
      const { categoryId, name, price, preparationTime } = request.body as {
        categoryId: number;
        name: string;
        price: number;
        preparationTime?: number;
      };
      if (!categoryId || !name || !price) {
        return reply.status(400).send({ message: "categoryId, name, and price are required" });
      }
      const item = await DatabaseService.addMenuItem(categoryId, name, price, preparationTime);
      return item;
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ message: "Failed to add menu item" });
    }
  });

  fastify.patch("/admin/menu-items/:id", async (request: any, reply: any) => {
    try {
      const { id } = request.params as { id: string };
      const updates = request.body as any;
      const item = await DatabaseService.updateMenuItem(Number(id), updates);
      return item;
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ message: "Failed to update menu item" });
    }
  });

  fastify.delete("/admin/menu-items/:id", async (request: any, reply: any) => {
    try {
      const { id } = request.params as { id: string };
      await DatabaseService.deleteMenuItem(Number(id));
      return { success: true };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ message: "Failed to delete menu item" });
    }
  });

  fastify.post("/admin/menu-items/:id/image", async (request: any, reply: any) => {
    try {
      const { id } = request.params as { id: string };
      const data = await request.file();
      if (!data) return reply.status(400).send({ message: "No file uploaded" });

      const buffer = await data.toBuffer();
      const fileName = `${id}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('menu-images')
        .upload(fileName, buffer, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (uploadError) {
        fastify.log.error(uploadError);
        return reply.status(500).send({ message: "Failed to upload image to storage" });
      }

      return { success: true, fileName };
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ message: "Failed to upload image" });
    }
  });
}