import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'books' })
export class Book extends Document {
  @Prop() title: string;
  @Prop() slug: string;
  @Prop() subtitle: string;
  @Prop() description: string;
  @Prop({ type: [Types.ObjectId], ref: 'Author' }) authors: Types.ObjectId[];
  @Prop() language: string;
  @Prop() publishDate: Date;
  @Prop() pageCount: number;
  @Prop() isbn: string;
  @Prop({ type: Types.ObjectId }) publisherId: Types.ObjectId;
  @Prop({ type: [Types.ObjectId], ref: 'Category' })
  categoryIds: Types.ObjectId[];
  @Prop() basePrice: number;
  @Prop() currency: string;
  @Prop() thumbnailUrl: string;
  @Prop() status: string;
  @Prop() soldCount: number;
  @Prop({ type: [String] }) tags: string[];
}

export const BookSchema = SchemaFactory.createForClass(Book);
