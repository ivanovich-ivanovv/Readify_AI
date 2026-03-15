import { Injectable, Logger } from '@nestjs/common';
import { BooksService } from '../../books/books.service';
import { AuthorsService } from '../../authors/authors.service';
import { CategoriesService } from '../../categories/categories.service';
import { StockService } from '../../stock/stock.service';
import { ChromaService } from '../../chroma/chroma.service';
import { EmbeddingService } from '../../embedding/embedding.service';
import { ChatbotQueryUtilsService } from './chatbot-query-utils.service';

// Service chuyên xử lý truy vấn dữ liệu sách theo từng intent.
// Mục tiêu: tách toàn bộ truy vấn và ranking ra khỏi lớp orchestrator.
@Injectable()
export class ChatbotBookQueryService {
  // Logger riêng của lớp query để dễ đọc log theo module.
  private readonly logger = new Logger(ChatbotBookQueryService.name);
  // Giới hạn số lượng sách trả ra cho đa số use case.
  private readonly MAX_DISPLAY_BOOKS = 5;

  constructor(
    // Truy cập dữ liệu sách.
    private booksService: BooksService,
    // Truy cập dữ liệu tác giả.
    private authorsService: AuthorsService,
    // Truy cập dữ liệu thể loại.
    private categoriesService: CategoriesService,
    // Truy cập tồn kho.
    private stockService: StockService,
    // Truy vấn vector database.
    private chromaService: ChromaService,
    // Tạo embedding và gọi model sinh câu trả lời.
    private embeddingService: EmbeddingService,
    // Utility normalize/ranking để tái sử dụng logic text match.
    private queryUtils: ChatbotQueryUtilsService,
  ) {}

  // Intent PRICE_RANGE: lọc sách theo khoảng giá.
  async handlePriceQuery(
    // Cận dưới giá, có thể undefined nếu user chỉ nêu cận trên.
    priceMin: number | undefined,
    // Cận trên giá, có thể undefined nếu user chỉ nêu cận dưới.
    priceMax: number | undefined,
  ): Promise<any[]> {
    // Ghi log tham số để xác minh parser classify hoạt động đúng.
    this.logger.log(`Price query: min=${priceMin}, max=${priceMax}`);
    // Gọi books service với giới hạn số lượng hiển thị.
    return this.booksService.findByPriceRange(
      priceMin,
      priceMax,
      this.MAX_DISPLAY_BOOKS,
    );
  }

  // Intent AUTHOR: tìm sách theo tác giả, có bước ranking trước và sau truy vấn sách.
  async handleAuthorQuery(
    // Tên tác giả parser bóc tách được từ câu hỏi.
    authorName: string,
    // Câu hỏi gốc dùng fallback nếu authorName rỗng.
    originalQuestion: string,
  ): Promise<any[]> {
    // Log tên tác giả parser trả về.
    this.logger.log(`Author query: "${authorName}"`);

    // Ưu tiên authorName đã parse; nếu rỗng thì tự rút từ khóa từ câu gốc.
    const authorQuery =
      authorName.trim() ||
      this.queryUtils.extractSearchPhrase(originalQuestion);

    // Không có query hợp lệ thì trả rỗng sớm.
    if (!authorQuery) {
      return [];
    }

    // Lấy danh sách tác giả có khả năng khớp theo tên.
    const exactAuthors = await this.authorsService.findByName(authorQuery);
    // Chấm điểm để sắp xếp tác giả theo mức liên quan.
    const rankedAuthors = this.queryUtils.rankAuthors(
      authorQuery,
      exactAuthors,
    );

    // Không có tác giả nào liên quan.
    if (rankedAuthors.length === 0) {
      return [];
    }

    // Mốc điểm cao nhất.
    const topScore = rankedAuthors[0].score;
    // Tập tác giả đủ mạnh.
    const strongAuthors = rankedAuthors.filter((a) => a.score >= 60);
    // Chọn tối đa 3 tác giả tốt nhất để query sách.
    const bestAuthors = (
      strongAuthors.length > 0 ? strongAuthors : rankedAuthors
    )
      .filter((a) => a.score === topScore || a.score >= 60)
      .slice(0, 3)
      .map((a) => a.author);

    // Tách ID để gọi books service.
    const authorIds = bestAuthors.map((a) => a._id);
    // Lấy candidate nhiều hơn để còn dư cho bước rerank cuối.
    const candidateBooks = await this.booksService.findByAuthorIds(
      authorIds,
      this.MAX_DISPLAY_BOOKS * 4,
    );

    // Chấm điểm sách theo độ khớp tác giả và cắt top N.
    return this.queryUtils
      .rankBooksByAuthor(authorQuery, candidateBooks)
      .slice(0, this.MAX_DISPLAY_BOOKS);
  }

  // Intent CATEGORY: tương tự author nhưng áp dụng cho thể loại.
  async handleCategoryQuery(
    // Tên thể loại parser bóc tách được.
    categoryName: string,
    // Câu hỏi gốc để fallback khi parser bỏ sót.
    originalQuestion: string,
  ): Promise<any[]> {
    // Log giá trị đầu vào để tiện debug intent/category extractor.
    this.logger.log(`Category query: "${categoryName}"`);

    // Ưu tiên categoryName đã parse, thiếu thì tự trích xuất phrase.
    const categoryQuery =
      categoryName.trim() ||
      this.queryUtils.extractSearchPhrase(originalQuestion);

    // Không có từ khóa thể loại hợp lệ.
    if (!categoryQuery) {
      return [];
    }

    // Lấy các thể loại có thể match.
    const exactCategories =
      await this.categoriesService.findByName(categoryQuery);
    // Chấm điểm và sắp xếp thể loại.
    const rankedCategories = this.queryUtils.rankCategories(
      categoryQuery,
      exactCategories,
    );

    // Không có thể loại nào đủ liên quan.
    if (rankedCategories.length === 0) {
      return [];
    }

    // Mốc điểm cao nhất để ưu tiên nhóm top.
    const topScore = rankedCategories[0].score;
    // Nhóm thể loại mạnh.
    const strongCategories = rankedCategories.filter((c) => c.score >= 60);
    // Chọn tối đa 3 thể loại tốt nhất cho truy vấn sách.
    const bestCategories = (
      strongCategories.length > 0 ? strongCategories : rankedCategories
    )
      .filter((c) => c.score === topScore || c.score >= 60)
      .slice(0, 3)
      .map((c) => c.category);

    // Tách category id để query books.
    const categoryIds = bestCategories.map((c) => c._id);
    // Lấy candidate rộng hơn để rerank.
    const candidateBooks = await this.booksService.findByCategoryIds(
      categoryIds,
      this.MAX_DISPLAY_BOOKS * 4,
    );

    // Rerank theo độ khớp thể loại và trả top N.
    return this.queryUtils
      .rankBooksByCategory(categoryQuery, candidateBooks)
      .slice(0, this.MAX_DISPLAY_BOOKS);
  }

  // Intent BESTSELLER: lấy trực tiếp top bán chạy.
  async handleBestsellerQuery(): Promise<any[]> {
    this.logger.log('Bestseller query');
    return this.booksService.findBestsellers(this.MAX_DISPLAY_BOOKS);
  }

  // Intent STOCK: truy vấn tồn kho dựa trên semantic search theo tên sách.
  async handleStockQuery(
    // Câu hỏi gốc của user.
    question: string,
    // Tên sách parser nhận diện hoặc fallback từ question.
    bookTitle: string,
  ): Promise<{ answer: string; books: any[] }> {
    // Log từ khóa stock query.
    this.logger.log(`Stock query for: "${bookTitle}"`);

    // Tạo vector embedding cho tên sách để truy vấn vector DB.
    const queryEmbedding = await this.embeddingService.embedText(bookTitle);
    // Lấy top 3 kết quả gần nhất theo cosine/similarity của Chroma.
    const results = await this.chromaService.query(queryEmbedding, 3);

    // Không tìm được bản ghi tương đồng.
    if (results.ids.length === 0) {
      return {
        answer: `I couldn't find any book matching "${bookTitle}" in our database.`,
        books: [],
      };
    }

    // Lấy bookId duy nhất vì một sách có thể xuất hiện nhiều chunk trong vector store.
    const bookIds = [...new Set(results.metadatas.map((m) => m.bookId))].slice(
      0,
      this.MAX_DISPLAY_BOOKS,
    );

    // Lấy thông tin sách đầy đủ từ DB chính.
    const books = await this.booksService.findByIds(bookIds);
    // Mảng response riêng cho stock use case.
    const formattedBooks: any[] = [];

    // Duyệt từng sách để bổ sung thông tin tồn kho theo thời điểm hiện tại.
    for (const book of books) {
      // Lấy quantity còn bán được từ stock service.
      const quantity = await this.stockService.getAvailableQuantity(
        book._id.toString(),
      );
      // Ghép tên tác giả thành một chuỗi hiển thị.
      const authorNames = (book.authors || [])
        .map((a: any) => a?.name || 'Unknown')
        .join(', ');

      // Chuẩn hóa object kết quả cho UI.
      formattedBooks.push({
        title: book.title,
        slug: book.slug,
        author: authorNames,
        // Ghép các category name, bỏ entry rỗng.
        category: (book.categoryIds || [])
          .map((c: any) => c?.name || '')
          .filter(Boolean)
          .join(', '),
        price: book.basePrice,
        currency: book.currency || 'VND',
        stockQuantity: quantity,
        // Cờ boolean thuận tiện cho hiển thị badge còn hàng/hết hàng.
        available: quantity > 0,
      });
    }

    // Sinh câu trả lời tự nhiên dựa trên dữ liệu stock đã chuẩn hóa.
    const answer = await this.generateStockAnswer(question, formattedBooks);
    // Trả đầy đủ answer + danh sách sách cho client render.
    return { answer, books: formattedBooks };
  }

  // Intent GENERAL: semantic retrieval tổng quát theo câu hỏi.
  async handleGeneralQuery(question: string): Promise<any[]> {
    this.logger.log('General RAG query');

    // Embed câu hỏi thành vector.
    const queryEmbedding = await this.embeddingService.embedText(question);
    // Lấy top 10 vector match.
    const results = await this.chromaService.query(queryEmbedding, 10);

    // Không có kết quả thì trả rỗng.
    if (results.ids.length === 0) {
      return [];
    }

    // Khử trùng lặp ID và giới hạn số lượng trả ra.
    const bookIds = [...new Set(results.metadatas.map((m) => m.bookId))].slice(
      0,
      this.MAX_DISPLAY_BOOKS,
    );

    // Trả sách đầy đủ theo ID.
    return this.booksService.findByIds(bookIds);
  }

  // Hàm nội bộ để tạo câu trả lời text cho nhánh stock.
  private async generateStockAnswer(
    // Câu hỏi gốc để giữ ngữ cảnh trong prompt.
    question: string,
    // Danh sách sách đã kèm thông tin tồn kho.
    books: any[],
  ): Promise<string> {
    // Không có dữ liệu để diễn giải.
    if (books.length === 0) {
      return 'I could not find any matching books in our inventory.';
    }

    // Chuyển mảng object thành text danh sách có cấu trúc để cho model đọc dễ hơn.
    const bookList = books
      .map(
        (b, i) =>
          `${i + 1}. ${b.title}\n   - Author: ${b.author}\n   - Price: ${b.price?.toLocaleString()} ${b.currency}\n   - Stock: ${b.stockQuantity} copies ${b.available ? '(Available)' : '(Out of stock)'}`,
      )
      .join('\n');

    // Prompt ràng buộc model chỉ dùng dữ liệu có thật, tránh hallucination.
    const prompt = `You are a helpful bookstore assistant for Readify bookstore.
A customer asked: "${question}"

Inventory results:
${bookList}

Provide a friendly answer about the stock availability.
Use concise, clean formatting with a short heading and a numbered list.
Include the quantity available for each book.
Do NOT make up any information. Only use the data provided above.`;

    // Gọi model tạo câu trả lời cuối cùng.
    return this.embeddingService.generateAnswer(prompt);
  }
}
