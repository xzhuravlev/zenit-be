import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Multer } from 'multer';
import * as sharp from 'sharp'; // Подключаем sharp
import { Readable } from 'stream';
// import { v4 as uuidv4 } from 'uuid';
import { randomUUID } from 'crypto';


@Injectable()
export class S3Service {
    private s3: S3Client;
    private bucketName: string;

    constructor(private configService: ConfigService) {
        const region = this.configService.get<string>('AWS_S3_REGION');
        const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
        const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

        if (!region || !accessKeyId || !secretAccessKey) {
            throw new Error('AWS S3 конфигурация не найдена. Проверь .env файл.');
        }

        this.s3 = new S3Client({
            region,
            credentials: {
                accessKeyId,
                secretAccessKey,
            },
        });

        this.bucketName = this.configService.get<string>('AWS_S3_BUCKET_NAME')!;
    }

    async uploadPanorama(file: Multer.File) {
        const fileKey = `panoramas/${randomUUID()}-${file.originalname}`;
        const previewKey = fileKey.replace(/(\.[\w\d_-]+)$/i, '_preview$1'); // Добавляем _preview перед расширением

        // 🔹 Создаём уменьшенную версию 350x196
        const previewBuffer = await sharp(file.buffer)
            .resize(350, 196)
            .toBuffer();

        // 🔹 Загрузка оригинала
        const uploadOriginal = new Upload({
            client: this.s3,
            params: {
                Bucket: this.bucketName,
                Key: fileKey,
                Body: Readable.from(file.buffer),
                ContentType: file.mimetype,
            },
        }).done();

        // 🔹 Загрузка превью
        const uploadPreview = new Upload({
            client: this.s3,
            params: {
                Bucket: this.bucketName,
                Key: previewKey,
                Body: Readable.from(previewBuffer),
                ContentType: file.mimetype,
            },
        }).done();

        // Запускаем оба процесса параллельно
        await Promise.all([uploadOriginal, uploadPreview]);

        // Генерируем URL
        const region = this.configService.get<string>('AWS_S3_REGION');
        const baseUrl = `https://${this.bucketName}.s3.${region}.amazonaws.com`;

        return {
            originalUrl: `${baseUrl}/${fileKey}`,
            previewUrl: `${baseUrl}/${previewKey}`,
        };
    }

    async uploadText(text: string, filename?: string): Promise<string> {
        
        if (!text) {
			throw new Error('Текст не передан.');
		}

		const timestamp = new Date().toISOString().replace(/[:.]/g, "-"); // Генерируем временную метку
		const safeFilename = filename ? filename.replace(/\s+/g, "_") : "text"; // Убираем пробелы в имени файла
		const fileKey = `texts/${safeFilename}_${timestamp}.txt`; // Добавляем метку времени
	
		try {
			const upload = new Upload({
				client: this.s3,
				params: {
					Bucket: this.bucketName,
					Key: fileKey,
					Body: Buffer.from(text, "utf-8"),
					ContentType: 'text/plain; charset=utf-8',
				},
			});
	
			await upload.done();
			return `https://${this.bucketName}.s3.${this.configService.get<string>('AWS_S3_REGION')}.amazonaws.com/${fileKey}`;
		} catch (error) {
			console.error('Ошибка при загрузке текста:', error);
			throw new InternalServerErrorException('Ошибка при загрузке текста');
		}
	}

    async deletePanorama(key: string) {
        try {
			const command = new DeleteObjectCommand({
				Bucket: this.bucketName,
				Key: key,
			});

			await this.s3.send(command);
			console.log(`Файл удалён: ${key}`);

			return { message: `Файл ${key} успешно удалён из S3` };
		} catch (error) {
			console.error('Ошибка при удалении файла:', error);
			throw new InternalServerErrorException('Ошибка при удалении файла');
		}
    }
}
