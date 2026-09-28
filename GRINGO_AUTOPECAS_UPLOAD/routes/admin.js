const express = require('express');
const router = express.Router();
const { dbHelpers } = require('../database');

let cachedPassword = '4662';

// Middleware de Autenticação Admin
async function requireAdminAuth(req, res, next) {
  const authPassword = req.headers['x-admin-password'] || req.headers['authorization'];
  if (!authPassword) {
    return res.status(401).json({
      success: false,
      error: 'Acesso negado. Senha não fornecida.'
    });
  }

  const cleanAuth = authPassword.replace('Bearer ', '').trim();
  if (cleanAuth !== cachedPassword) {
    try {
      const currentDbPassword = await dbHelpers.getSetting('admin_password');
      if (currentDbPassword) cachedPassword = currentDbPassword;
    } catch (e) {}

    if (cleanAuth !== cachedPassword) {
      return res.status(401).json({
        success: false,
        error: 'Acesso negado. Senha incorreta.'
      });
    }
  }
  next();
}

// Rota de Login / Validação de Senha
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    let currentPassword = cachedPassword;
    try {
      const dbPwd = await dbHelpers.getSetting('admin_password');
      if (dbPwd) {
        currentPassword = dbPwd;
        cachedPassword = dbPwd;
      }
    } catch (e) {}

    if (password === currentPassword) {
      return res.json({
        success: true,
        message: 'Autenticado com sucesso!',
        token: currentPassword
      });
    } else {
      return res.status(401).json({
        success: false,
        error: 'Senha incorreta.'
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro no servidor de autenticação.' });
  }
});

// A partir daqui, todas as rotas exigem a senha de admin
router.use(requireAdminAuth);

// Listar todos os envios diretamente do servidor
router.get('/orders', async (req, res) => {
  try {
    const orders = await dbHelpers.getAllOrders();
    const info = dbHelpers.getDatabaseInfo();
    res.json({
      success: true,
      orders,
      database: info
    });
  } catch (error) {
    console.error('Erro ao buscar pedidos no servidor:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar pedidos no servidor central.' });
  }
});

// Cadastrar novo envio no servidor
router.post('/orders', async (req, res) => {
  try {
    const { customer_name, customer_phone, address, number, complement, neighborhood, city, state, cep, items_description, tracking_code } = req.body;

    if (!customer_name || !address || !cep) {
      return res.status(400).json({
        success: false,
        error: 'Preencha os campos obrigatórios: Nome do Cliente, Endereço e CEP.'
      });
    }

    const newOrder = await dbHelpers.createOrder({
      customer_name,
      customer_phone,
      address,
      number,
      complement,
      neighborhood,
      city: city || 'Gravataí',
      state: state || 'RS',
      cep,
      items_description: items_description || 'Peças Automotivas',
      tracking_code
    });

    res.status(201).json({
      success: true,
      message: 'Envio cadastrado com sucesso no servidor!',
      order: newOrder
    });
  } catch (error) {
    console.error('Erro ao criar envio no servidor:', error);
    res.status(500).json({ success: false, error: 'Erro ao cadastrar envio no banco do servidor.' });
  }
});

// Atualizar status e adicionar checkpoint de rastreio no servidor
router.put('/orders/:id/status', async (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    const { status, description, location } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, error: 'O status é obrigatório.' });
    }

    const order = await dbHelpers.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Pedido não encontrado.' });
    }

    await dbHelpers.addCheckpoint(orderId, status, description, location);

    res.json({
      success: true,
      message: `Status atualizado para '${status}' com sucesso no servidor!`
    });
  } catch (error) {
    console.error('Erro ao atualizar status no servidor:', error);
    res.status(500).json({ success: false, error: 'Erro ao atualizar status no servidor.' });
  }
});

// Excluir envio no servidor
router.delete('/orders/:id', async (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    const order = await dbHelpers.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Pedido não encontrado.' });
    }

    await dbHelpers.deleteOrder(orderId);
    res.json({ success: true, message: 'Envio removido com sucesso do servidor.' });
  } catch (error) {
    console.error('Erro ao excluir pedido no servidor:', error);
    res.status(500).json({ success: false, error: 'Erro ao excluir envio no servidor.' });
  }
});

// Obter configurações do sistema do servidor
router.get('/settings', async (req, res) => {
  try {
    const settings = await dbHelpers.getAllSettings();
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao obter configurações.' });
  }
});

// Atualizar configurações no servidor
router.put('/settings', async (req, res) => {
  try {
    const { whatsapp_number, phone_landline, admin_password, address, city, state } = req.body;

    if (whatsapp_number !== undefined) await dbHelpers.setSetting('whatsapp_number', whatsapp_number);
    if (phone_landline !== undefined) await dbHelpers.setSetting('phone_landline', phone_landline);
    if (admin_password !== undefined && admin_password.trim().length > 0) {
      await dbHelpers.setSetting('admin_password', admin_password.trim());
      cachedPassword = admin_password.trim();
    }
    if (address !== undefined) await dbHelpers.setSetting('address', address);
    if (city !== undefined) await dbHelpers.setSetting('city', city);
    if (state !== undefined) await dbHelpers.setSetting('state', state);

    res.json({
      success: true,
      message: 'Configurações atualizadas com sucesso no servidor!',
      settings: await dbHelpers.getAllSettings()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao atualizar configurações no servidor.' });
  }
});

module.exports = router;
