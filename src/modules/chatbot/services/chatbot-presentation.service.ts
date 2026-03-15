import { Injectable } from '@nestjs/common';
import { QueryType } from '../interfaces/query.interface';

// Service chuyên xử lý phần trình bày (presentation layer) cho chatbot:
// - nhận diện câu hỏi giới thiệu
// - dựng quick questions
// - format dữ liệu sách cho UI
// - tạo câu trả lời văn bản cho luồng non-stock
@Injectable()
export class ChatbotPresentationService {
  // Số lượng sách hiển thị tối đa trong phản hồi chuẩn.
  private readonly MAX_DISPLAY_BOOKS = 5;

  // Bộ câu hỏi mẫu theo từng nhóm intent để hỗ trợ follow-up nhanh trên UI.
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

  // Kiểm tra user có yêu cầu phần giới thiệu/mô tả hay không.
  isIntroductionRequest(question: string): boolean {
    // Lowercase để so keyword ổn định hơn.
    const q = question.toLowerCase();
    // Tập keyword đa ngôn ngữ thường gặp cho ý định giới thiệu.
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

    // Chỉ cần có ít nhất 1 keyword là true.
    return introKeywords.some((keyword) => q.includes(keyword));
  }

  // Kiểm tra đây có phải query "chỉ giới thiệu shop" hay không.
  // normalizedQuestion đã được chuẩn hóa từ lớp ngoài để tránh xử lý lặp lại.
  isPureShopIntroductionRequest(
    // Giữ tham số gốc để tương thích API, thuận tiện mở rộng nếu cần dùng sau.
    question: string,
    normalizedQuestion: string,
  ): boolean {
    // question tạm thời chưa dùng trong logic hiện tại.
    void question;

    // Có tín hiệu muốn giới thiệu shop/readify.
    const hasIntro =
      /(gioi thieu|introduce|introduction|about|ve shop|ve readify)/.test(
        normalizedQuestion,
      );
    // Có tín hiệu yêu cầu tìm sách cụ thể.
    const hasBookIntent =
      /(sach|book|books|author|tac gia|category|the loai|gia|price|bestseller|ban chay|stock|con hang)/.test(
        normalizedQuestion,
      );

    // Chỉ khi có intro và không có ý định tìm sách thì coi là pure intro.
    return hasIntro && !hasBookIntent;
  }

  // Dựng script giới thiệu Readify, có thể kèm quick questions.
  buildShopIntroductionScript(includeQuickQuestions = false): string {
    // Nội dung giới thiệu cố định để đảm bảo phản hồi nhất quán.
    const lines = [
      'Xin chào! Tôi là trợ lý AI của Readify.',
      'Readify là nhà sách online giúp bạn tìm sách nhanh theo giá, tác giả, thể loại và mức độ bán chạy.',
      'Bạn chỉ cần nói nhu cầu, mình sẽ đề xuất những tựa sách phù hợp nhất cho bạn.',
    ];

    // Nếu không cần quick questions, trả giới thiệu ngắn gọn 1 đoạn.
    if (!includeQuickQuestions) {
      return lines.join(' ');
    }

    // Đánh số danh sách câu hỏi mẫu để UI/text dễ đọc.
    const quickQuestionLines = this.getQuickQuestions()
      .map((item, index) => `${index + 1}. ${item}`)
      .join('\n');

    // Ghép phần giới thiệu + phần câu hỏi phổ biến.
    return `${lines.join(' ')}\n\nCâu hỏi phổ biến (bạn có thể bấm để hỏi nhanh):\n${quickQuestionLines}`;
  }

  // Trả quick questions theo intent hiện tại.
  getQuickQuestions(queryType?: QueryType): string[] {
    // Không có queryType thì trả bộ tổng hợp mặc định (dùng ở màn intro).
    if (!queryType) {
      return [
        ...this.QUICK_QUESTIONS_BY_SELECTION[QueryType.PRICE_RANGE],
        ...this.QUICK_QUESTIONS_BY_SELECTION[QueryType.AUTHOR],
        ...this.QUICK_QUESTIONS_BY_SELECTION[QueryType.CATEGORY],
        ...this.QUICK_QUESTIONS_BY_SELECTION[QueryType.BESTSELLER],
      ].slice(0, 8);
    }

    // Lấy bộ câu hỏi đúng intent hiện tại.
    const current = this.QUICK_QUESTIONS_BY_SELECTION[queryType] || [];
    // Fallback thêm nhóm GENERAL để luôn có đủ câu gợi ý.
    const fallback = this.QUICK_QUESTIONS_BY_SELECTION[QueryType.GENERAL] || [];
    // Trộn 2 nguồn và giới hạn số lượng trả về.
    return [...current, ...fallback].slice(0, 6);
  }

  // Chuẩn hóa danh sách book document thành schema response cho UI.
  formatBooks(books: any[]): any[] {
    // Cắt top N rồi map từng book.
    return books.slice(0, this.MAX_DISPLAY_BOOKS).map((book) => {
      // Nối danh sách tác giả thành chuỗi text.
      const authorNames = (book.authors || [])
        .map((a: any) => a?.name || 'Unknown')
        .join(', ');

      // Nối danh sách thể loại thành chuỗi text.
      const categoryNames = (book.categoryIds || [])
        .map((c: any) => c?.name || '')
        .filter(Boolean)
        .join(', ');

      // Trả object chuẩn để controller/client dùng thống nhất.
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

  // Sinh câu trả lời text cho các intent không phải stock.
  generateAnswer(
    // Câu hỏi gốc user.
    question: string,
    // Danh sách sách đã format.
    books: any[],
    // Loại intent để chọn heading phù hợp.
    queryType: QueryType,
    // Cờ có chèn phần giới thiệu ở đầu hay không.
    wantsIntroduction: boolean,
  ): string {
    // Không có kết quả nào khớp.
    if (books.length === 0) {
      // Nếu user có nhu cầu intro, trả intro + hướng dẫn đặt câu hỏi rõ hơn.
      if (wantsIntroduction) {
        return `${this.buildShopIntroductionScript(true)}\n\nHiện tại mình chưa tìm thấy sách phù hợp với yêu cầu cụ thể của bạn. Bạn có thể nói rõ hơn về tác giả, thể loại hoặc khoảng giá.`;
      }
      // Fallback ngắn gọn cho trường hợp không intro.
      return 'Mình chưa tìm thấy sách phù hợp với yêu cầu của bạn. Bạn thử đổi từ khóa (tác giả, thể loại, khoảng giá) nhé.';
    }

    // Dựng câu trả lời theo từng dòng rồi join cuối cùng.
    const lines: string[] = [];

    // Thêm đoạn giới thiệu ở đầu nếu cần.
    if (wantsIntroduction) {
      lines.push(this.buildShopIntroductionScript(true));
      // Dòng trống để tách đoạn cho dễ đọc.
      lines.push('');
    }

    // Heading theo intent.
    lines.push(this.getHeadingByQueryType(queryType, question));
    // Dòng mô tả số lượng kết quả hiển thị.
    lines.push(
      books.length >= this.MAX_DISPLAY_BOOKS
        ? `Mình đã lọc và hiển thị ${this.MAX_DISPLAY_BOOKS} cuốn sách phù hợp nhất.`
        : `Mình tìm thấy ${books.length} cuốn sách phù hợp và hiển thị toàn bộ.`,
    );
    // Dòng chuyển tiếp để người dùng nhìn xuống list/card phía dưới.
    lines.push('Danh sách chi tiết đã được mình hiển thị bên dưới:');

    // Trả chuỗi hoàn chỉnh, loại bỏ khoảng trắng dư cuối chuỗi nếu có.
    return lines.join('\n').trim();
  }

  // Trả heading ngắn theo intent để câu trả lời có ngữ cảnh rõ ràng.
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
        // Với query chung, nhắc lại câu hỏi user để tăng tính định hướng.
        return `Kết quả gợi ý cho: "${question}"`;
    }
  }
}
