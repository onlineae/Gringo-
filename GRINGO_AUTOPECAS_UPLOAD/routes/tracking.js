const express = require('express');
const router = express.Router();
const { dbHelpers } = require('../database');

// Rastreamento público (consulta direta no servidor)
router.get('/:code', async (req, res) => {
  try {
    const code = req.params.code;
    if (!code || code.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Código de rastreamento não fornecido.' });
    }

    const orderData = await dbHelpers.getOrderByTrackingCode(code);

    if (!orderData) {
      return res.status(404).json({
        success: false,
        error: 'Código de rastreamento não localizado no sistema. Verifique os dígitos e tente novamente.'
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
    console.error('Erro na consulta de rastreio no servidor:', error);
    res.status(500).json({ success: false, error: 'Erro interno ao consultar rastreio no servidor.' });
  }
});

module.exports = router;
