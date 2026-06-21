import express from 'express';
import cors from 'cors';

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);

app.use(cors());
app.use(express.json());

app.get('/api/status', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
