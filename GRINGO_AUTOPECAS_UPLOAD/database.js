const path = require('path');
const fs = require('fs');

const defaultSettings = {
  admin_password: '4662',
  whatsapp_number: '51993687877',
  phone_landline: '5130475595',
  address: 'Rua Luciana de Abreu, 540 - Pda. 73 Frente ao Colégio Ponche Verde',
  city: 'Gravataí',
  state: 'RS',
  company_name: 'Gringo Autopeças'
};

// Data e hora oficial de Brasília (America/Sao_Paulo, UTC-3)
function getBrasiliaTimestamp() {
  const d = new Date();
  return d.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

let isPostgres = false;
let pgPool = null;
let sqliteDb = null;

const databaseUrl = process.env.DATABASE_URL || '';

if (databaseUrl && (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://'))) {
  isPostgres = true;
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false }
  });
  console.log('📦 [Servidor] Conectado ao banco de dados PostgreSQL na nuvem.');
} else {
  const Database = require('better-sqlite3');
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  sqliteDb = new Database(path.join(dataDir, 'logistica.db'));
  sqliteDb.pragma('journal_mode = WAL');
  console.log('📁 [Servidor] Utilizando banco de dados local SQLite (data/logistica.db).');
}

// Inicialização das tabelas no servidor
async function initDb() {
  if (isPostgres) {
    try {
      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS settings (
          key VARCHAR(255) PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS orders (
          id SERIAL PRIMARY KEY,
          tracking_code VARCHAR(50) UNIQUE NOT NULL,
          customer_name VARCHAR(255) NOT NULL,
          customer_phone VARCHAR(50) NOT NULL,
          address TEXT NOT NULL,
          number VARCHAR(50),
          complement VARCHAR(100),
          neighborhood VARCHAR(100),
          city VARCHAR(100) NOT NULL,
          state VARCHAR(10) NOT NULL,
          cep VARCHAR(20) NOT NULL,
          items_description TEXT,
          status VARCHAR(50) NOT NULL DEFAULT 'Pedido recebido',
          created_at VARCHAR(50) NOT NULL,
          updated_at VARCHAR(50) NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tracking_checkpoints (
          id SERIAL PRIMARY KEY,
          order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
          status VARCHAR(50) NOT NULL,
          description TEXT NOT NULL,
          location VARCHAR(100) NOT NULL,
          timestamp VARCHAR(50) NOT NULL
        );
      `);

      for (const [key, value] of Object.entries(defaultSettings)) {
        await pgPool.query(
          'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
          [key, value]
        );
      }
      console.log('✅ [Servidor] Tabelas PostgreSQL inicializadas com sucesso.');
    } catch (err) {
      console.error('❌ [Servidor] Erro ao inicializar PostgreSQL:', err);
    }
  } else {
    try {
      sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tracking_code TEXT UNIQUE NOT NULL,
          customer_name TEXT NOT NULL,
          customer_phone TEXT NOT NULL,
          address TEXT NOT NULL,
          number TEXT,
          complement TEXT,
          neighborhood TEXT,
          city TEXT NOT NULL,
          state TEXT NOT NULL,
          cep TEXT NOT NULL,
          items_description TEXT,
          status TEXT NOT NULL DEFAULT 'Pedido recebido',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS tracking_checkpoints (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id INTEGER NOT NULL,
          status TEXT NOT NULL,
          description TEXT NOT NULL,
          location TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
        );
      `);

      const getStmt = sqliteDb.prepare('SELECT value FROM settings WHERE key = ?');
      const setStmt = sqliteDb.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
      for (const [key, value] of Object.entries(defaultSettings)) {
        if (!getStmt.get(key)) {
          setStmt.run(key, value);
        }
      }
    } catch (err) {
      console.error('❌ [Servidor] Erro ao inicializar SQLite:', err);
    }
  }
}

initDb();

const dbHelpers = {
  getDatabaseInfo() {
    return {
      type: isPostgres ? 'PostgreSQL (Nuvem)' : 'SQLite (Arquivo Local)',
      isCloud: isPostgres
    };
  },

  async getSetting(key) {
    if (isPostgres) {
      const res = await pgPool.query('SELECT value FROM settings WHERE key = $1', [key]);
      return res.rows[0] ? res.rows[0].value : defaultSettings[key] || null;
    } else {
      const row = sqliteDb.prepare('SELECT value FROM settings WHERE key = ?').get(key);
      return row ? row.value : defaultSettings[key] || null;
    }
  },

  async getAllSettings() {
    const config = { ...defaultSettings };
    if (isPostgres) {
      const res = await pgPool.query('SELECT key, value FROM settings');
      res.rows.forEach(r => { config[r.key] = r.value; });
    } else {
      const rows = sqliteDb.prepare('SELECT key, value FROM settings').all();
      rows.forEach(r => { config[r.key] = r.value; });
    }
    return config;
  },

  async setSetting(key, value) {
    if (isPostgres) {
      await pgPool.query(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
        [key, value]
      );
    } else {
      sqliteDb.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
    }
    return true;
  },

  async generateTrackingCode() {
    let code;
    let exists = true;
    while (exists) {
      const num = Math.floor(100000000 + Math.random() * 900000000);
      code = `GR${num}BR`;
      if (isPostgres) {
        const res = await pgPool.query('SELECT id FROM orders WHERE tracking_code = $1', [code]);
        exists = res.rows.length > 0;
      } else {
        const row = sqliteDb.prepare('SELECT id FROM orders WHERE tracking_code = ?').get(code);
        exists = !!row;
      }
    }
    return code;
  },

  async getAllOrders() {
    if (isPostgres) {
      const res = await pgPool.query(`
        SELECT o.*,
          (SELECT COUNT(*) FROM tracking_checkpoints WHERE order_id = o.id)::int as checkpoint_count,
          (SELECT MAX(timestamp) FROM tracking_checkpoints WHERE order_id = o.id) as last_update
        FROM orders o
        ORDER BY o.id DESC
      `);
      return res.rows;
    } else {
      return sqliteDb.prepare(`
        SELECT o.*,
          (SELECT COUNT(*) FROM tracking_checkpoints WHERE order_id = o.id) as checkpoint_count,
          (SELECT MAX(timestamp) FROM tracking_checkpoints WHERE order_id = o.id) as last_update
        FROM orders o
        ORDER BY o.id DESC
      `).all();
    }
  },

  async getOrderById(id) {
    if (isPostgres) {
      const orderRes = await pgPool.query('SELECT * FROM orders WHERE id = $1', [id]);
      if (orderRes.rows.length === 0) return null;
      const order = orderRes.rows[0];
      const cpRes = await pgPool.query('SELECT * FROM tracking_checkpoints WHERE order_id = $1 ORDER BY id ASC', [id]);
      order.checkpoints = cpRes.rows;
      return order;
    } else {
      const order = sqliteDb.prepare('SELECT * FROM orders WHERE id = ?').get(id);
      if (!order) return null;
      order.checkpoints = sqliteDb.prepare('SELECT * FROM tracking_checkpoints WHERE order_id = ? ORDER BY id ASC').all(id);
      return order;
    }
  },

  async getOrderByTrackingCode(code) {
    const cleanCode = (code || '').trim().toUpperCase();
    if (isPostgres) {
      const orderRes = await pgPool.query('SELECT * FROM orders WHERE UPPER(tracking_code) = $1', [cleanCode]);
      if (orderRes.rows.length === 0) return null;
      const order = orderRes.rows[0];
      const cpRes = await pgPool.query('SELECT * FROM tracking_checkpoints WHERE order_id = $1 ORDER BY id ASC', [order.id]);
      order.checkpoints = cpRes.rows;
      return order;
    } else {
      const order = sqliteDb.prepare('SELECT * FROM orders WHERE UPPER(tracking_code) = ?').get(cleanCode);
      if (!order) return null;
      order.checkpoints = sqliteDb.prepare('SELECT * FROM tracking_checkpoints WHERE order_id = ? ORDER BY id ASC').all(order.id);
      return order;
    }
  },

  async createOrder(orderData) {
    const tracking_code = orderData.tracking_code || await this.generateTrackingCode();
    const now = getBrasiliaTimestamp();

    if (isPostgres) {
      const res = await pgPool.query(`
        INSERT INTO orders (
          tracking_code, customer_name, customer_phone,
          address, number, complement, neighborhood, city, state, cep,
          items_description, status, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
        ) RETURNING *
      `, [
        tracking_code,
        orderData.customer_name,
        orderData.customer_phone || '',
        orderData.address || '',
        orderData.number || '',
        orderData.complement || '',
        orderData.neighborhood || '',
        orderData.city || 'Gravataí',
        orderData.state || 'RS',
        orderData.cep || '',
        orderData.items_description || 'Peças Automotivas',
        'Pedido recebido',
        now,
        now
      ]);

      const order = res.rows[0];
      await pgPool.query(`
        INSERT INTO tracking_checkpoints (order_id, status, description, location, timestamp)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        order.id,
        'Pedido recebido',
        'Pedido registrado no sistema e aguardando processamento.',
        `${order.city}/${order.state}`,
        now
      ]);

      return order;
    } else {
      const insertOrder = sqliteDb.prepare(`
        INSERT INTO orders (
          tracking_code, customer_name, customer_phone,
          address, number, complement, neighborhood, city, state, cep,
          items_description, status, created_at, updated_at
        ) VALUES (
          @tracking_code, @customer_name, @customer_phone,
          @address, @number, @complement, @neighborhood, @city, @state, @cep,
          @items_description, @status, @created_at, @updated_at
        )
      `);

      const insertCheckpoint = sqliteDb.prepare(`
        INSERT INTO tracking_checkpoints (order_id, status, description, location, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `);

      let orderId;
      const transaction = sqliteDb.transaction(() => {
        const info = insertOrder.run({
          tracking_code,
          customer_name: orderData.customer_name,
          customer_phone: orderData.customer_phone || '',
          address: orderData.address || '',
          number: orderData.number || '',
          complement: orderData.complement || '',
          neighborhood: orderData.neighborhood || '',
          city: orderData.city || 'Gravataí',
          state: orderData.state || 'RS',
          cep: orderData.cep || '',
          items_description: orderData.items_description || 'Peças Automotivas',
          status: 'Pedido recebido',
          created_at: now,
          updated_at: now
        });
        orderId = info.lastInsertRowid;
        insertCheckpoint.run(
          orderId,
          'Pedido recebido',
          'Pedido registrado no sistema e aguardando processamento.',
          `${orderData.city || 'Gravataí'}/${orderData.state || 'RS'}`,
          now
        );
      });

      transaction();
      return this.getOrderById(orderId);
    }
  },

  async addCheckpoint(orderId, status, description, location) {
    const now = getBrasiliaTimestamp();
    const desc = description || `Status atualizado para: ${status}`;
    const loc = location || 'Gravataí/RS';

    if (isPostgres) {
      await pgPool.query(`
        INSERT INTO tracking_checkpoints (order_id, status, description, location, timestamp)
        VALUES ($1, $2, $3, $4, $5)
      `, [orderId, status, desc, loc, now]);

      await pgPool.query(`
        UPDATE orders SET status = $1, updated_at = $2 WHERE id = $3
      `, [status, now, orderId]);
      return true;
    } else {
      const insertCheckpoint = sqliteDb.prepare(`
        INSERT INTO tracking_checkpoints (order_id, status, description, location, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `);

      const updateOrderStatus = sqliteDb.prepare(`
        UPDATE orders SET status = ?, updated_at = ? WHERE id = ?
      `);

      const transaction = sqliteDb.transaction(() => {
        insertCheckpoint.run(orderId, status, desc, loc, now);
        updateOrderStatus.run(status, now, orderId);
      });

      transaction();
      return true;
    }
  },

  async deleteOrder(id) {
    if (isPostgres) {
      await pgPool.query('DELETE FROM orders WHERE id = $1', [id]);
      return true;
    } else {
      sqliteDb.prepare('DELETE FROM orders WHERE id = ?').run(id);
      return true;
    }
  }
};

module.exports = { dbHelpers };
