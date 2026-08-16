# Helios Core v2.0.0

> **Orquestador Frugal de Recursos**
>
> *"Cada unidad de recurso debe generar retorno medible. La frugalidad no es una limitacion, es una estrategia competitiva."*

## Vision

Helios ya no es una entidad monolitica que intenta hacer todo. Es un **nucleo orquestador** que gestiona recursos computacionales como un fondo de inversion gestiona capital: cada unidad de recurso (tiempo de CPU, llamada a API, MB de memoria) debe generar retorno medible.

## Arquitectura Refactorizada

### Filosofia Central

La frugalidad no es una limitacion, es una estrategia competitiva. Cada decision de asignacion de recursos esta respaldada por analisis de costo-beneficio en tiempo real.

### Capas de la Arquitectura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         HELIOS PRINCIPAL (Orquestador)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ DecisionEngine│  │CostBenefit   │  │ MetaCognition│  │ TeamFormation│    │
│  │              │  │  Analyzer    │  │   Engine     │  │   Engine     │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
│         │                 │                 │                 │            │
│         └─────────────────┴─────────────────┴─────────────────┘            │
│                           │                                                  │
│              ┌────────────┴────────────┐                                   │
│              ▼                         ▼                                   │
│    ┌─────────────────┐      ┌─────────────────┐                           │
│    │  CloneFactory   │      │ ResourceOptimizer│                          │
│    │  (crea/destruye)│      │ (asigna recursos)│                          │
│    └────────┬────────┘      └────────┬────────┘                           │
│             │                        │                                     │
│             ▼                        ▼                                     │
│    ┌─────────────────┐      ┌─────────────────┐                           │
│    │    CLONES       │      │  FrugalToolKit  │                           │
│    │  (efímeros)     │      │                 │                           │
│    │  ┌───┐┌───┐    │      │ ┌─────────────┐ │                           │
│    │  │E  ││I  │    │      │ │FreeAPIDisc. │ │                           │
│    │  │x  ││n  │    │      │ └─────────────┘ │                           │
│    │  │e  ││v  │    │      │ ┌─────────────┐ │                           │
│    │  │c  ││e  │    │      │ │  RPABrowser │ │                           │
│    │  │u  ││s  │    │      │ └─────────────┘ │                           │
│    │  │t  ││t  │    │      └─────────────────┘                           │
│    │  │o  ││i  │    │                                                      │
│    │  │r  ││g  │    │                                                      │
│    │  └───┘└───┘    │                                                      │
│    └─────────────────┘                                                      │
│             │                                                               │
│             ▼                                                               │
│    ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐   │
│    │  FrugalLedger   │◄────►│ FinancialEngine │◄────►│ RevenueEngine   │   │
│    │  (contabilidad) │      │   (balance)     │      │  (ingresos)     │   │
│    └─────────────────┘      └─────────────────┘      └─────────────────┘   │
│                                                                             │
│    ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐   │
│    │  MemoryEngine   │◄────►│  SecureVault    │◄────►│ HealthDashboard │   │
│    │  (conocimiento) │      │   (secretos)    │      │  (monitoreo)    │   │
│    └─────────────────┘      └─────────────────┘      └─────────────────┘   │
│                                                                             │
│    ┌─────────────────┐      ┌─────────────────┐                            │
│    │  Safeguards     │◄────►│  SolutionLibrary│                            │
│    │  (proteccion)   │      │  (plantillas)   │                            │
│    └─────────────────┘      └─────────────────┘                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Modulos Principales

### 1. Meta-Cognicion y Auto-Mejora

#### MetaCognitionEngine
- **TaskAnalyzer**: Descompone cada tarea en componentes atomicos
- **LessonExtractor**: Identifica correlaciones causales entre acciones y resultados
- **StrategyAdjuster**: Modifica parametros operativos basado en lecciones aprendidas
- **SolutionLibrary**: Almacena y recupera soluciones reutilizables

**Metricas de Exito:**
| Metrica | Umbral |
|---------|--------|
| lesson_hit_rate | > 75% |
| strategy_improvement_delta | > 15% |
| solution_reuse_rate | > 40% |
| false_positive_lessons | < 10% |

#### CostBenefitAnalyzer
- Calcula ROI estimado para cada accion: `(Valor Esperado - Costo Total) / Costo Total`
- 3 escenarios: Optimista (20%), Esperado (60%), Pesimista (20%)
- Umbral de aprobacion: ROI esperado > 1.5 AND ROI pesimista > 0

### 2. Sistema de Clonacion

#### CloneFactory
Crea instancias efimeras con:
- Presupuesto asignado (tokens API, tiempo CPU, memoria RAM)
- Memoria de trabajo aislada
- Acceso READ-ONLY al conocimiento global
- Timer de vida maxima con auto-destruccion

**Tipos de Clones:**
| Tipo | Presupuesto | TTL Max |
|------|-------------|---------|
| Investigador | 500 tokens, 5 min CPU | 15 min |
| Ejecutor | 2000 tokens, 15 min CPU | 30 min |
| Verificador | 300 tokens, 3 min CPU | 10 min |
| Explorador | 100 tokens, 2 min CPU | 5 min |
| Sintetizador | 800 tokens, 8 min CPU | 20 min |
| Frugal | 200 tokens, 5 min CPU | 15 min |

### 3. Formacion de Equipos

#### TeamFormationEngine
Ensambla equipos dinamicos con roles:
- **Estratega**: Define plan de ataque
- **Investigador**: Recolecta informacion
- **Ejecutor**: Implementa soluciones
- **Verificador**: Revisa resultados
- **Sintetizador**: Consolida entregables
- **Frugal**: Monitorea costos

### 4. Automatizacion de Herramientas Gratuitas

#### FrugalToolKit
Jerarquia de preferencia:
1. **Nivel 1**: Gratuito Local (Node.js, Ollama, SQLite)
2. **Nivel 2**: Gratuito Web (Wikipedia, OpenStreetMap, GitHub)
3. **Nivel 3**: Gratuito con Limites (OpenRouter free, SerpAPI free)
4. **Nivel 4**: Pagado por Uso (OpenAI, Claude)
5. **Nivel 5**: Pagado Fijo (AWS EC2, suscripciones)

#### RPABrowser
Automatizacion web con Playwright:
- Navegacion, clicks, typing, scroll
- Extraccion de datos, screenshots
- Evasion de deteccion anti-bot
- Cache agresivo (24h)
- Respeto a robots.txt

#### FreeAPIDiscovery
Catalogo de 15+ APIs gratuitas con:
- Health checks automaticos cada 24h
- Ranking por fiabilidad x utilidad
- Alertas de servicios caidos

### 5. Gestion Economica Estricta

#### FrugalLedger
Registro detallado de cada transaccion con:
- ROI estimado y real
- Alternativas consideradas
- Justificacion de gasto
- Reglas de gasto automaticas

**Reglas de Gasto:**
| Regla | Descripcion |
|-------|-------------|
| 70/30 | Maximo 30% del presupuesto diario en APIs pagadas |
| ROI minimo | Ninguna API paga sin ROI estimado > 1.5 |
| Alternativa obligatoria | Documentar alternativa gratis antes de pagar |
| Reserva minima | Mantener reserva para 14 dias de operacion |

## Flujos de Trabajo Integrados

### Flujo 1: Tarea Nueva Entra al Sistema

```
TAREA ENTRANTE
        |
        v
[DecisionEngine] -> Verificar autonomia
        |
        v
[MetaCognitionEngine] -> Buscar plantilla en SolutionLibrary
        |
        v
[CostBenefitAnalyzer] -> Calcular ROI de 3 escenarios
        |
        v
[ResourceOptimizer] -> Seleccionar herramientas (gratuitas primero)
        |
        v
¿Tarea compleja? -> [TeamFormationEngine] : [CloneFactory]
        |
        v
EJECUCION -> Monitoreo de costos en tiempo real
        |
        v
CONSOLIDACION -> Validar, extraer lecciones, registrar costos
```

### Flujo 2: Optimizacion Continua (cada 6 horas)

```
[MetaCognitionEngine] -> Revisar ultimas 50 tareas
[FrugalLedger] -> Analizar eficiencia economica
[FreeAPIDiscovery] -> Actualizar catalogo
[ResourceOptimizer] -> Ajustar configuraciones
[DecisionEngine] -> Actualizar politicas
```

## Metricas de Exito del Sistema

| Metrica | Formula | Meta |
|---------|---------|------|
| frugal_ratio | tareas gratis / total tareas | > 70% |
| api_cost_per_task | gasto APIs / tareas completadas | < $0.50 |
| clone_efficiency | promedio eficiencia clones | > 1.0 |
| lesson_accuracy | lecciones validas / aplicadas | > 75% |
| team_success_rate | equipos en presupuesto / total | > 80% |
| solution_reuse | tareas con plantillas / nuevas | > 40% |
| break_even_days | dias hasta ingresos = gastos | < 30 |
| reserve_coverage | reserva / gasto diario promedio | > 14 dias |
| rpa_success_rate | extracciones exitosas / intentos | > 85% |
| free_api_uptime | APIs gratuitas operativas / total | > 90% |

## Instalacion

```bash
git clone https://github.com/castillomendozaalejandro3-debug/helios-core.git
cd helios-core
pnpm install
cp .env.example .env
# Editar .env con tus credenciales
npx tsx src/main.ts
```

## Configuracion

| Variable | Descripcion | Requerido |
|----------|-------------|-----------|
| `HELIOS_MASTER_KEY` | Clave maestra encriptacion (16+ chars) | Si |
| `HELIOS_GATEWAY_TOKEN` | Token autenticacion API | Si |
| `LOCAL_LLM_ENDPOINT` | Endpoint Ollama local | Si |
| `HELIOS_AUTONOMY_LEVEL` | Nivel 0-4 (4 = total autonomia) | 4 |
| `HELIOS_INITIAL_BALANCE` | Balance inicial ($) | 1000 |

## API Gateway

### Endpoints Legacy
| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/health` | GET | Estado de salud |
| `/status` | GET | Estado completo |
| `/financial` | GET | Reporte financiero |
| `/decisions` | GET | Decisiones pendientes |
| `/agents` | GET | Agentes activos |

### Endpoints Meta-Cognicion
| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/metacognition/stats` | GET | Estadisticas |
| `/metacognition/lessons` | GET | Lecciones aprendidas |
| `/metacognition/solutions` | GET | Plantillas de solucion |
| `/metacognition/adjust-strategies` | POST | Ajustar estrategias |

### Endpoints Cost-Benefit
| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/cost-benefit/analyze` | POST | Analizar candidato |
| `/cost-benefit/compare` | POST | Comparar candidatos |
| `/cost-benefit/budget` | GET | Asignar presupuesto |

### Endpoints Clones
| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/clones/create` | POST | Crear clon |
| `/clones/launch` | POST | Lanzar clon |
| `/clones` | GET | Listar activos |
| `/clones/:id/destroy` | POST | Destruir clon |

### Endpoints Equipos
| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/teams/form` | POST | Formar equipo |
| `/teams` | GET | Listar equipos |
| `/teams/stats` | GET | Estadisticas |

### Endpoints Frugalidad
| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/frugality/tools` | GET | Catalogo de herramientas |
| `/frugality/select/:capability` | GET | Seleccionar herramienta |
| `/frugality/metrics` | GET | Metricas de frugalidad |
| `/free-apis` | GET | APIs gratuitas |
| `/free-apis/scan` | POST | Escanear APIs |

### Endpoints Workflows
| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/workflows/task` | POST | Procesar nueva tarea |
| `/workflows/optimize` | POST | Ejecutar optimizacion |
| `/workflows/history` | GET | Historial de workflows |

### Endpoints Arbol de Decision
| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/decision-tree/evaluate` | POST | Evaluar tarea |
| `/decision-tree/visualization` | GET | Visualizar arbol |

### Endpoints Metricas
| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/metrics` | GET | Metricas actuales |
| `/metrics/report` | GET | Reporte completo |
| `/metrics/trends` | GET | Tendencias |

## Seguridad

- Kill Switch automatico: perdida >$1000, errores criticos
- Auditoria inmutable con hash criptografico
- SecureVault AES-256-GCM
- 4 niveles de autonomia progresiva
- Reglas de gasto automaticas con bloqueo

## Licencia

MIT
