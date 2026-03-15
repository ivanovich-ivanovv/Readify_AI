import { Module } from '@nestjs/common';
import { BooksModule } from '../books/books.module';
import { AuthorsModule } from '../authors/authors.module';
import { CategoriesModule } from '../categories/categories.module';
import { StockModule } from '../stock/stock.module';
import { ChromaModule } from '../chroma/chroma.module';
import { EmbeddingModule } from '../embedding/embedding.module';
import { ChatbotService } from './chatbot.service';
import { ChatbotController } from './chatbot.controller';
import { QueryClassifierService } from './query-classifier.service';
import { ChatbotBookQueryService } from './services/chatbot-book-query.service';
import { ChatbotPresentationService } from './services/chatbot-presentation.service';
import { ChatbotQueryUtilsService } from './services/chatbot-query-utils.service';

@Module({
  imports: [
    BooksModule,
    AuthorsModule,
    CategoriesModule,
    StockModule,
    ChromaModule,
    EmbeddingModule,
  ],
  providers: [
    ChatbotService,
    QueryClassifierService,
    ChatbotBookQueryService,
    ChatbotPresentationService,
    ChatbotQueryUtilsService,
  ],
  controllers: [ChatbotController],
})
export class ChatbotModule {}
