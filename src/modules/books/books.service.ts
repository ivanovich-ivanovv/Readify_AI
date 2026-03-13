import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Book } from './book.schema';

@Injectable()
export class BooksService {
  constructor(@InjectModel(Book.name) private bookModel: Model<Book>) {}

  async findAll(): Promise<Book[]> {
    return this.bookModel.find().exec();
  }

  async findAllPopulated(): Promise<Book[]> {
    return this.bookModel
      .find()
      .populate('authors')
      .populate('categoryIds')
      .exec();
  }

  async findByPriceRange(
    min: number | undefined,
    max: number | undefined,
    limit = 5,
  ): Promise<Book[]> {
    const filter: Record<string, any> = {};
    if (min !== undefined && max !== undefined) {
      filter.basePrice = { $gte: min, $lte: max };
    } else if (min !== undefined) {
      filter.basePrice = { $gte: min };
    } else if (max !== undefined) {
      filter.basePrice = { $lte: max };
    }
    return this.bookModel
      .find(filter)
      .populate('authors')
      .populate('categoryIds')
      .sort({ soldCount: -1 })
      .limit(limit)
      .exec();
  }

  async findByAuthorIds(
    authorIds: Types.ObjectId[],
    limit = 5,
  ): Promise<Book[]> {
    return this.bookModel
      .find({ authors: { $in: authorIds } })
      .populate('authors')
      .populate('categoryIds')
      .sort({ soldCount: -1 })
      .limit(limit)
      .exec();
  }

  async findByCategoryIds(
    categoryIds: Types.ObjectId[],
    limit = 5,
  ): Promise<Book[]> {
    return this.bookModel
      .find({ categoryIds: { $in: categoryIds } })
      .populate('authors')
      .populate('categoryIds')
      .sort({ soldCount: -1 })
      .limit(limit)
      .exec();
  }

  async findBestsellers(limit = 5): Promise<Book[]> {
    return this.bookModel
      .find()
      .populate('authors')
      .populate('categoryIds')
      .sort({ soldCount: -1 })
      .limit(limit)
      .exec();
  }

  async findByIds(ids: string[], limit = 5): Promise<Book[]> {
    const objectIds = ids.map((id) => new Types.ObjectId(id));
    return this.bookModel
      .find({ _id: { $in: objectIds } })
      .populate('authors')
      .populate('categoryIds')
      .limit(limit)
      .exec();
  }
}
