import { Body, Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import { S3Service } from './s3.service';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Multer } from 'multer';

@Controller('s3')
@UseGuards(JwtGuard)
export class S3Controller {
    constructor(private s3Service: S3Service) { }

    @Post('uploadPanorama')
    @UseInterceptors(FileInterceptor('file'))
    uploadPanorama(
        @UploadedFile() file: Multer.File
    ) {
        return this.s3Service.uploadPanorama(file);
    }

    @Post('uploadText')
	async uploadText(
        @Body() body: { text: string; filename?: string }
    ) {
		const result = await this.s3Service.uploadText(body.text, body.filename);
        return { url: result };
	}
}
