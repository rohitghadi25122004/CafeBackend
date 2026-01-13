import { supabase } from './supabase.js';
import crypto from 'crypto';

export class DatabaseService {
  // Menu operations
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
          isAvailable
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
      items: cat.MenuItem || []
    })) || [];

    console.log('Categories fetched:', categories.length, 'categories');

    return { tableNumber, categories };
  }

  // Order operations
  static async createOrder(tableNumber: number, items: Array<{ menuItemId: number; quantity: number }>) {
    console.log(`Creating order for table ${tableNumber} with items:`, items);
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
    let { data: guestSession, error: gsError } = await supabase
      .from('GuestSession')
      .select('*')
      .eq('tableSessionId', tableSession.id)
      .eq('status', 'active')
      .order('createdAt', { ascending: false })
      .limit(1)
      .maybeSingle();

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
          guestToken: `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
    const menuItemIds = items.map(item => item.menuItemId);
    const { data: menuItems, error: miError } = await supabase
      .from('MenuItem')
      .select('*')
      .in('id', menuItemIds)
      .eq('isAvailable', true);

    if (miError) {
      console.error('Error validating menu items:', miError);
      throw new Error(`Error validating menu items: ${miError.message}`);
    }

    if (!menuItems || menuItems.length !== items.length) {
      throw new Error("Some menu items are not available or do not exist");
    }

    // 5. Calculate preparation time
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

  static async getOrdersByTable(tableNumber: number) {
    const { data: table, error: tableError } = await supabase
      .from('Table')
      .select('*')
      .eq('tableNumber', tableNumber)
      .single();

    if (tableError || !table) {
      console.error('Table not found:', tableError);
      throw new Error("Table not found");
    }

    const { data: tableSessions, error: sessionsError } = await supabase
      .from('TableSession')
      .select(`
        *,
        orders:Order (
          *,
          items:OrderItem (
            *,
            menuItem:MenuItem (
              name
            )
          )
        )
      `)
      .eq('tableId', table.id);

    if (sessionsError) {
      console.error('Error fetching table sessions:', sessionsError);
    }

    const orders = tableSessions?.flatMap(session => session.orders || []) || [];

    return orders.map((order: any) => {
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
        itemCount: order.items.reduce((sum: number, item: any) => sum + item.quantity, 0)
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