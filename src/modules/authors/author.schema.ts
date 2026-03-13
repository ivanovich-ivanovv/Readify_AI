import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'authors' })
export class Author extends Document {
  @Prop() name: string;
  @Prop() slug: string;
  @Prop() penName: string;
  @Prop() bio: string;
  @Prop() nationality: string;
  @Prop() birthDate: Date;
  @Prop() bookCount: number;
  @Prop({ type: [String] }) genres: string[];
  @Prop() status: string;
}

export const AuthorSchema = SchemaFactory.createForClass(Author);
