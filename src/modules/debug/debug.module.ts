import { Module } from '@nestjs/common';
import { BooksModule } from '../books/books.module';
import { ChromaModule } from '../chroma/chroma.module';
import { EmbeddingModule } from '../embedding/embedding.module';
import { DebugController } from './debug.controller';

@Module({
  imports: [BooksModule, ChromaModule, EmbeddingModule],
  controllers: [DebugController],
})
export class DebugModule {}
