import { Injectable, Logger } from '@nestjs/common';
import { BooksService } from '../books/books.service';
import { AuthorsService } from '../authors/authors.service';
import { CategoriesService } from '../categories/categories.service';
import { ChromaService } from '../chroma/chroma.service';
import { EmbeddingService } from '../embedding/embedding.service';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private booksService: BooksService,
    private authorsService: AuthorsService,
    private categoriesService: CategoriesService,
    private chromaService: ChromaService,
    private embeddingService: EmbeddingService,
  ) {}

  async syncAll(): Promise<{ synced: number }> {
    this.logger.log('Starting MongoDB → ChromaDB sync...');

    const [books, authors, categories] = await Promise.all([
      this.booksService.findAllPopulated(),
      this.authorsService.findAll(),
      this.categoriesService.findAll(),
    ]);

    const authorMap = new Map(authors.map((a) => [a._id.toString(), a]));
    const categoryMap = new Map(categories.map((c) => [c._id.toString(), c]));

    const ids: string[] = [];
    const documents: string[] = [];
    const metadatas: Record<string, any>[] = [];

    for (const book of books) {
      const bookId = book._id.toString();

      // Resolve author names
      const authorNames = (book.authors || [])
        .map((authorRef: any) => {
          if (authorRef?.name) return authorRef.name;
          const author = authorMap.get(authorRef?.toString());
          return author?.name || 'Unknown';
        })
        .join(', ');

      // Resolve category names
      const categoryNames = (book.categoryIds || [])
        .map((catRef: any) => {
          if (catRef?.name) return catRef.name;
          const cat = categoryMap.get(catRef?.toString());
          return cat?.name || '';
        })
        .filter(Boolean)
        .join(', ');

      // Build embedding text
      const embeddingText = this.buildEmbeddingText(
        book,
        authorNames,
        categoryNames,
      );

      // Chunk long texts
      const chunks = this.chunkText(embeddingText, 900);

      for (let i = 0; i < chunks.length; i++) {
        const chunkId = chunks.length > 1 ? `${bookId}_chunk${i}` : bookId;
        ids.push(chunkId);
        documents.push(chunks[i]);
        metadatas.push({
          bookId,
          title: book.title || '',
          authorNames,
          categoryNames,
          basePrice: book.basePrice || 0,
          soldCount: book.soldCount || 0,
          status: book.status || '',
          chunkIndex: i,
          totalChunks: chunks.length,
        });
      }
    }

    if (ids.length === 0) {
      this.logger.warn('No books found to sync');
      return { synced: 0 };
    }

    // Generate embeddings
    this.logger.log(`Generating embeddings for ${ids.length} documents...`);
    const embeddings = await this.embeddingService.embedBatch(documents);

    // Upsert to ChromaDB
    this.logger.log(`Upserting ${ids.length} documents to ChromaDB...`);
    await this.chromaService.upsertDocuments(
      ids,
      embeddings,
      documents,
      metadatas,
    );

    this.logger.log(`Sync completed: ${ids.length} documents synced`);
    return { synced: ids.length };
  }

  private buildEmbeddingText(
    book: any,
    authorNames: string,
    categoryNames: string,
  ): string {
    const parts = [`Book title: ${book.title || ''}`];

    if (book.subtitle) parts.push(`Subtitle: ${book.subtitle}`);
    if (authorNames) parts.push(`Author: ${authorNames}`);
    if (categoryNames) parts.push(`Category: ${categoryNames}`);
    if (book.description) parts.push(`Description: ${book.description}`);
    if (book.tags?.length) parts.push(`Tags: ${book.tags.join(', ')}`);
    if (book.language) parts.push(`Language: ${book.language}`);
    if (book.basePrice)
      parts.push(`Price: ${book.basePrice} ${book.currency || 'VND'}`);
    if (book.soldCount) parts.push(`Sold: ${book.soldCount} copies`);

    return parts.join('\n');
  }

  private chunkText(text: string, maxTokens: number): string[] {
    // Approximate: 1 token ≈ 4 characters
    const maxChars = maxTokens * 4;

    if (text.length <= maxChars) {
      return [text];
    }

    const chunks: string[] = [];
    const sentences = text.split(/(?<=[.!?\n])\s+/);
    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + ' ' + sentence).length > maxChars && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk = currentChunk ? currentChunk + ' ' + sentence : sentence;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks.length ? chunks : [text];
  }
}
