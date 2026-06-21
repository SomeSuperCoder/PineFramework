import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { OHLCVCache } from './cache/ohlcv-cache.js';
import { createOHLCVRouter } from './routes/ohlcv.js';
import { executeRouter } from './routes/execute.js';
import { symbolsRouter } from './routes/symbols.js';
import { statusRouter } from './routes/status.js';
import { createWSGateway } from './ws/gateway.js';

const app = express();
const server = createServer(app);
const PORT = parseInt(process.env.PORT || '8080', 10);

const cache = new OHLCVCache(100, 60_000);

app.use(cors());
app.use(express.json());

app.use('/api', createOHLCVRouter(cache));
app.use('/api', executeRouter);
app.use('/api', symbolsRouter);
app.use('/api', statusRouter);

createWSGateway(server, cache);

server.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/ws`);
});
