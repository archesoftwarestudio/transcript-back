import {
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as fs from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { AppService } from './app.service';

@Controller()
export class AppController {
  private openai: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly appService: AppService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('/transcript')
  @UseInterceptors(FileInterceptor('file'))
  async transcript(
    @UploadedFile() file: Express.Multer.File,
    @Body()
    body: { transcriptionType: string | null; userPrompt: string | null },
  ): Promise<any> {
    const { userPrompt, transcriptionType } = body;
    console.log(body);
    if (!file) {
      throw new Error('No se proporcionó archivo.');
    }

    const tempDir = join(__dirname, '.', 'audioTemp');

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFileName = `${randomUUID()}-${file.originalname}`;
    const tempFilePath = join(tempDir, tempFileName);

    fs.writeFileSync(tempFilePath, file.buffer);

    try {
      // Transcripción del audio con Whisper
      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(tempFilePath),
        model: 'whisper-1',
      });

      // Eliminar el archivo temporal
      fs.unlinkSync(tempFilePath);

      const transcriptText = transcription.text;

      let prompt = null;
      switch (transcriptionType) {
        case 'doctorSummary':
          prompt = `Texto de la conversación médica:
${transcriptText}

Por favor, genera dos resúmenes en formato Markdown:

1. Un resumen detallado para un doctor, que incluya las siguientes partes:
   - Motivo de consulta
   - Síntomas
   - Diagnóstico o prescripciones
   - Indicaciones y recomendaciones

2. Un resumen simple para un paciente que sea comprensible y breve.

Si el texto nada tiene que ver con el ámbito médico, por favor, devuelve:
  ## Audio no médico
  -Este audio no parece ser una conversación médica.
.

Por favor, devuelve el contenido formateado en Markdown.
`;
          break;
        case 'other':
          prompt =
            'Sobre el siguiente texto que es la transcripción de un audio:' +
            transcriptText +
            '. Haz lo que indica este prompt generado por el usuario en base a su audio: ' +
            userPrompt +
            '. Por favor, devuelve el contenido formateado en Markdown.';
          break;

        case 'interlocutorIdentification':
          prompt =
            'Identifica a los interlocutores de este audio y dame toda la conversación separada por cada interlocutor: ' +
            transcriptText +
            '. Por favor, devuelve el contenido formateado en Markdown.';
          break;

        case 'intelocutorSummary':
          prompt =
            'Dame un resumen de la conversación de cada interlocutor de este audio: ' +
            transcriptText +
            '. Por favor, devuelve el contenido formateado en Markdown.';
          break;

        case 'basic':
          prompt =
            'Dame un resumen basico de este texto sin perder detalles importantes: ' +
            transcriptText +
            '. Por favor, devuelve el contenido formateado en Markdown.';
          break;

        default:
          return {
            transcription: transcriptText,
          };
      }

      const gptResponse = await this.openai.chat.completions.create({
        messages: [{ role: 'system', content: prompt }],
        temperature: 0.7,
        model: 'gpt-4o',
      });

      // Verificar la respuesta de GPT-4
      const generatedHTML = gptResponse.choices[0].message.content;

      // Devolver el HTML generado
      return {
        transcription: generatedHTML,
      };
    } catch (error) {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }

      console.error('Error en la transcripción:', error.message);
      throw new Error('Error al procesar la transcripción.');
    }
  }
}

// Hacer la solicitud a GPT-4
