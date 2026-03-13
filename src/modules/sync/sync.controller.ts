import { Controller, Post } from '@nestjs/common';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private syncService: SyncService) {}

  @Post()
  async sync() {
    const result = await this.syncService.syncAll();
    return {
      message: 'Sync completed successfully',
      ...result,
    };
  }
}
