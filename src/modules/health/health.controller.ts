import { Controller, Get } from '@nestjs/common';
import { ChromaService } from '../chroma/chroma.service';

@Controller('health')
export class HealthController {
  constructor(private chromaService: ChromaService) {}

  @Get()
  async check() {
    let chromaStatus = 'unknown';
    let chromaCount = 0;

    try {
      chromaCount = await this.chromaService.getCollectionCount();
      chromaStatus = 'connected';
    } catch {
      chromaStatus = 'disconnected';
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        mongodb: 'connected',
        chromadb: chromaStatus,
        chromaDocuments: chromaCount,
      },
    };
  }
}
