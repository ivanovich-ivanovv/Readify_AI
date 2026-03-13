import { Injectable, Logger } from '@nestjs/common';
import { BooksService } from '../books/books.service';
import { AuthorsService } from '../authors/authors.service';
import { CategoriesService } from '../categories/categories.service';
import { StockService } from '../stock/stock.service';
import { ChromaService } from '../chroma/chroma.service';
import { EmbeddingService } from '../embedding/embedding.service';
import { QueryClassifierService } from './query-classifier.service';
import { QueryType } from './interfaces/query.interface';

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);
  private readonly MAX_DISPLAY_BOOKS = 5;
  private readonly QUICK_QUESTIONS_BY_SELECTION: Record<string, string[]> = {
    [QueryType.PRICE_RANGE]: [
      'Sách dưới 150k',
      'Sách từ 200k đến 300k',
      'Sách khoảng 250k',
    ],
    [QueryType.AUTHOR]: [
      'Sách của Nguyễn Nhật Ánh',
      'Sách của Nam Cao',
      'Sách của Haruki Murakami',
    ],
    [QueryType.CATEGORY]: [
      'Sách thể loại Self Help',
      'Sách thể loại Technology',
      'Sách thể loại Fiction',
    ],
    [QueryType.BESTSELLER]: [
      'Top 5 sách bestseller hiện tại',
      'Sách bán chạy nhất tháng này',
      'Gợi ý sách bán chạy theo giá dưới 200k',
    ],
    [QueryType.STOCK]: [
      'Kiểm tra tồn kho sách Atomic Habits',
      'Sách Clean Code còn hàng không?',
      'Còn bao nhiêu bản Deep Work?',
    ],
    [QueryType.GENERAL]: [
      'Gợi ý cho mình một cuốn dễ đọc',
      'Sách nào phù hợp để bắt đầu tự học?',
      'Có sách nào vừa hay vừa giá tốt không?',
    ],
  };

  constructor(
    private booksService: BooksService,
    private authorsService: AuthorsService,
    private categoriesService: CategoriesService,
    private stockService: StockService,
    private chromaService: ChromaService,
    private embeddingService: EmbeddingService,
    private queryClassifier: QueryClassifierService,
  ) {}

  async chat(
    question: string,
  ): Promise<{ answer: string; books: any[]; quickQuestions?: string[] }> {
    this.logger.log(`Processing question: "${question}"`);
    const wantsIntroduction = this.isIntroductionRequest(question);

    if (this.isPureShopIntroductionRequest(question)) {
      return {
        answer: this.buildShopIntroductionScript(true),
        books: [],
        quickQuestions: this.getQuickQuestions(),
      };
    }

    // Step 1: Classify the query
    const parsed = await this.queryClassifier.classifyQuery(question);
    this.logger.log(`Query classified as: ${parsed.type}`);

    // Step 2: Get relevant books based on query type
    let books: any[] = [];

    switch (parsed.type) {
      case QueryType.PRICE_RANGE:
        books = await this.handlePriceQuery(parsed.priceMin, parsed.priceMax);
        break;

      case QueryType.AUTHOR:
        books = await this.handleAuthorQuery(parsed.authorName ?? '', question);
        break;

      case QueryType.CATEGORY:
        books = await this.handleCategoryQuery(
          parsed.categoryName ?? '',
          question,
        );
        break;

      case QueryType.BESTSELLER:
        books = await this.handleBestsellerQuery();
        break;

      case QueryType.STOCK:
        return {
          ...(await this.handleStockQuery(
            question,
            parsed.bookTitle ?? question,
          )),
          quickQuestions: this.getQuickQuestions(QueryType.STOCK),
        };

      case QueryType.GENERAL:
      default:
        books = await this.handleGeneralQuery(question);
        break;
    }

    // Step 3: Format books for response
    const formattedBooks = await this.formatBooks(books);

    // Step 4: Generate natural language answer
    const answer = await this.generateAnswer(
      question,
      formattedBooks,
      parsed.type,
      wantsIntroduction,
    );

    return {
      answer,
      books: formattedBooks,
      quickQuestions: this.getQuickQuestions(parsed.type),
    };
  }

  private async handlePriceQuery(
    priceMin: number | undefined,
    priceMax: number | undefined,
  ): Promise<any[]> {
    this.logger.log(`Price query: min=${priceMin}, max=${priceMax}`);
    return this.booksService.findByPriceRange(
      priceMin,
      priceMax,
      this.MAX_DISPLAY_BOOKS,
    );
  }

  private async handleAuthorQuery(
    authorName: string,
    originalQuestion: string,
  ): Promise<any[]> {
    this.logger.log(`Author query: "${authorName}"`);
    const authorQuery =
      authorName.trim() || this.extractSearchPhrase(originalQuestion);

    if (!authorQuery) {
      return [];
    }

    const exactAuthors = await this.authorsService.findByName(authorQuery);
    const rankedAuthors = this.rankAuthors(authorQuery, exactAuthors);

    if (rankedAuthors.length === 0) {
      return [];
    }

    const topScore = rankedAuthors[0].score;
    const strongAuthors = rankedAuthors.filter((a) => a.score >= 60);
    const bestAuthors = (
      strongAuthors.length > 0 ? strongAuthors : rankedAuthors
    )
      .filter((a) => a.score === topScore || a.score >= 60)
      .slice(0, 3)
      .map((a) => a.author);

    const authorIds = bestAuthors.map((a) => a._id);
    const candidateBooks = await this.booksService.findByAuthorIds(
      authorIds,
      this.MAX_DISPLAY_BOOKS * 4,
    );

    return this.rankBooksByAuthor(authorQuery, candidateBooks).slice(
      0,
      this.MAX_DISPLAY_BOOKS,
    );
  }

  private async handleCategoryQuery(
    categoryName: string,
    originalQuestion: string,
  ): Promise<any[]> {
    this.logger.log(`Category query: "${categoryName}"`);
    const categoryQuery =
      categoryName.trim() || this.extractSearchPhrase(originalQuestion);

    if (!categoryQuery) {
      return [];
    }

    const exactCategories =
      await this.categoriesService.findByName(categoryQuery);
    const rankedCategories = this.rankCategories(
      categoryQuery,
      exactCategories,
    );

    if (rankedCategories.length === 0) {
      return [];
    }

    const topScore = rankedCategories[0].score;
    const strongCategories = rankedCategories.filter((c) => c.score >= 60);
    const bestCategories = (
      strongCategories.length > 0 ? strongCategories : rankedCategories
    )
      .filter((c) => c.score === topScore || c.score >= 60)
      .slice(0, 3)
      .map((c) => c.category);

    const categoryIds = bestCategories.map((c) => c._id);
    const candidateBooks = await this.booksService.findByCategoryIds(
      categoryIds,
      this.MAX_DISPLAY_BOOKS * 4,
    );

    return this.rankBooksByCategory(categoryQuery, candidateBooks).slice(
      0,
      this.MAX_DISPLAY_BOOKS,
    );
  }

  private async handleBestsellerQuery(): Promise<any[]> {
    this.logger.log('Bestseller query');
    return this.booksService.findBestsellers(this.MAX_DISPLAY_BOOKS);
  }

  private async handleStockQuery(
    question: string,
    bookTitle: string,
  ): Promise<{ answer: string; books: any[] }> {
    this.logger.log(`Stock query for: "${bookTitle}"`);

    // Search ChromaDB for the book
    const queryEmbedding = await this.embeddingService.embedText(bookTitle);
    const results = await this.chromaService.query(queryEmbedding, 3);

    if (results.ids.length === 0) {
      return {
        answer: `I couldn't find any book matching "${bookTitle}" in our database.`,
        books: [],
      };
    }

    // Get unique book IDs
    const bookIds = [...new Set(results.metadatas.map((m) => m.bookId))].slice(
      0,
      this.MAX_DISPLAY_BOOKS,
    );

    const books = await this.booksService.findByIds(bookIds);
    const formattedBooks: any[] = [];

    for (const book of books) {
      const quantity = await this.stockService.getAvailableQuantity(
        book._id.toString(),
      );
      const authorNames = (book.authors || [])
        .map((a: any) => a?.name || 'Unknown')
        .join(', ');

      formattedBooks.push({
        title: book.title,
        slug: book.slug,
        author: authorNames,
        category: (book.categoryIds || [])
          .map((c: any) => c?.name || '')
          .filter(Boolean)
          .join(', '),
        price: book.basePrice,
        currency: book.currency || 'VND',
        stockQuantity: quantity,
        available: quantity > 0,
      });
    }

    const answer = await this.generateStockAnswer(question, formattedBooks);

    return { answer, books: formattedBooks };
  }

  private async handleGeneralQuery(question: string): Promise<any[]> {
    this.logger.log('General RAG query');

    // Embed the question
    const queryEmbedding = await this.embeddingService.embedText(question);

    // Search ChromaDB
    const results = await this.chromaService.query(queryEmbedding, 10);

    if (results.ids.length === 0) {
      return [];
    }

    // Get unique book IDs from results
    const bookIds = [...new Set(results.metadatas.map((m) => m.bookId))].slice(
      0,
      this.MAX_DISPLAY_BOOKS,
    );

    return this.booksService.findByIds(bookIds);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async formatBooks(books: any[]): Promise<any[]> {
    return books.slice(0, this.MAX_DISPLAY_BOOKS).map((book) => {
      const authorNames = (book.authors || [])
        .map((a: any) => a?.name || 'Unknown')
        .join(', ');

      const categoryNames = (book.categoryIds || [])
        .map((c: any) => c?.name || '')
        .filter(Boolean)
        .join(', ');

      return {
        title: book.title,
        slug: book.slug,
        author: authorNames,
        category: categoryNames,
        price: book.basePrice,
        currency: book.currency || 'VND',
        soldCount: book.soldCount || 0,
      };
    });
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async generateAnswer(
    question: string,
    books: any[],
    queryType: QueryType,
    wantsIntroduction: boolean,
  ): Promise<string> {
    if (books.length === 0) {
      if (wantsIntroduction) {
        return `${this.buildShopIntroductionScript(true)}\n\nHiện tại mình chưa tìm thấy sách phù hợp với yêu cầu cụ thể của bạn. Bạn có thể nói rõ hơn về tác giả, thể loại hoặc khoảng giá.`;
      }
      return 'Mình chưa tìm thấy sách phù hợp với yêu cầu của bạn. Bạn thử đổi từ khóa (tác giả, thể loại, khoảng giá) nhé.';
    }

    const lines: string[] = [];

    if (wantsIntroduction) {
      lines.push(this.buildShopIntroductionScript(true));
      lines.push('');
    }

    lines.push(this.getHeadingByQueryType(queryType, question));
    lines.push(
      books.length >= this.MAX_DISPLAY_BOOKS
        ? `Mình đã lọc và hiển thị ${this.MAX_DISPLAY_BOOKS} cuốn sách phù hợp nhất.`
        : `Mình tìm thấy ${books.length} cuốn sách phù hợp và hiển thị toàn bộ.`,
    );
    lines.push('Danh sách chi tiết đã được mình hiển thị bên dưới:');

    return lines.join('\n').trim();
  }

  private async generateStockAnswer(
    question: string,
    books: any[],
  ): Promise<string> {
    if (books.length === 0) {
      return 'I could not find any matching books in our inventory.';
    }

    const bookList = books
      .map(
        (b, i) =>
          `${i + 1}. ${b.title}\n   - Author: ${b.author}\n   - Price: ${b.price?.toLocaleString()} ${b.currency}\n   - Stock: ${b.stockQuantity} copies ${b.available ? '(Available)' : '(Out of stock)'}`,
      )
      .join('\n');

    const prompt = `You are a helpful bookstore assistant for Readify bookstore.
A customer asked: "${question}"

Inventory results:
${bookList}

Provide a friendly answer about the stock availability.
Use concise, clean formatting with a short heading and a numbered list.
Include the quantity available for each book.
Do NOT make up any information. Only use the data provided above.`;

    return this.embeddingService.generateAnswer(prompt);
  }

  private rankAuthors(authorQuery: string, authors: any[]): any[] {
    const normalizedQuery = this.normalizeText(authorQuery);

    return authors
      .map((author) => {
        const names = [author?.name, author?.penName].filter(Boolean);
        const score = Math.max(
          ...names.map((name: string) =>
            this.calculateEntityMatchScore(normalizedQuery, name),
          ),
          0,
        );

        return { author, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  private rankCategories(categoryQuery: string, categories: any[]): any[] {
    const normalizedQuery = this.normalizeText(categoryQuery);

    return categories
      .map((category) => ({
        category,
        score: this.calculateEntityMatchScore(normalizedQuery, category?.name),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  private calculateEntityMatchScore(query: string, candidate: string): number {
    const normalizedCandidate = this.normalizeText(candidate);
    if (!normalizedCandidate) return 0;
    if (normalizedCandidate === query) return 100;
    if (` ${normalizedCandidate} `.includes(` ${query} `)) return 90;
    if (normalizedCandidate.startsWith(query)) return 80;
    if (normalizedCandidate.includes(` ${query} `)) return 70;
    if (normalizedCandidate.includes(query)) return 60;

    const queryTokens = query.split(' ').filter(Boolean);
    const candidateTokens = normalizedCandidate.split(' ').filter(Boolean);
    const overlapCount = queryTokens.filter((token) =>
      candidateTokens.includes(token),
    ).length;

    if (overlapCount === 0) return 0;
    return Math.min(50, overlapCount * 15);
  }

  private normalizeText(input: string): string {
    return (input || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractSearchPhrase(question: string): string {
    const cleaned = question
      .replace(
        /(sach|book|books|the loai|category|author|tac gia|gioi thieu|giới thiệu|shop|readify|cho toi|giup toi|recommend|goi y)/gi,
        ' ',
      )
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned;
  }

  private isIntroductionRequest(question: string): boolean {
    const q = question.toLowerCase();
    const introKeywords = [
      'gioi thieu',
      'giới thiệu',
      'introduce',
      'introduction',
      'mo ta',
      'mô tả',
      'review',
      'tom tat',
      'tóm tắt',
    ];

    return introKeywords.some((keyword) => q.includes(keyword));
  }

  private isPureShopIntroductionRequest(question: string): boolean {
    const normalized = this.normalizeText(question);
    const hasIntro =
      /(gioi thieu|introduce|introduction|about|ve shop|ve readify)/.test(
        normalized,
      );
    const hasBookIntent =
      /(sach|book|books|author|tac gia|category|the loai|gia|price|bestseller|ban chay|stock|con hang)/.test(
        normalized,
      );

    return hasIntro && !hasBookIntent;
  }

  private buildShopIntroductionScript(includeQuickQuestions = false): string {
    const lines = [
      'Xin chào! Tôi là trợ lý AI của Readify.',
      'Readify là nhà sách online giúp bạn tìm sách nhanh theo giá, tác giả, thể loại và mức độ bán chạy.',
      'Bạn chỉ cần nói nhu cầu, mình sẽ đề xuất những tựa sách phù hợp nhất cho bạn.',
    ];

    if (!includeQuickQuestions) {
      return lines.join(' ');
    }

    const quickQuestionLines = this.getQuickQuestions()
      .map((item, index) => `${index + 1}. ${item}`)
      .join('\n');

    return `${lines.join(' ')}\n\nCâu hỏi phổ biến (bạn có thể bấm để hỏi nhanh):\n${quickQuestionLines}`;
  }

  private getQuickQuestions(queryType?: QueryType): string[] {
    if (!queryType) {
      return [
        ...this.QUICK_QUESTIONS_BY_SELECTION[QueryType.PRICE_RANGE],
        ...this.QUICK_QUESTIONS_BY_SELECTION[QueryType.AUTHOR],
        ...this.QUICK_QUESTIONS_BY_SELECTION[QueryType.CATEGORY],
        ...this.QUICK_QUESTIONS_BY_SELECTION[QueryType.BESTSELLER],
      ].slice(0, 8);
    }

    const current = this.QUICK_QUESTIONS_BY_SELECTION[queryType] || [];
    const fallback = this.QUICK_QUESTIONS_BY_SELECTION[QueryType.GENERAL] || [];
    return [...current, ...fallback].slice(0, 6);
  }

  private getHeadingByQueryType(
    queryType: QueryType,
    question: string,
  ): string {
    switch (queryType) {
      case QueryType.PRICE_RANGE:
        return 'Danh sách sách theo khoảng giá bạn yêu cầu:';
      case QueryType.AUTHOR:
        return 'Danh sách sách theo đúng tác giả bạn tìm:';
      case QueryType.CATEGORY:
        return 'Danh sách sách theo đúng thể loại bạn quan tâm:';
      case QueryType.BESTSELLER:
        return 'Top sách bán chạy hiện tại:';
      case QueryType.GENERAL:
      default:
        return `Kết quả gợi ý cho: "${question}"`;
    }
  }

  private rankBooksByAuthor(authorQuery: string, books: any[]): any[] {
    const query = this.normalizeText(authorQuery);

    return [...books]
      .map((book) => {
        const names = (book.authors || [])
          .map((a: any) => [a?.name, a?.penName])
          .flat()
          .filter(Boolean);

        const score = names.length
          ? Math.max(
              ...names.map((name: string) =>
                this.calculateEntityMatchScore(query, name),
              ),
            )
          : 0;

        return { book, score };
      })
      .filter((x) => x.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          (b.book.soldCount || 0) - (a.book.soldCount || 0),
      )
      .map((x) => x.book);
  }

  private rankBooksByCategory(categoryQuery: string, books: any[]): any[] {
    const query = this.normalizeText(categoryQuery);

    return [...books]
      .map((book) => {
        const categories = (book.categoryIds || [])
          .map((c: any) => c?.name)
          .filter(Boolean);

        const score = categories.length
          ? Math.max(
              ...categories.map((name: string) =>
                this.calculateEntityMatchScore(query, name),
              ),
            )
          : 0;

        return { book, score };
      })
      .filter((x) => x.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          (b.book.soldCount || 0) - (a.book.soldCount || 0),
      )
      .map((x) => x.book);
  }
}
