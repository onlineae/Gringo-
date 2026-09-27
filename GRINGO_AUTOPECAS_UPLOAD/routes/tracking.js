const express = require('express');
const router = express.Router();
const { dbHelpers } = require('../database');

// Rastreamento público
router.get('/:code', (req, res) => {
  try {
    const code = req.params.code;
    if (!code || code.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Código de rastreamento não fornecido.' });
    }

    const orderData = dbHelpers.getOrderByTrackingCode(code);

    if (!orderData) {
      return res.status(404).json({
        success: false,
        error: 'Código de rastreamento não localizado. Verifique os dígitos e tente novamente.'
      });
    }

    // Retorna apenas dados públicos seguros (sem expor endereço residencial completo do cliente na busca pública)
    res.json({
      success: true,
      data: {
        tracking_code: orderData.tracking_code,
        status: orderData.status,
        destination: `${orderData.city} / ${orderData.state}`,
        created_at: orderData.created_at,
        updated_at: orderData.updated_at,
        checkpoints: orderData.checkpoints
      }
    });
  } catch (error) {
    console.error('Erro na consulta de rastreio:', error);
    res.status(500).json({ success: false, error: 'Erro interno ao consultar rastreio.' });
  }
});

module.exports = router;
