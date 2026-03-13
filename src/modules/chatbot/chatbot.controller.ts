import { Controller, Post, Body } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { ChatDto } from './dto/chat.dto';

@Controller('chat')
export class ChatbotController {
  constructor(private chatbotService: ChatbotService) {}

  @Post()
  async chat(@Body() chatDto: ChatDto) {
    return this.chatbotService.chat(chatDto.question);
  }
}
