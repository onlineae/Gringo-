const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Garante que o diretório data exista
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'logistica.db'));

// Otimizações de performance do SQLite
db.pragma('journal_mode = WAL');

// Inicialização das tabelas
db.exec(`
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

// Inserir configurações padrão se não existirem
const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSettingStmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

const defaultSettings = {
  admin_password: '4662',
  whatsapp_number: '51993687877',
  phone_landline: '5130475595',
  address: 'Rua Luciana de Abreu, 540 - Pda. 73 Frente ao Colégio Ponche Verde',
  city: 'Gravataí',
  state: 'RS',
  company_name: 'Gringo Autopeças'
};

for (const [key, value] of Object.entries(defaultSettings)) {
  const existing = getSettingStmt.get(key);
  if (!existing) {
    setSettingStmt.run(key, value);
  }
}

// Função que retorna a data e hora oficial de Brasília (America/Sao_Paulo, UTC-3)
function getBrasiliaTimestamp() {
  const d = new Date();
  return d.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

// Helpers para operações no banco
const dbHelpers = {
  // Configurações
  getSetting(key) {
    const row = getSettingStmt.get(key);
    return row ? row.value : null;
  },
  getAllSettings() {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const config = {};
    rows.forEach(r => { config[r.key] = r.value; });
    return config;
  },
  setSetting(key, value) {
    setSettingStmt.run(key, value);
  },

  // Gerador de código de rastreio único (Formato GR + 9 números + BR)
  generateTrackingCode() {
    let code;
    let exists;
    const checkStmt = db.prepare('SELECT id FROM orders WHERE tracking_code = ?');
    do {
      const randomNum = Math.floor(100000000 + Math.random() * 900000000);
      code = `GR${randomNum}BR`;
      exists = checkStmt.get(code);
    } while (exists);
    return code;
  },

  // Pedidos
  createOrder(data) {
    const trackingCode = data.tracking_code || this.generateTrackingCode();
    const nowBrasilia = getBrasiliaTimestamp();

    const insertOrder = db.prepare(`
      INSERT INTO orders (
        tracking_code, customer_name, customer_phone,
        address, number, complement, neighborhood, city, state, cep,
        items_description, status, created_at, updated_at
      ) VALUES (
        @tracking_code, @customer_name, @customer_phone,
        @address, @number, @complement, @neighborhood, @city, @state, @cep,
        @items_description, 'Pedido recebido', @created_at, @updated_at
      )
    `);

    const info = insertOrder.run({
      tracking_code: trackingCode,
      customer_name: data.customer_name,
      customer_phone: data.customer_phone || '',
      address: data.address || '',
      number: data.number || '',
      complement: data.complement || '',
      neighborhood: data.neighborhood || '',
      city: data.city || 'Gravataí',
      state: data.state || 'RS',
      cep: data.cep || '',
      items_description: data.items_description || 'Peças Automotivas',
      created_at: nowBrasilia,
      updated_at: nowBrasilia
    });

    const orderId = info.lastInsertRowid;

    // Primeiro checkpoint automático: Pedido recebido no horário exato de Brasília
    db.prepare(`
      INSERT INTO tracking_checkpoints (order_id, status, description, location, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      orderId,
      'Pedido recebido',
      'Pedido cadastrado e confirmado no sistema logístico.',
      'Gravataí/RS',
      nowBrasilia
    );

    return { id: orderId, tracking_code: trackingCode };
  },

  getAllOrders() {
    return db.prepare(`
      SELECT o.*, 
        (SELECT COUNT(*) FROM tracking_checkpoints WHERE order_id = o.id) as checkpoint_count,
        (SELECT timestamp FROM tracking_checkpoints WHERE order_id = o.id ORDER BY id DESC LIMIT 1) as last_update
      FROM orders o
      ORDER BY o.id DESC
    `).all();
  },

  getOrderById(id) {
    return db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  },

  getOrderByTrackingCode(code) {
    const sanitizedCode = (code || '').trim().toUpperCase();
    const order = db.prepare('SELECT * FROM orders WHERE tracking_code = ?').get(sanitizedCode);
    if (!order) return null;

    const checkpoints = db.prepare(`
      SELECT * FROM tracking_checkpoints 
      WHERE order_id = ? 
      ORDER BY timestamp ASC, id ASC
    `).all(order.id);

    return {
      tracking_code: order.tracking_code,
      status: order.status,
      customer_name: order.customer_name,
      city: order.city,
      state: order.state,
      created_at: order.created_at,
      updated_at: order.updated_at,
      checkpoints: checkpoints
    };
  },

  addCheckpoint(orderId, status, description, location) {
    const loc = location || 'Centro de Distribuição - Gravataí/RS';
    const desc = description || `Status atualizado para: ${status}`;
    const nowBrasilia = getBrasiliaTimestamp();

    const insertCheckpoint = db.prepare(`
      INSERT INTO tracking_checkpoints (order_id, status, description, location, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);

    const updateOrderStatus = db.prepare(`
      UPDATE orders 
      SET status = ?, updated_at = ?
      WHERE id = ?
    `);

    const transaction = db.transaction(() => {
      insertCheckpoint.run(orderId, status, desc, loc, nowBrasilia);
      updateOrderStatus.run(status, nowBrasilia, orderId);
    });

    transaction();
    return true;
  },

  deleteOrder(id) {
    return db.prepare('DELETE FROM orders WHERE id = ?').run(id);
  }
};

module.exports = { db, dbHelpers };
