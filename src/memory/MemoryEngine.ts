import { connect, Table } from 'lancedb';

enum MemoryType { 
  EPISODIC = 'episodic', 
  SEMANTIC = 'semantic', 
  PROCEDURAL = 'procedural' 
}

class MemoryEngine {
  db: any;

  constructor() {
    this.db = null;
  }

  async init(): Promise<void> {
    this.db = await connect('./helios_memory_db');
    
    for (const type of Object.values(MemoryType)) {
      try {
        await this.db.openTable(type);
      } catch (error) {
        // Table doesn't exist, create it
        const schema = {
          content: { type: 'string' },
          metadata: { type: 'struct', fields: [
            { name: 'timestamp', type: 'timestamp' },
            { name: 'type', type: 'string' }
          ]},
          vector: { type: 'vector', size: 384 }
        };
        
        await this.db.createTable(type, [], {
          mode: 'overwrite'
        });
      }
    }
  }

  async store(type: MemoryType, content: string, metadata: any): Promise<void> {
    const table = await this.db.openTable(type);
    
    const record = {
      content,
      metadata: {
        ...metadata,
        timestamp: new Date(),
        type
      }
    };
    
    await table.add([record]);
  }

  async recall(type: MemoryType, query: string, nResults: number = 5): Promise<any[]> {
    const table = await this.db.openTable(type);
    
    const results = await table.search(query).limit(nResults).execute();
    
    return results;
  }
}

export { MemoryType, MemoryEngine };