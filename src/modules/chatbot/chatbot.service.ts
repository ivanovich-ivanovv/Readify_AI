import { Injectable, Logger } from '@nestjs/common';
import { QueryClassifierService } from './query-classifier.service';
import { QueryType } from './interfaces/query.interface';
import { ChatbotBookQueryService } from './services/chatbot-book-query.service';
import { ChatbotPresentationService } from './services/chatbot-presentation.service';
import { ChatbotQueryUtilsService } from './services/chatbot-query-utils.service';

// Service tổng hợp (orchestrator):
// - Nhận câu hỏi từ controller
// - Phân loại intent
// - Gọi đúng service nghiệp vụ
// - Chuẩn hóa phản hồi cuối cùng cho client
@Injectable()
export class ChatbotService {
  // Logger để trace toàn bộ vòng đời xử lý của một câu hỏi.
  private readonly logger = new Logger(ChatbotService.name);

  constructor(
    // Service phân loại intent (price/author/category/stock/general...).
    private queryClassifier: QueryClassifierService,
    // Service xử lý truy vấn dữ liệu sách theo từng intent.
    private bookQueryService: ChatbotBookQueryService,
    // Service tạo nội dung hiển thị (text answer, quick questions, format book card).
    private presentationService: ChatbotPresentationService,
    // Service utility xử lý text (normalize...) dùng để nhận diện nhanh một số trường hợp.
    private queryUtilsService: ChatbotQueryUtilsService,
  ) {}

  // Hàm public chính của chatbot.
  // Input: câu hỏi người dùng.
  // Output: câu trả lời + danh sách sách + quick questions (nếu có).
  async chat(
    question: string,
  ): Promise<{ answer: string; books: any[]; quickQuestions?: string[] }> {
    // Ghi log câu hỏi gốc để tiện theo dõi ở server log.
    this.logger.log(`Processing question: "${question}"`);

    // Xác định user có mong muốn phần giới thiệu không.
    // Cờ này sẽ ảnh hưởng tới phần text answer cuối cùng.
    const wantsIntroduction =
      this.presentationService.isIntroductionRequest(question);

    // Normalize câu hỏi để regex/so khớp ổn định hơn
    // (không dấu, lower-case, bỏ ký tự đặc biệt...).
    const normalizedQuestion = this.queryUtilsService.normalizeText(question);

    // Nhánh tối ưu: nếu user chỉ hỏi giới thiệu shop (không hỏi tìm sách cụ thể),
    // trả kết quả ngay để tiết kiệm classify + retrieval.
    if (
      this.presentationService.isPureShopIntroductionRequest(
        question,
        normalizedQuestion,
      )
    ) {
      return {
        // Script giới thiệu đầy đủ kèm câu hỏi mẫu.
        answer: this.presentationService.buildShopIntroductionScript(true),
        // Không trả danh sách sách trong nhánh chỉ giới thiệu.
        books: [],
        // Trả quick questions tổng hợp để user có thể bấm hỏi tiếp.
        quickQuestions: this.presentationService.getQuickQuestions(),
      };
    }

    // Phân loại query sang dạng có cấu trúc để điều hướng nghiệp vụ.
    const parsed = await this.queryClassifier.classifyQuery(question);
    // Log loại intent đã phân loại.
    this.logger.log(`Query classified as: ${parsed.type}`);

    // Biến tạm chứa danh sách sách raw từ lớp query service.
    let books: any[] = [];

    // Điều hướng theo intent.
    switch (parsed.type) {
      case QueryType.PRICE_RANGE:
        // Truy vấn theo khoảng giá min/max.
        books = await this.bookQueryService.handlePriceQuery(
          parsed.priceMin,
          parsed.priceMax,
        );
        break;

      case QueryType.AUTHOR:
        // Truy vấn theo tác giả đã parse (fallback về original question nếu thiếu).
        books = await this.bookQueryService.handleAuthorQuery(
          parsed.authorName ?? '',
          question,
        );
        break;

      case QueryType.CATEGORY:
        // Truy vấn theo thể loại đã parse (fallback tương tự author).
        books = await this.bookQueryService.handleCategoryQuery(
          parsed.categoryName ?? '',
          question,
        );
        break;

      case QueryType.BESTSELLER:
        // Truy vấn top bestseller.
        books = await this.bookQueryService.handleBestsellerQuery();
        break;

      case QueryType.STOCK:
        // Intent stock có schema trả về riêng (kèm stockQuantity/available),
        // nên trả sớm ở đây thay vì đi chung luồng formatBooks/generateAnswer.
        return {
          ...(await this.bookQueryService.handleStockQuery(
            question,
            parsed.bookTitle ?? question,
          )),
          // Ưu tiên nhóm quick questions dành cho stock.
          quickQuestions: this.presentationService.getQuickQuestions(
            QueryType.STOCK,
          ),
        };

      case QueryType.GENERAL:
      default:
        // Truy vấn chung dùng semantic retrieval (RAG).
        books = await this.bookQueryService.handleGeneralQuery(question);
        break;
    }

    // Chuẩn hóa dữ liệu sách về định dạng response đồng nhất cho client/UI.
    const formattedBooks = this.presentationService.formatBooks(books);

    // Sinh câu trả lời text từ queryType + số lượng kết quả + cờ wantsIntroduction.
    const answer = this.presentationService.generateAnswer(
      question,
      formattedBooks,
      parsed.type,
      wantsIntroduction,
    );

    // Trả payload cuối cùng cho controller.
    return {
      answer,
      books: formattedBooks,
      // Quick questions theo đúng intent hiện tại để tăng tỉ lệ follow-up tự nhiên.
      quickQuestions: this.presentationService.getQuickQuestions(parsed.type),
    };
  }
}
