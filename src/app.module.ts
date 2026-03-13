import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import configuration from './config/configuration';
import { BooksModule } from './modules/books/books.module';
import { AuthorsModule } from './modules/authors/authors.module';
import { StockModule } from './modules/stock/stock.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ChromaModule } from './modules/chroma/chroma.module';
import { EmbeddingModule } from './modules/embedding/embedding.module';
import { SyncModule } from './modules/sync/sync.module';
import { ChatbotModule } from './modules/chatbot/chatbot.module';
import { HealthModule } from './modules/health/health.module';
import { DebugModule } from './modules/debug/debug.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      serveRoot: '/',
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('mongodb.uri'),
      }),
      inject: [ConfigService],
    }),
    BooksModule,
    AuthorsModule,
    StockModule,
    CategoriesModule,
    ChromaModule,
    EmbeddingModule,
    SyncModule,
    ChatbotModule,
    HealthModule,
    DebugModule,
  ],
})
export class AppModule {}
