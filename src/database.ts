import { supabase } from './supabase.js';
import crypto from 'crypto';

export class DatabaseService {
  // Menu operations
  static async getTables() {
    const { data, error } = await supabase
      .from('Table')
      .select('*')
      .order('tableNumber');
    if (error) throw error;
    return data || [];
  }

  static async getMenu(tableNumber: number) {
    console.log(`Getting menu for table ${tableNumber}`);
    // Find or create table
    let { data: table, error: tableError } = await supabase
      .from('Table')
      .select('*')
      .eq('tableNumber', tableNumber)
      .single();

    if (tableError && tableError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
      console.error('Error fetching table:', tableError);
    }

    if (!table) {
      console.log(`Table ${tableNumber} not found, creating it...`);
      const { data: newTable, error: insertError } = await supabase
        .from('Table')
        .insert({
          tableNumber: tableNumber,
          qrCodeUrl: `https://cafe-ordering.com/qr/table${tableNumber}`,
          isActive: true
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating table:', insertError);
        throw new Error(`Failed to create table: ${insertError.message}`);
      }
      table = newTable;
    }

    // Get menu categories with items
    const { data: rawCategories, error: categoriesError } = await supabase
      .from('MenuCategory')
      .select(`
        id,
        name,
        MenuItem (
          id,
          name,
          price,
          isAvailable,
          preparationTime
        )
      `)
      .eq('isActive', true)
      .order('id');

    if (categoriesError) {
      console.error('Error fetching menu categories:', categoriesError);
    }

    // Map Supabase relation name to 'items' for frontend compatibility
    const categories = rawCategories?.map((cat: any) => ({
      id: cat.id,
      name: cat.name,
      items: cat.MenuItem?.map((item: any) => ({
        ...item,
        imageUrl: `https://dncyxqcxmmwzfujbpjtq.supabase.co/storage/v1/object/public/menu-images/${item.id}.jpg`
      })) || []
    })) || [];

    console.log('Categories fetched:', categories.length, 'categories');

    return { tableNumber, categories };
  }

  // Admin operations
  static async updateMenuItem(id: number, updates: any) {
    const { data, error } = await supabase
      .from('MenuItem')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  static async deleteMenuItem(id: number) {
    const { error } = await supabase
      .from('MenuItem')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting menu item:', error);
      throw new Error(`Failed to delete menu item: ${error.message}`);
    }
    return { success: true };
  }

  static async addCategory(name: string) {
    const { data, error } = await supabase
      .from('MenuCategory')
      .insert({ name, isActive: true })
      .select()
      .single();

    if (error) {
      console.error('Error adding category:', error);
      throw new Error(`Failed to add category: ${error.message}`);
    }
    return data;
  }

  static async deleteCategory(id: number) {
    const { error } = await supabase
      .from('MenuCategory')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting category:', error);
      throw new Error(`Failed to delete category: ${error.message}`);
    }
    return { success: true };
  }

  static async addMenuItem(categoryId: number, name: string, price: number, preparationTime: number = 10) {
    const { data, error } = await supabase
      .from('MenuItem')
      .insert({
        categoryId,
        name,
        price,
        preparationTime,
        isAvailable: true
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding menu item:', error);
      throw new Error(`Failed to add menu item: ${error.message}`);
    }
    return data;
  }

  static async endTableSession(tableNumber: number) {
    // Find table
    const { data: table, error: tableError } = await supabase
      .from('Table')
      .select('id')
      .eq('tableNumber', tableNumber)
      .single();

    if (tableError || !table) {
      throw new Error('Table not found');
    }

    // End active table session
    const { error: tsError } = await supabase
      .from('TableSession')
      .update({ status: 'completed', updatedAt: new Date().toISOString() })
      .eq('tableId', table.id)
      .eq('status', 'active');

    if (tsError) {
      console.error('Error ending table session:', tsError);
      throw new Error(`Failed to end table session: ${tsError.message}`);
    }

    // End all active guest sessions for this table
    const { data: activeSessions } = await supabase
      .from('TableSession')
      .select('id')
      .eq('tableId', table.id);

    if (activeSessions && activeSessions.length > 0) {
      const sessionIds = activeSessions.map(s => s.id);
      await supabase
        .from('GuestSession')
        .update({ status: 'completed', updatedAt: new Date().toISOString() })
        .in('tableSessionId', sessionIds)
        .eq('status', 'active');
    }

    return { success: true };
  }

  // Order operations
  static async createOrder(tableNumber: number, items: Array<{ menuItemId: number; quantity: number }>, guestToken?: string) {
    console.log(`Creating order for table ${tableNumber} (Guest: ${guestToken}) with items:`, items);
    const now = new Date().toISOString();

    // 1. Find or create table
    let { data: table, error: tableError } = await supabase
      .from('Table')
      .select('*')
      .eq('tableNumber', tableNumber)
      .single();

    if (tableError && tableError.code !== 'PGRST116') {
      console.error('Error finding table:', tableError);
      throw new Error(`Error finding table: ${tableError.message}`);
    }

    if (!table) {
      const { data: newTable, error: createTableError } = await supabase
        .from('Table')
        .insert({
          tableNumber: tableNumber,
          name: `Table ${tableNumber}`,
          qrCodeUrl: `https://cafe-ordering.com/qr/table${tableNumber}`,
          isActive: true
        })
        .select()
        .single();

      if (createTableError) {
        console.error('Error creating table:', createTableError);
        throw new Error(`Error creating table: ${createTableError.message}`);
      }
      table = newTable;
    }

    // 2. Find or create active table session
    let { data: tableSession, error: tsError } = await supabase
      .from('TableSession')
      .select('*')
      .eq('tableId', table.id)
      .eq('status', 'active')
      .order('createdAt', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tsError) {
      console.error('Error finding table session:', tsError);
    }

    if (!tableSession) {
      const { data: newTableSession, error: createTsError } = await supabase
        .from('TableSession')
        .insert({
          id: crypto.randomUUID(),
          tableId: table.id,
          status: 'active',
          createdAt: now,
          updatedAt: now
        })
        .select()
        .single();

      if (createTsError) {
        console.error('Error creating table session:', createTsError);
        throw new Error(`Error creating table session: ${createTsError.message}`);
      }
      tableSession = newTableSession;
    }

    // 3. Find or create active guest session
    // 3. Find or create active guest session
    let guestSession;
    let gsError;

    if (guestToken) {
      const { data, error } = await supabase
        .from('GuestSession')
        .select('*')
        .eq('guestToken', guestToken)
        .maybeSingle();

      if (data) {
        // If guest session exists but is for an old table session or is completed, update it
        if (data.tableSessionId !== tableSession.id || data.status !== 'active') {
          const { data: updated, error: updateError } = await supabase
            .from('GuestSession')
            .update({
              tableSessionId: tableSession.id,
              status: 'active',
              updatedAt: now
            })
            .eq('id', data.id)
            .select()
            .single();

          if (updateError) {
            console.error('Error updating existing guest session:', updateError);
          } else {
            guestSession = updated;
          }
        } else {
          guestSession = data;
        }
      }
      gsError = error;
    } else {
      const { data, error } = await supabase
        .from('GuestSession')
        .select('*')
        .eq('tableSessionId', tableSession.id)
        .eq('status', 'active')
        .order('createdAt', { ascending: false })
        .limit(1)
        .maybeSingle();
      guestSession = data;
      gsError = error;
    }

    if (gsError) {
      console.error('Error finding guest session:', gsError);
    }

    if (!guestSession) {
      const { data: newGuestSession, error: createGsError } = await supabase
        .from('GuestSession')
        .insert({
          id: crypto.randomUUID(),
          tableSessionId: tableSession.id,
          status: 'active',
          guestToken: guestToken || `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          createdAt: now,
          updatedAt: now
        })
        .select()
        .single();

      if (createGsError) {
        console.error('Error creating guest session:', createGsError);
        throw new Error(`Error creating guest session: ${createGsError.message}`);
      }
      guestSession = newGuestSession;
    }

    // 4. Validate menu items
    const uniqueMenuItemIds = [...new Set(items.map(item => item.menuItemId))];
    const { data: menuItems, error: miError } = await supabase
      .from('MenuItem')
      .select('*')
      .in('id', uniqueMenuItemIds)
      .eq('isAvailable', true);

    if (miError) {
      console.error('Error validating menu items:', miError);
      throw new Error(`Error validating menu items: ${miError.message}`);
    }

    if (!menuItems || menuItems.length !== uniqueMenuItemIds.length) {
      throw new Error("Some menu items are not available or do not exist");
    }

    // 5. Calculate preparation time (keep it for DB but default it)
    const maxPreparationTime = menuItems.length > 0
      ? Math.max(...menuItems.map(item => item.preparationTime || 10))
      : 10;

    // 6. Create order
    const { data: order, error: orderError } = await supabase
      .from('Order')
      .insert({
        id: crypto.randomUUID(),
        tableSessionId: tableSession.id,
        guestSessionId: guestSession.id,
        status: 'pending',
        preparationTime: maxPreparationTime,
        createdAt: now,
        updatedAt: now
      })
      .select()
      .single();

    if (orderError) {
      console.error('Error creating order:', orderError);
      throw new Error(`Error creating order: ${orderError.message}`);
    }

    // 7. Create order items
    const orderItemsToInsert = items.map(item => {
      const menuItem = menuItems.find(mi => mi.id === item.menuItemId)!;
      return {
        id: crypto.randomUUID(),
        orderId: order.id,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        price: menuItem.price,
        status: 'pending'
      };
    });

    const { error: oiError } = await supabase
      .from('OrderItem')
      .insert(orderItemsToInsert);

    if (oiError) {
      console.error('Error creating order items:', oiError);
      throw new Error(`Error creating order items: ${oiError.message}`);
    }

    // 8. Calculate totals for response
    const subtotal = orderItemsToInsert.reduce(
      (sum, item) => sum + Number(item.price) * item.quantity,
      0
    );
    const tax = Math.round(subtotal * 0.05);
    const total = subtotal + tax;

    console.log(`Order ${order.id} created successfully`);

    return {
      orderId: order.id,
      status: order.status,
      subtotal,
      tax,
      total
    };
  }

  static async getOrderById(orderId: string) {
    const { data: order, error } = await supabase
      .from('Order')
      .select(`
        *,
        tableSession:TableSession (
          table:Table (
            tableNumber
          )
        ),
        items:OrderItem (
          *,
          menuItem:MenuItem (
            name
          )
        )
      `)
      .eq('id', orderId)
      .single();

    if (error) {
      console.error('Error fetching order by ID:', error);
      throw new Error("Order not found");
    }

    if (!order) {
      throw new Error("Order not found");
    }

    const subtotal = order.items.reduce(
      (sum: number, item: any) => sum + Number(item.price) * item.quantity,
      0
    );
    const tax = Math.round(subtotal * 0.05);
    const total = subtotal + tax;

    return {
      id: order.id,
      tableNumber: order.tableSession.table.tableNumber,
      status: order.status,
      createdAt: order.createdAt,
      subtotal,
      tax,
      total,
      items: order.items.map((item: any) => ({
        name: item.menuItem.name,
        quantity: item.quantity,
        price: Number(item.price),
        total: Number(item.price) * item.quantity
      }))
    };
  }

  static async getOrdersByTable(tableNumber: number, guestToken?: string) {
    const { data: table, error: tableError } = await supabase
      .from('Table')
      .select('*')
      .eq('tableNumber', tableNumber)
      .single();

    if (tableError || !table) {
      console.error('Table not found:', tableError);
      throw new Error("Table not found");
    }

    let query = supabase
      .from('Order')
      .select(`
        *,
        guestSession:GuestSession!inner (
          guestToken
        ),
        tableSession:TableSession!inner (
          tableId,
          status
        ),
        items:OrderItem (
          *,
          menuItem:MenuItem (
            name
          )
        )
      `)
      .eq('tableSession.tableId', table.id)
      .eq('tableSession.status', 'active');

    if (guestToken) {
      query = query.eq('guestSession.guestToken', guestToken);
    }

    const { data: orders, error: ordersError } = await query;

    if (ordersError) {
      console.error('Error fetching orders:', ordersError);
      return [];
    }

    return (orders || []).map((order: any) => {
      const subtotal = order.items.reduce(
        (sum: number, item: any) => sum + Number(item.price) * item.quantity,
        0
      );
      const tax = Math.round(subtotal * 0.05);
      const total = subtotal + tax;

      return {
        id: order.id,
        status: order.status,
        createdAt: order.createdAt,
        subtotal,
        tax,
        total,
        itemCount: order.items.reduce((sum: number, item: any) => sum + item.quantity, 0),
        items: order.items.map((item: any) => ({
          name: item.menuItem.name,
          quantity: item.quantity,
          price: Number(item.price)
        }))
      };
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  static async updateOrderStatus(orderId: string, status: string) {
    const validStatuses = [
      "pending",
      "accepted",
      "preparing",
      "ready",
      "completed",
      "cancelled",
      "rejected"
    ];

    if (!validStatuses.includes(status)) {
      throw new Error("Invalid status");
    }

    const { data: order, error } = await supabase
      .from('Order')
      .update({
        status,
        updatedAt: new Date().toISOString()
      })
      .eq('id', orderId)
      .select()
      .single();

    if (error) {
      console.error('Error updating order status:', error);
      throw new Error(`Failed to update order status: ${error.message}`);
    }

    return {
      id: order.id,
      status: order.status
    };
  }
}