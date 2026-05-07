import { JobSource } from '@jobagent/shared/src/interfaces/source';

class SourceRegistry {
  private sources: Map<string, JobSource> = new Map();

  register(source: JobSource): void {
    this.sources.set(source.name, source);
    console.log(`[source-registry] Registered source: ${source.name}`);
  }

  getAll(): JobSource[] {
    return Array.from(this.sources.values());
  }
}

export const sourceRegistry = new SourceRegistry();
