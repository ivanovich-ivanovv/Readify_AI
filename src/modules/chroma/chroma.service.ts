import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChromaClient, Collection } from 'chromadb';

const COLLECTION_NAME = 'readify_books';

@Injectable()
export class ChromaService implements OnModuleInit {
  private client: ChromaClient;
  private collection: Collection;
  private readonly logger = new Logger(ChromaService.name);

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const chromaUrl =
      this.configService.get<string>('chroma.url') || 'http://localhost:8000';

    // Parse URL to extract host and port
    const url = new URL(chromaUrl);
    const host = url.hostname;
    const port = url.port
      ? parseInt(url.port)
      : url.protocol === 'https:'
        ? 443
        : 8000;

    this.client = new ChromaClient({
      host,
      port,
    });

    this.collection = await this.client.getOrCreateCollection({
      name: COLLECTION_NAME,
      metadata: { 'hnsw:space': 'cosine' },
      embeddingFunction: undefined, // We use Gemini embeddings, not Chroma's default
    });

    this.logger.log(
      `ChromaDB collection "${COLLECTION_NAME}" ready at ${host}:${port}`,
    );
  }

  async upsertDocuments(
    ids: string[],
    embeddings: number[][],
    documents: string[],
    metadatas: Record<string, any>[],
  ): Promise<void> {
    const batchSize = 100;
    for (let i = 0; i < ids.length; i += batchSize) {
      await this.collection.upsert({
        ids: ids.slice(i, i + batchSize),
        embeddings: embeddings.slice(i, i + batchSize),
        documents: documents.slice(i, i + batchSize),
        metadatas: metadatas.slice(i, i + batchSize),
      });
    }
  }

  async query(
    queryEmbedding: number[],
    nResults = 10,
  ): Promise<{
    ids: string[];
    documents: string[];
    metadatas: Record<string, any>[];
    distances: number[];
  }> {
    const results = await this.collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults,
    });

    return {
      ids: results.ids?.[0] || [],
      documents: (results.documents?.[0] as string[]) || [],
      metadatas: (results.metadatas?.[0] as Record<string, any>[]) || [],
      distances: (results.distances?.[0] as number[]) || [],
    };
  }

  async getCollectionCount(): Promise<number> {
    return this.collection.count();
  }

  async deleteAll(): Promise<void> {
    await this.client.deleteCollection({ name: COLLECTION_NAME });
    this.collection = await this.client.getOrCreateCollection({
      name: COLLECTION_NAME,
      metadata: { 'hnsw:space': 'cosine' },
      embeddingFunction: undefined, // We use Gemini embeddings
    });
    this.logger.log(`Collection "${COLLECTION_NAME}" deleted and recreated`);
  }
}
