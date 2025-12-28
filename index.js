// server.js - Multi-conexão WhatsApp

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const LOVABLE_WEBHOOK_URL = process.env.LOVABLE_WEBHOOK_URL;

// Armazena múltiplos clientes por sessionId
const sessions = new Map();

function createSession(sessionId) {
  if (sessions.has(sessionId)) {
    return sessions.get(sessionId);
  }

  const session = {
    client: null,
    isReady: false,
    qrCode: null,
    info: null
  };

  session.client = new Client({
    authStrategy: new LocalAuth({ clientId: sessionId }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    }
  });

  session.client.on('qr', async (qr) => {
    console.log(`📱 [${sessionId}] QR Code recebido`);
    session.qrCode = await qrcode.toDataURL(qr);
  });

  session.client.on('ready', () => {
    console.log(`✅ [${sessionId}] Conectado!`);
    session.isReady = true;
    session.qrCode = null;
    session.info = session.client.info;
  });

  session.client.on('disconnected', () => {
    console.log(`❌ [${sessionId}] Desconectado`);
    session.isReady = false;
    session.info = null;
  });

  session.client.on('message', async (msg) => {
    if (msg.from.includes('@g.us')) return;
    
    try {
      const response = await fetch(LOVABLE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'incoming_message',
          sessionId,
          data: {
            from: msg.from.replace('@c.us', ''),
            message: msg.body,
            timestamp: new Date().toISOString()
          }
        })
      });
      
      const result = await response.json();
      if (result.reply) await msg.reply(result.reply);
    } catch (error) {
      console.error(`❌ [${sessionId}] Webhook error:`, error.message);
    }
  });

  session.client.initialize();
  sessions.set(sessionId, session);
  return session;
}

// ==================== ROTAS ====================

// Criar/obter sessão
app.post('/session/:sessionId/start', (req, res) => {
  const { sessionId } = req.params;
  createSession(sessionId);
  res.json({ success: true, message: `Sessão ${sessionId} iniciada` });
});

// Status de uma sessão
app.get('/session/:sessionId/status', (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });
  
  res.json({
    ready: session.isReady,
    hasQrCode: !!session.qrCode,
    connectedNumber: session.info?.wid?.user || null
  });
});

// QR Code de uma sessão
app.get('/session/:sessionId/qr', (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });
  if (session.isReady) return res.json({ status: 'connected' });
  if (session.qrCode) return res.json({ status: 'pending', qrCode: session.qrCode });
  res.json({ status: 'waiting' });
});

// Enviar mensagem
app.post('/session/:sessionId/send', async (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session?.isReady) return res.status(503).json({ error: 'Não conectado' });
  
  const { to, message } = req.body;
  const chatId = `${to.replace(/\D/g, '')}@c.us`;
  
  try {
    await session.client.sendMessage(chatId, message);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Listar todas as sessões
app.get('/sessions', (req, res) => {
  const list = [];
  sessions.forEach((session, id) => {
    list.push({ id, ready: session.isReady, number: session.info?.wid?.user });
  });
  res.json(list);
});

// Encerrar sessão
app.delete('/session/:sessionId', async (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (session) {
    await session.client.destroy();
    sessions.delete(req.params.sessionId);
  }
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Multi-session server na porta ${PORT}`));
