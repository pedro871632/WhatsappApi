// server.js - Multi-conexão WhatsApp com suporte a áudio

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// ==================== CONFIGURAÇÃO ====================

const LOVABLE_WEBHOOK_URL = "https://npowdgatpuqhgualeshq.supabase.co/functions/v1/whatsapp-webhook";

// Limpa todos os dados de autenticação ao iniciar
const authBasePath = '.wwebjs_auth';
if (fs.existsSync(authBasePath)) {
  fs.rmSync(authBasePath, { recursive: true, force: true });
  console.log('🧹 Dados de autenticação removidos.');
}

// ==================== GERENCIADOR DE SESSÕES ====================

const sessions = new Map();

async function processIncomingMessage(sessionId, msg) {
  // Ignora grupos
  if (msg.from.includes('@g.us')) return;
  if (!LOVABLE_WEBHOOK_URL) return;

  const fromNumber = msg.from.replace('@c.us', '');
  
  // Prepara dados base da mensagem
  let messageData = {
    from: fromNumber,
    message: msg.body || '',
    timestamp: new Date().toISOString(),
    messageType: 'text'
  };

  // Processa áudio (ptt = push-to-talk / audio = áudio normal)
  if (msg.type === 'ptt' || msg.type === 'audio') {
    try {
      console.log(`🎤 [${sessionId}] Baixando áudio de ${fromNumber}...`);
      const media = await msg.downloadMedia();
      
      if (media?.data) {
        messageData = {
          from: fromNumber,
          message: '',
          timestamp: new Date().toISOString(),
          messageType: 'audio',
          audioData: media.data,
          mimeType: media.mimetype || 'audio/ogg'
        };
        console.log(`✅ [${sessionId}] Áudio: ${media.mimetype}, ${Math.round(media.data.length / 1024)}KB`);
      } else {
        console.error(`❌ [${sessionId}] Falha ao baixar áudio`);
        messageData.message = '[Áudio não processado]';
      }
    } catch (error) {
      console.error(`❌ [${sessionId}] Erro no áudio:`, error.message);
      messageData.message = '[Áudio não processado]';
    }
  }

  // Envia para webhook
  try {
    const response = await fetch(LOVABLE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'incoming_message',
        sessionId,
        data: messageData
      })
    });
    
    const result = await response.json();
    if (result?.reply) {
      await msg.reply(result.reply);
    }
  } catch (error) {
    console.error(`❌ [${sessionId}] Erro webhook:`, error.message);
  }
}

function createSession(sessionId) {
  if (sessions.has(sessionId)) {
    return sessions.get(sessionId);
  }

  // Limpa auth anterior
  const authPath = `.wwebjs_auth/${sessionId}`;
  if (fs.existsSync(authPath)) {
    fs.rmSync(authPath, { recursive: true, force: true });
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

  // Eventos
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

  session.client.on('disconnected', async (reason) => {
    console.log(`❌ [${sessionId}] Desconectado:`, reason);
    try {
      await session.client.destroy();
    } catch (e) {
      console.error(`Erro ao destruir [${sessionId}]:`, e.message);
    }
    sessions.delete(sessionId);
    console.log(`🗑️ [${sessionId}] Removido da memória`);
  });

  session.client.on('message', (msg) => processIncomingMessage(sessionId, msg));

  session.client.initialize().catch(error => {
    console.error(`❌ [${sessionId}] Falha init:`, error.message);
    sessions.delete(sessionId);
  });

  sessions.set(sessionId, session);
  return session;
}

// ==================== ROTAS API ====================

app.post('/session/:sessionId/start', (req, res) => {
  createSession(req.params.sessionId);
  res.json({ success: true, message: `Sessão inicializando...` });
});

app.get('/session/:sessionId/status', (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Sessão não ativa' });
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
  const list = Array.from(sessions.entries()).map(([id, s]) => ({
    id,
    ready: s.isReady,
    number: s.info?.wid?.user
  }));
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

// ==================== INICIALIZAÇÃO ====================

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server on port ${PORT}`));
