const express = require('express');
const path = require('path');

const empenhosRouter = require('./routes/empenhos');
const anulacoesRouter = require('./routes/anulacoes');
const recebimentosRouter = require('./routes/recebimentos');
const notasCreditoRouter = require('./routes/notasCredito');
const comissoesRouter = require('./routes/comissoes');
const dashboardRouter = require('./routes/dashboard');
const cnpjRouter = require('./routes/cnpj');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use('/api/empenhos', empenhosRouter);
app.use('/api/anulacoes', anulacoesRouter);
app.use('/api/recebimentos', recebimentosRouter);
app.use('/api/notas-credito', notasCreditoRouter);
app.use('/api/comissoes', comissoesRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/cnpj', cnpjRouter);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
  console.log(`SisAprov rodando em http://localhost:${PORT}`);
});
