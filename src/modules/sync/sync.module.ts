import { Module } from '@nestjs/common';
import { BooksModule } from '../books/books.module';
import { AuthorsModule } from '../authors/authors.module';
import { CategoriesModule } from '../categories/categories.module';
import { ChromaModule } from '../chroma/chroma.module';
import { EmbeddingModule } from '../embedding/embedding.module';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';

@Module({
  imports: [
    BooksModule,
    AuthorsModule,
    CategoriesModule,
    ChromaModule,
    EmbeddingModule,
  ],
  providers: [SyncService],
  controllers: [SyncController],
  exports: [SyncService],
})
export class SyncModule {}
