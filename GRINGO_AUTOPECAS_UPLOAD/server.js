const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const adminRoutes = require('./routes/admin');
const trackingRoutes = require('./routes/tracking');
const infoRoutes = require('./routes/info');
const productsRoutes = require('./routes/products');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Arquivos Estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Rotas da API
app.use('/api/admin', adminRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/info', infoRoutes);
app.use('/api/products', productsRoutes);

// Rotas de Páginas Amigáveis
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/rastreio', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'rastreio.html'));
});

app.get('/catalogo', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Fallback para SPA / Home
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`⚡ Gringo Autopeças - Sistema Online`);
  console.log(`🚀 Servidor rodando em: http://localhost:${PORT}`);
  console.log(`📦 Rastreio Público: http://localhost:${PORT}/rastreio`);
  console.log(`🔐 Painel Admin: http://localhost:${PORT}/admin`);
  console.log(`=======================================================`);
});
