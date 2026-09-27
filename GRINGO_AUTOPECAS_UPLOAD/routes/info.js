const express = require('express');
const router = express.Router();
const { dbHelpers } = require('../database');

// Informações públicas da loja (contato, endereço, WhatsApp configurado)
router.get('/store-info', (req, res) => {
  try {
    const config = dbHelpers.getAllSettings();
    res.json({
      success: true,
      company_name: config.company_name || 'Gringo Autopeças',
      whatsapp_number: config.whatsapp_number || '51993687877',
      phone_landline: config.phone_landline || '5130475595',
      address: config.address || 'Rua Luciana de Abreu, 540 - Pda. 73 Frente ao Colégio Ponche Verde',
      city: config.city || 'Gravataí',
      state: config.state || 'RS'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao obter informações da loja.' });
  }
});

module.exports = router;
