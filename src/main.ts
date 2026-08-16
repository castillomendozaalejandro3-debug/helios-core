/**
 * main.ts - Punto de entrada principal de Helios Core
 * Orquestador Frugal de Recursos - v2.2.0
 * "Piensa, decide, actua, cobra y mejora - sin desperdiciar un centavo"
 *
 * CHANGELOG v2.2.0:
 * - Logger estructurado con niveles (DEBUG/INFO/WARN/ERROR/FATAL)
 * - Request ID middleware para trazabilidad
 * - AsyncHandler en todos los endpoints async
 * - Error handler global con formato JSON
 *
 * CHANGELOG v2.1.0:
 * - Integrado BudgetManager con endpoints API completos
 * - Integrado CloneCommunicator para mensajeria entre clones
 * - Integrado CAPTCHASolver en navegacion RPA
 * - Integrado TokenEstimator con LLMProvider para pre-estimacion
 * - Fix: Eliminada duplicacion de GracefulShutdown hooks
 */

import { configManager } from './config/ConfigManager.js';
import { systemReadiness } from './core/SystemReadiness.js';
import { logger } from './core/Logger.js';
import { memoryEngine } from './memory/MemoryEngine.js';
import { decisionEngine, DecisionLevel } from './decision/DecisionEngine.js';
import { financialEngine } from './economy/FinancialAutonomyEngine.js';
import { safeguards, AutonomyLevel } from './safeguards/Safeguards.js';
import { healthDashboard } from './safeguards/HealthDashboard.js';
import { agentFactory } from './agents/AgentFactory.js';
import { agentOrchestrator } from './agents/AgentOrchestrator.js';
import { browserAgent } from './integrations/BrowserAgent.js';
import { evolutionEngine } from './architecture/ArchitectureEvolutionEngine.js';
import { selfRefactorer } from './architecture/SelfRefactorer.js';
import { resourceOptimizer } from './architecture/ResourceOptimizer.js';
import { moduleGenerator } from './architecture/ModuleGenerator.js';
import { revenueLoop } from './core/AutonomousRevenueLoop.js';
import { personalityCore } from './personality/PersonalityCore.js';
import { rewardSystem } from './learning/RewardSystem.js';
import { metaLearningEngine } from './learning/MetaLearningEngine.js';
import { creativityEngine, CreativityMode } from './creativity/CreativityEngine.js';
import { ragWorkflowEngine } from './integrations/RAGWorkflowEngine.js';
import { crawlAgent } from './integrations/CrawlAgent.js';
import { revenueEngine } from './integrations/RevenueEngine.js';

import { metaCognitionEngine } from './metacognition/MetaCognitionEngine.js';
import { costBenefitAnalyzer } from './metacognition/CostBenefitAnalyzer.js';
import { cloneFactory, CloneRole } from './clones/CloneFactory.js';
import { cloneCommunicator } from './clones/CloneCommunicator.js';
import { teamFormationEngine } from './teams/TeamFormationEngine.js';
import { frugalToolKit, ToolLevel } from './frugality/FrugalToolKit.js';
import { freeAPIDiscovery } from './frugality/FreeAPIDiscovery.js';
import { frugalLedger, TransactionType } from './frugality/FrugalLedger.js';
import { rpaBrowser } from './integrations/RPABrowser.js';
import { integratedWorkflows } from './workflows/IntegratedWorkflows.js';
import { resourceDecisionTree } from './decision/ResourceDecisionTree.js';
import { systemMetrics } from './metrics/SystemMetrics.js';

import { gracefulShutdown } from './core/GracefulShutdown.js';
import { budgetManager } from './economy/BudgetManager.js';
import { captchaSolver } from './integrations/CAPTCHASolver.js';
import { tokenEstimator } from './llm/TokenEstimator.js';
import { llmProvider } from './llm/LLMProvider.js';

import express from 'express';
import { WebSocketServer } from 'ws';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import compression from 'compression';

const app = express();

app.use(helmet());
app.use(compression());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(limiter);

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many requests on sensitive endpoint.' },
});

app.use(express.json({ limit: '10mb' }));

// [v2.2] Request ID para trazabilidad
app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
  (req as any).id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  next();
});

function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token as string;
  if (!token || token !== configManager.config.HELIOS_GATEWAY_TOKEN) {
    res.status(401).json({ error: 'Unauthorized - Invalid or missing token' });
    return;
  }
  next();
}

// [v2.2] Async handler: envuelve handlers async para atrapar rejects automaticamente
function asyncHandler(fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<any>) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

async function bootstrap(): Promise<void> {
  logger.info('============================================================');
  logger.info('  HELIOS CORE v2.2.0 - ORQUESTADOR FRUGAL DE RECURSOS');
  logger.info('  Entidad de Software Autonoma');
  logger.info('  "Piensa, decide, actua, cobra y mejora"');
  logger.info('============================================================');

  const { ready } = await systemReadiness.runAll();
  if (!ready) {
    logger.error('Helios no puede arrancar - checks fallidos');
    process.exit(1);
  }

  await memoryEngine.init();
  await browserAgent.init();
  await rpaBrowser.init();

  setupGateway();
  setupWebSocket();
  setupEventListeners();
  startAutonomousLoop();
  registerShutdownHooks();

  logger.info(`Helios v2.2.0 operativo en http://${configManager.config.HELIOS_GATEWAY_HOST}:${configManager.config.HELIOS_GATEWAY_PORT}`);
  logger.info(`WebSocket en ws://${configManager.config.HELIOS_GATEWAY_HOST}:3001`);
  logger.info(`Balance inicial: $${financialEngine.getFinancialReport().balance}`);
  logger.info(`Autonomia: Nivel ${configManager.autonomyLevel} (${getAutonomyLabel(configManager.autonomyLevel)})`);
  logger.info(`Safeguards: ${safeguards.isKillSwitchActive() ? 'KILL SWITCH ACTIVO' : 'Protegido'}`);
  logger.info(`Frugalidad: ${(frugalToolKit.getFrugalMetrics().frugalRatio * 100).toFixed(1)}% herramientas gratuitas`);
  logger.info(`BudgetManager: ${budgetManager.getStats().totalBudgets} presupuestos activos`);
}

function getAutonomyLabel(level: number): string {
  const labels = ['Aprobacion Total', 'Notificar', 'Automatico con Excepciones', 'Independiente', 'Total Autonomia'];
  return labels[level] || 'Desconocido';
}

function setupGateway(): void {
  app.get('/health', (_req, res) => {
    const health = healthDashboard.getHealth();
    res.status(health.healthy ? 200 : 503).json(health);
  });

  app.get('/status', (_req, res) => {
    res.json(healthDashboard.getStatus());
  });

  app.post('/kill-switch', strictLimiter, (req, res) => {
    const { reason } = req.body;
    safeguards.triggerKillSwitch(reason || 'manual-request', { reason, by: req.ip });
    res.json({ ok: true, reason });
  });

  app.post('/kill-switch/reset', strictLimiter, (req, res) => {
    const { by } = req.body;
    safeguards.resetKillSwitch(by || 'human');
    res.json({ ok: true });
  });

  app.use(authMiddleware);

  app.get('/audit', (req, res) => {
    const { module, since, limit } = req.query as { module?: string; since?: string; limit?: string };
    const result = safeguards.getAuditLog({ module, since });
    const maxEntries = limit ? parseInt(limit) : 100;
    res.json({
      entries: result.entries.slice(0, maxEntries),
      total: result.total,
      filters: { module, since },
    });
  });

  app.get('/financial', (_req, res) => {
    res.json({
      legacy: financialEngine.getFinancialReport(),
      frugal: frugalLedger.getStats(),
      budget: budgetManager.getStats(),
      report: frugalLedger.generateDailyReport(),
    });
  });

  app.get('/ledger', (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const type = req.query.type as string | undefined;
    res.json({
      legacy: financialEngine.getLedger(limit),
      frugal: frugalLedger.getTransactions(limit, type as any),
      balance: financialEngine.getFinancialReport().balance,
    });
  });

  app.post('/ledger/income', asyncHandler(async (req, res) => {
    const { amount, category, subcategory, entity, ...options } = req.body;
    await frugalLedger.recordIncome(amount, category, subcategory, entity, options);
    res.json({ ok: true, balance: frugalLedger.getBalance() });
  }));

  app.post('/ledger/expense', asyncHandler(async (req, res) => {
    const { amount, category, subcategory, entity, ...options } = req.body;
    const result = await frugalLedger.recordExpense(amount, category, subcategory, entity, options);
    res.status(result.approved ? 200 : 403).json(result);
  }));

  app.get('/ledger/report', (_req, res) => {
    res.json(frugalLedger.generateDailyReport());
  });

  app.get('/budgets', (_req, res) => {
    res.json({
      budgets: budgetManager.getAllBudgets(),
      stats: budgetManager.getStats(),
    });
  });

  app.get('/budget/:ownerType/:ownerId', (req, res) => {
    const budget = budgetManager.getBudget(req.params.ownerId, req.params.ownerType);
    if (!budget) {
      res.status(404).json({ error: 'Presupuesto no encontrado' });
      return;
    }
    res.json(budget);
  });

  app.post('/budget/create', (req, res) => {
    const { ownerId, ownerType, total, options } = req.body;
    try {
      const budget = budgetManager.createBudget(ownerId, ownerType, total, options);
      res.json({ ok: true, budget });
    } catch (err) {
      res.status(400).json({ ok: false, error: (err as Error).message });
    }
  });

  app.post('/budget/spend', asyncHandler(async (req, res) => {
    const { ownerId, ownerType, amount, description } = req.body;
    const result = await budgetManager.spend(ownerId, ownerType, amount, description);
    res.status(result.allowed ? 200 : 403).json(result);
  }));

  app.post('/budget/check', (req, res) => {
    const { ownerId, ownerType, amount } = req.body;
    const result = budgetManager.canSpend(ownerId, ownerType, amount);
    res.json(result);
  });

  app.post('/budget/release', (req, res) => {
    const { ownerId, ownerType } = req.body;
    const result = budgetManager.releaseBudget(ownerId, ownerType);
    res.json(result);
  });

  app.post('/budget/add', (req, res) => {
    const { ownerId, ownerType, amount } = req.body;
    const ok = budgetManager.addToBudget(ownerId, ownerType, amount);
    res.json({ ok });
  });

  app.get('/decisions', (_req, res) => {
    res.json({
      stats: decisionEngine.getStats(),
      pending: decisionEngine.getPendingDecisions(),
    });
  });

  app.get('/decisions/history', (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    res.json(decisionEngine.getDecisionHistory(limit));
  });

  app.post('/decision/:id', (req, res) => {
    try {
      const { approved, notes } = req.body;
      decisionEngine.humanApprove(req.params.id, approved, notes);
      res.json({ ok: true, decisionId: req.params.id, approved });
    } catch (err) {
      res.status(400).json({ ok: false, error: (err as Error).message });
    }
  });

  app.post('/decide', (req, res) => {
    const decision = decisionEngine.decide(req.body);
    res.json(decision);
  });

  app.get('/agents', (_req, res) => {
    res.json({
      agents: agentFactory.listAgents(),
      stats: agentFactory.getStats(),
    });
  });

  app.post('/agents/create', (req, res) => {
    try {
      const { name, type, ...options } = req.body;
      const spec = agentFactory.createAgent(name, type, options);
      const started = agentFactory.startAgent(spec);
      res.json({ ok: started, agent: spec });
    } catch (err) {
      res.status(400).json({ ok: false, error: (err as Error).message });
    }
  });

  app.post('/agents/:id/stop', (req, res) => {
    const ok = agentFactory.stopAgent(req.params.id);
    res.json({ ok });
  });

  app.post('/agents/:id/task', (req, res) => {
    const { type, priority, payload, requiredCapabilities } = req.body;
    const taskId = agentOrchestrator.submitTask({
      type,
      priority: priority || 1,
      payload,
      requiredCapabilities: requiredCapabilities || [],
    });
    res.json({ ok: true, taskId });
  });

  app.get('/agents/queue', (_req, res) => {
    res.json(agentOrchestrator.getQueueStatus());
  });

  app.get('/personality', (_req, res) => {
    res.json(personalityCore.getTraits());
  });

  app.get('/personality/stats', (_req, res) => {
    res.json(personalityCore.getStats());
  });

  app.post('/personality/experience', (req, res) => {
    const { context, outcome } = req.body;
    personalityCore.recordExperience(context, outcome);
    res.json({ ok: true, traits: personalityCore.getTraits() });
  });

  app.get('/creativity/:problem', (req, res) => {
    const { problem } = req.params;
    const { mode = 'divergent' } = req.query;
    const modeEnum = mode === 'convergent'
      ? CreativityMode.CONVERGENT
      : mode === 'lateral'
        ? CreativityMode.LATERAL
        : CreativityMode.DIVERGENT;
    res.json({
      problem,
      mode,
      solutions: creativityEngine.solve(problem, modeEnum),
    });
  });

  app.get('/memory', (_req, res) => {
    res.json(memoryEngine.getStats());
  });

  app.get('/memory/:type', (req, res) => {
    const { type } = req.params;
    const { query, limit } = req.query;
    memoryEngine.retrieve(type as any, query as string | undefined, limit ? parseInt(limit as string) : 10)
      .then(entries => res.json({ type, entries }))
      .catch(err => res.status(400).json({ error: err.message }));
  });

  app.post('/memory', (req, res) => {
    const { type, content, options } = req.body;
    memoryEngine.store(type, content, options)
      .then(id => res.json({ ok: true, id }))
      .catch(err => res.status(400).json({ error: err.message }));
  });

  app.get('/memory/search/:query', (req, res) => {
    const { query } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;
    memoryEngine.searchSemantic(query, limit)
      .then(results => res.json({ query, results }))
      .catch(err => res.status(400).json({ error: err.message }));
  });

  app.get('/rewards', (_req, res) => {
    res.json(rewardSystem.getStats());
  });

  app.get('/rewards/best', (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;
    res.json(rewardSystem.getBestAgents(limit));
  });

  app.get('/meta-learning', (_req, res) => {
    res.json(metaLearningEngine.getParameters());
  });

  app.get('/refactor', (_req, res) => {
    res.json({ report: selfRefactorer.generateRefactorPlan() });
  });

  app.get('/evolution', (_req, res) => {
    res.json(evolutionEngine.getHealthReport());
  });

  app.get('/optimize', (_req, res) => {
    resourceOptimizer.detectMemoryLeak();
    res.json(resourceOptimizer.getStats());
  });

  app.post('/module-generator', (req, res) => {
    const { name, layer, description, exports } = req.body;
    const path = moduleGenerator.generate({ name, layer, description, exports });
    res.json({ ok: true, path });
  });

  app.get('/browser/sessions', (_req, res) => {
    res.json(browserAgent.getSessions());
  });

  app.post('/browser/navigate', asyncHandler(async (req, res) => {
    const { url } = req.body;
    const result = await browserAgent.navigate(url);
    res.json(result);
  }));

  app.post('/browser/search', asyncHandler(async (req, res) => {
    const { query, engine = 'duckduckgo' } = req.body;
    const results = await browserAgent.search(query, engine as any);
    res.json({ query, results });
  }));

  app.get('/rpa/sessions', (_req, res) => {
    res.json(rpaBrowser.getSessions());
  });

  app.post('/rpa/navigate', asyncHandler(async (req, res) => {
    const { url, handleCaptcha = true } = req.body;
    let result = await rpaBrowser.navigate(url);
    if (handleCaptcha && result.page) {
      const detection = await captchaSolver.detect(result.page);
      if (detection.detected) {
        const handleResult = await captchaSolver.handle(result.page, { notifyHuman: true });
        result = { ...result, captcha: { detection, handleResult } };
      }
    }
    res.json(result);
  }));

  app.post('/rpa/click', asyncHandler(async (req, res) => {
    const { url, selector } = req.body;
    const result = await rpaBrowser.click(url, selector);
    res.json(result);
  }));

  app.post('/rpa/type', asyncHandler(async (req, res) => {
    const { url, selector, text } = req.body;
    const result = await rpaBrowser.type(url, selector, text);
    res.json(result);
  }));

  app.post('/rpa/extract', asyncHandler(async (req, res) => {
    const { url, selector } = req.body;
    const result = await rpaBrowser.extract(url, selector);
    res.json(result);
  }));

  app.post('/rpa/scrape-static', asyncHandler(async (req, res) => {
    const { url } = req.body;
    const result = await rpaBrowser.scrapeStatic(url);
    res.json(result);
  }));

  app.post('/captcha/detect', asyncHandler(async (req, res) => {
    const { url } = req.body;
    const page = await rpaBrowser.navigate(url);
    const detection = await captchaSolver.detect(page.page || page);
    res.json(detection);
  }));

  app.post('/captcha/handle', asyncHandler(async (req, res) => {
    const { url, strategy, notifyHuman } = req.body;
    const page = await rpaBrowser.navigate(url);
    const result = await captchaSolver.handle(page.page || page, { strategy, notifyHuman });
    res.json(result);
  }));

  app.get('/captcha/stats', (_req, res) => {
    res.json(captchaSolver.getStats());
  });

  app.post('/rag/ingest', asyncHandler(async (req, res) => {
    const { content, metadata } = req.body;
    const id = await ragWorkflowEngine.ingestDocument(content, metadata);
    res.json({ ok: true, documentId: id });
  }));

  app.get('/rag/retrieve', asyncHandler(async (req, res) => {
    const { query, topK } = req.query as { query: string; topK?: string };
    const results = await ragWorkflowEngine.retrieve(query, topK ? parseInt(topK) : 5);
    res.json({ query, results });
  }));

  app.get('/revenue', (_req, res) => {
    res.json(revenueEngine.getStats());
  });

  app.get('/revenue/contracts', (_req, res) => {
    res.json(revenueEngine.getActiveContracts());
  });

  app.post('/crawl', asyncHandler(async (req, res) => {
    const { url, strategy } = req.body;
    const result = await crawlAgent.crawl(url, strategy);
    res.json(result);
  }));

  app.get('/metacognition/stats', (_req, res) => {
    res.json(metaCognitionEngine.getStats());
  });

  app.get('/metacognition/lessons', (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    res.json(metaCognitionEngine.getLessons(limit));
  });

  app.get('/metacognition/solutions', (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    res.json(metaCognitionEngine.getSolutions(limit));
  });

  app.get('/metacognition/solutions/:domain', (req, res) => {
    res.json(metaCognitionEngine.getSolutionsByDomain(req.params.domain));
  });

  app.post('/metacognition/adjust-strategies', async (_req, res) => {
    const updates = await metaCognitionEngine.adjustStrategies();
    res.json({ ok: true, updates });
  });

  app.post('/cost-benefit/analyze', (req, res) => {
    const candidate = req.body;
    const analysis = costBenefitAnalyzer.analyze(candidate);
    res.json(analysis);
  });

  app.post('/cost-benefit/compare', (req, res) => {
    const { candidates } = req.body;
    const analyses = costBenefitAnalyzer.compareCandidates(candidates);
    res.json(analyses);
  });

  app.get('/cost-benefit/budget', (req, res) => {
    const taskCount = parseInt(req.query.tasks as string) || 1;
    const complexity = (req.query.complexity as string) || 'medium';
    res.json(costBenefitAnalyzer.allocateBudget(taskCount, complexity as any));
  });

  app.get('/cost-benefit/stats', (_req, res) => {
    res.json(costBenefitAnalyzer.getStats());
  });

  app.post('/clones/create', (req, res) => {
    const { role, taskDescription, parentId } = req.body;
    const spec = cloneFactory.createClone(role as CloneRole, taskDescription, parentId);
    if (!spec) {
      res.status(429).json({ ok: false, error: 'No se pudo crear clon - limite o presupuesto' });
      return;
    }
    res.json({ ok: true, spec });
  });

  app.post('/clones/launch', (req, res) => {
    const { spec } = req.body;
    const ok = cloneFactory.launchClone(spec);
    res.json({ ok });
  });

  app.get('/clones', (_req, res) => {
    res.json(cloneFactory.listActiveClones());
  });

  app.get('/clones/stats', (_req, res) => {
    res.json(cloneFactory.getStats());
  });

  app.post('/clones/:id/destroy', asyncHandler(async (req, res) => {
    await cloneFactory.destroyClone(req.params.id, 'manual_request');
    res.json({ ok: true });
  }));

  app.post('/clones/:id/pause', (req, res) => {
    const ok = cloneFactory.pauseClone(req.params.id);
    res.json({ ok });
  });

  app.post('/clones/:id/resume', (req, res) => {
    const ok = cloneFactory.resumeClone(req.params.id);
    res.json({ ok });
  });

  app.post('/clones/:id/send', asyncHandler(async (req, res) => {
    const { to, type, payload, ttl, priority } = req.body;
    const success = await cloneCommunicator.send({
      from: req.params.id,
      to,
      type: type || 'task',
      payload,
      timestamp: Date.now(),
      ttl,
      priority,
    });
    res.json({ ok: success });
  }));

  app.get('/clones/:id/messages', asyncHandler(async (req, res) => {
    const { clear, type } = req.query;
    const messages = await cloneCommunicator.receive(
      req.params.id,
      clear !== 'false',
      type as any
    );
    res.json({ messages });
  }));

  app.get('/clones/:id/messages/wait', asyncHandler(async (req, res) => {
    const { type, timeout } = req.query;
    const msg = await cloneCommunicator.waitForMessage(
      req.params.id,
      type as any,
      timeout ? parseInt(timeout as string) : 5000
    );
    res.json({ message: msg });
  }));

  app.get('/clones/communicator/stats', asyncHandler(async (_req, res) => {
    res.json(await cloneCommunicator.getStats());
  }));

  app.post('/teams/form', (req, res) => {
    const team = teamFormationEngine.formTeam(req.body);
    if (!team) {
      res.status(400).json({ ok: false, error: 'No se pudo formar equipo' });
      return;
    }
    res.json({ ok: true, team });
  });

  app.get('/teams', (_req, res) => {
    res.json(teamFormationEngine.listTeams());
  });

  app.get('/teams/stats', (_req, res) => {
    res.json(teamFormationEngine.getStats());
  });

  app.get('/teams/top', (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    res.json(teamFormationEngine.getTopTeams(limit));
  });

  app.get('/teams/:id', (req, res) => {
    const team = teamFormationEngine.getTeam(req.params.id);
    if (!team) {
      res.status(404).json({ error: 'Equipo no encontrado' });
      return;
    }
    res.json(team);
  });

  app.get('/frugality/tools', (_req, res) => {
    res.json(frugalToolKit.getCatalog());
  });

  app.get('/frugality/tools/:level', (req, res) => {
    const level = parseInt(req.params.level);
    res.json(frugalToolKit.getToolsByLevel(level));
  });

  app.get('/frugality/select/:capability', (req, res) => {
    const { capability } = req.params;
    const minReliability = req.query.reliability ? parseFloat(req.query.reliability as string) : 0.7;
    res.json(frugalToolKit.selectTool(capability, minReliability));
  });

  app.get('/frugality/metrics', (_req, res) => {
    res.json(frugalToolKit.getFrugalMetrics());
  });

  app.get('/frugality/usage', (_req, res) => {
    res.json(frugalToolKit.getUsageStats());
  });

  app.get('/free-apis', (_req, res) => {
    res.json(freeAPIDiscovery.getRankedServices());
  });

  app.get('/free-apis/stats', (_req, res) => {
    res.json(freeAPIDiscovery.getStats());
  });

  app.get('/free-apis/category/:category', (req, res) => {
    res.json(freeAPIDiscovery.findByCategory(req.params.category));
  });

  app.get('/free-apis/usecase/:useCase', (req, res) => {
    res.json(freeAPIDiscovery.findService(req.params.useCase));
  });

  app.post('/free-apis/scan', asyncHandler(async (_req, res) => {
    await freeAPIDiscovery.scanAll();
    res.json({ ok: true, stats: freeAPIDiscovery.getStats() });
  }));

  app.post('/llm/estimate', (req, res) => {
    const { prompt, systemPrompt, expectedOutputLength, model } = req.body;
    const estimate = tokenEstimator.estimateRequest(
      prompt,
      systemPrompt,
      expectedOutputLength,
      model
    );
    res.json(estimate);
  });

  app.post('/llm/recommend', (req, res) => {
    const { prompt, options } = req.body;
    const models = llmProvider.getModels();
    const recommendation = tokenEstimator.recommendModel(prompt, options || {}, models);
    res.json(recommendation || { error: 'No suitable model found' });
  });

  app.get('/llm/models', (_req, res) => {
    res.json(llmProvider.getModels());
  });

  app.get('/safeguards', (_req, res) => {
    res.json(safeguards.getStats());
  });

  app.post('/safeguards/autonomy', (req, res) => {
    const { level, reason } = req.body;
    safeguards.setAutonomyLevel(level as AutonomyLevel, reason);
    res.json({ ok: true, level, reason });
  });

  app.post('/workflows/task', asyncHandler(async (req, res) => {
    const result = await integratedWorkflows.processNewTask(req.body);
    res.status(result.success ? 200 : 400).json(result);
  }));

  app.post('/workflows/optimize', asyncHandler(async (_req, res) => {
    const result = await integratedWorkflows.runOptimizationCycle();
    res.json(result);
  }));

  app.get('/workflows/history', (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    res.json(integratedWorkflows.getWorkflowHistory(limit));
  });

  app.get('/workflows/active', (_req, res) => {
    res.json(integratedWorkflows.getActiveWorkflows());
  });

  app.get('/workflows/stats', (_req, res) => {
    res.json(integratedWorkflows.getStats());
  });

  app.post('/decision-tree/evaluate', (req, res) => {
    const result = resourceDecisionTree.evaluate(req.body);
    res.json(result);
  });

  app.get('/decision-tree/visualization', (_req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.send(resourceDecisionTree.getTreeVisualization());
  });

  app.get('/decision-tree/nodes', (_req, res) => {
    res.json(resourceDecisionTree.getNodes());
  });

  app.get('/decision-tree/stats', (_req, res) => {
    res.json(resourceDecisionTree.getStats());
  });

  app.get('/metrics', (_req, res) => {
    res.json(systemMetrics.calculateAll());
  });

  app.get('/metrics/report', (_req, res) => {
    res.json(systemMetrics.generateReport());
  });

  app.get('/metrics/trends', (_req, res) => {
    res.json(systemMetrics.getTrends());
  });

  app.get('/metrics/history', (req, res) => {
    const days = req.query.days ? parseInt(req.query.days as string) : 7;
    res.json(systemMetrics.getHistory(days));
  });

  app.use('/ui', express.static('./ui'));

  // [v2.2] Error handler global - SIEMPRE al final, despues de todas las rutas
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('[ErrorHandler]', { message: err?.message, stack: err?.stack });
    res.status(err?.status || 500).json({
      error: err?.message || 'Internal server error',
      code: err?.code || 'INTERNAL_ERROR',
    });
  });

  server = app.listen(
    configManager.config.HELIOS_GATEWAY_PORT,
    configManager.config.HELIOS_GATEWAY_HOST
  );
}

let server: ReturnType<typeof app.listen>;

let wss: WebSocketServer | null = null;

function setupWebSocket(): void {
  wss = new WebSocketServer({ port: 3001 });

  wss.on('connection', (ws) => {
    logger.info('[WebSocket] Cliente conectado');

    ws.send(JSON.stringify({
      type: 'init',
      data: healthDashboard.getStatus(),
    }));

    ws.on('message', (message) => {
      try {
        const msg = JSON.parse(message.toString());
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
      } catch {
        // ignore invalid messages
      }
    });

    ws.on('close', () => {
      logger.info('[WebSocket] Cliente desconectado');
    });
  });

  setInterval(() => {
    if (!wss) return;
    const status = healthDashboard.getStatus();
    const message = JSON.stringify({
      type: 'status-update',
      timestamp: Date.now(),
      data: status,
    });
    wss.clients.forEach(client => {
      if (client.readyState === 1) {
        client.send(message);
      }
    });
  }, 5000);
}

function setupEventListeners(): void {
  safeguards.on('kill-switch', () => {
    logger.fatal('KILL SWITCH ACTIVADO - Deteniendo operaciones criticas');
    browserAgent.close();
    rpaBrowser.close();
    revenueLoop.stop();
    agentFactory.listAgents().forEach(a => agentFactory.stopAgent(a.id));
  });

  const logFin = logger.child('financial');
  const logAgent = logger.child('agent');
  const logMeta = logger.child('metacognition');
  const logClone = logger.child('clone');
  const logTeam = logger.child('team');
  const logFrugal = logger.child('frugal');
  const logWorkflow = logger.child('workflow');
  const logMetrics = logger.child('metrics');
  const logCaptcha = logger.child('captcha');
  const logBudget = logger.child('budget');

  financialEngine.on('insufficient-funds', ({ requested, available }) => {
    logFin.warn(`Fondos insuficientes: $${requested} requerido, $${available} disponible`);
  });

  financialEngine.on('human-transfer', ({ amount }) => {
    logFin.info(`Transferencia al humano: $${amount}`);
  });

  agentFactory.on('agent-crashed', ({ agentId }) => {
    logAgent.warn(`Agente ${agentId} caido`);
  });

  decisionEngine.on('decision-made', (decision) => {
    if (decision.level >= DecisionLevel.APPROVE) {
      logAgent.info(`Decision pendiente [${DecisionLevel[decision.level]}]: ${decision.reason}`);
    }
  });

  rewardSystem.on('agent-penalized', ({ agentId, score }) => {
    logAgent.warn(`Agente ${agentId} penalizado, score: ${score}`);
  });

  metaCognitionEngine.on('task-analyzed', ({ taskId }) => {
    logMeta.info(`Tarea ${taskId} analizada`);
  });

  metaCognitionEngine.on('strategies-adjusted', ({ count }) => {
    logMeta.info(`${count} estrategias ajustadas`);
  });

  cloneFactory.on('clone-launched', ({ cloneId, role }) => {
    logClone.info(`Clon ${cloneId} (${role}) lanzado`);
  });

  cloneFactory.on('clone-destroyed', ({ cloneId, reason, efficiency }) => {
    logClone.info(`Clon ${cloneId} destruido (${reason}). Eficiencia: ${(efficiency || 0).toFixed(2)}`);
  });

  cloneFactory.on('clone-budget-exceeded', ({ cloneId }) => {
    logClone.warn(`Clon ${cloneId} excedio presupuesto - auto-pausa`);
  });

  cloneCommunicator.on('message-expired', ({ msg }) => {
    logClone.warn(`Mensaje expirado: ${msg.type} de ${msg.from} a ${msg.to}`);
  });

  teamFormationEngine.on('team-formed', ({ teamId, memberCount, roles }) => {
    logTeam.info(`Equipo ${teamId} formado con ${memberCount} miembros: ${roles.join(', ')}`);
  });

  teamFormationEngine.on('team-completed', ({ teamId, efficiency }) => {
    logTeam.info(`Equipo ${teamId} completado. Eficiencia: ${(efficiency || 0).toFixed(2)}`);
  });

  frugalToolKit.on('tool-selected', ({ capability, selection }) => {
    logFrugal.info(`Capacidad "${capability}": ${selection.reason}`);
  });

  frugalLedger.on('expense-recorded', ({ amount, category, entity }) => {
    logFrugal.info(`Gasto: $${amount} en ${category} (${entity})`);
  });

  frugalLedger.on('income-recorded', ({ amount, category }) => {
    logFrugal.info(`Ingreso: $${amount} de ${category}`);
  });

  freeAPIDiscovery.on('scan-complete', ({ checked, active, down }) => {
    logFrugal.info(`Scan: ${checked} servicios, ${active} activos, ${down} caidos`);
  });

  integratedWorkflows.on('workflow-started', ({ workflowId, type }) => {
    logWorkflow.info(`${type} iniciado: ${workflowId}`);
  });

  integratedWorkflows.on('workflow-completed', ({ workflowId, success }) => {
    logWorkflow.info(`Completado: ${workflowId} (${success ? 'exito' : 'fallo'})`);
  });

  integratedWorkflows.on('workflow-failed', ({ workflowId }) => {
    logWorkflow.warn(`Fallo: ${workflowId}`);
  });

  integratedWorkflows.on('optimization-started', ({ workflowId }) => {
    logWorkflow.info(`Ciclo iniciado: ${workflowId}`);
  });

  systemMetrics.on('metrics-calculated', (snapshot) => {
    const healthy = snapshot.frugalRatio >= 0.7 && snapshot.reserveCoverage >= 14;
    if (!healthy) {
      logMetrics.warn(`Alerta: Frugal=${(snapshot.frugalRatio * 100).toFixed(0)}%, Reserva=${snapshot.reserveCoverage}d`);
    }
  });

  captchaSolver.on('captcha-detected', (detection) => {
    logCaptcha.warn(`Detectado: ${detection.type} (confianza: ${(detection.confidence * 100).toFixed(0)}%)`);
  });

  captchaSolver.on('human-intervention-required', ({ detection }) => {
    logCaptcha.error(`Intervencion humana requerida: ${detection.type}`);
  });

  budgetManager.on('spend-blocked', ({ ownerId, amount, reason }) => {
    logBudget.warn(`Bloqueado: ${ownerId} intento $${amount} - ${reason}`);
  });

  budgetManager.on('budget-created', ({ ownerId, total }) => {
    logBudget.info(`Creado: ${ownerId} con $${total}`);
  });
}

function startAutonomousLoop(): void {
  revenueLoop.start();

  const logLoop = logger.child('autonomous-loop');
  const logShutdown = logger.child('shutdown');

  setInterval(async () => {
    const health = healthDashboard.getHealth();
    if (!health.healthy) {
      logLoop.warn('Salud degradada', { checks: health.checks.filter(c => c.status !== 'healthy').map(c => c.name) });
    }

    await memoryEngine.consolidate();

    const finReport = financialEngine.getFinancialReport();
    if (finReport.netProfit < -configManager.config.HELIOS_MAX_LOSS_KILL_SWITCH) {
      safeguards.checkFinancialKillSwitch(Math.abs(finReport.netProfit));
    }

    metaLearningEngine.optimizeAll(finReport.netProfit / 100);

    metaCognitionEngine.adjustStrategies().catch(() => {});

    const report = frugalLedger.generateDailyReport();
    if (report.alerts.some((a: string) => a.startsWith('⚠️'))) {
      logLoop.warn('[FrugalLedger] Alertas activas', { alerts: report.alerts });
    }

    const hour = new Date().getHours();
    if (hour === 0 || hour === 6 || hour === 12 || hour === 18) {
      freeAPIDiscovery.scanAll().catch(() => {});
    }

    await cloneCommunicator.purgeExpired();

  }, configManager.config.HELIOS_HEALTH_CHECK_INTERVAL_MS);

  setInterval(() => {
    const plan = selfRefactorer.generateRefactorPlan();
    logLoop.info('Auto-refactorizacion', { planPreview: plan.split('\n').slice(0, 5) });
  }, 6 * 60 * 60 * 1000);

  setInterval(() => {
    const stats = metaCognitionEngine.getStats();
    logLoop.info(`[MetaCognition] ${stats.totalLessons} lecciones, ${stats.validatedLessons} validadas, ${stats.totalSolutions} soluciones`);
  }, 60 * 60 * 1000);

  setInterval(() => {
    const report = systemMetrics.generateReport();
    logLoop.info(report.summary);
  }, 30 * 60 * 1000);

  setInterval(() => {
    integratedWorkflows.runOptimizationCycle().catch(() => {});
  }, 6 * 60 * 60 * 1000);

  setInterval(() => {
    const stats = budgetManager.getStats();
    if (stats.activeWarnings > 0) {
      logLoop.warn(`[BudgetManager] ${stats.activeWarnings} presupuestos con advertencias activas`);
    }
  }, 60 * 60 * 1000);
}

function registerShutdownHooks(): void {
  const logShutdown = logger.child('shutdown');
  gracefulShutdown.register({
    name: 'memory-engine',
    priority: 100,
    handler: async () => {
      logShutdown.info('[Shutdown] Persisting memory engine...');
      await memoryEngine.save(true);
    },
  });

  gracefulShutdown.register({
    name: 'frugal-ledger',
    priority: 90,
    handler: async () => {
      logShutdown.info('[Shutdown] Saving frugal ledger...');
      await frugalLedger.destroy();
    },
  });

  gracefulShutdown.register({
    name: 'meta-cognition',
    priority: 80,
    handler: async () => {
      logShutdown.info('[Shutdown] Saving meta-cognition state...');
      await metaCognitionEngine.save();
    },
  });

  gracefulShutdown.register({
    name: 'budget-manager',
    priority: 75,
    handler: async () => {
      logShutdown.info('[Shutdown] BudgetManager state saved...');
      await budgetManager.destroy();
    },
  });

  gracefulShutdown.register({
    name: 'agent-orchestrator',
    priority: 70,
    handler: async () => {
      logShutdown.info('[Shutdown] Stopping agent orchestrator...');
      agentOrchestrator.stop();
    },
  });

  gracefulShutdown.register({
    name: 'revenue-loop',
    priority: 60,
    handler: async () => {
      logShutdown.info('[Shutdown] Stopping revenue loop...');
      revenueLoop.stop();
    },
  });

  gracefulShutdown.register({
    name: 'http-server',
    priority: 50,
    handler: async () => {
      logShutdown.info('[Shutdown] Closing HTTP server...');
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        setTimeout(resolve, 5000);
      });
    },
  });

  gracefulShutdown.register({
    name: 'websocket-server',
    priority: 40,
    handler: async () => {
      logShutdown.info('[Shutdown] Closing WebSocket server...');
      await new Promise<void>((resolve) => {
        if (wss) wss.close(() => resolve());
        setTimeout(resolve, 3000);
      });
    },
  });
}

process.on('SIGTERM', () => {
  logger.info('Helios recibio SIGTERM, apagando graceful...');
  gracefulShutdown.shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  logger.info('Helios recibio SIGINT, deteniendo...');
  gracefulShutdown.shutdown('SIGINT');
});

bootstrap().catch(err => {
  logger.fatal('Fatal error durante bootstrap', { error: String(err), stack: err?.stack });
  process.exit(1);
});
