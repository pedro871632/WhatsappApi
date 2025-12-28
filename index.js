// server.js - Multi-conexão WhatsApp (Remoção automática da memória)

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const LOVABLE_WEBHOOK_URL = "https://npowdgatpuqhgualeshq.supabase.co/functions/v1/whatsapp-webhook";

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
    webVersionCache: {
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1018919651-alpha.html',
    },
    puppeteer: {
      ...(process.env.PUPPETEER_EXECUTABLE_PATH && { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }),
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process'
      ]
    }
  });

  // --- Eventos do Cliente ---

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

  // Alteração solicitada: Remove da memória ao desconectar
  session.client.on('disconnected', async (reason) => {
    console.log(`❌ [${sessionId}] Desconectado:`, reason);
    
    try {
      // Encerra o processo do navegador
      await session.client.destroy();
    } catch (e) {
      console.error(`Erro ao destruir cliente [${sessionId}]:`, e.message);
    }
    
    // Remove do Map de sessões
    sessions.delete(sessionId);
    console.log(`🗑️ [${sessionId}] Sessão removida da memória.`);
  });

  session.client.on('message', async (msg) => {
    if (msg.from.includes('@g.us')) return;
    
    if (!LOVABLE_WEBHOOK_URL) return;
    
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
      if (result && result.reply) {
        await msg.reply(result.reply);
      }
    } catch (error) {
      console.error(`❌ [${sessionId}] Erro no Webhook:`, error.message);
    }
  });

  session.client.initialize().catch(error => {
    console.error(`❌ [${sessionId}] Falha ao inicializar:`, error.message);
    sessions.delete(sessionId);
  });

  sessions.set(sessionId, session);
  return session;
}

// ==================== ROTAS API ====================

app.post('/session/:sessionId/start', (req, res) => {
  const { sessionId } = req.params;
  createSession(sessionId);
  res.json({ success: true, message: `Sessão ${sessionId} inicializando...` });
});

app.get('/session/:sessionId/status', (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Sessão não ativa ou desconectada' });
  
  res.json({
    ready: session.isReady,
    hasQrCode: !!session.qrCode,
    connectedNumber: session.info?.wid?.user || null
  });
});

app.get('/session/:sessionId/qr', (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });
  if (session.isReady) return res.json({ status: 'connected' });
  if (session.qrCode) return res.json({ status: 'pending', qrCode: session.qrCode });
  res.json({ status: 'waiting' });
});

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

app.get('/sessions', (req, res) => {
  const list = [];
  sessions.forEach((session, id) => {
    list.push({ id, ready: session.isReady, number: session.info?.wid?.user });
  });
  res.json(list);
});

app.delete('/session/:sessionId', async (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (session) {
    await session.client.destroy();
    sessions.delete(req.params.sessionId);
  }
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server on port ${PORT}`))