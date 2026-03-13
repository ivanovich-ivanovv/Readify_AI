import { Module } from '@nestjs/common';
import { ChromaModule } from '../chroma/chroma.module';
import { HealthController } from './health.controller';

@Module({
  imports: [ChromaModule],
  controllers: [HealthController],
})
export class HealthModule {}
