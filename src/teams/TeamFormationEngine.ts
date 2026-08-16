/**
 * TeamFormationEngine - Formacion Dinamica de Equipos
 * Ensambla equipos de clones con roles especificos segun la tarea.
 * Implementa competencia interna por eficiencia.
 */

import { EventEmitter } from 'events';
import { cloneFactory, CloneRole, CloneSpec } from '../clones/CloneFactory.js';
import { costBenefitAnalyzer } from '../metacognition/CostBenefitAnalyzer.js';
import { metaCognitionEngine } from '../metacognition/MetaCognitionEngine.js';

export interface TeamRequirement {
  taskType: string;
  description: string;
  complexity: 'low' | 'medium' | 'high';
  skillsNeeded: string[];
  parallelizable: boolean;
  budgetTotal: number;
  deadlineMs?: number;
}

export interface TeamMember {
  cloneId: string;
  role: CloneRole;
  responsibilities: string[];
  dependencies: string[]; // IDs de clones que debe esperar
  budget: number;
  status: 'waiting' | 'active' | 'completed' | 'failed';
}

export interface Team {
  id: string;
  name: string;
  requirements: TeamRequirement;
  members: TeamMember[];
  formedAt: number;
  startedAt?: number;
  completedAt?: number;
  status: 'forming' | 'active' | 'completed' | 'failed';
  totalBudget: number;
  budgetUsed: number;
  results: Record<string, any>;
  efficiency: number;
}

interface TeamTopology {
  roles: Array<{ role: CloneRole; count: number; responsibilities: string[]; dependencies: string[] }>;
  sequence: string[][]; // Fases de ejecucion (cada fase es un array de roles que corren en paralelo)
}

export class TeamFormationEngine extends EventEmitter {
  private teams: Map<string, Team> = new Map();
  private teamCounter = 0;

  // Topologias predefinidas por tipo de tarea
  private topologies: Map<string, TeamTopology> = new Map();

  constructor() {
    super();
    this.initializeTopologies();
  }

  private initializeTopologies(): void {
    // Topologia para investigacion web
    this.topologies.set('web-research', {
      roles: [
        { role: CloneRole.INVESTIGADOR, count: 2, responsibilities: ['buscar fuentes', 'validar datos'], dependencies: [] },
        { role: CloneRole.FRUGAL, count: 1, responsibilities: ['monitorear costos', 'proponer alternativas'], dependencies: [] },
        { role: CloneRole.SINTETIZADOR, count: 1, responsibilities: ['consolidar hallazgos', 'generar reporte'], dependencies: ['investigador'] },
      ],
      sequence: [
        ['investigador', 'frugal'], // Fase 1: Investigacion en paralelo
        ['sintetizador'], // Fase 2: Consolidacion
      ],
    });

    // Topologia para desarrollo de software
    this.topologies.set('software-dev', {
      roles: [
        { role: CloneRole.INVESTIGADOR, count: 1, responsibilities: ['investigar librerias', 'evaluar opciones'], dependencies: [] },
        { role: CloneRole.EJECUTOR, count: 1, responsibilities: ['implementar codigo', 'escribir tests'], dependencies: ['investigador'] },
        { role: CloneRole.VERIFICADOR, count: 1, responsibilities: ['revisar codigo', 'ejecutar tests'], dependencies: ['ejecutor'] },
        { role: CloneRole.FRUGAL, count: 1, responsibilities: ['verificar costos', 'optimizar recursos'], dependencies: [] },
      ],
      sequence: [
        ['investigador', 'frugal'],
        ['ejecutor'],
        ['verificador'],
      ],
    });

    // Topologia para analisis de datos
    this.topologies.set('data-analysis', {
      roles: [
        { role: CloneRole.INVESTIGADOR, count: 1, responsibilities: ['explorar dataset', 'identificar patrones'], dependencies: [] },
        { role: CloneRole.EJECUTOR, count: 1, responsibilities: ['procesar datos', 'generar visualizaciones'], dependencies: ['investigador'] },
        { role: CloneRole.VERIFICADOR, count: 1, responsibilities: ['validar resultados', 'detectar sesgos'], dependencies: ['ejecutor'] },
        { role: CloneRole.SINTETIZADOR, count: 1, responsibilities: ['crear presentacion', 'resumir insights'], dependencies: ['verificador'] },
      ],
      sequence: [
        ['investigador'],
        ['ejecutor'],
        ['verificador'],
        ['sintetizador'],
      ],
    });

    // Topologia para exploracion (tareas inciertas)
    this.topologies.set('exploration', {
      roles: [
        { role: CloneRole.EXPLORADOR, count: 3, responsibilities: ['probar hipotesis', 'descartar caminos fallidos'], dependencies: [] },
        { role: CloneRole.FRUGAL, count: 1, responsibilities: ['limitar gastos', 'reportar eficiencia'], dependencies: [] },
      ],
      sequence: [
        ['explorador', 'frugal'],
      ],
    });

    // Topologia por defecto
    this.topologies.set('default', {
      roles: [
        { role: CloneRole.EJECUTOR, count: 1, responsibilities: ['ejecutar tarea'], dependencies: [] },
        { role: CloneRole.VERIFICADOR, count: 1, responsibilities: ['validar resultado'], dependencies: ['ejecutor'] },
      ],
      sequence: [
        ['ejecutor'],
        ['verificador'],
      ],
    });
  }

  // ----------------------------------------------------------
  // FORMACION DE EQUIPOS
  // ----------------------------------------------------------

  formTeam(requirements: TeamRequirement): Team | null {
    const teamId = `team_${Date.now()}_${this.teamCounter++}`;

    // Seleccionar topologia
    const topology = this.selectTopology(requirements);

    // Calcular presupuesto por miembro
    const totalRoles = topology.roles.reduce((sum, r) => sum + r.count, 0);
    const budgetPerMember = requirements.budgetTotal / totalRoles;

    // Crear miembros del equipo
    const members: TeamMember[] = [];
    for (const roleConfig of topology.roles) {
      for (let i = 0; i < roleConfig.count; i++) {
        const cloneSpec = cloneFactory.createClone(
          roleConfig.role,
          `${requirements.description} - ${roleConfig.role}`,
          teamId
        );

        if (!cloneSpec) {
          this.emit('team-formation-failed', { teamId, reason: 'clone_creation_failed' });
          return null;
        }

        // Ajustar presupuesto del clon
        cloneSpec.budget.tokens = Math.min(cloneSpec.budget.tokens, budgetPerMember);

        members.push({
          cloneId: cloneSpec.id,
          role: roleConfig.role,
          responsibilities: [...roleConfig.responsibilities],
          dependencies: roleConfig.dependencies.map(d => {
            // Encontrar el primer miembro con ese rol
            const dep = members.find(m => m.role === d);
            return dep?.cloneId || '';
          }).filter(Boolean),
          budget: budgetPerMember,
          status: 'waiting',
        });

        // Lanzar clon
        cloneFactory.launchClone(cloneSpec);
      }
    }

    const team: Team = {
      id: teamId,
      name: `Equipo_${requirements.taskType}_${this.teamCounter}`,
      requirements,
      members,
      formedAt: Date.now(),
      status: 'forming',
      totalBudget: requirements.budgetTotal,
      budgetUsed: 0,
      results: {},
      efficiency: 0,
    };

    this.teams.set(teamId, team);

    // Iniciar coordinacion
    this.coordinateTeam(teamId);

    this.emit('team-formed', { teamId, memberCount: members.length, roles: members.map(m => m.role) });
    return team;
  }

  // ----------------------------------------------------------
  // COORDINACION DE EQUIPOS
  // ----------------------------------------------------------

  private async coordinateTeam(teamId: string): Promise<void> {
    const team = this.teams.get(teamId);
    if (!team) return;

    team.status = 'active';
    team.startedAt = Date.now();

    const topology = this.selectTopology(team.requirements);

    // Ejecutar por fases
    for (const phase of topology.sequence) {
      const phaseMembers = team.members.filter(m => phase.includes(m.role));

      // Esperar que dependencias esten completadas
      for (const member of phaseMembers) {
        for (const depId of member.dependencies) {
          await this.waitForMember(depId, teamId);
        }
        member.status = 'active';
      }

      // Ejecutar fase en paralelo
      const phasePromises = phaseMembers.map(member =>
        this.executeMemberTask(member, teamId)
      );

      await Promise.all(phasePromises);
    }

    // Calcular eficiencia del equipo
    team.efficiency = this.calculateTeamEfficiency(team);
    team.status = 'completed';
    team.completedAt = Date.now();

    this.emit('team-completed', { teamId, efficiency: team.efficiency, results: team.results });
  }

  private async executeMemberTask(member: TeamMember, teamId: string): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const clone = cloneFactory.getClone(member.cloneId);
        const result = cloneFactory.getResult(member.cloneId);

        if (result) {
          clearInterval(checkInterval);
          member.status = result.success ? 'completed' : 'failed';

          const team = this.teams.get(teamId);
          if (team) {
            team.results[member.cloneId] = result.result;
            team.budgetUsed += result.costUsed;
          }

          resolve();
        } else if (!clone) {
          // Clon desaparecio sin resultado
          clearInterval(checkInterval);
          member.status = 'failed';
          resolve();
        }
      }, 1000);

      // Timeout de seguridad
      setTimeout(() => {
        clearInterval(checkInterval);
        member.status = 'failed';
        resolve();
      }, 5 * 60 * 1000); // 5 min max
    });
  }

  private async waitForMember(cloneId: string, teamId: string): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const team = this.teams.get(teamId);
        if (!team) {
          clearInterval(checkInterval);
          resolve();
          return;
        }

        const member = team.members.find(m => m.cloneId === cloneId);
        if (member && (member.status === 'completed' || member.status === 'failed')) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 500);

      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 10 * 60 * 1000); // 10 min max espera
    });
  }

  // ----------------------------------------------------------
  // SELECCION DE TOPOLOGIA
  // ----------------------------------------------------------

  private selectTopology(requirements: TeamRequirement): TeamTopology {
    // Buscar topologia especifica
    for (const [key, topology] of this.topologies) {
      if (requirements.taskType.includes(key)) {
        return topology;
      }
    }

    // Buscar por skills necesarios
    if (requirements.skillsNeeded.includes('research')) {
      return this.topologies.get('web-research') || this.topologies.get('default')!;
    }
    if (requirements.skillsNeeded.includes('coding')) {
      return this.topologies.get('software-dev') || this.topologies.get('default')!;
    }
    if (requirements.skillsNeeded.includes('analysis')) {
      return this.topologies.get('data-analysis') || this.topologies.get('default')!;
    }

    return this.topologies.get('default')!;
  }

  // ----------------------------------------------------------
  // COMPETENCIA INTERNA
  // ----------------------------------------------------------

  private calculateTeamEfficiency(team: Team): number {
    const completedMembers = team.members.filter(m => m.status === 'completed');
    const failedMembers = team.members.filter(m => m.status === 'failed');

    if (completedMembers.length === 0) return 0;

    const successRate = completedMembers.length / team.members.length;
    const budgetEfficiency = 1 - (team.budgetUsed / Math.max(team.totalBudget, 1));
    const timeEfficiency = team.completedAt && team.startedAt
      ? 1 - ((team.completedAt - team.startedAt) / Math.max(team.requirements.deadlineMs || 3600000, 1))
      : 0.5;

    // Formula: exito * 0.5 + ahorro * 0.3 + velocidad * 0.2
    return (successRate * 0.5) + (budgetEfficiency * 0.3) + (timeEfficiency * 0.2);
  }

  getTopTeams(limit: number = 10): Team[] {
    return Array.from(this.teams.values())
      .filter(t => t.status === 'completed')
      .sort((a, b) => b.efficiency - a.efficiency)
      .slice(0, limit);
  }

  // ----------------------------------------------------------
  // CONSULTAS
  // ----------------------------------------------------------

  getTeam(teamId: string): Team | undefined {
    return this.teams.get(teamId);
  }

  listTeams(): Array<{
    id: string;
    name: string;
    status: string;
    members: number;
    budgetUsed: number;
    budgetTotal: number;
    efficiency: number;
  }> {
    return Array.from(this.teams.values()).map(t => ({
      id: t.id,
      name: t.name,
      status: t.status,
      members: t.members.length,
      budgetUsed: Math.round(t.budgetUsed * 100) / 100,
      budgetTotal: t.totalBudget,
      efficiency: Math.round(t.efficiency * 100) / 100,
    }));
  }

  getStats(): {
    totalTeams: number;
    active: number;
    completed: number;
    failed: number;
    avgEfficiency: number;
    totalBudgetUsed: number;
  } {
    const all = Array.from(this.teams.values());
    const completed = all.filter(t => t.status === 'completed');
    return {
      totalTeams: all.length,
      active: all.filter(t => t.status === 'active').length,
      completed: completed.length,
      failed: all.filter(t => t.status === 'failed').length,
      avgEfficiency: completed.length > 0
        ? completed.reduce((s, t) => s + t.efficiency, 0) / completed.length
        : 0,
      totalBudgetUsed: all.reduce((s, t) => s + t.budgetUsed, 0),
    };
  }
}

export const teamFormationEngine = new TeamFormationEngine();
