import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingService } from '../embedding/embedding.service';
import { ParsedQuery, QueryType } from './interfaces/query.interface';

@Injectable()
export class QueryClassifierService {
  private readonly logger = new Logger(QueryClassifierService.name);

  constructor(private embeddingService: EmbeddingService) {}

  async classifyQuery(question: string): Promise<ParsedQuery> {
    const lower = question.toLowerCase();

    // 1. Price range detection
    const priceResult = this.detectPriceRange(lower);
    if (priceResult) {
      return { type: QueryType.PRICE_RANGE, ...priceResult };
    }

    // 2. Bestseller detection
    if (this.isBestsellerQuery(lower)) {
      return { type: QueryType.BESTSELLER };
    }

    // 3. Stock availability detection
    if (this.isStockQuery(lower)) {
      const bookTitle = this.extractBookTitleFromStockQuery(question);
      return { type: QueryType.STOCK, bookTitle };
    }

    // 4. Rule-based author detection (more reliable than LLM for short queries)
    const authorName = this.detectAuthorName(question);
    if (authorName) {
      return { type: QueryType.AUTHOR, authorName };
    }

    // 5. Rule-based category detection
    const categoryName = this.detectCategoryName(question);
    if (categoryName) {
      return { type: QueryType.CATEGORY, categoryName };
    }

    // 6. Use Gemini to classify author/category/general queries
    return this.classifyWithLLM(question);
  }

  private detectPriceRange(
    q: string,
  ): { priceMin?: number; priceMax?: number } | null {
    const priceToken =
      '([\\d.,]+(?:\\s*(?:k|ka|cành|canh|nghìn|nghin|ngàn|ngan|vnđ|vnd))?)';

    // "khoang/tam/around 200k" => 200k..299k
    const approxMatch = q.match(
      new RegExp(
        `(?:trong\\s+)?(?:khoảng|khoang|tầm|tam|around|about)\\s*${priceToken}`,
        'i',
      ),
    );
    if (approxMatch) {
      const range = this.expandApproximatePriceRange(approxMatch[1]);
      if (range) return range;
    }

    // Match patterns like "100000 to 200000", "from 100000 to 200000",
    // "between 100000 and 200000", "100000 - 200000", "100.000 đến 200.000"
    const rangePatterns = [
      new RegExp(
        `(?:từ|from|between)\\s*${priceToken}\\s*(?:đến|to|and|-)\\s*${priceToken}`,
        'i',
      ),
      new RegExp(`${priceToken}\\s*(?:đến|to|-)\\s*${priceToken}`, 'i'),
      new RegExp(
        `${priceToken}\\s*(?:vnđ|vnd|đ|dong)?\\s*(?:đến|to|-)\\s*${priceToken}`,
        'i',
      ),
    ];

    for (const pattern of rangePatterns) {
      const match = q.match(pattern);
      if (match) {
        return {
          priceMin: this.parsePriceToken(match[1]),
          priceMax: this.parsePriceToken(match[2]),
        };
      }
    }

    // "under/below/less than X", "dưới X"
    const underMatch = q.match(
      new RegExp(
        `(?:under|below|less than|dưới|không quá|toi da|tối đa)\\s*${priceToken}`,
        'i',
      ),
    );
    if (underMatch) {
      return { priceMax: this.parsePriceToken(underMatch[1]) };
    }

    // "above/over/more than X", "trên X"
    const aboveMatch = q.match(
      new RegExp(
        `(?:above|over|more than|trên|từ|toi thieu|tối thiểu)\\s*${priceToken}(?:\\s*(?:vnđ|vnd|đ|dong))?$`,
        'i',
      ),
    );
    if (aboveMatch) {
      return { priceMin: this.parsePriceToken(aboveMatch[1]) };
    }

    // Check if question contains price-related keywords with numbers
    if (/(?:price|giá|cost|chi phí|tiền)/.test(q) && /\d+/.test(q)) {
      const numbers =
        q
          .match(
            /\d[\d.,]*(?:\s*(?:k|ka|cành|canh|nghìn|nghin|ngàn|ngan|vnđ|vnd))?/gi,
          )
          ?.map((n) => this.parsePriceToken(n)) || [];
      if (numbers.length >= 2) {
        return {
          priceMin: Math.min(...numbers),
          priceMax: Math.max(...numbers),
        };
      }
      if (numbers.length === 1) {
        return { priceMax: numbers[0] };
      }
    }

    return null;
  }

  private parsePriceToken(priceTokenRaw: string): number {
    const token = (priceTokenRaw || '').trim().toLowerCase();
    const numberPart = parseInt(
      token.replace(/[^\d.,]/g, '').replace(/[.,]/g, ''),
      10,
    );

    if (Number.isNaN(numberPart)) return 0;

    // Thousand shorthand: 200k, 200 ka, 200 cành, 200 nghìn/ngàn.
    if (/(?:k|ka|cành|canh|nghìn|nghin|ngàn|ngan)\b/.test(token)) {
      return numberPart * 1000;
    }

    // Heuristic for "200 vnd" style input: in this domain it usually means 200k VND.
    if (/(?:vnđ|vnd)\b/.test(token) && numberPart <= 1000) {
      return numberPart * 1000;
    }

    return numberPart;
  }

  private expandApproximatePriceRange(
    priceTokenRaw: string,
  ): { priceMin: number; priceMax: number } | null {
    const value = this.parsePriceToken(priceTokenRaw);
    if (value <= 0) return null;

    const token = (priceTokenRaw || '').trim().toLowerCase();

    if (this.hasThousandScaleMarker(token)) {
      const min = Math.floor(value / 1000) * 1000;
      return {
        priceMin: min,
        priceMax: min + 99999,
      };
    }

    return {
      priceMin: value,
      priceMax: value,
    };
  }

  private hasThousandScaleMarker(token: string): boolean {
    return /(?:k|ka|cành|canh|nghìn|nghin|ngàn|ngan|vnđ|vnd)\b/.test(token);
  }

  private isBestsellerQuery(q: string): boolean {
    const keywords = [
      'bestsell',
      'best sell',
      'best-sell',
      'top sell',
      'most popular',
      'most sold',
      'bán chạy',
      'phổ biến nhất',
      'top book',
      'popular book',
      'trending',
      'hot book',
    ];
    return keywords.some((kw) => q.includes(kw));
  }

  private isStockQuery(q: string): boolean {
    const keywords = [
      'stock',
      'available',
      'availability',
      'in stock',
      'how many copies',
      'còn hàng',
      'tồn kho',
      'còn bao nhiêu',
      'inventory',
    ];
    return keywords.some((kw) => q.includes(kw));
  }

  private extractBookTitleFromStockQuery(q: string): string {
    // Try to extract a book title from stock queries
    const patterns = [
      /(?:is|does)\s+["']?(.+?)["']?\s+(?:available|in stock)/i,
      /(?:stock|availability|copies)\s+(?:of|for)\s+["']?(.+?)["']?$/i,
      /["'](.+?)["']/,
    ];
    for (const pattern of patterns) {
      const match = q.match(pattern);
      if (match) return match[1].trim();
    }
    return q;
  }

  private detectAuthorName(question: string): string | null {
    const normalized = question.trim();
    const patterns = [
      /(?:sách|sach|books?)\s+(?:của|cua|by)\s+(.+)$/i,
      /(?:tác\s*giả|tac\s*gia|author)\s+(.+)$/i,
      /(?:sách|sach|books?)\s+(?:của\s+tác\s+giả|cua\s+tac\s+gia)\s+(.+)$/i,
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (!match?.[1]) continue;

      const name = this.cleanExtractedEntity(match[1]);
      if (name) return name;
    }

    return null;
  }

  private detectCategoryName(question: string): string | null {
    const normalized = question.trim();
    const patterns = [
      /(?:thể\s*loại|the\s*loai|category|genre)\s+(.+)$/i,
      /(?:sách|sach|books?)\s+(?:thể\s*loại|the\s*loai|category|genre)\s+(.+)$/i,
      /(?:sách|sach|books?)\s+(?:về|ve|thuộc|thuoc)\s+(?:thể\s*loại|the\s*loai|category|genre)\s+(.+)$/i,
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (!match?.[1]) continue;

      const category = this.cleanExtractedEntity(match[1]);
      if (category) return category;
    }

    return null;
  }

  private cleanExtractedEntity(raw: string): string {
    const cleaned = raw
      .replace(/[?!.,;:]+$/g, '')
      .replace(/^(của|cua)\s+/i, '')
      .replace(/^(la|là|la\s+gi|là\s+gì)\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) return '';

    // Ignore generic trailing words that are not entities
    if (/^(nao|nào|gi|gì|hay|khong|không)$/i.test(cleaned)) {
      return '';
    }

    return cleaned;
  }

  private async classifyWithLLM(question: string): Promise<ParsedQuery> {
    const prompt = `Classify this bookstore question into exactly one category.

Question: "${question}"

Categories:
- AUTHOR: asking about books by a specific author
- CATEGORY: asking about books in a specific genre/category  
- GENERAL: general book question or recommendation

Reply with ONLY a JSON object (no markdown, no explanation):
{"type": "AUTHOR|CATEGORY|GENERAL", "authorName": "name if AUTHOR", "categoryName": "name if CATEGORY"}`;

    try {
      const response = await this.embeddingService.generateAnswer(prompt);
      const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      switch (parsed.type) {
        case 'AUTHOR':
          return {
            type: QueryType.AUTHOR,
            authorName: parsed.authorName || '',
          };
        case 'CATEGORY':
          return {
            type: QueryType.CATEGORY,
            categoryName: parsed.categoryName || '',
          };
        default:
          return { type: QueryType.GENERAL };
      }
    } catch (error) {
      this.logger.warn(`LLM classification failed: ${error.message}`);
      return { type: QueryType.GENERAL };
    }
  }
}
