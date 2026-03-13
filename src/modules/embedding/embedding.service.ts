import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as crypto from 'crypto';

@Injectable()
export class EmbeddingService implements OnModuleInit {
  private genAI: GoogleGenerativeAI;
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('gemini.apiKey')!;
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.logger.log('Gemini embedding service initialized');
  }

  async embedText(text: string): Promise<number[]> {
    try {
      // Try using Gemini's embedding model
      const model = this.genAI.getGenerativeModel({
        model: 'text-embedding-004',
      });
      const result = await model.embedContent(text);
      return result.embedding.values;
    } catch (error) {
      this.logger.warn(
        `Gemini embedding failed, using fallback: ${error.message}`,
      );
      // Fallback: Generate simple embeddings based on text hash
      return this.generateSimpleEmbedding(text);
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    try {
      const model = this.genAI.getGenerativeModel({
        model: 'text-embedding-004',
      });
      const embeddings: number[][] = [];

      // Process in batches of 10 to avoid rate limits
      const batchSize = 10;
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map((text) => model.embedContent(text)),
        );
        embeddings.push(...results.map((r) => r.embedding.values));

        if (i + batchSize < texts.length) {
          // Small delay to respect rate limits
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }

      return embeddings;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      this.logger.warn(`Gemini batch embedding failed, using fallback`);
      return texts.map((text) => this.generateSimpleEmbedding(text));
    }
  }

  async generateAnswer(prompt: string): Promise<string> {
    try {
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
      });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      this.logger.warn(
        `Gemini generateAnswer failed (likely quota), using template: ${error.message}`,
      );
      // Fallback: Extract book info from prompt and format simple answer
      return this.generateTemplateAnswer(prompt);
    }
  }

  /**
   * Fallback: Generate simple embeddings based on text hash
   * This is used when Gemini embedding API is not available
   */
  private generateSimpleEmbedding(text: string): number[] {
    const hash = crypto
      .createHash('sha256')
      .update(text.toLowerCase())
      .digest();
    const embedding: number[] = [];

    // Create 768-dimensional embedding (standard size)
    for (let i = 0; i < 768; i++) {
      const byteIndex = i % hash.length;
      const value = (hash[byteIndex] / 255) * 2 - 1; // Normalize to [-1, 1]
      embedding.push(value);
    }

    return embedding;
  }

  /**
   * Fallback: Generate template-based answer when Gemini API is not available
   */
  private generateTemplateAnswer(prompt: string): string {
    // Extract book list from prompt
    const bookListMatch = prompt.match(/Books found:([\s\S]*?)(?=Based on|$)/);

    if (bookListMatch) {
      const bookList = bookListMatch[1].trim();
      const books = bookList.split('\n').filter((line) => line.trim());

      if (books.length > 0) {
        return `Dưới đây là ${books.length} cuốn sách tôi tìm thấy:\n\n${bookList}`;
      }
    }

    return 'Tôi đã tìm thấy một số cuốn sách phù hợp với câu hỏi của bạn. Vui lòng xem danh sách bên dưới.';
  }
}
