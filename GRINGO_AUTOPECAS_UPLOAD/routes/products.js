const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const productsFilePath = path.join(__dirname, '..', 'public', 'products.json');

// Obter todos os produtos e categorias
router.get('/', (req, res) => {
  try {
    if (fs.existsSync(productsFilePath)) {
      const data = fs.readFileSync(productsFilePath, 'utf8');
      return res.json(JSON.parse(data));
    }
    res.status(404).json({ success: false, error: 'Catálogo não encontrado.' });
  } catch (err) {
    console.error('Erro ao ler produtos:', err);
    res.status(500).json({ success: false, error: 'Erro ao carregar catálogo.' });
  }
});

// Obter produto específico por ID
router.get('/:id', (req, res) => {
  try {
    if (fs.existsSync(productsFilePath)) {
      const data = JSON.parse(fs.readFileSync(productsFilePath, 'utf8'));
      const product = data.products.find(p => p.id === req.params.id);
      if (product) {
        return res.json({ success: true, product });
      }
      return res.status(404).json({ success: false, error: 'Produto não encontrado.' });
    }
    res.status(404).json({ success: false, error: 'Catálogo não encontrado.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erro ao buscar produto.' });
  }
});

module.exports = router;
