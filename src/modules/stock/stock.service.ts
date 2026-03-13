import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Stock } from './stock.schema';

@Injectable()
export class StockService {
  constructor(@InjectModel(Stock.name) private stockModel: Model<Stock>) {}

  async findByBookId(bookId: string): Promise<Stock[]> {
    return this.stockModel.find({ bookId: new Types.ObjectId(bookId) }).exec();
  }

  async getAvailableQuantity(bookId: string): Promise<number> {
    const stocks = await this.findByBookId(bookId);
    return stocks.reduce((sum, s) => sum + (s.quantity || 0), 0);
  }
}
