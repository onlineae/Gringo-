const express = require('express');
const router = express.Router();
const { dbHelpers } = require('../database');

// Middleware de Autenticação Admin
function requireAdminAuth(req, res, next) {
  const authPassword = req.headers['x-admin-password'] || req.headers['authorization'];
  const expectedPassword = dbHelpers.getSetting('admin_password') || '4662';

  if (!authPassword || authPassword.replace('Bearer ', '').trim() !== expectedPassword) {
    return res.status(401).json({
      success: false,
      error: 'Acesso negado. Senha incorreta ou não fornecida.'
    });
  }
  next();
}

// Rota de Login / Validação de Senha
router.post('/login', (req, res) => {
  const { password } = req.body;
  const currentPassword = dbHelpers.getSetting('admin_password') || '4662';

  if (password === currentPassword) {
    return res.json({
      success: true,
      message: 'Autenticado com sucesso!',
      token: currentPassword // Pode ser usado no cabeçalho x-admin-password
    });
  } else {
    return res.status(401).json({
      success: false,
      error: 'Senha incorreta.'
    });
  }
});

// A partir daqui, todas as rotas exigem a senha de admin
router.use(requireAdminAuth);

// Listar todos os envios
router.get('/orders', (req, res) => {
  try {
    const orders = dbHelpers.getAllOrders();
    res.json({ success: true, orders });
  } catch (error) {
    console.error('Erro ao buscar pedidos:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar pedidos.' });
  }
});

// Cadastrar novo envio
router.post('/orders', (req, res) => {
  try {
    const { customer_name, customer_phone, address, number, complement, neighborhood, city, state, cep, items_description, tracking_code } = req.body;

    if (!customer_name || !address || !cep) {
      return res.status(400).json({
        success: false,
        error: 'Preencha os campos obrigatórios: Nome do Cliente, Endereço e CEP.'
      });
    }

    const newOrder = dbHelpers.createOrder({
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
      message: 'Envio cadastrado com sucesso!',
      order: newOrder
    });
  } catch (error) {
    console.error('Erro ao criar envio:', error);
    res.status(500).json({ success: false, error: 'Erro ao cadastrar envio no sistema.' });
  }
});

// Atualizar status e adicionar checkpoint de rastreio
router.put('/orders/:id/status', (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    const { status, description, location } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, error: 'O status é obrigatório.' });
    }

    const order = dbHelpers.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Pedido não encontrado.' });
    }

    dbHelpers.addCheckpoint(orderId, status, description, location);

    res.json({
      success: true,
      message: `Status atualizado para '${status}' com sucesso!`
    });
  } catch (error) {
    console.error('Erro ao atualizar status:', error);
    res.status(500).json({ success: false, error: 'Erro ao atualizar status do pedido.' });
  }
});

// Excluir envio
router.delete('/orders/:id', (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    const order = dbHelpers.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, error: 'Pedido não encontrado.' });
    }

    dbHelpers.deleteOrder(orderId);
    res.json({ success: true, message: 'Envio removido com sucesso.' });
  } catch (error) {
    console.error('Erro ao excluir pedido:', error);
    res.status(500).json({ success: false, error: 'Erro ao excluir envio.' });
  }
});

// Obter configurações do sistema
router.get('/settings', (req, res) => {
  try {
    const settings = dbHelpers.getAllSettings();
    // Ocultar a senha completa por segurança no GET geral se necessário, mas para o admin ele pode visualizar
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao obter configurações.' });
  }
});

// Atualizar configurações (ex: número de WhatsApp, nova senha, etc.)
router.put('/settings', (req, res) => {
  try {
    const { whatsapp_number, phone_landline, admin_password, address, city, state } = req.body;

    if (whatsapp_number !== undefined) dbHelpers.setSetting('whatsapp_number', whatsapp_number);
    if (phone_landline !== undefined) dbHelpers.setSetting('phone_landline', phone_landline);
    if (admin_password !== undefined && admin_password.trim().length > 0) {
      dbHelpers.setSetting('admin_password', admin_password.trim());
    }
    if (address !== undefined) dbHelpers.setSetting('address', address);
    if (city !== undefined) dbHelpers.setSetting('city', city);
    if (state !== undefined) dbHelpers.setSetting('state', state);

    res.json({
      success: true,
      message: 'Configurações atualizadas com sucesso!',
      settings: dbHelpers.getAllSettings()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao atualizar configurações.' });
  }
});

module.exports = router;
