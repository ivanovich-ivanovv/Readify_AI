import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Author } from './author.schema';

@Injectable()
export class AuthorsService {
  constructor(@InjectModel(Author.name) private authorModel: Model<Author>) {}

  async findAll(): Promise<Author[]> {
    return this.authorModel.find().exec();
  }

  async findByName(name: string): Promise<Author[]> {
    return this.authorModel
      .find({
        $or: [
          { name: { $regex: name, $options: 'i' } },
          { penName: { $regex: name, $options: 'i' } },
        ],
      })
      .exec();
  }
}
