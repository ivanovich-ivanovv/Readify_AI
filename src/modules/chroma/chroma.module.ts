import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChromaService } from './chroma.service';

@Module({
  imports: [ConfigModule],
  providers: [ChromaService],
  exports: [ChromaService],
})
export class ChromaModule {}
