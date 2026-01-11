import express from 'express';
import cors from 'cors';
import TelegramBot from 'node-telegram-bot-api';

const app = express();

// CORS muy permisivo (necesario para pruebas locales/file://)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// Variables de entorno (Render)
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SECRET_PATH = process.env.SECRET_PATH || 'x7k9p2m-q8z-send-v3';

if (!TELEGRAM_TOKEN || !CHAT_ID) {
  console.error('Faltan TELEGRAM_TOKEN o TELEGRAM_CHAT_ID en variables de entorno');
  process.exit(1);
}

// Bot en modo polling
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Almacenamiento temporal de callbacks recibidos
// transactionId → callback_data completa
const pendingCallbacks = new Map();

bot.on('callback_query', async (query) => {
  try {
    const data = query.data;
    const txIdMatch = data.match(/:([^:]+)$/);
    
    if (txIdMatch) {
      const txId = txIdMatch[1];
      pendingCallbacks.set(txId, data);

      console.log(`[CALLBACK] Recibido para ${txId}: ${data}`);

      // Responder al callback (quita el loading en Telegram)
      await bot.answerCallbackQuery(query.id);

      // Opcional pero recomendado: quitar los botones
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
        }
      ).catch(() => {}); // ignorar error si ya se quitaron
    }
  } catch (err) {
    console.error('Error procesando callback_query:', err);
  }
});

// Ruta para enviar el mensaje inicial con botones
app.post(`/${SECRET_PATH}`, async (req, res) => {
  try {
    const { text, reply_markup, parse_mode = 'HTML' } = req.body;

    if (!text) {
      return res.status(400).json({ ok: false, error: 'Falta texto del mensaje' });
    }

    const sentMessage = await bot.sendMessage(CHAT_ID, text, {
      reply_markup: reply_markup ? JSON.parse(reply_markup) : undefined,
      parse_mode,
    });

    res.json({ ok: true, result: sentMessage });
  } catch (error) {
    console.error('Error enviando mensaje inicial:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Ruta que el cliente consulta (polling corto)
app.get('/check/:transactionId', (req, res) => {
  const txId = req.params.transactionId;
  const callbackData = pendingCallbacks.get(txId);

  if (callbackData) {
    pendingCallbacks.delete(txId); // limpiar para no repetir
    res.json({ ok: true, callback_data: callbackData });
  } else {
    res.json({ ok: false });
  }
});

// Health check básico para Render
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
  console.log(`Endpoint envío:   /${SECRET_PATH}`);
  console.log(`Polling activo - esperando callbacks...`);
});
