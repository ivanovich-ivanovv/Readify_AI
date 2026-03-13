export enum QueryType {
  PRICE_RANGE = 'price_range',
  AUTHOR = 'author',
  CATEGORY = 'category',
  BESTSELLER = 'bestseller',
  STOCK = 'stock',
  GENERAL = 'general',
}

export interface ParsedQuery {
  type: QueryType;
  priceMin?: number;
  priceMax?: number;
  authorName?: string;
  categoryName?: string;
  bookTitle?: string;
}
