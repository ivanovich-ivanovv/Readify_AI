import { Controller, Get, Post } from '@nestjs/common';
import { BooksService } from '../books/books.service';
import { ChromaService } from '../chroma/chroma.service';
import { EmbeddingService } from '../embedding/embedding.service';

@Controller('debug')
export class DebugController {
  constructor(
    private booksService: BooksService,
    private chromaService: ChromaService,
    private embeddingService: EmbeddingService,
  ) {}

  @Get('test-mongo')
  async testMongo() {
    try {
      const books = await this.booksService.findAll();
      return {
        status: 'ok',
        message: 'MongoDB connected',
        bookCount: books.length,
        firstBook: books[0]
          ? { title: books[0].title, id: books[0]._id }
          : null,
      };
    } catch (error) {
      return {
        status: 'error',
        message: error.message,
      };
    }
  }

  @Get('test-chroma')
  async testChroma() {
    try {
      const count = await this.chromaService.getCollectionCount();
      return {
        status: 'ok',
        message: 'ChromaDB connected',
        documentCount: count,
      };
    } catch (error) {
      return {
        status: 'error',
        message: error.message,
      };
    }
  }

  @Get('test-gemini')
  async testGemini() {
    try {
      const embedding = await this.embeddingService.embedText('test');
      return {
        status: 'ok',
        message: 'Gemini API working',
        embeddingLength: embedding.length,
      };
    } catch (error) {
      return {
        status: 'error',
        message: error.message,
      };
    }
  }

  @Post('reset-chroma')
  async resetChroma() {
    try {
      await this.chromaService.deleteAll();
      return {
        status: 'ok',
        message: 'ChromaDB collection deleted and recreated successfully',
      };
    } catch (error) {
      return {
        status: 'error',
        message: error.message,
      };
    }
  }
}
