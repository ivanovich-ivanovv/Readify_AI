import { Injectable } from '@nestjs/common';

// Service utility thuần cho xử lý text và ranking:
// - chuẩn hóa chuỗi truy vấn
// - chấm điểm độ khớp giữa query và candidate
// - xếp hạng tác giả/thể loại/sách theo mức liên quan
@Injectable()
export class ChatbotQueryUtilsService {
  // Chuẩn hóa text để so sánh ổn định giữa nhiều nguồn dữ liệu.
  normalizeText(input: string): string {
    // B1: chuẩn hóa giá trị đầu vào null/undefined thành chuỗi rỗng.
    const base = input || '';
    // B2: hạ chữ thường để không phân biệt hoa/thường.
    const lower = base.toLowerCase();
    // B3: tách dấu khỏi ký tự gốc (Unicode decomposition).
    const decomposed = lower.normalize('NFD');
    // B4: bỏ các dấu tổ hợp.
    const withoutDiacritics = decomposed.replace(/[\u0300-\u036f]/g, '');
    // B5: bỏ ký tự đặc biệt, chỉ giữ chữ/số/khoảng trắng.
    const alphaNumeric = withoutDiacritics.replace(/[^a-z0-9\s]/g, ' ');
    // B6: gộp nhiều khoảng trắng liên tiếp thành một.
    const compactSpaces = alphaNumeric.replace(/\s+/g, ' ');
    // B7: trim khoảng trắng đầu/cuối.
    return compactSpaces.trim();
  }

  // Rút cụm từ khóa tìm kiếm từ câu tự nhiên bằng cách bỏ stop words phổ biến.
  extractSearchPhrase(question: string): string {
    // Loại bỏ các token điều hướng chung không mang tính định danh entity.
    const removedStopWords = question.replace(
      /(sach|book|books|the loai|category|author|tac gia|gioi thieu|giới thiệu|shop|readify|cho toi|giup toi|recommend|goi y)/gi,
      ' ',
    );

    // Gộp khoảng trắng và trim để trả ra một phrase gọn.
    return removedStopWords.replace(/\s+/g, ' ').trim();
  }

  // Chấm điểm độ khớp giữa query và candidate.
  // Thang điểm ưu tiên: exact > phrase > prefix > contains > token overlap.
  calculateEntityMatchScore(query: string, candidate: string): number {
    const normalizedCandidate = this.normalizeText(candidate);

    // Candidate rỗng thì không thể khớp.
    if (!normalizedCandidate) return 0;

    // Mức khớp mạnh nhất: trùng hoàn toàn.
    if (normalizedCandidate === query) return 100;
    // Query xuất hiện nguyên cụm từ trong candidate.
    if (` ${normalizedCandidate} `.includes(` ${query} `)) return 90;
    // Candidate bắt đầu bằng query.
    if (normalizedCandidate.startsWith(query)) return 80;
    // Query xuất hiện dưới dạng cụm có ranh giới từ.
    if (normalizedCandidate.includes(` ${query} `)) return 70;
    // Query xuất hiện ở bất kỳ vị trí nào.
    if (normalizedCandidate.includes(query)) return 60;

    // Fallback: chấm điểm theo số token giao nhau.
    const queryTokens = query.split(' ').filter(Boolean);
    const candidateTokens = normalizedCandidate.split(' ').filter(Boolean);
    const overlapCount = queryTokens.filter((token) =>
      candidateTokens.includes(token),
    ).length;

    if (overlapCount === 0) return 0;
    // Mỗi token chung cộng 15 điểm, giới hạn tối đa 50.
    return Math.min(50, overlapCount * 15);
  }

  // Xếp hạng tác giả theo độ khớp với authorQuery.
  rankAuthors(authorQuery: string, authors: any[]): any[] {
    const normalizedQuery = this.normalizeText(authorQuery);

    return (
      authors
        .map((author) => {
          // Dùng cả tên thật và bút danh để tăng khả năng match.
          const names = [author?.name, author?.penName].filter(Boolean);

          // Điểm tác giả = điểm cao nhất trong các tên khả dụng.
          const score = Math.max(
            ...names.map((name: string) =>
              this.calculateEntityMatchScore(normalizedQuery, name),
            ),
            0,
          );

          return { author, score };
        })
        // Chỉ giữ lại ứng viên có liên quan.
        .filter((item) => item.score > 0)
        // Sắp giảm dần theo score.
        .sort((a, b) => b.score - a.score)
    );
  }

  // Xếp hạng thể loại theo độ khớp với categoryQuery.
  rankCategories(categoryQuery: string, categories: any[]): any[] {
    const normalizedQuery = this.normalizeText(categoryQuery);

    return categories
      .map((category) => ({
        category,
        score: this.calculateEntityMatchScore(normalizedQuery, category?.name),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  // Re-rank sách theo độ khớp tác giả.
  // Nếu đồng điểm, ưu tiên sách soldCount cao hơn.
  rankBooksByAuthor(authorQuery: string, books: any[]): any[] {
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

  // Re-rank sách theo độ khớp thể loại.
  // Nếu đồng điểm, ưu tiên sách soldCount cao hơn.
  rankBooksByCategory(categoryQuery: string, books: any[]): any[] {
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
