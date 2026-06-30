import 'dotenv/config';
import express, { Request, Response } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { advisorRespond } from './api/advisorRespond';
import { getGuidanceCorpusStatus } from './retrieval/retrieveGuidance';
import { validateRuntimeEnvironment } from './config/runtimeEnv';

validateRuntimeEnvironment();

const app = express();
const PORT = Number.parseInt(process.env['PORT'] ?? '3000', 10);
const REQUEST_TIMEOUT_MS = 30000;

app.use(helmet());
app.use(express.json({ limit: '100kb' }));

app.disable('x-powered-by');

app.use((req: Request, res: Response, next) => {
  res.setTimeout(REQUEST_TIMEOUT_MS, () => {
    if (!res.headersSent) {
      res.status(408).json({ error: 'Request timeout', message: 'The request took too long to complete.' });
    }
  });
  next();
});

const advisorEndpointLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

app.get('/health', (_req: Request, res: Response) => {
  const guidanceStatus = getGuidanceCorpusStatus();
  res.json({
    status: 'ok',
    service: 'dutiva-advisor-engine',
    readiness: {
      guidance: guidanceStatus,
    },
  });
});

app.use('/api/advisor/respond', advisorEndpointLimiter);
app.post('/api/advisor/respond', advisorRespond);

app.listen(PORT, () => {
  console.log(`[dutiva-advisor-engine] Server running on port ${PORT}`);
});

export default app;
