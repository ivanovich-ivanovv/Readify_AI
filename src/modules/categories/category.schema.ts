import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'categories' })
export class Category extends Document {
  @Prop() name: string;
  @Prop() slug: string;
  @Prop() description: string;
  @Prop() iconUrl: string;
  @Prop() sortOrder: number;
  @Prop() status: string;
}

export const CategorySchema = SchemaFactory.createForClass(Category);
