import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'stock' })
export class Stock extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Book' }) bookId: Types.ObjectId;
  @Prop() quantity: number;
  @Prop() location: string;
  @Prop() price: number;
  @Prop() batch: string;
  @Prop() status: string;
}

export const StockSchema = SchemaFactory.createForClass(Stock);
