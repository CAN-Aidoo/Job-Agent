import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';
import { registry } from '../agents/registry';

export interface PipelineStep {
  name: string;
  agent: string;
  hitl: boolean;
  config?: Record<string, unknown>;
}

export interface PipelinePhase {
  trigger: 'cron' | 'event';
  schedule?: string;
  event?: string;
  steps: PipelineStep[];
}

export interface WatcherConfig {
  agent: string;
  interval_seconds?: number;
  triggered_by?: string;
  sources?: string[];
}

export interface GlobalConfig {
  max_retries: number;
  retry_backoff_ms: number[];
  lock_ttl_ms: number;
  approval_timeout_hours: number;
}

export interface PipelineConfig {
  phases: Record<string, PipelinePhase>;
  watchers?: Record<string, WatcherConfig>;
  global: GlobalConfig;
}

let cachedConfig: PipelineConfig | null = null;

export function loadPipelineConfig(configPath?: string): PipelineConfig {
  if (cachedConfig) return cachedConfig;

  const filePath = configPath || path.resolve(__dirname, '../../pipeline.yaml');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = yaml.load(raw) as PipelineConfig;

  if (!parsed.phases) {
    throw new Error('pipeline.yaml must have a "phases" key');
  }

  if (!parsed.global) {
    throw new Error('pipeline.yaml must have a "global" key');
  }

  cachedConfig = parsed;
  return parsed;
}

/**
 * Validates that all agents referenced in pipeline steps are registered.
 * Call this AFTER agents are loaded.
 */
export function validatePipelineAgents(config: PipelineConfig): void {
  const missing: string[] = [];

  for (const [phaseName, phase] of Object.entries(config.phases)) {
    for (const step of phase.steps) {
      if (!registry.has(step.agent)) {
        missing.push(`${phaseName}.${step.name} → ${step.agent}`);
      }
    }
  }

  if (config.watchers) {
    for (const [watcherName, watcher] of Object.entries(config.watchers)) {
      if (!registry.has(watcher.agent)) {
        missing.push(`watchers.${watcherName} → ${watcher.agent}`);
      }
    }
  }

  if (missing.length > 0) {
    console.warn(`[pipeline] Missing agents (not yet registered):\n  ${missing.join('\n  ')}`);
  }
}

export function resetConfig(): void {
  cachedConfig = null;
}
